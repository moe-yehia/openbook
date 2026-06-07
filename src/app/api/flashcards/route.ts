import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { anthropic, model } from "@/lib/anthropic";
import { extractJson } from "@/lib/ai/ingest-ai";
import { userRegisterStyle } from "@/lib/ai/register-style";
import { retrieve } from "@/lib/rag/retrieve";
import { newCard, review, type FsrsFields, type Grade } from "@/lib/fsrs";

export const runtime = "nodejs";
export const maxDuration = 120;

const textOf = (m: { content: Array<{ type: string; text?: string }> }) =>
  m.content.find((b) => b.type === "text")?.text ?? "";

// ---------- request bodies ----------
const generateBody = z.object({
  action: z.literal("generate"),
  documentId: z.string().uuid(),
});

const gradeBody = z.object({
  action: z.literal("grade"),
  flashcardId: z.string().uuid(),
  grade: z.enum(["again", "hard", "good", "easy"]),
  recallMode: z.enum(["typed", "self_graded"]),
  typedAnswer: z.string().max(4000).optional(),
  predictedConfidence: z.number().int().min(1).max(4).optional(),
});

// Shape the LLM must emit for each generated card.
const cardShape = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  card_type: z.literal("qa").optional(),
  source_chunk_id: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // The student's chosen voice register — prepended to the card-writing prompt.
  const voice = await userRegisterStyle(supabase);

  const json = await req.json().catch(() => ({}));

  // ======================= GENERATE =======================
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

    // One deck per document — reuse it if the student already started one.
    const { data: existingDeck } = await supabase
      .from("decks")
      .select("id")
      .eq("owner_id", user.id)
      .eq("document_id", documentId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let deckId = existingDeck?.id ?? null;
    if (!deckId) {
      const { data: created, error: deckErr } = await supabase
        .from("decks")
        .insert({
          owner_id: user.id,
          document_id: documentId,
          title: doc.title,
          description: "Spaced-repetition deck",
          card_count: 0,
        })
        .select("id")
        .single();
      if (deckErr || !created)
        return NextResponse.json({ error: "Could not create deck." }, { status: 500 });
      deckId = created.id;
    }

    // Ground generation in the document's opening passages.
    const chunks = await retrieve(supabase, documentId, doc.title, 8);
    const validChunkIds = new Set(chunks.map((c) => c.id));
    const ctx = chunks.map((c) => `[chunk:${c.id}] ${c.content}`).join("\n\n");

    const r = await anthropic.messages.create({
      model: model("balanced"),
      max_tokens: 2200,
      system:
        `Voice: ${voice}\n\n` +
        'Output ONLY minified JSON: {"cards":[{"front":string,"back":string,"card_type":"qa","source_chunk_id":string|null}]}. ' +
        "Write 8-12 active-recall flashcards grounded STRICTLY in CONTEXT. " +
        "front = one focused question that forces retrieval of a single idea. back = the precise, complete answer (1-3 sentences). " +
        "Test understanding, not trivia. Never write a card whose answer isn't in CONTEXT. " +
        "source_chunk_id = the [chunk:ID] the card is drawn from, or null. No prose, no code fences.",
      messages: [
        {
          role: "user",
          content: `DOCUMENT: ${doc.title}\n\nCONTEXT:\n${ctx}`,
        },
      ],
    });

    const out = extractJson<{ cards: z.infer<typeof cardShape>[] }>(textOf(r));
    const aiCards = (out?.cards ?? [])
      .map((c) => cardShape.safeParse(c))
      .filter((p): p is { success: true; data: z.infer<typeof cardShape> } => p.success)
      .map((p) => p.data)
      .slice(0, 12);

    const now = new Date();
    const rows = aiCards.map((c) => {
      const chunkId =
        c.source_chunk_id && validChunkIds.has(c.source_chunk_id) ? c.source_chunk_id : null;
      return {
        owner_id: user.id,
        deck_id: deckId,
        document_id: documentId,
        card_type: "qa",
        front: c.front,
        back: c.back,
        citations: [],
        source_chunk_id: chunkId,
        origin: "ai_generated",
        ...newCard(now),
      };
    });

    // Turn proven weak spots (quiz misses) into cards, then mark them consumed.
    const { data: seeds } = await supabase
      .from("card_seeds")
      .select("id, content, source_chunk_id")
      .eq("owner_id", user.id)
      .eq("deck_id", deckId)
      .eq("consumed", false)
      .limit(20);

    const consumedIds: string[] = [];
    for (const seed of seeds ?? []) {
      const content = (seed.content ?? "").trim();
      if (!content) continue;
      rows.push({
        owner_id: user.id,
        deck_id: deckId,
        document_id: documentId,
        card_type: "qa",
        front: content,
        back: "Recall this from your earlier miss, then check yourself against the material.",
        citations: [],
        source_chunk_id: seed.source_chunk_id ?? null,
        origin: "quiz_miss",
        ...newCard(now),
      });
      consumedIds.push(seed.id);
    }

    if (rows.length === 0)
      return NextResponse.json({ error: "Could not generate cards." }, { status: 502 });

    const { error: insErr } = await supabase.from("flashcards").insert(rows);
    if (insErr) return NextResponse.json({ error: "Could not save cards." }, { status: 500 });

    if (consumedIds.length > 0) {
      await supabase
        .from("card_seeds")
        .update({ consumed: true })
        .eq("owner_id", user.id)
        .in("id", consumedIds);
    }

    // Keep the deck's denormalised count fresh.
    const { count } = await supabase
      .from("flashcards")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .eq("deck_id", deckId);
    await supabase
      .from("decks")
      .update({ card_count: count ?? rows.length, updated_at: new Date().toISOString() })
      .eq("id", deckId)
      .eq("owner_id", user.id);

    return NextResponse.json({ deckId, created: rows.length });
  }

  // ======================= GRADE =======================
  if (json?.action === "grade") {
    const parsed = gradeBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { flashcardId, grade, recallMode, typedAnswer, predictedConfidence } = parsed.data;

    // Load the card's current FSRS state (RLS-scoped to the owner).
    const { data: card } = await supabase
      .from("flashcards")
      .select("id, fsrs_state, due, stability, difficulty, reps, lapses, last_review")
      .eq("id", flashcardId)
      .eq("owner_id", user.id)
      .single();
    if (!card) return NextResponse.json({ error: "Card not found." }, { status: 404 });

    const prev: FsrsFields = {
      fsrs_state: card.fsrs_state,
      due: card.due,
      stability: card.stability,
      difficulty: card.difficulty,
      reps: card.reps,
      lapses: card.lapses,
      last_review: card.last_review,
    };

    // Pure-TS scheduler — the LLM never schedules.
    const next = review(prev, grade as Grade, new Date());

    const { error: updErr } = await supabase
      .from("flashcards")
      .update({
        fsrs_state: next.fsrs_state,
        due: next.due,
        stability: next.stability,
        difficulty: next.difficulty,
        reps: next.reps,
        lapses: next.lapses,
        last_review: next.last_review,
      })
      .eq("id", flashcardId)
      .eq("owner_id", user.id);
    if (updErr) return NextResponse.json({ error: "Could not update card." }, { status: 500 });

    await supabase.from("flashcard_reviews").insert({
      owner_id: user.id,
      flashcard_id: flashcardId,
      grade,
      predicted_confidence: predictedConfidence ?? null,
      recall_mode: recallMode,
      typed_answer: typedAnswer ?? null,
      prev_due: next.prev_due,
      next_due: next.next_due,
      reviewed_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, nextDue: next.next_due, fsrsState: next.fsrs_state });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
