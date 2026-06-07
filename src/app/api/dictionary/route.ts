import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { anthropic, model } from "@/lib/anthropic";
import { extractJson } from "@/lib/ai/ingest-ai";
import { userRegisterStyle } from "@/lib/ai/register-style";

export const runtime = "nodejs";
export const maxDuration = 30;

const textOf = (m: { content: Array<{ type: string; text?: string }> }) =>
  m.content.find((b) => b.type === "text")?.text ?? "";

// ---------- request shapes ----------
// LOOKUP resolves a single hovered word in the context of its sentence. The
// char offsets disambiguate repeated words ("lead" the metal vs. the verb).
const lookupBody = z.object({
  action: z.literal("lookup"),
  documentId: z.string().uuid(),
  chunkId: z.string().uuid().nullable().optional(),
  word: z.string().min(1).max(60),
  sentence: z.string().min(1).max(2000),
  // Offsets of the word WITHIN the sentence.
  charStart: z.number().int().min(0),
  charEnd: z.number().int().min(0),
});

// GUESS logs the predict-step outcome onto the lookup + nudges SM-2-lite.
const guessBody = z.object({
  action: z.literal("guess"),
  lookupId: z.string().uuid(),
  correct: z.boolean(),
});

// ---------- LLM card shape ----------
type Card = {
  word?: string;
  lemma?: string;
  pos?: string;
  contextual_definition?: string;
  plain_gloss?: string;
  sense_tag?: string;
  why_here?: string;
  distractors?: string[];
  difficulty?: string;
};

