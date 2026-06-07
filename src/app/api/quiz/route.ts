import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { anthropic, model } from "@/lib/anthropic";
import { extractJson } from "@/lib/ai/ingest-ai";
import { userRegisterStyle } from "@/lib/ai/register-style";
import { retrieve, formatLoc } from "@/lib/rag/retrieve";

export const runtime = "nodejs";
export const maxDuration = 120;

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const textOf = (m: { content: Array<{ type: string; text?: string }> }) =>
  m.content.find((b) => b.type === "text")?.text ?? "";

// ---------- request shapes ----------
const generateBody = z.object({
  action: z.literal("generate"),
  documentId: z.string().uuid(),
});

const gradeBody = z.object({
  action: z.literal("grade"),
  quizItemId: z.string().uuid(),
  // For MCQ this is the chosen option id; for short_answer it is free text.
  answer: z.string().min(1),
  confidence: z.number().int().min(0).max(2),
});

const completeBody = z.object({
  action: z.literal("complete"),
  quizId: z.string().uuid(),
  // Overall mastery on this run, 0..1.
  score: z.number().min(0).max(1),
});

// ---------- LLM generation shape ----------
type GenItem = {
  concept_label?: string;
  kind?: "mcq" | "short_answer";
  stem?: string;
  options?: { id: string; text: string }[];
  correct?: string;
  target_misconception?: string;
  explanation?: string;
  difficulty?: number;
};

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // The student's chosen voice register — prepended to the grading system prompt.
  const voice = await userRegisterStyle(supabase);

  const json = await req.json().catch(() => ({}));

  // ============================================================== GENERATE
  if (json?.action === "generate") {
    const parsed = generateBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { documentId } = parsed.data;

    const { data: doc } = await supabase
      .from("documents")
      .select("id, title")
      .eq("id", documentId)
      .single();
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });

    // Concepts to probe — one item per concept where possible (cap ~6).
    const { data: concepts } = await supabase
      .from("concepts")
      .select("id, label, summary")
      .eq("document_id", documentId)
      .limit(6);
    const conceptList = concepts ?? [];

    if (conceptList.length === 0) {
      return NextResponse.json(
        { error: "This document has no mapped concepts to quiz yet." },
        { status: 422 }
      );
    }

    // Retrieve grounding chunks per concept (parallel), then ask the model for one item each.
    const grounded = await Promise.all(
      conceptList.map(async (c) => {
        const chunks = await retrieve(supabase, documentId, c.label, 3);
        return { concept: c, chunk: chunks[0] ?? null, chunks };
      })
    );

    const context = grounded
      .map(
        (g, i) =>
          `### Concept ${i + 1}: ${g.concept.label}\n${
            g.concept.summary ? g.concept.summary + "\n" : ""
          }${g.chunks.map((ch) => `[${ch.n}] ${ch.content.slice(0, 700)}`).join("\n")}`
      )
      .join("\n\n");

    const r = await anthropic.messages.create({
      model: model("balanced"),
      max_tokens: 2600,
      system:
        'Output ONLY minified JSON: {"items":[{"concept_label":string,"kind":"mcq"|"short_answer","stem":string,"options":[{"id":string,"text":string}]|null,"correct":string,"target_misconception":string,"explanation":string,"difficulty":number}]}. ' +
        "Write ONE diagnostic item per concept, grounded STRICTLY in the provided context. " +
        "Mix kinds: use 'mcq' (exactly 4 options with ids a,b,c,d; correct = the id of the one right option) for discrete facts; use 'short_answer' (options = null; correct = the ideal concise answer) for conceptual understanding. " +
        "Each stem must be answerable from the context. target_misconception = the single most likely wrong belief this item detects. explanation = 1-2 sentences re-teaching the idea. difficulty = 1..5. " +
        "Use the exact concept_label given. No prose, no code fences.",
      messages: [
        {
          role: "user",
          content: `DOCUMENT: ${doc.title}\n\nCONTEXT BY CONCEPT:\n${context}`,
        },
      ],
    });

    const out = extractJson<{ items: GenItem[] }>(textOf(r));
    const rawItems = (out?.items ?? []).filter((it) => it && it.stem && it.kind);
    if (rawItems.length === 0) {
      return NextResponse.json({ error: "Could not build a quiz." }, { status: 502 });
    }

    // Create the quiz row first (RLS: owner = auth.uid()).
    const { data: quiz, error: quizErr } = await supabase
      .from("quizzes")
      .insert({
        owner_id: user.id,
        document_id: documentId,
        scope: "whole_doc",
        status: "active",
      })
      .select("id")
      .single();
    if (quizErr || !quiz) {
      return NextResponse.json({ error: "Could not start the quiz." }, { status: 500 });
    }

    // Match each generated item back to a concept + its grounding chunk.
    const byLabel = new Map(grounded.map((g) => [g.concept.label.toLowerCase(), g]));
    const itemRows = rawItems.slice(0, 6).map((it, idx) => {
      const g =
        byLabel.get((it.concept_label ?? "").toLowerCase()) ?? grounded[idx % grounded.length];
      const kind = it.kind === "mcq" ? "mcq" : "short_answer";
      const options =
        kind === "mcq" && Array.isArray(it.options) && it.options.length > 0 ? it.options : null;
      // correct is stored as JSON: an option id (mcq) or the model answer text (short).
      const correct = kind === "mcq" ? (it.correct ?? options?.[0]?.id ?? "a") : it.correct ?? "";
      return {
        quiz_id: quiz.id,
        owner_id: user.id,
        concept_id: g?.concept.id ?? null,
        chunk_id: g?.chunk?.id ?? null,
        kind,
        stem: it.stem!,
        options,
        correct,
        target_misconception: it.target_misconception ?? null,
        explanation: it.explanation ?? null,
        difficulty: Math.max(1, Math.min(5, Math.round(it.difficulty ?? 3))),
        ordinal: idx,
        model: model("balanced"),
      };
    });

    const { data: inserted, error: itemErr } = await supabase
      .from("quiz_items")
      .insert(itemRows)
      .select(
        "id, concept_id, chunk_id, kind, stem, options, target_misconception, explanation, difficulty, ordinal"
      );
    if (itemErr || !inserted) {
      return NextResponse.json({ error: "Could not save the quiz." }, { status: 500 });
    }

    // Server-side next-item ordering: weak concepts first. Pull this learner's
    // mastery for the probed concepts and sort ascending (unknown = weakest).
    const conceptIds = inserted.map((i) => i.concept_id).filter(Boolean) as string[];
    const masteryById = new Map<string, number>();
    if (conceptIds.length > 0) {
      const { data: masteries } = await supabase
        .from("concept_mastery")
        .select("concept_id, mastery")
        .eq("owner_id", user.id)
        .in("concept_id", conceptIds);
      for (const m of masteries ?? []) masteryById.set(m.concept_id, Number(m.mastery));
    }
    const ordered = [...inserted].sort(
      (a, b) =>
        (a.concept_id ? masteryById.get(a.concept_id) ?? -1 : -1) -
        (b.concept_id ? masteryById.get(b.concept_id) ?? -1 : -1)
    );

    // Resolve supporting passages for the runner (no answers leaked to client).
    const chunkIds = ordered.map((i) => i.chunk_id).filter(Boolean) as string[];
    const passageById = new Map<string, { quote: string; locLabel: string }>();
    if (chunkIds.length > 0) {
      const { data: chunkRows } = await supabase
        .from("chunks")
        .select("id, content, loc")
        .in("id", chunkIds);
      for (const ch of chunkRows ?? [])
        passageById.set(ch.id, {
          quote: (ch.content as string).slice(0, 600),
          locLabel: formatLoc((ch.loc as Record<string, unknown>) ?? {}),
        });
    }

    const labelById = new Map(conceptList.map((c) => [c.id, c.label]));
    const conceptsProbed = new Set(ordered.map((i) => i.concept_id).filter(Boolean)).size;

    return NextResponse.json({
      quizId: quiz.id,
      conceptsProbed,
      totalConcepts: conceptList.length,
      items: ordered.map((i) => ({
        id: i.id,
        kind: i.kind as "mcq" | "short_answer",
        stem: i.stem,
        options: (i.options as { id: string; text: string }[] | null) ?? null,
        conceptId: i.concept_id,
        conceptLabel: i.concept_id ? labelById.get(i.concept_id) ?? null : null,
        explanation: i.explanation as string | null,
        targetMisconception: i.target_misconception as string | null,
        passage: i.chunk_id ? passageById.get(i.chunk_id) ?? null : null,
      })),
    });
  }

  // ================================================================= GRADE
  if (json?.action === "grade") {
    const parsed = gradeBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { quizItemId, answer, confidence } = parsed.data;

    const { data: item } = await supabase
      .from("quiz_items")
      .select("id, quiz_id, concept_id, chunk_id, kind, stem, options, correct, explanation, target_misconception")
      .eq("id", quizItemId)
      .single();
    if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

    let isCorrect = false;
    let partialCredit = 0;
    let misconceptionLabel: string | null = null;
    let feedback = "";

    if (item.kind === "mcq") {
      // Graded server-side: compare chosen option id to the stored correct id.
      const correctId = typeof item.correct === "string" ? item.correct : String(item.correct ?? "");
      isCorrect = answer.trim() === correctId.trim();
      partialCredit = isCorrect ? 1 : 0;
      if (isCorrect) {
        feedback = "Correct — that's the one.";
      } else {
        feedback = "Not quite. Read the explanation below and the passage it came from.";
        misconceptionLabel = (item.target_misconception as string | null) ?? null;
      }
    } else {
      // short_answer: graded by MEANING with Sonnet.
      const modelAnswer = typeof item.correct === "string" ? item.correct : String(item.correct ?? "");
      const r = await anthropic.messages.create({
        model: model("balanced"),
        max_tokens: 500,
        system:
          `Voice: ${voice}\n\n` +
          'Output ONLY minified JSON: {"is_correct":boolean,"partial_credit":number,"misconception_label":string,"feedback":string}. ' +
          "Grade the student's free-text answer by MEANING, never by wording or spelling. " +
          "partial_credit is 0..1 (1 = fully correct, ~0.5 = the right idea with a gap, 0 = wrong/missing). " +
          "misconception_label = a short tag for the wrong belief if any, else \"\". feedback = 1-2 warm, specific sentences. No prose, no fences.",
        messages: [
          {
            role: "user",
            content: `QUESTION: ${item.stem}\nIDEAL ANSWER: ${modelAnswer}\nSTUDENT ANSWER: ${answer}`,
          },
        ],
      });
      const g = extractJson<{
        is_correct: boolean;
        partial_credit: number;
        misconception_label: string;
        feedback: string;
      }>(textOf(r));
      isCorrect = !!g?.is_correct;
      partialCredit = clamp(typeof g?.partial_credit === "number" ? g.partial_credit : isCorrect ? 1 : 0);
      misconceptionLabel = g?.misconception_label ? g.misconception_label : null;
      feedback = g?.feedback ?? (isCorrect ? "That captures it." : "Let's revisit this one.");
    }

    // "Fragile" = right but only guessing/unsure, or partial but not full credit.
    const fragile = (!isCorrect && partialCredit >= 0.5) || (isCorrect && confidence === 0);
    const missed = !isCorrect && partialCredit < 0.5;

    // Persist the attempt (RLS: owner = auth.uid()).
    await supabase.from("quiz_attempts").insert({
      owner_id: user.id,
      quiz_item_id: item.id,
      answer: { value: answer },
      confidence,
      is_correct: isCorrect,
      partial_credit: partialCredit,
      misconception_label: misconceptionLabel,
      ai_feedback: feedback,
    });

    // Miss/fragile → seed a flashcard for the Flashcards engine to pick up.
    let seeded = false;
    if (missed || fragile) {
      const correctText =
        item.kind === "mcq"
          ? (item.options as { id: string; text: string }[] | null)?.find(
              (o) => o.id === String(item.correct ?? "")
            )?.text ?? String(item.correct ?? "")
          : String(item.correct ?? "");
      const content = `Q: ${item.stem}\nA: ${correctText}${
        item.explanation ? `\n\n${item.explanation}` : ""
      }`;
      const { error: seedErr } = await supabase.from("card_seeds").insert({
        owner_id: user.id,
        deck_id: null,
        seed_type: "quiz_miss",
        source_quiz_item_id: item.id,
        source_chunk_id: item.chunk_id ?? null,
        content,
        consumed: false,
      });
      seeded = !seedErr;
    }

    // Update SM-2-lite concept mastery (same shape as /api/check).
    if (item.concept_id) {
      const { data: existing } = await supabase
        .from("concept_mastery")
        .select("mastery, reps, ease, interval_days")
        .eq("owner_id", user.id)
        .eq("concept_id", item.concept_id)
        .maybeSingle();

      const delta = isCorrect ? 0.18 : partialCredit >= 0.5 ? 0.06 : -0.15;
      const mastery = clamp((existing?.mastery ?? 0.3) + delta);
      let ease = existing?.ease ?? 2.5;
      let interval = existing?.interval_days ?? 0;
      if (isCorrect) {
        ease = Math.min(3, ease + 0.1);
        interval = interval <= 0 ? 1 : Math.round(interval * ease);
      } else if (missed) {
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
          concept_id: item.concept_id,
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

    return NextResponse.json({
      isCorrect,
      partialCredit,
      misconceptionLabel,
      feedback,
      explanation: (item.explanation as string | null) ?? null,
      seeded,
    });
  }

  // ============================================================== COMPLETE
  if (json?.action === "complete") {
    const parsed = completeBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { quizId, score } = parsed.data;

    // RLS scopes this to the owner; the explicit filter keeps intent clear.
    const { error: updateErr } = await supabase
      .from("quizzes")
      .update({
        status: "completed",
        score: clamp(score),
        completed_at: new Date().toISOString(),
      })
      .eq("id", quizId)
      .eq("owner_id", user.id);
    if (updateErr) {
      return NextResponse.json({ error: "Could not save your results." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
