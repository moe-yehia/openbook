import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  MindMapCanvas,
  SeedLauncher,
  type MapNode,
  type MapEdge,
} from "@/components/mindmap/mind-map-canvas";

export default async function MindMapPage({ params }: { params: { docId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, title, emoji")
    .eq("id", params.docId)
    .single();
  if (!doc) notFound();

  // One map per document per learner (RLS-scoped).
  const { data: map } = await supabase
    .from("mind_maps")
    .select("id, central_topic")
    .eq("document_id", doc.id)
    .eq("owner_id", user.id)
    .maybeSingle();

  const header = (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-5">
      <Link
        href={`/documents/${doc.id}`}
        className="inline-flex items-center gap-1.5 text-callout text-content-secondary hover:text-content-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="text-content-tertiary">{doc.emoji || "📄"}</span>
        {doc.title}
      </Link>
      <span className="ml-auto text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
        Mind map
      </span>
    </div>
  );

  // ------------------------------------------------------------- NOT SEEDED
  if (!map) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col">
        {header}
        <div className="min-h-0 flex-1">
          <SeedLauncher documentId={doc.id} />
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------- LOAD MAP
  const [{ data: nodeRows }, { data: edgeRows }] = await Promise.all([
    supabase
      .from("mind_map_nodes")
      .select("id, label, canonical_text, kind, status, authored_by, x, y")
      .eq("map_id", map.id)
      .eq("owner_id", user.id),
    supabase
      .from("mind_map_edges")
      .select("id, source_node_id, target_node_id, relation, status")
      .eq("map_id", map.id)
      .eq("owner_id", user.id),
  ]);

  // Which nodes are due for recall right now (SM-2 schedule).
  const nodeIds = (nodeRows ?? []).map((n) => n.id);
  const dueSet = new Set<string>();
  if (nodeIds.length > 0) {
    const { data: reviews } = await supabase
      .from("node_reviews")
      .select("node_id, due_at")
      .eq("owner_id", user.id)
      .in("node_id", nodeIds)
      .not("due_at", "is", null)
      .lte("due_at", new Date().toISOString());
    for (const rv of reviews ?? []) dueSet.add(rv.node_id);
  }

  const nodes: MapNode[] = (nodeRows ?? []).map((n) => ({
    id: n.id,
    label: (n.label as string | null) ?? null,
    canonical_text: (n.canonical_text as string | null) ?? null,
    kind: n.kind as string,
    status: n.status as MapNode["status"],
    authored_by: n.authored_by as string,
    x: (n.x as number | null) ?? 0,
    y: (n.y as number | null) ?? 0,
    due: dueSet.has(n.id),
  }));

  const edges: MapEdge[] = (edgeRows ?? []).map((e) => ({
    id: e.id,
    source_node_id: e.source_node_id as string,
    target_node_id: e.target_node_id as string,
    relation: e.relation as MapEdge["relation"],
    status: e.status as MapEdge["status"],
  }));

  // "You built N%": student-authored, confirmed share of the non-central nodes.
  const nonCentral = nodes.filter((n) => n.kind !== "central");
  const built = nonCentral.filter(
    (n) => n.authored_by === "student" && n.status === "confirmed"
  ).length;
  const builtPct = nonCentral.length ? Math.round((built / nonCentral.length) * 100) : 0;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {header}
      <div className="min-h-0 flex-1">
        <MindMapCanvas
          mapId={map.id}
          centralTopic={map.central_topic ?? doc.title}
          builtPct={builtPct}
          initialNodes={nodes}
          initialEdges={edges}
        />
      </div>
    </div>
  );
}
