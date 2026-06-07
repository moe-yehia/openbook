"use client";

import "@xyflow/react/dist/style.css";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import {
  Check,
  Plus,
  Loader2,
  AlertTriangle,
  CircleDashed,
  Compass,
  Map as MapIcon,
  Brain,
  X,
  CornerDownLeft,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";

// ---------------------------------------------------------------- types
type NodeStatus =
  | "ghost"
  | "unverified"
  | "confirmed"
  | "partial"
  | "off_source"
  | "misconception";

type Relation =
  | "causes"
  | "is_part_of"
  | "contrasts_with"
  | "depends_on"
  | "example_of"
  | "leads_to";

const RELATIONS: { value: Relation; label: string }[] = [
  { value: "causes", label: "causes" },
  { value: "is_part_of", label: "is part of" },
  { value: "contrasts_with", label: "contrasts with" },
  { value: "depends_on", label: "depends on" },
  { value: "example_of", label: "example of" },
  { value: "leads_to", label: "leads to" },
];

export type MapNode = {
  id: string;
  label: string | null;
  canonical_text: string | null;
  kind: string; // central | concept | subconcept
  status: NodeStatus;
  authored_by: string; // claude_seed | student
  x: number | null;
  y: number | null;
  due: boolean; // a node_review is due now
};

export type MapEdge = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relation: Relation;
  status: "unverified" | "confirmed" | "partial" | "invalid";
};

type NodeData = MapNode & {
  isNext: boolean;
  onActivate: (id: string) => void;
};

// ---------------------------------------------------------------- status vocab
// Status is encoded by SHAPE + ICON + LINE-STYLE, never colour alone.
const STATUS_META: Record<
  NodeStatus,
  { Icon: typeof Check; ring: string; line: string; tone: string; label: string }
> = {
  ghost: {
    Icon: Plus,
    ring: "border-dotted border-2 border-border-strong bg-surface-sunken/60",
    line: "dotted",
    tone: "text-content-tertiary",
    label: "Find what belongs here",
  },
  unverified: {
    Icon: CircleDashed,
    ring: "border-dashed border border-border-strong bg-surface",
    line: "dashed",
    tone: "text-content-secondary",
    label: "Not yet checked",
  },
  confirmed: {
    Icon: Check,
    ring: "border-solid border border-success/50 bg-surface",
    line: "solid",
    tone: "text-success",
    label: "Confirmed",
  },
  partial: {
    Icon: CircleDashed, // tilde-like dashed semantics
    ring: "border-dashed border border-warning/55 bg-surface",
    line: "dashed",
    tone: "text-warning",
    label: "Partial",
  },
  off_source: {
    Icon: X,
    ring: "border-dashed border border-info/55 bg-surface",
    line: "dashed",
    tone: "text-info",
    label: "Not in this source",
  },
  misconception: {
    Icon: AlertTriangle,
    ring: "border-double border-4 border-danger/60 bg-surface",
    line: "double",
    tone: "text-danger",
    label: "Misconception",
  },
};

