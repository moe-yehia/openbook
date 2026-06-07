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

const genBody = z.object({
  action: z.literal("generate"),
  documentId: z.string().uuid(),
  question: z.string().min(1),
  answer: z.string().min(1),
});

const checkShape = z.object({
  prompt: z.string(),
  type: z.enum(["mcq", "free"]),
  options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  correctOptionId: z.string().nullable().optional(),
  modelAnswer: z.string(),
  conceptLabel: z.string().optional(),
  conceptId: z.string().nullable().optional(),
});

const gradeBody = z.object({
  action: z.literal("grade"),
  documentId: z.string().uuid(),
  check: checkShape,
  studentResponse: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // The student's chosen voice register — prepended to every system prompt below.
  const voice = await userRegisterStyle(supabase);

  const json = await req.json().catch(() => ({}));

  // ---------- GENERATE ----------
  if (json?.action === "generate") {
    const parsed = genBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { documentId, question, answer } = parsed.data;

    const chunks = await retrieve(supabase, documentId, question, 4);
    const { data: concepts } = await supabase
      .from("concepts")
      .select("id, label")
      .eq("document_id", documentId)
      .limit(40);
    const ctx = chunks.map((c) => `[${c.n}] ${c.content}`).join("\n\n");

    const r = await anthropic.messages.create({
      model: model("balanced"),
      max_tokens: 600,
      system:
        `Voice: ${voice}\n\n` +
        'Output ONLY minified JSON: {"prompt":string,"type":"mcq"|"free","options":[{"id":string,"text":string}]|null,"correctOptionId":string|null,"modelAnswer":string,"conceptLabel":string}. ' +
        "Write ONE short active-recall check that tests whether the student truly grasped the key idea from this exchange, grounded in CONTEXT. " +
        "Use type 'free' for conceptual understanding; use 'mcq' (3-4 options, exactly one correct) for a discrete fact. modelAnswer = the ideal answer. conceptLabel = the single concept tested. No prose, no code fences.",
      messages: [
        {
          role: "user",
          content: `STUDENT ASKED: ${question}\n\nTUTOR ANSWERED: ${answer}\n\nCONTEXT:\n${ctx}`,
        },
      ],
    });

    const obj = extractJson<z.infer<typeof checkShape>>(textOf(r));
    if (!obj || !obj.prompt) {
      return NextResponse.json({ error: "Could not build a check." }, { status: 502 });
    }
    // Match the concept label to a seeded concept (for mastery tracking).
    const label = (obj.conceptLabel ?? "").toLowerCase();
    const match =
      (concepts ?? []).find(
        (c) => label && (c.label.toLowerCase().includes(label) || label.includes(c.label.toLowerCase()))
      ) ?? null;

    return NextResponse.json({
      check: {
        prompt: obj.prompt,
        type: obj.type === "mcq" ? "mcq" : "free",
        options: obj.options ?? null,
        correctOptionId: obj.correctOptionId ?? null,
        modelAnswer: obj.modelAnswer,
        conceptLabel: obj.conceptLabel ?? null,
        conceptId: match?.id ?? null,
      },
      chunkId: chunks[0]?.id ?? null,
    });
  }

  // ---------- GRADE ----------
  if (json?.action === "grade") {
    const parsed = gradeBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { check, studentResponse } = parsed.data;

    const r = await anthropic.messages.create({
      model: model("balanced"),
      max_tokens: 500,
      system:
        `Voice: ${voice}\n\n` +
        'Output ONLY minified JSON: {"verdict":"correct"|"partial"|"misconception","gap":string,"feedback":string,"reexplanation":string}. ' +
        "Grade by MEANING, never by wording or spelling (do not penalize phrasing). feedback = 1-2 warm sentences. " +
        "If not fully correct, reexplanation = a short, clear re-teach of the exact gap; otherwise reexplanation = \"\". No prose, no fences.",
      messages: [
        {
          role: "user",
          content: `CHECK: ${check.prompt}\nMODEL ANSWER: ${check.modelAnswer}\n${
            check.options ? "OPTIONS: " + JSON.stringify(check.options) + "\nCORRECT: " + check.correctOptionId + "\n" : ""
          }STUDENT RESPONSE: ${studentResponse}`,
        },
      ],
    });

    const g = extractJson<{ verdict: string; gap: string; feedback: string; reexplanation: string }>(
      textOf(r)
    );
    const verdict = ["correct", "partial", "misconception"].includes(g?.verdict ?? "")
      ? (g!.verdict as "correct" | "partial" | "misconception")
      : "partial";
    const feedback = g?.feedback ?? "";
    const reexplanation = verdict === "correct" ? "" : g?.reexplanation ?? "";

    // Persist the check (RLS: owner = auth.uid()).
    await supabase.from("understanding_checks").insert({
      owner_id: user.id,
      concept_id: check.conceptId ?? null,
      check_type: check.type === "mcq" ? "mcq" : "free_response",
      prompt: check.prompt,
      options: check.options ?? null,
      model_answer: check.modelAnswer,
      student_response: studentResponse,
      verdict,
      gap: g?.gap ?? null,
      reexplanation: reexplanation || null,
    });

    // Update SM-2-lite mastery for the concept (the retention engine).
    if (check.conceptId) {
      const { data: existing } = await supabase
        .from("concept_mastery")
        .select("mastery, reps, ease, interval_days")
        .eq("owner_id", user.id)
        .eq("concept_id", check.conceptId)
        .maybeSingle();

      const delta = verdict === "correct" ? 0.18 : verdict === "partial" ? 0.06 : -0.15;
      const mastery = clamp((existing?.mastery ?? 0.3) + delta);
      let ease = existing?.ease ?? 2.5;
      let interval = existing?.interval_days ?? 0;
      if (verdict === "correct") {
        ease = Math.min(3, ease + 0.1);
        interval = interval <= 0 ? 1 : Math.round(interval * ease);
      } else if (verdict === "misconception") {
        ease = Math.max(1.3, ease - 0.2);
        interval = 0;
      } else if (interval <= 0) {
        interval = 1;
      }
      const state = mastery < 0.4 ? "weak" : mastery < 0.75 ? "shaky" : "solid";
      const nextReview = new Date(Date.now() + Math.max(1, interval) * 86_400_000).toISOString();

      await supabase.from("concept_mastery").upsert(
        {
          owner_id: user.id,
          concept_id: check.conceptId,
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
    }

    return NextResponse.json({ verdict, feedback, reexplanation });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
