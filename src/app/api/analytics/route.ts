import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { anthropic, model } from "@/lib/anthropic";
import { extractJson } from "@/lib/ai/ingest-ai";
import { userRegisterStyle } from "@/lib/ai/register-style";
import { retrieve } from "@/lib/rag/retrieve";

export const runtime = "nodejs";
export const maxDuration = 60;

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const textOf = (m: { content: Array<{ type: string; text?: string }> }) =>
  m.content.find((b) => b.type === "text")?.text ?? "";

// ---------- request shapes ----------
const itemsBody = z.object({
  action: z.literal("items"),
  conceptId: z.string().uuid(),
});

const gradeBody = z.object({
  action: z.literal("grade"),
  conceptId: z.string().uuid(),
  // Self-rating after revealing the model answer: 1=again, 2=hard, 3=good, 4=easy.
  grade: z.number().int().min(1).max(4),
});

const startBody = z.object({
  action: z.literal("start"),
  conceptId: z.string().uuid(),
});

const snoozeBody = z.object({
  action: z.literal("snooze"),
  conceptId: z.string().uuid(),
  reason: z.enum(["already_know", "no_time", "too_hard"]),
});

// LLM review-item shape (strict JSON).
type ReviewItem = { prompt?: string; modelAnswer?: string };

/** Find today's pending/started move for this concept (no unique key on the table). */
async function todaysMove(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  conceptId: string
) {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const { data } = await supabase
    .from("daily_moves")
    .select("id, status")
    .eq("owner_id", ownerId)
    .eq("concept_id", conceptId)
    .gte("generated_at", dayStart.toISOString())
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const json = await req.json().catch(() => ({}));

  // ============================================================ ITEMS (generate)
  // The LLM only WRITES review items — it never decides what to review.
  if (json?.action === "items") {
    const parsed = itemsBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { conceptId } = parsed.data;

    const { data: concept } = await supabase
      .from("concepts")
      .select("id, label, document_id")
      .eq("id", conceptId)
      .single();
    if (!concept) return NextResponse.json({ error: "Concept not found." }, { status: 404 });

    // The student's chosen voice register — prepended to the system prompt.
    const voice = await userRegisterStyle(supabase);

    const chunks = await retrieve(supabase, concept.document_id, concept.label, 4);
    const ctx = chunks.map((c) => `[${c.n}] ${c.content.slice(0, 700)}`).join("\n\n");

    const r = await anthropic.messages.create({
      model: model("balanced"),
      max_tokens: 1400,
      system:
        `Voice: ${voice}\n\n` +
        'Output ONLY minified JSON: {"items":[{"prompt":string,"modelAnswer":string}]}. ' +
        `Write 3-6 free-recall review items that target the concept "${concept.label}", grounded STRICTLY in the provided context. ` +
        "Each prompt asks the student to retrieve or explain something from memory (no multiple choice). " +
        "modelAnswer = the ideal concise answer to reveal after they try. No prose, no code fences.",
      messages: [
        {
          role: "user",
          content: `CONCEPT: ${concept.label}\n\nCONTEXT:\n${ctx}`,
        },
      ],
    });

    const out = extractJson<{ items: ReviewItem[] }>(textOf(r));
    const items = (out?.items ?? [])
      .filter((it) => it && typeof it.prompt === "string" && typeof it.modelAnswer === "string")
      .slice(0, 6)
      .map((it) => ({ prompt: it.prompt as string, modelAnswer: it.modelAnswer as string }));

    if (items.length === 0) {
      return NextResponse.json({ error: "Could not build review items." }, { status: 502 });
    }

    return NextResponse.json({ conceptLabel: concept.label, items });
  }

  // ===================================================================== GRADE
  // Self-rating after revealing the model answer → SM-2-lite mastery update
  // (same approach as /api/check; the deltas here come from a 1-4 self-grade).
  if (json?.action === "grade") {
    const parsed = gradeBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { conceptId, grade } = parsed.data;

    const { data: existing } = await supabase
      .from("concept_mastery")
      .select("mastery, reps, ease, interval_days")
      .eq("owner_id", user.id)
      .eq("concept_id", conceptId)
      .maybeSingle();

    // 4=easy +0.2, 3=good +0.12, 2=hard +0.02, 1=again -0.15.
    const delta = grade === 4 ? 0.2 : grade === 3 ? 0.12 : grade === 2 ? 0.02 : -0.15;
    const mastery = clamp((existing?.mastery ?? 0.3) + delta);
    let ease = existing?.ease ?? 2.5;
    let interval = existing?.interval_days ?? 0;
    if (grade >= 3) {
      ease = Math.min(3, ease + (grade === 4 ? 0.15 : 0.1));
      interval = interval <= 0 ? 1 : Math.round(interval * ease);
    } else if (grade === 1) {
      ease = Math.max(1.3, ease - 0.2);
      interval = 0;
    } else if (interval <= 0) {
      interval = 1;
    }
    const state = mastery < 0.4 ? "weak" : mastery < 0.75 ? "shaky" : "solid";
    const nextReview = new Date(Date.now() + Math.max(1, interval) * 86_400_000).toISOString();

    const { error: upErr } = await supabase.from("concept_mastery").upsert(
      {
        owner_id: user.id,
        concept_id: conceptId,
        mastery,
        reps: (existing?.reps ?? 0) + 1,
        ease,
        interval_days: interval,
        state,
        last_reviewed: new Date().toISOString(),
        next_review: nextReview,
      },
      { onConflict: "owner_id,concept_id" }
    );
    if (upErr) return NextResponse.json({ error: "Could not save your review." }, { status: 500 });

    return NextResponse.json({ mastery, state, nextReview, intervalDays: interval });
  }

  // ===================================================================== START
  // Mark today's move 'started' (or open one) so the forced decision is resolved.
  if (json?.action === "start") {
    const parsed = startBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { conceptId } = parsed.data;

    const { data: cm } = await supabase
      .from("concept_mastery")
      .select("recall_prob_now")
      .eq("owner_id", user.id)
      .eq("concept_id", conceptId)
      .maybeSingle();
    const recallProb =
      cm?.recall_prob_now != null ? Number(cm.recall_prob_now) : null;

    const move = await todaysMove(supabase, user.id, conceptId);
    if (move) {
      await supabase
        .from("daily_moves")
        .update({ status: "started" })
        .eq("id", move.id)
        .eq("owner_id", user.id);
    } else {
      await supabase.from("daily_moves").insert({
        owner_id: user.id,
        concept_id: conceptId,
        status: "started",
        recall_prob_at_creation: recallProb,
      });
    }

    return NextResponse.json({ ok: true });
  }

  // ==================================================================== SNOOZE
  // The forced decision's other branch: requires a metacognitive reason.
  if (json?.action === "snooze") {
    const parsed = snoozeBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { conceptId, reason } = parsed.data;

    const { data: cm } = await supabase
      .from("concept_mastery")
      .select("recall_prob_now")
      .eq("owner_id", user.id)
      .eq("concept_id", conceptId)
      .maybeSingle();
    const recallProb =
      cm?.recall_prob_now != null ? Number(cm.recall_prob_now) : null;

    const move = await todaysMove(supabase, user.id, conceptId);
    if (move) {
      await supabase
        .from("daily_moves")
        .update({
          status: "snoozed",
          snooze_reason: reason,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", move.id)
        .eq("owner_id", user.id);
    } else {
      await supabase.from("daily_moves").insert({
        owner_id: user.id,
        concept_id: conceptId,
        status: "snoozed",
        snooze_reason: reason,
        recall_prob_at_creation: recallProb,
        resolved_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