// ---------------------------------------------------------------- custom node
function ConceptFlowNode({ data, selected }: NodeProps) {
  const d = data as unknown as NodeData;
  const central = d.kind === "central";
  const meta = STATUS_META[d.status];
  const Icon = meta.Icon;

  if (central) {
    return (
      <button
        type="button"
        onClick={() => d.onActivate(d.id)}
        className="grid min-h-[64px] min-w-[180px] place-items-center rounded-card bg-surface-inverse px-6 py-4 text-center shadow-float"
      >
        <Handle type="target" position={Position.Top} className="!opacity-0" />
        <Handle type="source" position={Position.Bottom} className="!opacity-0" />
        <span className="font-display text-title-3 font-semibold tracking-tight text-content-inverse">
          {d.label}
        </span>
      </button>
    );
  }

  const isGhost = d.status === "ghost";

  return (
    <button
      type="button"
      onClick={() => d.onActivate(d.id)}
      aria-label={`${d.label ?? "Empty stub"} — ${meta.label}`}
      className={cn(
        "group relative grid min-h-[52px] w-[176px] place-items-center rounded-lg px-4 py-3 text-center transition-shadow",
        meta.ring,
        selected ? "shadow-accent ring-2 ring-accent-ring" : "shadow-e2",
        d.isNext && "animate-pulse ring-2 ring-accent shadow-accent"
      )}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-border-strong !bg-surface" />
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-border-strong !bg-surface" />

      <span
        className={cn(
          "absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-pill bg-surface shadow-e1 ring-1 ring-border",
          meta.tone
        )}
        aria-hidden
      >
        <Icon className="h-3 w-3" />
      </span>

      {isGhost ? (
        <span className="flex flex-col items-center gap-1">
          <Plus className="h-4 w-4 text-content-tertiary" />
          <span className="text-caption-sm uppercase tracking-[0.1em] text-content-tertiary">
            What goes here?
          </span>
        </span>
      ) : (
        <span className="font-display text-callout font-semibold leading-tight text-content-primary">
          {d.label ?? "Untitled"}
        </span>
      )}

      {d.isNext && (
        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-pill bg-accent px-2 py-0.5 text-caption-sm font-semibold text-accent-foreground">
          Next
        </span>
      )}
    </button>
  );
}

const nodeTypes = { concept: ConceptFlowNode };

// ---------------------------------------------------------------- feedback rail
type RailState =
  | { kind: "idle" }
  | { kind: "grow"; nodeId: string; label: string }
  | {
      kind: "node-result";
      nodeId: string;
      status: NodeStatus;
      canonicalText: string | null;
      feedback: string;
    }
  | { kind: "recall"; nodeId: string; label: string; response: string }
  | { kind: "recall-result"; grade: string; feedback: string; intervalDays: number }
  | { kind: "edge-result"; status: string; followUp: string };

// =================================================================== seed launcher
// Empty state: the map does not exist until the student asks Claude to seed it
// (central topic + 5-9 grounded concepts + ghost stubs). Then they rebuild it.
export function SeedLauncher({ documentId }: { documentId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function seed() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mindmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seed", documentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not seed the map.");
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-2xl flex-col items-center justify-center px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-pill bg-accent-subtle">
        <Brain className="h-6 w-6 text-content-primary" />
      </span>
      <h1 className="mt-5 font-display text-title-1 text-content-primary">
        A map you rebuild from memory
      </h1>
      <p className="mt-2 max-w-md text-body-lg text-content-secondary">
        Claude seeds only the central topic and a handful of first-order concepts — plus a few empty
        stubs marked &ldquo;something belongs here.&rdquo; The rest of the map is yours to grow, connect, and
        defend, one recall at a time.
      </p>
      <Button variant="accent" size="lg" className="mt-7" onClick={seed} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Seeding the map…
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" /> Seed my map
          </>
        )}
      </Button>
      {error && (
        <div className="mt-6 inline-flex items-center gap-2 rounded-md border border-danger/30 bg-danger-subtle px-3.5 py-3 text-callout text-content-primary">
          <AlertTriangle className="h-4 w-4 text-danger" />
          {error}
        </div>
      )}
    </div>
  );
}

// =================================================================== main
export function MindMapCanvas(props: {
  mapId: string;
  centralTopic: string;
  builtPct: number;
  initialNodes: MapNode[];
  initialEdges: MapEdge[];
}) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

