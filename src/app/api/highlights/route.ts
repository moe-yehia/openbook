import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { anthropic, model } from "@/lib/anthropic";
import { extractJson } from "@/lib/ai/ingest-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const textOf = (m: { content: Array<{ type: string; text?: string }> }) =>
  m.content.find((b) => b.type === "text")?.text ?? "";

// Frozen, cacheable system prompt — volatile highlight + context go in the user
// turn so this prefix caches across a session.
const ANNOTATE_SYSTEM =
  "You reframe a highlight as a retrieval cue, never just restating it. " +
  'Output ONLY minified JSON: {"annotation":string,"recall_question":string}. ' +
  "annotation = ONE sentence on why this passage matters, in the surrounding context — add insight, do not repeat the quote verbatim. " +
  "recall_question = ONE question whose correct answer IS the highlighted text itself (so answering it reproduces the highlight from memory). " +
  "No prose, no code fences.";

// ---------- request shapes ----------
const locShape = z.object({}).passthrough();

const annotateBody = z.object({
  action: z.literal("annotate"),
  documentId: z.string().uuid(),
  sourceId: z.string().uuid().nullable().optional(),
  chunkId: z.string().uuid().nullable().optional(),
  quote: z.string().min(1).max(4000),
  context: z.string().max(4000).optional().default(""),
  loc: locShape.optional().default({}),
});

const listBody = z.object({
  action: z.literal("list"),
  documentId: z.string().uuid(),
});

const triageBody = z.object({
  action: z.literal("triage"),
  highlightId: z.string().uuid(),
  triage: z.enum(["inbox", "got_it", "confused", "forged", "dismissed"]),
});

const gradeBody = z.object({
  action: z.literal("grade"),
  highlightId: z.string().uuid(),
  answer: z.string().min(1).max(4000),
});

type HighlightRow = {
  id: string;
  source_id: string | null;
  chunk_id: string | null;
  color: string;
  loc: Record<string, unknown>;
  quote: string;
  annotation: string | null;
  recall_question: string | null;
  triage: string;
  meta: Record<string, unknown> | null;
  created_at: string;
};

const serialize = (h: HighlightRow) => ({
  id: h.id,
  sourceId: h.source_id,
  chunkId: h.chunk_id,
  color: h.color,
  loc: h.loc ?? {},
  quote: h.quote,
  annotation: h.annotation,
  recallQuestion: h.recall_question,
  triage: h.triage,
  context: typeof h.meta?.context === "string" ? (h.meta.context as string) : "",
  createdAt: h.created_at,
});

const SELECT =
  "id, source_id, chunk_id, color, loc, quote, annotation, recall_question, triage, meta, created_at";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const json = await req.json().catch(() => ({}));

  // ============================================================== ANNOTATE
  if (json?.action === "annotate") {
    const parsed = annotateBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { documentId, sourceId, chunkId, quote, context, loc } = parsed.data;

    // Confirm the document is readable by this user (RLS-scoped).
    const { data: doc } = await supabase
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .single();
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });

    // Haiku: structured, NOT streamed — tiny atomic payload.
    const r = await anthropic.messages.create({
      model: model("fast"),
      max_tokens: 320,
      system: ANNOTATE_SYSTEM,
      messages: [
        {
          role: "user",
          content: `CONTEXT (surrounding passage):\n"""${context || quote}"""\n\nHIGHLIGHTED TEXT (the answer to your recall question):\n"""${quote}"""`,
        },
      ],
    });

    const out = extractJson<{ annotation?: string; recall_question?: string }>(textOf(r));
    const annotation = (out?.annotation ?? "").trim() || null;
    const recallQuestion = (out?.recall_question ?? "").trim() || null;

    const { data: inserted, error } = await supabase
      .from("highlights")
      .insert({
        owner_id: user.id,
        document_id: documentId,
        source_id: sourceId ?? null,
        chunk_id: chunkId ?? null,
        color: "accent",
        loc: loc ?? {},
        quote,
        annotation,
        recall_question: recallQuestion,
        triage: "inbox",
        meta: { context: context ?? "" },
      })
      .select(SELECT)
      .single();

    if (error || !inserted) {
      return NextResponse.json({ error: "Could not save the highlight." }, { status: 500 });
    }

    return NextResponse.json({ highlight: serialize(inserted as HighlightRow) });
  }

  // ================================================================== LIST
  if (json?.action === "list") {
    const parsed = listBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { documentId } = parsed.data;

    const { data: rows } = await supabase
      .from("highlights")
      .select(SELECT)
      .eq("document_id", documentId)
      .eq("owner_id", user.id)
      .neq("triage", "dismissed")
      .order("created_at", { ascending: false });

    return NextResponse.json({
      highlights: ((rows as HighlightRow[] | null) ?? []).map(serialize),
    });
  }

  // ================================================================ TRIAGE
  if (json?.action === "triage") {
    const parsed = triageBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { highlightId, triage } = parsed.data;

    const { error } = await supabase
      .from("highlights")
      .update({ triage })
      .eq("id", highlightId)
      .eq("owner_id", user.id);
    if (error) return NextResponse.json({ error: "Could not update." }, { status: 500 });

    return NextResponse.json({ ok: true, triage });
  }

  // ================================================================= GRADE
  if (json?.action === "grade") {
    const parsed = gradeBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { highlightId, answer } = parsed.data;

    const { data: h } = await supabase
      .from("highlights")
      .select("id, quote, recall_question, meta")
      .eq("id", highlightId)
      .eq("owner_id", user.id)
      .single();
    if (!h) return NextResponse.json({ error: "Highlight not found." }, { status: 404 });

    const context =
      typeof (h.meta as Record<string, unknown> | null)?.context === "string"
        ? ((h.meta as Record<string, unknown>).context as string)
        : "";

    // Sonnet grades by MEANING against the highlight + its context.
    const r = await anthropic.messages.create({
      model: model("balanced"),
      max_tokens: 500,
      system:
        'Output ONLY minified JSON: {"verdict":"correct"|"partial"|"missed","feedback":string,"missed_points":string[]}. ' +
        "Grade the student's answer to a recall question by MEANING against the IDEAL ANSWER (the highlighted text), never by wording or spelling. " +
        "feedback = 1-2 warm, specific sentences. missed_points = short phrases the student left out (empty array if fully correct). No prose, no fences.",
      messages: [
        {
          role: "user",
          content: `RECALL QUESTION: ${h.recall_question ?? ""}\nIDEAL ANSWER (the highlight): ${h.quote}\n${
            context ? `CONTEXT: ${context}\n` : ""
          }STUDENT ANSWER: ${answer}`,
        },
      ],
    });

    const g = extractJson<{
      verdict: string;
      feedback: string;
      missed_points: string[];
    }>(textOf(r));
    const verdict = ["correct", "partial", "missed"].includes(g?.verdict ?? "")
      ? (g!.verdict as "correct" | "partial" | "missed")
      : "partial";
    const feedback = g?.feedback ?? "";
    const missedPoints = Array.isArray(g?.missed_points)
      ? g!.missed_points.filter((p) => typeof p === "string")
      : [];

    return NextResponse.json({ verdict, feedback, missedPoints, quote: h.quote });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
