import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { anthropic, model } from "@/lib/anthropic";
import { extractJson } from "@/lib/ai/ingest-ai";
import { userRegisterStyle } from "@/lib/ai/register-style";
import { retrieve } from "@/lib/rag/retrieve";

export const runtime = "nodejs";
export const maxDuration = 120;

const textOf = (m: { content: Array<{ type: string; text?: string }> }) =>
  m.content.find((b) => b.type === "text")?.text ?? "";

const line = (obj: unknown) => JSON.stringify(obj) + "\n";

// The frozen contract for the whole feature: the STUDENT writes; Claude only
// organizes. Hard-coded here so it can never drift across calls.
const SYNTH_SYSTEM =
  "You help a student turn THEIR OWN notes into a clean, durable artifact. " +
  "NEVER write the explanation for the student; only refine THEIR words, preserve their voice, surface gaps as questions. " +
  "Do not add new facts, claims, or ideas the student did not write. Keep their phrasing, fix only clarity/grammar/structure. " +
  "If the student's wording overstates what the source supports (e.g. source says 'correlated', student wrote 'causes'), flag it as a short question — never silently rewrite it. " +
  'Output ONLY minified JSON: {"title":string,"body_synth":string,"keypoints":string[],"flags":string[]}. ' +
  "title = 3-8 words. body_synth = the student's text tightened, SAME voice, no new content. " +
  "keypoints = 2-4 atomic single-sentence points drawn ONLY from what the student wrote. " +
  "flags = 0-3 short questions surfacing unsupported claims or gaps (empty array if none). No prose, no code fences.";

// ---------- request shapes ----------
const promptBody = z.object({
  action: z.literal("prompt"),
  documentId: z.string().uuid(),
  quote: z.string().max(4000).optional(),
});

const hintBody = z.object({
  action: z.literal("hint"),
  documentId: z.string().uuid(),
  retrievalPrompt: z.string().min(1).max(2000),
  quote: z.string().max(4000).optional(),
  draft: z.string().max(8000).optional(),
});

const synthesizeBody = z.object({
  action: z.literal("synthesize"),
  documentId: z.string().uuid(),
  bodyStudent: z.string().min(1).max(12000),
  retrievalPrompt: z.string().max(2000).optional(),
  quote: z.string().max(4000).optional(),
  originHighlightId: z.string().uuid().nullable().optional(),
});

const linkBody = z.object({
  action: z.literal("link"),
  documentId: z.string().uuid(),
  noteId: z.string().uuid(),
});

const gradeBody = z.object({
  action: z.literal("grade"),
  noteId: z.string().uuid(),
  response: z.string().min(1).max(8000),
});

