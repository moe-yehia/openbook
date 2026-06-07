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

// ---------- node status / relation vocabularies ----------
const RELATIONS = [
  "causes",
  "is_part_of",
  "contrasts_with",
  "depends_on",
  "example_of",
  "leads_to",
] as const;

const NODE_VERDICTS = ["confirmed", "partial", "off_source", "misconception"] as const;
const EDGE_VERDICTS = ["confirmed", "partial", "invalid"] as const;
const RECALL_GRADES = ["again", "hard", "good", "easy"] as const;

// ---------- request shapes ----------
const seedBody = z.object({
  action: z.literal("seed"),
  documentId: z.string().uuid(),
});

const gradeNodeBody = z.object({
  action: z.literal("grade-node"),
  mapId: z.string().uuid(),
  nodeId: z.string().uuid(),
  label: z.string().min(1).max(200),
});

const createEdgeBody = z.object({
  action: z.literal("create-edge"),
  mapId: z.string().uuid(),
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
  relation: z.enum(RELATIONS),
});

const gradeEdgeBody = z.object({
  action: z.literal("grade-edge"),
  mapId: z.string().uuid(),
  edgeId: z.string().uuid(),
});

const recallBody = z.object({
  action: z.literal("recall"),
  mapId: z.string().uuid(),
  nodeId: z.string().uuid(),
  response: z.string().min(1).max(2000),
});

// ---------- SM-2 (pure TS — the LLM never touches the schedule) ----------
// Maps a recall-quality verdict to the classic SM-2 quality 0..5, then folds
// it into ease/interval/reps. The LLM only judges quality; this is the engine.
const SM2_QUALITY: Record<(typeof RECALL_GRADES)[number], number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

function sm2(
  prev: { ease: number; interval_days: number; reps: number },
  grade: (typeof RECALL_GRADES)[number]
): { ease: number; interval_days: number; reps: number; due_at: string } {
  const q = SM2_QUALITY[grade];
  let { ease, interval_days, reps } = prev;

  if (q < 3) {
    // Lapse — relearn from the start.
    reps = 0;
    interval_days = 1;
  } else {
    reps += 1;
    if (reps === 1) interval_days = 1;
    else if (reps === 2) interval_days = 6;
    else interval_days = Math.round(interval_days * ease);
  }

  // Standard SM-2 ease update, floored at 1.3.
  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ease = Math.max(1.3, ease);

  const due_at = new Date(Date.now() + Math.max(1, interval_days) * 86_400_000).toISOString();
  return { ease, interval_days, reps, due_at };
}