function Inner({
  mapId,
  centralTopic,
  builtPct,
  initialNodes,
  initialEdges,
}: {
  mapId: string;
  centralTopic: string;
  builtPct: number;
  initialNodes: MapNode[];
  initialEdges: MapEdge[];
}) {
  const [view, setView] = useState<"map" | "weak">("map");
  const [rail, setRail] = useState<RailState>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pct, setPct] = useState(builtPct);

  // Authoritative per-node model state, keyed by id (drives styling + counts).
  const modelRef = useRef<Map<string, MapNode>>(
    new Map(initialNodes.map((n) => [n.id, n]))
  );

  // The single next-action: a due node, else the first ghost stub.
  const nextNodeId = useMemo(() => {
    const due = initialNodes.find((n) => n.due && n.kind !== "central");
    if (due) return due.id;
    const ghost = initialNodes.find((n) => n.status === "ghost");
    return ghost?.id ?? null;
  }, [initialNodes]);

  const onActivate = useCallback((id: string) => {
    const n = modelRef.current.get(id);
    if (!n || n.kind === "central") return;
    setError(null);
    if (n.status === "ghost") {
      setRail({ kind: "grow", nodeId: id, label: "" });
    } else {
      // Confirmed / graded nodes go to the recall gate.
      setRail({ kind: "recall", nodeId: id, label: n.label ?? "", response: "" });
    }
  }, []);

  // Build xyflow nodes from the model.
  const toFlowNode = useCallback(
    (n: MapNode): Node => ({
      id: n.id,
      type: "concept",
      position: { x: n.x ?? 0, y: n.y ?? 0 },
      data: { ...n, isNext: n.id === nextNodeId, onActivate },
      draggable: true,
    }),
    [nextNodeId, onActivate]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(
    initialNodes.map(toFlowNode)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialEdges.map((e) => toFlowEdge(e))
  );

  // Refresh one node's data after a grade so styling/counts update live.
  const patchNode = useCallback(
    (id: string, patch: Partial<MapNode>) => {
      const cur = modelRef.current.get(id);
      if (!cur) return;
      const updated = { ...cur, ...patch };
      modelRef.current.set(id, updated);
      setNodes((nds) =>
        nds.map((nd) =>
          nd.id === id
            ? { ...nd, data: { ...updated, isNext: id === nextNodeId, onActivate } }
            : nd
        )
      );
      // "You built N%": fraction of non-central nodes the student authored & confirmed.
      const all = Array.from(modelRef.current.values()).filter((n) => n.kind !== "central");
      const built = all.filter(
        (n) => n.authored_by === "student" && n.status === "confirmed"
      ).length;
      setPct(all.length ? Math.round((built / all.length) * 100) : 0);
    },
    [nextNodeId, onActivate, setNodes]
  );

  // ----- CONNECT: drag an edge -> open the relation palette
  const [pendingConn, setPendingConn] = useState<Connection | null>(null);

  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return;
    setPendingConn(conn);
  }, []);

  async function confirmConnection(relation: Relation) {
    const conn = pendingConn;
    if (!conn || !conn.source || !conn.target) return;
    setPendingConn(null);
    setBusy(true);
    setError(null);
    // Optimistic: draw the line immediately as 'unverified', then reconcile.
    const tmpId = `tmp-${Date.now()}`;
    setEdges((eds) =>
      addEdge(
        toFlowEdge({
          id: tmpId,
          source_node_id: conn.source as string,
          target_node_id: conn.target as string,
          relation,
          status: "unverified",
        }),
        eds
      )
    );
    try {
      // Persist the edge (status 'unverified'), then validate it in one trip.
      const res = await fetch("/api/mindmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-edge",
          mapId,
          sourceNodeId: conn.source,
          targetNodeId: conn.target,
          relation,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save the connection.");
      // Swap the temp edge for the real one, recoloured by the verdict.
      setEdges((eds) =>
        eds.map((e) =>
          e.id === tmpId
            ? toFlowEdge({
                id: data.edgeId ?? tmpId,
                source_node_id: conn.source as string,
                target_node_id: conn.target as string,
                relation,
                status: data.status ?? "unverified",
              })
            : e
        )
      );
      setRail({ kind: "edge-result", status: data.status ?? "unverified", followUp: data.followUp ?? "" });
    } catch (e) {
      setEdges((eds) => eds.filter((edge) => edge.id !== tmpId));
      setError(e instanceof Error ? e.message : "Could not save the connection.");
    } finally {
      setBusy(false);
    }
  }

  // ----- GROW: submit a label for a ghost stub / node
  async function submitGrow() {
    if (rail.kind !== "grow") return;
    const label = rail.label.trim();
    if (!label || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mindmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grade-node", mapId, nodeId: rail.nodeId, label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not grade that.");
      patchNode(rail.nodeId, {
        label,
        canonical_text: data.canonicalText ?? null,
        status: data.status as NodeStatus,
        authored_by: "student",
      });
      setRail({
        kind: "node-result",
        nodeId: rail.nodeId,
        status: data.status,
        canonicalText: data.canonicalText ?? null,
        feedback: data.feedback ?? "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // Accept Claude's precise phrasing as the node's canonical text (label stays the student's).
  function acceptCanonical() {
    if (rail.kind !== "node-result" || !rail.canonicalText) return;
    patchNode(rail.nodeId, { status: "confirmed", canonical_text: rail.canonicalText });
    setRail({ kind: "idle" });
  }

  // ----- RECALL: reproduce the definition from memory
  async function submitRecall() {
    if (rail.kind !== "recall") return;
    const response = rail.response.trim();
    if (!response || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mindmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "recall", mapId, nodeId: rail.nodeId, response }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not score that.");
      patchNode(rail.nodeId, { due: false });
      setRail({
        kind: "recall-result",
        grade: data.grade,
        feedback: data.feedback ?? "",
        intervalDays: data.intervalDays ?? 1,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // Weak-spots tray: misconception / partial / off_source / due nodes.
  const weakNodes = Array.from(modelRef.current.values()).filter(
    (n) =>
      n.kind !== "central" &&
      (n.due ||
        n.status === "misconception" ||
        n.status === "partial" ||
        n.status === "off_source")
  );

  const railOpen = rail.kind !== "idle";

  return (
    <div className="relative h-full w-full bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "default" }}
        minZoom={0.25}
        maxZoom={2}
        className="bg-background"
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1.5} color="rgb(var(--ob-border))" />
        <Controls className="!rounded-lg !border !border-border !bg-surface !shadow-e2" showInteractive={false} />
      </ReactFlow>

      {/* FLOATING PILL NAV */}
      <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center">
        <div className="pointer-events-auto inline-flex items-center gap-1 rounded-pill border border-border bg-surface/90 p-1 shadow-float backdrop-blur ob-glass">
          <NavPill active={view === "map"} onClick={() => setView("map")} Icon={MapIcon}>
            Map
          </NavPill>
          <NavPill active={view === "weak"} onClick={() => setView("weak")} Icon={Compass}>
            Weak spots
            {weakNodes.length > 0 && (
              <span className="ml-1 grid h-4 min-w-4 place-items-center rounded-pill bg-warning-subtle px-1 text-caption-sm font-semibold text-warning">
                {weakNodes.length}
              </span>
            )}
          </NavPill>
        </div>
      </div>

      {/* BUILT-% STAT */}
      <div className="pointer-events-none absolute left-4 top-4 z-10">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-pill border border-accent-ring/60 bg-accent-subtle px-3 py-1.5 text-caption-sm font-medium text-content-primary shadow-e1">
          <Sparkles className="h-3.5 w-3.5" />
          You built {pct}% of this map
        </div>
      </div>

      {/* WEAK-SPOTS TRAY (overlay) */}
      {view === "weak" && (
        <div className="absolute inset-x-0 top-16 z-10 mx-auto max-w-md px-4">
          <div className="rounded-card border border-border bg-surface p-5 shadow-float ob-glass animate-scale-in">
            <div className="mb-3 flex items-center gap-2 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
              <Compass className="h-3.5 w-3.5" /> Weak spots
            </div>
            {weakNodes.length === 0 ? (
              <p className="text-body text-content-secondary">
                Nothing to repair right now. Grow a ghost stub or recall a node to keep the map alive.
              </p>
            ) : (
              <ul className="space-y-2">
                {weakNodes.map((n) => {
                  const meta = STATUS_META[n.status];
                  const Icon = meta.Icon;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => {
                          setView("map");
                          onActivate(n.id);
                        }}
                        className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface px-3.5 py-3 text-left transition-colors hover:bg-surface-sunken"
                      >
                        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-pill bg-surface-sunken", meta.tone)}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-callout font-medium text-content-primary">
                            {n.label ?? "Untitled"}
                          </span>
                          <span className="text-caption-sm text-content-tertiary">
                            {n.due ? "Due for recall" : meta.label}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* RELATION PALETTE (when an edge is dragged) */}
      {pendingConn && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-surface-inverse/20 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-card border border-border bg-surface p-6 shadow-float animate-scale-in">
            <div className="mb-1 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
              Name the relationship
            </div>
            <p className="mb-4 text-body text-content-secondary">
              How does the first concept relate to the second?
            </p>
            <div className="grid grid-cols-2 gap-2">
              {RELATIONS.map((rel) => (
                <button
                  key={rel.value}
                  disabled={busy}
                  onClick={() => confirmConnection(rel.value)}
                  className="rounded-lg border border-border bg-surface px-3 py-2.5 text-callout font-medium text-content-primary transition-colors hover:border-accent-ring hover:bg-accent-subtle disabled:opacity-50"
                >
                  {rel.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPendingConn(null)}
              className="mt-4 text-caption text-content-tertiary hover:text-content-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* RIGHT RAIL — Socratic feedback / grow / recall */}
      {railOpen && (
        <aside className="absolute inset-y-0 right-0 z-10 flex w-full max-w-sm flex-col border-l border-border bg-surface/95 shadow-float backdrop-blur ob-glass animate-fade-in">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <span className="text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
              {railTitle(rail.kind)}
            </span>
            <button
              onClick={() => setRail({ kind: "idle" })}
              aria-label="Close"
              className="grid h-7 w-7 place-items-center rounded-pill text-content-tertiary hover:bg-surface-sunken hover:text-content-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {rail.kind === "grow" && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-headline text-content-primary">
                  <Plus className="h-4 w-4 text-content-tertiary" /> Something belongs here
                </div>
                <p className="text-body text-content-secondary">
                  From memory, what concept from <strong className="text-content-primary">{centralTopic}</strong> fills
                  this gap? Type it — Claude won&rsquo;t fill it for you.
                </p>
                <textarea
                  autoFocus
                  value={rail.label}
                  onChange={(e) => setRail({ ...rail, label: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void submitGrow();
                    }
                  }}
                  rows={2}
                  placeholder="e.g. a sub-concept you remember…"
                  className="mt-4 w-full resize-none rounded-lg border border-border-strong bg-surface p-3.5 text-body text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring"
                />
                <Button variant="accent" className="mt-4 w-full" onClick={submitGrow} disabled={busy || !rail.label.trim()}>
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Checking…
                    </>
                  ) : (
                    <>
                      Check it <CornerDownLeft className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            )}

            {rail.kind === "node-result" && (
              <div>
                <StatusBadge status={rail.status} />
                <p className="mt-4 text-body text-content-primary">{rail.feedback}</p>
                {rail.canonicalText && rail.status !== "confirmed" && (
                  <div className="mt-4 rounded-lg border border-accent-ring/50 bg-accent-subtle/40 p-4">
                    <div className="mb-1.5 text-caption-sm uppercase tracking-[0.1em] text-content-secondary">
                      The source&rsquo;s precise phrasing
                    </div>
                    <p className="text-body text-content-primary">{rail.canonicalText}</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={acceptCanonical}>
                      <Check className="h-4 w-4" /> Accept this phrasing
                    </Button>
                  </div>
                )}
                <Button variant="ghost" className="mt-5 w-full" onClick={() => setRail({ kind: "idle" })}>
                  Done
                </Button>
              </div>
            )}

            {rail.kind === "recall" && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-headline text-content-primary">
                  <Brain className="h-4 w-4 text-content-tertiary" /> Recall gate
                </div>
                <p className="text-body text-content-secondary">
                  This node is blanked. From memory, reproduce the definition of{" "}
                  <strong className="text-content-primary">{rail.label || "this concept"}</strong>.
                </p>
                <textarea
                  autoFocus
                  value={rail.response}
                  onChange={(e) => setRail({ ...rail, response: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void submitRecall();
                    }
                  }}
                  rows={4}
                  placeholder="Explain it in your own words — no peeking…"
                  className="mt-4 w-full resize-none rounded-lg border border-border-strong bg-surface p-3.5 text-body text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring"
                />
                <Button variant="accent" className="mt-4 w-full" onClick={submitRecall} disabled={busy || !rail.response.trim()}>
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Scoring…
                    </>
                  ) : (
                    <>
                      Score my recall <CornerDownLeft className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            )}

            {rail.kind === "recall-result" && (
              <div>
                <RecallBadge grade={rail.grade} />
                <p className="mt-4 text-body text-content-primary">{rail.feedback}</p>
                <p className="mt-4 rounded-md bg-surface-sunken p-3.5 text-callout text-content-secondary">
                  Rescheduled by SM-2 — next review in {rail.intervalDays}{" "}
                  {rail.intervalDays === 1 ? "day" : "days"}.
                </p>
                <Button variant="ghost" className="mt-5 w-full" onClick={() => setRail({ kind: "idle" })}>
                  Done
                </Button>
              </div>
            )}

            {rail.kind === "edge-result" && (
              <div>
                <StatusBadge status={rail.status as NodeStatus} />
                {rail.followUp && (
                  <div className="mt-4 rounded-lg border border-border bg-surface-sunken p-4">
                    <div className="mb-1.5 flex items-center gap-1.5 text-caption-sm uppercase tracking-[0.1em] text-content-tertiary">
                      <Brain className="h-3.5 w-3.5" /> Defend this link
                    </div>
                    <p className="text-body text-content-primary">{rail.followUp}</p>
                  </div>
                )}
                <Button variant="ghost" className="mt-5 w-full" onClick={() => setRail({ kind: "idle" })}>
                  Done
                </Button>
              </div>
            )}

            {error && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-subtle px-3.5 py-3 text-callout text-content-primary">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                {error}
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- helpers
function toFlowEdge(e: MapEdge): Edge {
  const dashed = e.status === "unverified" || e.status === "partial";
  const invalid = e.status === "invalid";
  return {
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    label: e.relation.replace(/_/g, " "),
    animated: e.status === "unverified",
    style: {
      stroke: invalid ? "rgb(var(--ob-danger))" : "rgb(var(--ob-border-strong))",
      strokeWidth: 1.5,
      strokeDasharray: dashed ? "5 5" : invalid ? "2 3" : undefined,
    },
    labelStyle: { fontSize: 11, fill: "rgb(var(--ob-text-secondary))" },
    labelBgStyle: { fill: "rgb(var(--ob-surface))" },
  };
}

function railTitle(kind: RailState["kind"]): string {
  switch (kind) {
    case "grow":
      return "Grow";
    case "node-result":
      return "Feedback";
    case "recall":
      return "Recall";
    case "recall-result":
      return "Recall scored";
    case "edge-result":
      return "Connection";
    default:
      return "";
  }
}

function NavPill({
  active,
  onClick,
  Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof MapIcon;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-callout font-medium transition-colors",
        active
          ? "bg-surface-inverse text-content-inverse"
          : "text-content-secondary hover:bg-surface-sunken hover:text-content-primary"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: NodeStatus }) {
  const meta = STATUS_META[status];
  const tone =
    status === "confirmed"
      ? "success"
      : status === "misconception"
        ? "danger"
        : status === "off_source"
          ? "info"
          : "warning";
  const Icon = meta.Icon;
  return (
    <Pill tone={tone} icon={<Icon className="h-3.5 w-3.5" />}>
      {meta.label}
    </Pill>
  );
}

function RecallBadge({ grade }: { grade: string }) {
  const map: Record<string, { tone: "success" | "warning" | "info" | "danger"; Icon: typeof Check; label: string }> = {
    easy: { tone: "success", Icon: Check, label: "Effortless" },
    good: { tone: "info", Icon: Check, label: "Recalled it" },
    hard: { tone: "warning", Icon: CircleDashed, label: "Struggled" },
    again: { tone: "danger", Icon: AlertTriangle, label: "Missed it" },
  };
  const m = map[grade] ?? map.hard;
  const Icon = m.Icon;
  return (
    <Pill tone={m.tone} icon={<Icon className="h-3.5 w-3.5" />}>
      {m.label}
    </Pill>
  );
}