const RELATIONS = ["relates_to", "contradicts", "example_of", "prerequisite_of"] as const;
type Relation = (typeof RELATIONS)[number];

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // The student's chosen voice register — prepended to every system prompt below.
  const voice = await userRegisterStyle(supabase);

  const json = await req.json().catch(() => ({}));

  // ============================================================ PROMPT (Haiku)
  // One grounded retrieval prompt that asks the student to explain in their own
  // words, without looking back at the source.
  if (json?.action === "prompt") {
    const parsed = promptBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { documentId, quote } = parsed.data;

    const seed = quote?.trim() || "";
    const chunks = await retrieve(supabase, documentId, seed, 4);
    const ctx = chunks.map((c) => `[${c.n}] ${c.content.slice(0, 700)}`).join("\n\n");

    const r = await anthropic.messages.create({
      model: model("fast"),
      max_tokens: 200,
      system:
        'Output ONLY minified JSON: {"prompt":string}. ' +
        "Write ONE retrieval-practice question that asks the student to explain a key idea from this material IN THEIR OWN WORDS, without looking back. " +
        "Phrase it like \"In your own words, why does X…?\" or \"Without looking back, explain how…\". " +
        "Ground it in the CONTEXT (and the QUOTE if given). One sentence, <= 24 words. No prose, no code fences.",
      messages: [
        {
          role: "user",
          content: `${quote ? `QUOTE:\n${quote}\n\n` : ""}CONTEXT:\n${ctx}`,
        },
      ],
    });

    const obj = extractJson<{ prompt: string }>(textOf(r));
    const prompt =
      obj?.prompt?.trim() || "In your own words, explain the key idea here — don't look back.";
    return NextResponse.json({ prompt });
  }

  // ============================================================== HINT (Haiku)
  // Socratic nudge on "I'm stuck" — a question that points the way, never the answer.
  if (json?.action === "hint") {
    const parsed = hintBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { documentId, retrievalPrompt, quote, draft } = parsed.data;

    const chunks = await retrieve(supabase, documentId, `${retrievalPrompt} ${quote ?? ""}`, 4);
    const ctx = chunks.map((c) => `[${c.n}] ${c.content.slice(0, 600)}`).join("\n\n");

    const r = await anthropic.messages.create({
      model: model("fast"),
      max_tokens: 160,
      system:
        `Voice: ${voice}\n\n` +
        'Output ONLY minified JSON: {"hint":string}. ' +
        "The student is stuck answering a retrieval prompt and must articulate it THEMSELVES. " +
        "Give ONE Socratic nudge — a guiding question or a pointer to what to focus on — that helps them think. " +
        "NEVER state the answer or explanation. <= 22 words. No prose, no code fences.",
      messages: [
        {
          role: "user",
          content: `RETRIEVAL PROMPT: ${retrievalPrompt}\n${
            quote ? `SOURCE QUOTE: ${quote}\n` : ""
          }${draft ? `STUDENT DRAFT SO FAR: ${draft}\n` : ""}CONTEXT:\n${ctx}`,
        },
      ],
    });

    const obj = extractJson<{ hint: string }>(textOf(r));
    const hint =
      obj?.hint?.trim() ||
      "What's the single cause or mechanism behind this? Start there, in your own words.";
    return NextResponse.json({ hint });
  }

  // ===================================================== SYNTHESIZE (Sonnet, stream)
  // CRITICAL: the note is saved with body_student FIRST so the student's writing
  // is never lost, even if streaming/synthesis fails. body_synth + keypoints are
  // saved only on the client's explicit accept (separate handler below).
  if (json?.action === "synthesize") {
    const parsed = synthesizeBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { documentId, bodyStudent, retrievalPrompt, quote, originHighlightId } = parsed.data;

    const { data: doc } = await supabase
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .single();
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });

    // Save the student's work immediately (owner_id for RLS). The note exists no
    // matter what Claude does next.
    const { data: note, error: noteErr } = await supabase
      .from("notes")
      .insert({
        owner_id: user.id,
        document_id: documentId,
        body_student: bodyStudent,
        retrieval_prompt: retrievalPrompt ?? null,
        origin_highlight_id: originHighlightId ?? null,
        embedding: null, // no embedding key configured — candidate matching is text-based
      })
      .select("id")
      .single();
    if (noteErr || !note) {
      return NextResponse.json({ error: "Could not save your note." }, { status: 500 });
    }

    // Mark the originating highlight as forged so the Inbox stays clean.
    if (originHighlightId) {
      await supabase
        .from("highlights")
        .update({ triage: "forged" })
        .eq("id", originHighlightId)
        .eq("owner_id", user.id);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const safeEnqueue = (s: string) => {
          if (!closed) controller.enqueue(encoder.encode(s));
        };
        const safeClose = () => {
          if (!closed) {
            closed = true;
            controller.close();
          }
        };

        // Hand the client the saved note id up front so it can never be orphaned.
        safeEnqueue(line({ type: "saved", noteId: note.id }));

        const ms = anthropic.messages.stream({
          model: model("balanced"),
          max_tokens: 1200,
          system: `Voice: ${voice}\n\n${SYNTH_SYSTEM}`,
          messages: [
            {
              role: "user",
              content: `${quote ? `SOURCE QUOTE (read-only, do not copy from it):\n${quote}\n\n` : ""}${
                retrievalPrompt ? `RETRIEVAL PROMPT: ${retrievalPrompt}\n\n` : ""
              }STUDENT'S OWN WRITING:\n${bodyStudent}`,
            },
          ],
        });

        ms.on("text", (t) => safeEnqueue(line({ type: "delta", text: t })));

        try {
          const final = await ms.finalMessage();
          const obj = extractJson<{
            title: string;
            body_synth: string;
            keypoints: string[];
            flags: string[];
          }>(textOf(final));
          safeEnqueue(
            line({
              type: "done",
              noteId: note.id,
              title: obj?.title ?? null,
              bodySynth: obj?.body_synth ?? null,
              keypoints: Array.isArray(obj?.keypoints)
                ? obj!.keypoints.filter((k) => typeof k === "string" && k.trim()).slice(0, 4)
                : [],
              flags: Array.isArray(obj?.flags)
                ? obj!.flags.filter((f) => typeof f === "string" && f.trim()).slice(0, 3)
                : [],
            })
          );
        } catch (e) {
          // Note is already saved with body_student — the client offers "retry refine?".
          safeEnqueue(
            line({
              type: "error",
              noteId: note.id,
              message: e instanceof Error ? e.message : "Synthesis failed.",
            })
          );
        } finally {
          safeClose();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  // ============================================================== ACCEPT
  // The student accepted the synthesis: persist title, body_synth, keypoints, and
  // seed the SM-2 schedule. body_student is untouched (proof of authorship).
  if (json?.action === "accept") {
    const acceptBody = z.object({
      action: z.literal("accept"),
      noteId: z.string().uuid(),
      title: z.string().max(300).nullable().optional(),
      bodySynth: z.string().max(12000).nullable().optional(),
      keypoints: z.array(z.string().min(1).max(600)).max(4).optional(),
    });
    const parsed = acceptBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { noteId, title, bodySynth, keypoints } = parsed.data;

    const { data: note } = await supabase
      .from("notes")
      .select("id")
      .eq("id", noteId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!note) return NextResponse.json({ error: "Note not found." }, { status: 404 });

    await supabase
      .from("notes")
      .update({
        title: title ?? null,
        body_synth: bodySynth ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("owner_id", user.id);

    // Replace keypoints atomically.
    await supabase.from("note_keypoints").delete().eq("note_id", noteId).eq("owner_id", user.id);
    const points = (keypoints ?? []).filter((k) => k.trim());
    if (points.length > 0) {
      await supabase.from("note_keypoints").insert(
        points.map((text, i) => ({
          note_id: noteId,
          owner_id: user.id,
          text,
          order_idx: i,
        }))
      );
    }

    // Seed the Quick Recall schedule (due now) if not already scheduled.
    await supabase.from("note_schedule").upsert(
      {
        note_id: noteId,
        owner_id: user.id,
        next_review_at: new Date().toISOString(),
        interval_days: 0,
        ease: 2.5,
      },
      { onConflict: "note_id", ignoreDuplicates: true }
    );

    return NextResponse.json({ ok: true });
  }

  // ============================================================== LINK (Haiku)
  // Up to 3 suggested links to existing notes. Candidates pre-filtered by SIMPLE
  // text match (not vectors) over the source note's words.
  if (json?.action === "link") {
    const parsed = linkBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { documentId, noteId } = parsed.data;

    const { data: source } = await supabase
      .from("notes")
      .select("id, title, body_student, body_synth")
      .eq("id", noteId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!source) return NextResponse.json({ error: "Note not found." }, { status: 404 });

    // Other notes in this document.
    const { data: others } = await supabase
      .from("notes")
      .select("id, title, body_student, body_synth")
      .eq("document_id", documentId)
      .eq("owner_id", user.id)
      .neq("id", noteId)
      .limit(60);
    const candidatesAll = others ?? [];
    if (candidatesAll.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // Simple text pre-filter: rank by shared significant words (no vectors).
    const sourceText = `${source.title ?? ""} ${source.body_synth ?? source.body_student ?? ""}`;
    const terms = Array.from(
      new Set(
        sourceText
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 3)
      )
    );
    const ranked = candidatesAll
      .map((c) => {
        const text = `${c.title ?? ""} ${c.body_synth ?? c.body_student ?? ""}`.toLowerCase();
        let overlap = 0;
        for (const t of terms) if (text.includes(t)) overlap += 1;
        return { c, overlap };
      })
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 8)
      .map((r) => r.c);

    // Already-decided pairs we should not re-suggest.
    const { data: existingLinks } = await supabase
      .from("note_links")
      .select("target_note_id, relation, status")
      .eq("owner_id", user.id)
      .eq("source_note_id", noteId);
    const decided = new Set((existingLinks ?? []).map((l) => `${l.target_note_id}:${l.relation}`));

    const candList = ranked
      .map(
        (c, i) =>
          `${i}. id=${c.id} title="${c.title ?? "Untitled"}" — ${(
            c.body_synth ??
            c.body_student ??
            ""
          ).slice(0, 220)}`
      )
      .join("\n");

    const r = await anthropic.messages.create({
      model: model("fast"),
      max_tokens: 500,
      system:
        'Output ONLY minified JSON: {"links":[{"targetId":string,"relation":"relates_to"|"contradicts"|"example_of"|"prerequisite_of","rationale":string}]}. ' +
        "Suggest UP TO 3 meaningful links from the SOURCE NOTE to the CANDIDATE notes. " +
        "targetId MUST be one of the candidate ids. relation = how the source relates to the target. rationale = one short line (<= 16 words). " +
        "Only suggest links that are genuinely useful; return fewer (or none) rather than weak links. No prose, no code fences.",
      messages: [
        {
          role: "user",
          content: `SOURCE NOTE:\ntitle="${source.title ?? "Untitled"}"\n${
            source.body_synth ?? source.body_student ?? ""
          }\n\nCANDIDATE NOTES:\n${candList}`,
        },
      ],
    });

    const out = extractJson<{
      links: { targetId: string; relation: string; rationale: string }[];
    }>(textOf(r));
    const validIds = new Set(ranked.map((c) => c.id));
    const labelById = new Map(ranked.map((c) => [c.id, c.title ?? "Untitled"]));
    const suggestions = (out?.links ?? [])
      .filter(
        (l) =>
          l &&
          validIds.has(l.targetId) &&
          RELATIONS.includes(l.relation as Relation) &&
          !decided.has(`${l.targetId}:${l.relation}`)
      )
      .slice(0, 3)
      .map((l) => ({
        targetId: l.targetId,
        targetTitle: labelById.get(l.targetId) ?? "Untitled",
        relation: l.relation as Relation,
        rationale: typeof l.rationale === "string" ? l.rationale : "",
      }));

    return NextResponse.json({ suggestions });
  }

  // ============================================================ CONFIRM LINK
  // Confirming a suggested link writes a note_links row (status 'confirmed').
  if (json?.action === "confirm_link") {
    const confirmBody = z.object({
      action: z.literal("confirm_link"),
      documentId: z.string().uuid(),
      sourceNoteId: z.string().uuid(),
      targetNoteId: z.string().uuid(),
      relation: z.enum(RELATIONS),
      rationale: z.string().max(600).optional(),
    });
    const parsed = confirmBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { documentId, sourceNoteId, targetNoteId, relation, rationale } = parsed.data;
    if (sourceNoteId === targetNoteId) {
      return NextResponse.json({ error: "A note can't link to itself." }, { status: 400 });
    }

    const { error: linkErr } = await supabase.from("note_links").upsert(
      {
        owner_id: user.id,
        document_id: documentId,
        source_note_id: sourceNoteId,
        target_note_id: targetNoteId,
        relation,
        rationale: rationale ?? null,
        status: "confirmed",
      },
      { onConflict: "source_note_id,target_note_id,relation" }
    );
    if (linkErr) {
      return NextResponse.json({ error: "Could not save the link." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // ============================================================== GRADE (Haiku)
  // Quick Recall: score the student's re-explanation against note_keypoints
  // (covered/missed). SM-2 next-review is computed in PURE TS here — the LLM only
  // judges recall quality.
  if (json?.action === "grade") {
    const parsed = gradeBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { noteId, response } = parsed.data;

    const { data: note } = await supabase
      .from("notes")
      .select("id, title")
      .eq("id", noteId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!note) return NextResponse.json({ error: "Note not found." }, { status: 404 });

    const { data: kpRows } = await supabase
      .from("note_keypoints")
      .select("id, text, order_idx")
      .eq("note_id", noteId)
      .eq("owner_id", user.id)
      .order("order_idx", { ascending: true });
    const keypoints = kpRows ?? [];
    if (keypoints.length === 0) {
      return NextResponse.json(
        { error: "This note has no key-points to recall against yet." },
        { status: 422 }
      );
    }

    const kpList = keypoints.map((k, i) => `${i}. ${k.text}`).join("\n");

    const r = await anthropic.messages.create({
      model: model("fast"),
      max_tokens: 500,
      system:
        `Voice: ${voice}\n\n` +
        'Output ONLY minified JSON: {"covered":number[],"missed":number[],"feedback":string}. ' +
        "Grade the student's re-explanation by MEANING, never by wording or spelling. " +
        "covered = indices of KEY-POINTS the student conveyed; missed = indices they did not. Every index must appear in exactly one array. " +
        "feedback = 1-2 warm, specific sentences naming what they nailed and what to revisit. No prose, no code fences.",
      messages: [
        {
          role: "user",
          content: `KEY-POINTS:\n${kpList}\n\nSTUDENT RE-EXPLANATION:\n${response}`,
        },
      ],
    });

    const g = extractJson<{ covered: number[]; missed: number[]; feedback: string }>(textOf(r));
    const all = keypoints.map((_, i) => i);
    const covered = Array.isArray(g?.covered)
      ? g!.covered.filter((i) => Number.isInteger(i) && i >= 0 && i < keypoints.length)
      : [];
    const coveredSet = new Set(covered);
    const missed = all.filter((i) => !coveredSet.has(i));
    const feedback = g?.feedback?.trim() || "";
    const score = keypoints.length > 0 ? coveredSet.size / keypoints.length : 0;

    // ---- SM-2 (pure TS) — the LLM only judged quality above ----
    // Map recall coverage to an SM-2 grade q in 0..5.
    const q = score >= 0.85 ? 5 : score >= 0.6 ? 4 : score >= 0.4 ? 3 : score >= 0.2 ? 2 : 1;
    const { data: sched } = await supabase
      .from("note_schedule")
      .select("interval_days, ease, next_review_at")
      .eq("note_id", noteId)
      .eq("owner_id", user.id)
      .maybeSingle();

    let ease = sched?.ease ? Number(sched.ease) : 2.5;
    let interval = sched?.interval_days ?? 0;

    if (q < 3) {
      // Lapse: relearn from the start.
      interval = 0;
    } else if (interval <= 0) {
      interval = 1;
    } else if (interval === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * ease);
    }
    // Standard SM-2 ease update, floored at 1.3.
    ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

    const nextReviewAt = new Date(
      Date.now() + Math.max(interval, q < 3 ? 0 : 1) * 86_400_000
    ).toISOString();

    await supabase.from("note_schedule").upsert(
      {
        note_id: noteId,
        owner_id: user.id,
        interval_days: interval,
        ease,
        next_review_at: nextReviewAt,
        last_reviewed_at: new Date().toISOString(),
      },
      { onConflict: "note_id" }
    );

    return NextResponse.json({
      feedback,
      score,
      covered: covered.map((i) => ({ index: i, text: keypoints[i].text })),
      missed: missed.map((i) => ({ index: i, text: keypoints[i].text })),
      nextReviewAt,
      intervalDays: interval,
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
