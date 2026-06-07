"use client";

import { useMemo, useRef, useState } from "react";
import {
  Sparkles,
  Loader2,
  Quote,
  ChevronDown,
  Lightbulb,
  Check,
  CircleDashed,
  RotateCcw,
  PencilLine,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ConceptNode } from "@/components/ui/concept-graph";

type Bullet = { text: string; loc: string | null };
type Node = { id: string; label: string; bullets: Bullet[] };
type Edge = { from: string; to: string };
type Confidence = "got" | "shaky" | "lost";

type LadderData = {
  thesis: string;
  nodes: Node[];
  edges: Edge[];
  teachBack: string | null;
};

// A node's worst remembered confidence drives its spine colour. "review next"
// (lime) is reserved for the single weakest revealed node.
function nodeTone(
  node: Node,
  revealed: boolean,
  confidences: Record<string, Confidence>,
  reviewNextId: string | null
): "neutral" | "weak" | "shaky" | "solid" | "next" {
  if (node.id === reviewNextId) return "next";
  if (!revealed) return "neutral";
  let worst: Confidence | null = null;
  node.bullets.forEach((_, i) => {
    const c = confidences[`${node.id}:${i}`];
    if (!c) return;
    if (c === "lost" || worst === "lost") worst = "lost";
    else if (c === "shaky") worst = worst === null ? "shaky" : worst;
    else if (worst === null) worst = "got";
  });
  if (worst === "lost") return "weak";
  if (worst === "shaky") return "shaky";
  if (worst === "got") return "solid";
  return "neutral";
}

const CONF_OPTIONS = [
  { value: "got" as const, label: "Got it" },
  { value: "shaky" as const, label: "Shaky" },
  { value: "lost" as const, label: "Lost" },
];

