import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { anthropic, model } from "@/lib/anthropic";
import { extractJson } from "@/lib/ai/ingest-ai";
import { userRegisterStyle } from "@/lib/ai/register-style";
import { retrieve, formatLoc } from "@/lib/rag/retrieve";

export const runtime = "nodejs";
export const maxDuration = 120;

const textOf = (m: { content: Array<{ type: string; text?: string }> }) =>
  m.content.find((b) => b.type === "text")?.text ?? "";

const generateBody = z.object({
  action: z.literal("generate"),
  documentId: z.string().uuid(),
});

const teachbackBody = z.object({
  action: z.literal("teachback"),
  documentId: z.string().uuid(),
  teachBack: z.string().min(1).max(4000),
});

// Shape Claude is asked to emit (validated tolerantly, then normalised).
const ladderShape = z.object({
  thesis: z.string(),
  spine: z.array(
    z.object({
      id: z.string().optional(),
      label: z.string(),
      bullets: z.array(
        z.object({
          text: z.string(),
          loc: z.string().nullable().optional(),
        })
      ),
    })
  ),
});

export type LadderBullet = { text: string; loc: string | null };
export type LadderNode = { id: string; label: string; bullets: LadderBullet[] };
export type LadderEdge = { from: string; to: string };
export type Ladder = {
  thesis: string;
  nodes: LadderNode[];
  edges: LadderEdge[];
  teachBack: string | null;
};

const slug = (s: string, i: number) =>
  (s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "node") + "-" + i;

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
    const parsed = generateBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { documentId } = parsed.data;

    // Document is RLS-scoped to the owner.
    const { data: doc } = await supabase
      .from("documents")
      .select("id, title")
      .eq("id", documentId)
      .single();
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });

    // Reuse an existing ladder for this doc if present (idempotent per doc).
    const { data: existing } = await supabase
      .from("summaries")
      .select("id, thesis, spine, teach_back")
      .eq("owner_id", user.id)
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingSpine = existing?.spine as
      | { nodes?: LadderNode[]; edges?: LadderEdge[] }
      | null;
    if (existing && existing.thesis && (existingSpine?.nodes?.length ?? 0) > 0) {
      return NextResponse.json({
        ladder: {
          thesis: existing.thesis,
          nodes: existingSpine?.nodes ?? [],
          edges: existingSpine?.edges ?? [],
          teachBack: existing.teach_back ?? null,
        } satisfies Ladder,
      });
    }

    // Ground the ladder in the opening + most-salient chunks (empty query →
    // retrieve() falls back to the orienting opening chunks).
    const chunks = await retrieve(supabase, documentId, doc.title ?? "", 8);
    if (chunks.length === 0) {
      return NextResponse.json({ error: "This source has no readable text yet." }, { status: 409 });
    }
    const ctx = chunks
      .map((c) => `[loc:${formatLoc(c.loc)}] ${c.content.slice(0, 1100)}`)
      .join("\n\n");

    const r = await anthropic.messages.create({
      model: model("deep"),
      max_tokens: 2400,
      system:
        `Voice: ${voice}\n\n` +
        'Output ONLY minified JSON: {"thesis":string,"spine":[{"label":string,"bullets":[{"text":string,"loc":string|null}]}]}. ' +
        "Build a STUDY LADDER for this material — a recall-gated spine, NOT a wall of text. " +
        "thesis = one tight sentence capturing the single most important claim of the whole source. " +
        "spine = 5 to 9 nodes, each a key idea ordered so earlier ideas scaffold later ones. " +
        "Each node: a short noun-phrase label (<= 6 words) and 2 to 4 crisp bullets that a student must be able to recall. " +
        "Every bullet's loc MUST be copied verbatim from the [loc:...] tag of the chunk it came from (e.g. \"p.4\"); use null only if truly unlocatable. " +
        "Ground every claim in CONTEXT; do not invent facts. No prose, no code fences.",
      messages: [
        {
          role: "user",
          content: `DOCUMENT: ${doc.title}\n\nCONTEXT:\n${ctx}`,
        },
      ],
    });

    const obj = extractJson<z.infer<typeof ladderShape>>(textOf(r));
    const valid = obj ? ladderShape.safeParse(obj) : null;
    if (!valid || !valid.success || !valid.data.thesis || valid.data.spine.length === 0) {
      return NextResponse.json({ error: "Could not build a ladder." }, { status: 502 });
    }

    const nodes: LadderNode[] = valid.data.spine.slice(0, 9).map((n, i) => ({
      id: n.id || slug(n.label, i),
      label: n.label,
      bullets: (n.bullets ?? []).slice(0, 4).map((b) => ({
        text: b.text,
        loc: b.loc ?? null,
      })),
    }));
    // Linear scaffold edges (prerequisite chain along the spine).
    const edges: LadderEdge[] = nodes
      .slice(1)
      .map((n, i) => ({ from: nodes[i].id, to: n.id }));

    const spine = { nodes, edges };

    // Persist: reuse the doc's row if one exists, else insert (owner_id set).
    if (existing) {
      await supabase
        .from("summaries")
        .update({ thesis: valid.data.thesis, spine })
        .eq("id", existing.id)
        .eq("owner_id", user.id);
    } else {
      await supabase.from("summaries").insert({
        owner_id: user.id,
        document_id: documentId,
        thesis: valid.data.thesis,
        spine,
      });
    }

    return NextResponse.json({
      ladder: {
        thesis: valid.data.thesis,
        nodes,
        edges,
        teachBack: existing?.teach_back ?? null,
      } satisfies Ladder,
    });
  }

  // ---------- TEACHBACK ----------
  if (json?.action === "teachback") {
    const parsed = teachbackBody.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    const { documentId, teachBack } = parsed.data;

    const { data: existing } = await supabase
      .from("summaries")
      .select("id")
      .eq("owner_id", user.id)
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("summaries")
        .update({ teach_back: teachBack })
        .eq("id", existing.id)
        .eq("owner_id", user.id);
      if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });
    } else {
      const { error } = await supabase.from("summaries").insert({
        owner_id: user.id,
        document_id: documentId,
        teach_back: teachBack,
      });
      if (error) return NextResponse.json({ error: "Could not save." }, { status: 500 });
    }

    return NextResponse.json({ saved: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