// A stable per-sentence fingerprint so common words dedupe across users/docs
// without storing the raw sentence as the cache key. Normalises case +
// whitespace + punctuation so trivial variations collapse to one entry.
function fingerprint(word: string, sentence: string): string {
  const norm = sentence
    .toLowerCase()
    .replace(/[^0-9a-zà-öø-ÿ\s]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  let h = 2166136261;
  const basis = `${word.toLowerCase()}::${norm}`;
  for (let i = 0; i < basis.length; i++) {
    h ^= basis.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

const POS = ["noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "determiner", "interjection", "other"];
const normPos = (p: string | undefined) => {
  const v = (p ?? "").toLowerCase().trim();
  return POS.includes(v) ? v : "other";
};
const trimWords = (s: string | undefined, max: number) =>
  (s ?? "").trim().split(/\s+/).filter(Boolean).slice(0, max).join(" ");

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // The student's chosen voice register — kept as its own leading system block so
  // the frozen dictionary prompt below stays cache-stable across users.
  const voice = await userRegisterStyle(supabase);

  const json = await req.json().catch(() => ({}));

  // ================================================================= LOOKUP
  if (json?.action === "lookup") {
    const parsed = lookupBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { documentId, chunkId, word, sentence, charStart, charEnd } = parsed.data;

    const cleanWord = word.trim().replace(/^[^0-9a-zà-öø-ÿ]+|[^0-9a-zà-öø-ÿ]+$/gi, "") || word.trim();
    const lemmaGuess = cleanWord.toLowerCase();
    const fp = fingerprint(cleanWord, sentence);

    // 1) Dedupe via definition_cache (lemma + context fingerprint).
    const { data: cached } = await supabase
      .from("definition_cache")
      .select("id, lemma, payload, hit_count")
      .eq("lemma", lemmaGuess)
      .eq("context_fingerprint", fp)
      .maybeSingle();

    let card: Card | null = cached?.payload ? (cached.payload as Card) : null;

    // 2) Cache miss → one atomic Haiku call (definition + distractors together,
    //    so the predict step has zero extra latency). The frozen system prompt
    //    and the passage chunk are cached together to clear Haiku's prefix floor.
    if (!card) {
      const r = await anthropic.messages.create({
        model: model("fast"),
        max_tokens: 400,
        system: [
          { type: "text" as const, text: `Voice: ${voice}` },
          {
            type: "text" as const,
            text:
              'Output ONLY minified JSON, no prose, no code fences: {"word":string,"lemma":string,"pos":string,"contextual_definition":string,"plain_gloss":string,"sense_tag":string,"why_here":string,"distractors":[string,string],"difficulty":string}. ' +
              "You are a precise in-context dictionary. Define the TARGET WORD as it is used in THIS sentence only — disambiguate by the sentence and the char offsets (e.g. 'novel' = new here, not a book). " +
              "lemma = dictionary base form (lowercase). pos = one of: noun, verb, adjective, adverb, pronoun, preposition, conjunction, determiner, interjection, other. " +
              "contextual_definition = what the word means HERE, one clear sentence. plain_gloss = the same meaning in <=12 plain, dyslexia-friendly words. " +
              "sense_tag = 2-4 word label for THIS sense (e.g. 'new/original sense'). why_here = <=8 words on why this sense fits the sentence. " +
              "distractors = exactly 2 plausible-but-WRONG meanings the word has in OTHER contexts (never the correct sense). difficulty = one of: easy, medium, hard. " +
              "Keep every field tight; this renders in a tiny hover card.",
            cache_control: { type: "ephemeral" as const },
          },
        ],
        messages: [
          {
            role: "user",
            content: `SENTENCE: ${sentence}\n\nTARGET WORD: "${cleanWord}" (chars ${charStart}-${charEnd} of the sentence)`,
          },
        ],
      });

      card = extractJson<Card>(textOf(r));
      if (!card || !card.contextual_definition) {
        return NextResponse.json({ error: "In-context sense unavailable." }, { status: 502 });
      }

      // Persist to the shared cache (best-effort; never blocks the reader).
      await supabase
        .from("definition_cache")
        .upsert(
          {
            lemma: (card.lemma ?? lemmaGuess).toLowerCase(),
            sense_hash: card.sense_tag ?? null,
            context_fingerprint: fp,
            payload: card,
            model: model("fast"),
            hit_count: 0,
          },
          { onConflict: "lemma,context_fingerprint" }
        );
    } else {
      // Cache hit — bump the counter so we can see the dedupe paying off.
      await supabase
        .from("definition_cache")
        .update({ hit_count: (cached?.hit_count ?? 0) + 1 })
        .eq("id", cached!.id);
    }

    const lemma = (card.lemma ?? lemmaGuess).toLowerCase();
    const senseTag = card.sense_tag ?? null;
    const pos = normPos(card.pos);
    const plainGloss = trimWords(card.plain_gloss, 12);
    const whyHere = trimWords(card.why_here, 8);
    const distractors = Array.isArray(card.distractors)
      ? card.distractors.filter((d): d is string => typeof d === "string" && d.trim().length > 0).slice(0, 2)
      : [];
    const difficulty = ["easy", "medium", "hard"].includes((card.difficulty ?? "").toLowerCase())
      ? (card.difficulty as string).toLowerCase()
      : "medium";

    // 3) Log the raw hover event (RLS: owner = auth.uid()). guessed/correct
    //    are filled in later by the 'guess' action.
    const { data: lookup } = await supabase
      .from("lookups")
      .insert({
        owner_id: user.id,
        document_id: documentId,
        chunk_id: chunkId ?? null,
        word: cleanWord,
        lemma,
        char_start: charStart,
        char_end: charEnd,
        sentence_text: sentence,
        contextual_definition: card.contextual_definition,
        plain_gloss: plainGloss || null,
        sense_tag: senseTag,
        pos,
        difficulty,
        guessed: false,
        guess_correct: null,
      })
      .select("id")
      .single();

    // 4) Seed / refresh the SM-2-lite vocab item for this lemma+sense.
    const { data: existingVocab } = await supabase
      .from("vocab_items")
      .select("id, repetitions")
      .eq("owner_id", user.id)
      .eq("lemma", lemma)
      .eq("sense_tag", senseTag ?? "")
      .maybeSingle();

    if (!existingVocab) {
      // First exposure: due tomorrow (SM-2-lite cold start).
      const dueAt = new Date(Date.now() + 86_400_000).toISOString();
      await supabase.from("vocab_items").upsert(
        {
          owner_id: user.id,
          lemma,
          sense_tag: senseTag ?? "",
          first_seen_document_id: documentId,
          example_sentence: sentence,
          plain_gloss: plainGloss || card.contextual_definition,
          ease_factor: 2.5,
          interval_days: 0,
          repetitions: 0,
          due_at: dueAt,
          last_reviewed_at: null,
          mastered: false,
        },
        { onConflict: "owner_id,lemma,sense_tag" }
      );
    }

    return NextResponse.json({
      lookupId: lookup?.id ?? null,
      card: {
        word: card.word ?? cleanWord,
        lemma,
        pos,
        contextualDefinition: card.contextual_definition,
        plainGloss: plainGloss || null,
        senseTag,
        whyHere: whyHere || null,
        distractors,
        difficulty,
      },
    });
  }

  // ================================================================== GUESS
  if (json?.action === "guess") {
    const parsed = guessBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { lookupId, correct } = parsed.data;

    // Record the predict-step outcome on the lookup row.
    const { data: lookup } = await supabase
      .from("lookups")
      .update({ guessed: true, guess_correct: correct })
      .eq("id", lookupId)
      .eq("owner_id", user.id)
      .select("lemma, sense_tag")
      .single();

    // SM-2-lite update: a correct prediction is a successful recall; a wrong
    // one resets the interval (re-expose sooner, in context). Pure TS — the
    // LLM never touches the schedule.
    if (lookup) {
      const { data: vocab } = await supabase
        .from("vocab_items")
        .select("id, ease_factor, interval_days, repetitions")
        .eq("owner_id", user.id)
        .eq("lemma", lookup.lemma ?? "")
        .eq("sense_tag", lookup.sense_tag ?? "")
        .maybeSingle();

      if (vocab) {
        let ease = Number(vocab.ease_factor ?? 2.5);
        let interval = Number(vocab.interval_days ?? 0);
        let reps = Number(vocab.repetitions ?? 0);

        if (correct) {
          reps += 1;
          ease = Math.min(3, ease + 0.1);
          interval = interval <= 0 ? 1 : reps === 1 ? 1 : reps === 2 ? 4 : Math.round(interval * ease);
        } else {
          reps = 0;
          ease = Math.max(1.3, ease - 0.2);
          interval = 0;
        }
        const dueAt = new Date(Date.now() + Math.max(1, interval) * 86_400_000).toISOString();

        await supabase
          .from("vocab_items")
          .update({
            ease_factor: ease,
            interval_days: interval,
            repetitions: reps,
            due_at: dueAt,
            last_reviewed_at: new Date().toISOString(),
            mastered: reps >= 3 && interval >= 7,
          })
          .eq("id", vocab.id);
      }
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