// Shared edge validator (Sonnet judges; status persisted by the caller).
type EdgeNode = { id: string; label: string | null; canonical_text: string | null };
async function validateEdge(
  supabase: ReturnType<typeof createClient>,
  ownerId: string,
  voice: string,
  args: {
    documentId: string;
    centralTopic: string;
    relation: string;
    nodes: EdgeNode[];
    sourceNodeId: string;
    targetNodeId: string;
  }
): Promise<{ status: (typeof EDGE_VERDICTS)[number]; followUp: string }> {
  void ownerId; // nodes are already RLS-scoped by the caller's query
  const byId = new Map(args.nodes.map((n) => [n.id, n]));
  const src = byId.get(args.sourceNodeId);
  const tgt = byId.get(args.targetNodeId);
  const srcLabel = src?.label || src?.canonical_text || "source concept";
  const tgtLabel = tgt?.label || tgt?.canonical_text || "target concept";

  const chunks = await retrieve(supabase, args.documentId, `${srcLabel} ${tgtLabel}`, 4);
  const context = chunks.map((c) => `[${c.n}] ${c.content.slice(0, 700)}`).join("\n\n");

  const r = await anthropic.messages.create({
    model: model("balanced"),
    max_tokens: 400,
    system:
      `Voice: ${voice}\n\n` +
      'Output ONLY minified JSON: {"status":"confirmed"|"partial"|"invalid","followUp":string}. ' +
      "Validate the relationship the student drew, grounded in CONTEXT. " +
      "confirmed = the relation holds and is supported. partial = a related link exists but the chosen relation is imprecise. invalid = the relation is not supported. " +
      "followUp = ONE short Socratic question that turns this line into a retrieval rep (answerable in one sentence). No prose, no fences.",
    messages: [
      {
        role: "user",
        content: `CENTRAL TOPIC: ${args.centralTopic}\nCLAIM: "${srcLabel}" ${args.relation.replace(/_/g, " ")} "${tgtLabel}"\n\nCONTEXT:\n${context}`,
      },
    ],
  });

  const g = extractJson<{ status: string; followUp: string }>(textOf(r));
  const status = (EDGE_VERDICTS as readonly string[]).includes(g?.status ?? "")
    ? (g!.status as (typeof EDGE_VERDICTS)[number])
    : "partial";
  return { status, followUp: g?.followUp?.trim() || "" };
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // The student's chosen voice register — prepended to every grading/follow-up prompt.
  const voice = await userRegisterStyle(supabase);

  const json = await req.json().catch(() => ({}));

  // ============================================================== SEED
  if (json?.action === "seed") {
    const parsed = seedBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { documentId } = parsed.data;

    const { data: doc } = await supabase
      .from("documents")
      .select("id, title")
      .eq("id", documentId)
      .single();
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });

    // Idempotent: one map per document per learner. Hand back the existing one.
    const { data: existing } = await supabase
      .from("mind_maps")
      .select("id")
      .eq("document_id", documentId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (existing) return NextResponse.json({ mapId: existing.id, existed: true });

    // Ground the seed in passages the student actually has to map.
    const chunks = await retrieve(supabase, documentId, doc.title, 8);
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "This document has no content to map yet." },
        { status: 422 }
      );
    }
    const context = chunks.map((c) => `[${c.n}] ${c.content.slice(0, 900)}`).join("\n\n");

    const r = await anthropic.messages.create({
      model: model("deep"),
      max_tokens: 1500,
      system:
        'Output ONLY minified JSON: {"centralTopic":string,"concepts":[{"label":string,"sourceQuote":string}]}. ' +
        "centralTopic = the single organising idea of this material (<= 6 words). " +
        "concepts = 5-9 FIRST-ORDER concepts that ACTUALLY appear in the CONTEXT — the things a student must master. " +
        "label = a short noun phrase (<= 5 words). sourceQuote = the exact verbatim sentence from CONTEXT that grounds this concept (this is hidden ground-truth, never shown). " +
        "Do NOT invent concepts absent from the CONTEXT. No prose, no code fences.",
      messages: [
        {
          role: "user",
          content: `DOCUMENT: ${doc.title}\n\nCONTEXT:\n${context}`,
        },
      ],
    });

    const out = extractJson<{
      centralTopic: string;
      concepts: { label: string; sourceQuote: string }[];
    }>(textOf(r));
    const central = (out?.centralTopic ?? doc.title).trim();
    const concepts = (out?.concepts ?? [])
      .filter((c) => c && typeof c.label === "string" && c.label.trim())
      .slice(0, 9);
    if (concepts.length === 0) {
      return NextResponse.json({ error: "Could not seed a map." }, { status: 502 });
    }

    // Create the map row first (RLS: owner = auth.uid()).
    const { data: map, error: mapErr } = await supabase
      .from("mind_maps")
      .insert({
        owner_id: user.id,
        document_id: documentId,
        title: doc.title,
        central_topic: central,
        seed_model: model("deep"),
      })
      .select("id")
      .single();
    if (mapErr || !map) {
      return NextResponse.json({ error: "Could not start the map." }, { status: 500 });
    }

    // Radial layout: central at the origin, concepts on a ring around it.
    const ring = 280;
    const insertCentral = await supabase
      .from("mind_map_nodes")
      .insert({
        map_id: map.id,
        owner_id: user.id,
        label: central,
        kind: "central",
        status: "confirmed",
        authored_by: "claude_seed",
        x: 0,
        y: 0,
      })
      .select("id")
      .single();
    if (insertCentral.error || !insertCentral.data) {
      return NextResponse.json({ error: "Could not place the central node." }, { status: 500 });
    }
    const centralId = insertCentral.data.id;

    // Hidden ground-truth anchors (embedding NULL — text matching only).
    const { data: anchors } = await supabase
      .from("source_anchors")
      .insert(
        concepts.map((c) => ({
          map_id: map.id,
          owner_id: user.id,
          quote: c.sourceQuote ?? c.label,
          embedding: null,
        }))
      )
      .select("id");
    const anchorIds = (anchors ?? []).map((a) => a.id);

    // The 5-9 seeded concept nodes (confirmed, claude_seed) on the ring.
    const conceptRows = concepts.map((c, i) => {
      const angle = (i / concepts.length) * Math.PI * 2 - Math.PI / 2;
      return {
        map_id: map.id,
        owner_id: user.id,
        parent_id: centralId,
        label: c.label,
        kind: "concept",
        status: "confirmed",
        authored_by: "claude_seed",
        source_anchor_id: anchorIds[i] ?? null,
        x: Math.round(Math.cos(angle) * ring),
        y: Math.round(Math.sin(angle) * ring),
      };
    });

    // 2-3 empty ghost stubs: "something belongs here — you find it."
    const ghostCount = concepts.length >= 7 ? 2 : 3;
    const ghostRows = Array.from({ length: ghostCount }, (_, i) => {
      const angle = ((i + 0.5) / ghostCount) * Math.PI * 2;
      return {
        map_id: map.id,
        owner_id: user.id,
        parent_id: centralId,
        label: null,
        kind: "concept",
        status: "ghost",
        authored_by: "claude_seed",
        x: Math.round(Math.cos(angle) * (ring + 140)),
        y: Math.round(Math.sin(angle) * (ring + 140)),
      };
    });

    await supabase.from("mind_map_nodes").insert([...conceptRows, ...ghostRows]);

    return NextResponse.json({ mapId: map.id, existed: false });
  }

  // ============================================================== GRADE-NODE
  if (json?.action === "grade-node") {
    const parsed = gradeNodeBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { mapId, nodeId, label } = parsed.data;

    // Scope the map to this learner and recover its document for grounding.
    const { data: map } = await supabase
      .from("mind_maps")
      .select("id, document_id, central_topic")
      .eq("id", mapId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!map) return NextResponse.json({ error: "Map not found." }, { status: 404 });

    const { data: node } = await supabase
      .from("mind_map_nodes")
      .select("id, source_anchor_id")
      .eq("id", nodeId)
      .eq("map_id", mapId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!node) return NextResponse.json({ error: "Node not found." }, { status: 404 });

    // Hidden ground-truth anchors for this map (text only — no vectors).
    const { data: anchors } = await supabase
      .from("source_anchors")
      .select("quote")
      .eq("map_id", mapId)
      .eq("owner_id", user.id)
      .limit(20);
    const anchorText = (anchors ?? []).map((a, i) => `(${i + 1}) ${a.quote}`).join("\n");

    // Plus passages retrieved on the student's own words.
    const chunks = await retrieve(supabase, map.document_id, label, 4);
    const context = chunks.map((c) => `[${c.n}] ${c.content.slice(0, 700)}`).join("\n\n");

    const r = await anthropic.messages.create({
      model: model("balanced"),
      max_tokens: 500,
      system:
        `Voice: ${voice}\n\n` +
        'Output ONLY minified JSON: {"status":"confirmed"|"partial"|"off_source"|"misconception","canonicalText":string,"feedback":string}. ' +
        "Grade the student's proposed concept against the SOURCE ANCHORS (hidden ground-truth) and CONTEXT, by MEANING never wording. " +
        "confirmed = a real concept in the source, accurately named. partial = the right area but vague/incomplete (canonicalText = the precise phrasing they should accept). " +
        "off_source = plausible but NOT actually in this material. misconception = states something the source contradicts. " +
        "canonicalText = the source's precise phrasing of this concept (always fill it; for confirmed it affirms, for partial it sharpens). feedback = ONE warm, specific sentence. No prose, no fences.",
      messages: [
        {
          role: "user",
          content: `CENTRAL TOPIC: ${map.central_topic}\nSTUDENT'S CONCEPT: ${label}\n\nSOURCE ANCHORS:\n${anchorText}\n\nCONTEXT:\n${context}`,
        },
      ],
    });

    const g = extractJson<{ status: string; canonicalText: string; feedback: string }>(textOf(r));
    const status = (NODE_VERDICTS as readonly string[]).includes(g?.status ?? "")
      ? (g!.status as (typeof NODE_VERDICTS)[number])
      : "partial";
    const canonicalText = g?.canonicalText?.trim() || null;
    const feedback = g?.feedback?.trim() || "";

    // Persist the student's label + the verdict. Claude NEVER overwrites the
    // label — canonical_text is offered as a suggestion to accept.
    const { error: updateErr } = await supabase
      .from("mind_map_nodes")
      .update({
        label,
        canonical_text: canonicalText,
        status,
        authored_by: "student",
      })
      .eq("id", nodeId)
      .eq("owner_id", user.id);
    if (updateErr) {
      return NextResponse.json({ error: "Could not save the node." }, { status: 500 });
    }

    return NextResponse.json({ status, canonicalText, feedback });
  }

  // ============================================================== CREATE-EDGE
  // Persist a student-drawn edge ('unverified'), then validate it in one round
  // trip so the canvas gets a real id + verdict + Socratic follow-up.
  if (json?.action === "create-edge") {
    const parsed = createEdgeBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { mapId, sourceNodeId, targetNodeId, relation } = parsed.data;
    if (sourceNodeId === targetNodeId) {
      return NextResponse.json({ error: "An edge needs two different nodes." }, { status: 400 });
    }

    const { data: map } = await supabase
      .from("mind_maps")
      .select("id, document_id, central_topic")
      .eq("id", mapId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!map) return NextResponse.json({ error: "Map not found." }, { status: 404 });

    // Both endpoints must belong to this map (and learner).
    const { data: ends } = await supabase
      .from("mind_map_nodes")
      .select("id, label, canonical_text")
      .in("id", [sourceNodeId, targetNodeId])
      .eq("map_id", mapId)
      .eq("owner_id", user.id);
    if ((ends ?? []).length !== 2) {
      return NextResponse.json({ error: "Both nodes must be on this map." }, { status: 400 });
    }

    const { data: edge, error: edgeErr } = await supabase
      .from("mind_map_edges")
      .insert({
        map_id: mapId,
        owner_id: user.id,
        source_node_id: sourceNodeId,
        target_node_id: targetNodeId,
        relation,
        status: "unverified",
      })
      .select("id")
      .single();
    if (edgeErr || !edge) {
      return NextResponse.json({ error: "Could not save the edge." }, { status: 500 });
    }

    const verdict = await validateEdge(supabase, user.id, voice, {
      documentId: map.document_id,
      centralTopic: map.central_topic ?? "",
      relation,
      nodes: ends ?? [],
      sourceNodeId,
      targetNodeId,
    });

    await supabase
      .from("mind_map_edges")
      .update({ status: verdict.status })
      .eq("id", edge.id)
      .eq("owner_id", user.id);

    return NextResponse.json({ edgeId: edge.id, status: verdict.status, followUp: verdict.followUp });
  }

  // ============================================================== GRADE-EDGE
  if (json?.action === "grade-edge") {
    const parsed = gradeEdgeBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { mapId, edgeId } = parsed.data;

    const { data: map } = await supabase
      .from("mind_maps")
      .select("id, document_id, central_topic")
      .eq("id", mapId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!map) return NextResponse.json({ error: "Map not found." }, { status: 404 });

    const { data: edge } = await supabase
      .from("mind_map_edges")
      .select("id, source_node_id, target_node_id, relation")
      .eq("id", edgeId)
      .eq("map_id", mapId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!edge) return NextResponse.json({ error: "Edge not found." }, { status: 404 });
    if (!(RELATIONS as readonly string[]).includes(edge.relation)) {
      return NextResponse.json({ error: "Unknown relation." }, { status: 400 });
    }

    const { data: ends } = await supabase
      .from("mind_map_nodes")
      .select("id, label, canonical_text")
      .in("id", [edge.source_node_id, edge.target_node_id])
      .eq("owner_id", user.id);

    const verdict = await validateEdge(supabase, user.id, voice, {
      documentId: map.document_id,
      centralTopic: map.central_topic ?? "",
      relation: edge.relation,
      nodes: ends ?? [],
      sourceNodeId: edge.source_node_id,
      targetNodeId: edge.target_node_id,
    });

    const { error: updateErr } = await supabase
      .from("mind_map_edges")
      .update({ status: verdict.status })
      .eq("id", edgeId)
      .eq("owner_id", user.id);
    if (updateErr) {
      return NextResponse.json({ error: "Could not save the edge." }, { status: 500 });
    }

    return NextResponse.json({ status: verdict.status, followUp: verdict.followUp });
  }

  // ============================================================== RECALL
  if (json?.action === "recall") {
    const parsed = recallBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { mapId, nodeId, response } = parsed.data;

    const { data: map } = await supabase
      .from("mind_maps")
      .select("id, document_id, central_topic")
      .eq("id", mapId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!map) return NextResponse.json({ error: "Map not found." }, { status: 404 });

    const { data: node } = await supabase
      .from("mind_map_nodes")
      .select("id, label, canonical_text, source_anchor_id")
      .eq("id", nodeId)
      .eq("map_id", mapId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!node) return NextResponse.json({ error: "Node not found." }, { status: 404 });

    // Recover the hidden ground-truth for this node if it has one.
    let truth = node.canonical_text ?? "";
    if (node.source_anchor_id) {
      const { data: anchor } = await supabase
        .from("source_anchors")
        .select("quote")
        .eq("id", node.source_anchor_id)
        .eq("owner_id", user.id)
        .maybeSingle();
      if (anchor?.quote) truth = truth ? `${truth}\n${anchor.quote}` : anchor.quote;
    }

    const r = await anthropic.messages.create({
      model: model("balanced"),
      max_tokens: 400,
      system:
        `Voice: ${voice}\n\n` +
        'Output ONLY minified JSON: {"grade":"again"|"hard"|"good"|"easy","feedback":string}. ' +
        "Score how well the student reproduced this concept's definition from memory, by MEANING not wording. " +
        "again = missed/wrong. hard = the gist with notable gaps. good = accurate. easy = accurate and complete with no hesitation. " +
        "feedback = ONE warm, specific sentence naming what was strong or missing. No prose, no fences.",
      messages: [
        {
          role: "user",
          content: `CONCEPT: ${node.label ?? "this concept"}\nGROUND TRUTH: ${truth || node.label || ""}\n\nSTUDENT RECALL: ${response}`,
        },
      ],
    });

    const g = extractJson<{ grade: string; feedback: string }>(textOf(r));
    const grade = (RECALL_GRADES as readonly string[]).includes(g?.grade ?? "")
      ? (g!.grade as (typeof RECALL_GRADES)[number])
      : "hard";
    const feedback = g?.feedback?.trim() || "";

    // SM-2 (pure TS). Read prior review state, schedule the next one.
    const { data: prior } = await supabase
      .from("node_reviews")
      .select("id, ease, interval_days, reps")
      .eq("node_id", nodeId)
      .eq("owner_id", user.id)
      .maybeSingle();

    const next = sm2(
      {
        ease: prior?.ease ?? 2.5,
        interval_days: prior?.interval_days ?? 0,
        reps: prior?.reps ?? 0,
      },
      grade
    );

    const row = {
      owner_id: user.id,
      node_id: nodeId,
      ease: next.ease,
      interval_days: next.interval_days,
      due_at: next.due_at,
      last_grade: grade,
      reps: next.reps,
      last_recalled_at: new Date().toISOString(),
    };
    if (prior?.id) {
      await supabase.from("node_reviews").update(row).eq("id", prior.id).eq("owner_id", user.id);
    } else {
      await supabase.from("node_reviews").insert(row);
    }

    return NextResponse.json({
      grade,
      feedback,
      dueAt: next.due_at,
      intervalDays: next.interval_days,
    });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
