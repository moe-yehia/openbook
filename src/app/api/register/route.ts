import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { anthropic, model } from "@/lib/anthropic";
import { extractJson } from "@/lib/ai/ingest-ai";
import { REGISTERS, getRegister, type RegisterId } from "@/lib/register";

export const runtime = "nodejs";
export const maxDuration = 60;

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const textOf = (m: { content: Array<{ type: string; text?: string }> }) =>
  m.content.find((b) => b.type === "text")?.text ?? "";

const registerEnum = z.enum(["formal", "casual", "gen_z", "gen_alpha"]);

const renderBody = z.object({
  action: z.literal("render"),
  documentId: z.string().uuid().optional(),
});

const recallBody = z.object({
  action: z.literal("recall"),
  registerId: registerEnum,
  conceptId: z.string().uuid().nullable().optional(),
  question: z.string().min(1),
  answer: z.string().min(1),
  source: z.string().min(1),
});

const setBody = z.object({
  action: z.literal("set"),
  registerId: registerEnum,
});

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const json = await req.json().catch(() => ({}));

  // ---------- RENDER (pick one concept, voice it in all 4 registers at once) ----------
  if (json?.action === "render") {
    const parsed = renderBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { documentId } = parsed.data;

    // Pick ONE concept from the student's material: the named doc's first concept,
    // else the most recent document's first concept, else a sensible built-in.
    let concept: { id: string | null; label: string; summary: string | null } | null = null;
    if (documentId) {
      const { data } = await supabase
        .from("concepts")
        .select("id, label, summary")
        .eq("document_id", documentId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data) concept = data;
    }
    if (!concept) {
      const { data: recentDoc } = await supabase
        .from("documents")
        .select("id")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentDoc) {
        const { data } = await supabase
          .from("concepts")
          .select("id, label, summary")
          .eq("document_id", recentDoc.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (data) concept = data;
      }
    }
    if (!concept) {
      concept = {
        id: null,
        label: "Spaced repetition",
        summary:
          "Reviewing material at expanding intervals so it sticks in long-term memory.",
      };
    }

    const styleGuide = REGISTERS.map((r) => `- ${r.id}: ${r.styleBlock}`).join("\n");
    const r = await anthropic.messages.create({
      model: model("balanced"),
      max_tokens: 1100,
      system:
        'Output ONLY minified JSON: {"concept":string,"renders":{"formal":string,"casual":string,"gen_z":string,"gen_alpha":string}}. ' +
        "For the given concept, write the SAME short explanation (2-3 sentences) four times — once in each register. " +
        "The meaning must be identical and factually accurate across all four; only the VOICE changes. " +
        "Follow each register's style exactly:\n" +
        styleGuide +
        "\nNo prose, no code fences.",
      messages: [
        {
          role: "user",
          content: `CONCEPT: ${concept.label}${
            concept.summary ? `\nSUMMARY: ${concept.summary}` : ""
          }`,
        },
      ],
    });

    const obj = extractJson<{
      concept: string;
      renders: Record<RegisterId, string>;
    }>(textOf(r));
    if (!obj?.renders) {
      return NextResponse.json({ error: "Could not render the concept." }, { status: 502 });
    }

    return NextResponse.json({
      concept: obj.concept || concept.label,
      conceptId: concept.id,
      renders: {
        formal: obj.renders.formal ?? "",
        casual: obj.renders.casual ?? "",
        gen_z: obj.renders.gen_z ?? "",
        gen_alpha: obj.renders.gen_alpha ?? "",
      },
    });
  }

  // ---------- RECALL (gate the lock behind correct free-recall) ----------
  if (json?.action === "recall") {
    const parsed = recallBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { registerId, conceptId, question, answer, source } = parsed.data;
    const reg = getRegister(registerId);

    const r = await anthropic.messages.create({
      model: model("fast"),
      max_tokens: 500,
      system:
        'Output ONLY minified JSON: {"correct":boolean,"gist_match_score":number,"feedback":string,"reexplanation":string}. ' +
        "Grade the student's free-recall answer by GIST and MEANING only — never by wording, spelling, or phrasing. " +
        "gist_match_score is 0..1 (how well the meaning matches). correct = the gist is genuinely there. " +
        "feedback = 1-2 warm, encouraging sentences (never a red slap). " +
        "If not correct, reexplanation = a short, gentle re-teach of the gap; otherwise reexplanation = \"\". " +
        `Write feedback and reexplanation in this voice: ${reg.styleBlock} No prose, no code fences.`,
      messages: [
        {
          role: "user",
          content: `QUESTION: ${question}\nMODEL ANSWER: ${answer}\nSTUDENT ANSWER: (graded for gist)`,
        },
      ],
    });

    const g = extractJson<{
      correct: boolean;
      gist_match_score: number;
      feedback: string;
      reexplanation: string;
    }>(textOf(r));

    const correct = g?.correct === true;
    const gistScore = clamp(typeof g?.gist_match_score === "number" ? g.gist_match_score : correct ? 0.8 : 0.3);
    const feedback = g?.feedback ?? "";
    const reexplanation = correct ? "" : g?.reexplanation ?? "";

    await supabase.from("register_recall_events").insert({
      owner_id: user.id,
      concept_id: conceptId ?? null,
      register_id: registerId,
      correct,
      gist_match_score: gistScore,
      source,
    });

    return NextResponse.json({ correct, gist_match_score: gistScore, feedback, reexplanation });
  }

  // ---------- SET (persist the calibrated choice; lock it in) ----------
  if (json?.action === "set") {
    const parsed = setBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { registerId } = parsed.data;

    // Merge into profiles.prefs without clobbering other keys (threads the voice
    // into every AI feature's system prompt).
    const { data: profile } = await supabase
      .from("profiles")
      .select("prefs")
      .eq("id", user.id)
      .single();
    const prefs = { ...((profile?.prefs as Record<string, unknown>) ?? {}), register: registerId };
    await supabase.from("profiles").update({ prefs }).eq("id", user.id);

    const now = new Date().toISOString();
    await supabase.from("user_communication_prefs").upsert(
      {
        user_id: user.id,
        active_register_id: registerId,
        calibrated_at: now,
        locked: true,
        global_override: true,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );

    return NextResponse.json({ ok: true, register: registerId });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