export function StudyLadder({ documentId }: { documentId: string }) {
  const [ladder, setLadder] = useState<LadderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-node interaction state.
  const [committed, setCommitted] = useState<Record<string, boolean>>({});
  const [confidences, setConfidences] = useState<Record<string, Confidence>>({});

  // Teach-back.
  const [teachBack, setTeachBack] = useState("");
  const [savingTeach, setSavingTeach] = useState(false);
  const [savedTeach, setSavedTeach] = useState(false);
  const started = useRef(false);

  async function generate() {
    if (started.current) return;
    started.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", documentId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Couldn't build the ladder.");
      const data = (await res.json()) as { ladder: LadderData };
      setLadder(data.ladder);
      if (data.ladder.teachBack) {
        setTeachBack(data.ladder.teachBack);
        setSavedTeach(true);
      }
    } catch (e) {
      started.current = false;
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function saveTeachBack() {
    const value = teachBack.trim();
    if (!value || savingTeach) return;
    setSavingTeach(true);
    setSavedTeach(false);
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "teachback", documentId, teachBack: value }),
      });
      if (!res.ok) throw new Error();
      setSavedTeach(true);
    } catch {
      setError("Couldn't save your teach-back. Try again.");
    } finally {
      setSavingTeach(false);
    }
  }

  // The single weakest revealed node = the lime "review next" anchor.
  const reviewNextId = useMemo(() => {
    if (!ladder) return null;
    const rank = { lost: 0, shaky: 1, got: 2 } as const;
    let best: { id: string; score: number } | null = null;
    for (const node of ladder.nodes) {
      if (!committed[node.id]) continue;
      let worst = 3;
      node.bullets.forEach((_, i) => {
        const c = confidences[`${node.id}:${i}`];
        if (c) worst = Math.min(worst, rank[c]);
      });
      if (worst === 3) continue;
      if (!best || worst < best.score) best = { id: node.id, score: worst };
    }
    return best?.id ?? null;
  }, [ladder, committed, confidences]);

  const revealedCount = ladder ? ladder.nodes.filter((n) => committed[n.id]).length : 0;
  const allRevealed = ladder ? revealedCount === ladder.nodes.length : false;

  // ---------- Empty / start ----------
  if (!ladder) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-14">
        <span className="grid h-11 w-11 place-items-center rounded-pill bg-accent-subtle">
          <Sparkles className="h-5 w-5 text-content-primary" />
        </span>
        <h1 className="mt-4 font-display text-title-1 text-content-primary">
          Climb the Study Ladder.
        </h1>
        <p className="mt-2 text-body-lg text-content-secondary">
          Not a wall of text — a spine of key ideas. You&rsquo;ll predict each one before it reveals,
          rate how solid it feels, then teach it back in your own words.
        </p>
        {error && (
          <div className="mt-5 rounded-md border border-danger/30 bg-danger-subtle px-3.5 py-3 text-callout text-content-primary">
            {error}
          </div>
        )}
        <button
          onClick={generate}
          disabled={loading}
          className="mt-6 inline-flex items-center gap-2 rounded-pill bg-cta px-5 py-2.5 text-callout font-medium text-cta-foreground transition-opacity disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Building your ladder…" : "Build the ladder"}
        </button>
      </div>
    );
  }

  // ---------- The ladder ----------
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-6 py-10 lg:grid-cols-[1fr_240px]">
      <div className="min-w-0">
        {/* Thesis — always visible, tightly tracked */}
        <div className="rounded-card border border-accent-ring/50 bg-accent-subtle/40 p-6">
          <div className="mb-2 flex items-center gap-2 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
            <Lightbulb className="h-3.5 w-3.5" /> The thesis
          </div>
          <p className="font-display text-title-3 leading-snug text-content-primary">
            {ladder.thesis}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
            The spine · {revealedCount}/{ladder.nodes.length} revealed
          </div>
        </div>

        {/* Spine of recall-gated nodes */}
        <ol className="mt-3 space-y-3">
          {ladder.nodes.map((node, idx) => {
            const open = !!committed[node.id];
            return (
              <li
                key={node.id}
                className={cn(
                  "rounded-card border bg-surface transition-colors",
                  node.id === reviewNextId
                    ? "border-accent-ring shadow-accent"
                    : "border-border"
                )}
              >
                {/* Header / commitment gate */}
                {!open ? (
                  <CommitGate
                    index={idx + 1}
                    label={node.label}
                    onCommit={() => setCommitted((p) => ({ ...p, [node.id]: true }))}
                  />
                ) : (
                  <div className="p-5">
                    <div className="flex items-baseline gap-2.5">
                      <span className="font-display text-callout font-semibold tabular-nums text-content-tertiary">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <h3 className="font-display text-headline text-content-primary">
                        {node.label}
                      </h3>
                    </div>

                    {/* Revealed bullets — self-explain with a confidence toggle */}
                    <ul className="mt-4 space-y-4">
                      {node.bullets.map((b, i) => {
                        const key = `${node.id}:${i}`;
                        const conf = confidences[key];
                        return (
                          <li key={i} className="animate-fade-in">
                            <div className="flex items-start gap-2.5">
                              <span
                                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong"
                                aria-hidden
                              />
                              <div className="min-w-0 flex-1">
                                <p className="text-body text-content-primary">{b.text}</p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  {b.loc && (
                                    <span className="inline-flex items-center gap-1 rounded-pill bg-surface-sunken px-2 py-0.5 text-caption-sm text-content-tertiary">
                                      <Quote className="h-3 w-3" />
                                      {b.loc}
                                    </span>
                                  )}
                                  <SegmentedControl
                                    size="sm"
                                    ariaLabel={`How solid is: ${b.text.slice(0, 40)}`}
                                    options={CONF_OPTIONS}
                                    value={conf ?? "got"}
                                    onChange={(v) =>
                                      setConfidences((p) => ({ ...p, [key]: v }))
                                    }
                                    className={cn(!conf && "opacity-80")}
                                  />
                                  <ConfidenceMark conf={conf} />
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {/* Consolidate — teach-back */}
        <div
          className={cn(
            "mt-7 rounded-card border border-border bg-surface p-6",
            allRevealed && "border-l-2 border-l-accent"
          )}
        >
          <div className="mb-1 flex items-center gap-2 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
            <PencilLine className="h-3.5 w-3.5" /> 20-second teach-back
          </div>
          <p className="text-headline text-content-primary">
            Without looking up, explain the thesis in your own words.
          </p>
          <p className="mt-1 text-caption text-content-tertiary">
            {allRevealed
              ? "You've revealed the whole spine — close the loop by saying it back."
              : "You can do this any time, but it lands hardest after you've climbed the spine."}
          </p>
          <textarea
            value={teachBack}
            onChange={(e) => {
              setTeachBack(e.target.value);
              setSavedTeach(false);
            }}
            rows={4}
            placeholder="So the core idea is…"
            className="mt-3 w-full resize-none rounded-md border border-border-strong bg-surface p-3 text-body text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={saveTeachBack}
              disabled={savingTeach || !teachBack.trim()}
              className="inline-flex items-center gap-2 rounded-pill bg-cta px-4 py-2 text-callout font-medium text-cta-foreground disabled:opacity-40"
            >
              {savingTeach ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {savingTeach ? "Saving…" : "Save teach-back"}
            </button>
            {savedTeach && (
              <span className="inline-flex items-center gap-1.5 text-caption font-medium text-success">
                <Check className="h-3.5 w-3.5" /> Saved
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-md border border-danger/30 bg-danger-subtle px-3.5 py-3 text-callout text-content-primary">
            {error}
          </div>
        )}
      </div>

      {/* Spine map — re-colours by confidence */}
      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <div className="mb-3 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
            Your spine
          </div>
          <div className="flex flex-col gap-2">
            {ladder.nodes.map((node, idx) => (
              <ConceptNode
                key={node.id}
                tone={nodeTone(node, !!committed[node.id], confidences, reviewNextId)}
                active={node.id === reviewNextId}
                label={node.label}
                sublabel={
                  committed[node.id]
                    ? node.id === reviewNextId
                      ? "Review next"
                      : "Revealed"
                    : "Collapsed"
                }
                className="w-full"
                style={{ animationDelay: `${idx * 30}ms` }}
              />
            ))}
          </div>
          <p className="mt-4 text-caption-sm leading-relaxed text-content-tertiary">
            Lime marks the one idea to review next. Amber = shaky, green = solid.
          </p>
        </div>
      </aside>
    </div>
  );
}

/** Predict-before-reveal gate: bullets render only after the student commits. */
function CommitGate({
  index,
  label,
  onCommit,
}: {
  index: number;
  label: string;
  onCommit: () => void;
}) {
  const [prediction, setPrediction] = useState("");
  return (
    <div className="p-5">
      <div className="flex items-baseline gap-2.5">
        <span className="font-display text-callout font-semibold tabular-nums text-content-tertiary">
          {String(index).padStart(2, "0")}
        </span>
        <h3 className="font-display text-headline text-content-primary">{label}</h3>
      </div>
      <p className="mt-2 text-caption text-content-tertiary">
        Before you reveal this: what do you already know about it? (Predicting first makes it stick.)
      </p>
      <input
        value={prediction}
        onChange={(e) => setPrediction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
        }}
        placeholder="One line — your best guess (optional)…"
        className="mt-3 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-body text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring"
      />
      <button
        onClick={onCommit}
        className="mt-3 inline-flex items-center gap-2 rounded-pill border border-border-strong bg-surface px-4 py-2 text-callout font-medium text-content-primary transition-colors hover:bg-surface-sunken"
      >
        <ChevronDown className="h-4 w-4" />
        {prediction.trim() ? "Reveal & check my guess" : "I think I know this — reveal"}
      </button>
    </div>
  );
}

/** Status pairs colour with an icon/shape (never colour alone). */
function ConfidenceMark({ conf }: { conf?: Confidence }) {
  if (!conf) return null;
  const map = {
    got: { Icon: Check, cls: "text-success", label: "Got it" },
    shaky: { Icon: CircleDashed, cls: "text-warning", label: "Shaky" },
    lost: { Icon: RotateCcw, cls: "text-danger", label: "Lost" },
  } as const;
  const { Icon, cls, label } = map[conf];
  return (
    <span className={cn("inline-flex items-center gap-1 text-caption-sm font-medium", cls)}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
