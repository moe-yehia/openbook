"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  Highlighter,
  Sparkles,
  Check,
  HelpCircle,
  RotateCcw,
  Loader2,
  CircleDashed,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const CONTEXT_RADIUS = 280;

type Triage = "inbox" | "got_it" | "confused" | "forged" | "dismissed";

type Highlight = {
  id: string;
  sourceId: string | null;
  chunkId: string | null;
  color: string;
  loc: Record<string, unknown>;
  quote: string;
  annotation: string | null;
  recallQuestion: string | null;
  triage: Triage;
  context: string;
  createdAt: string;
};

type PendingPill = {
  quote: string;
  context: string;
  sourceId: string | null;
  chunkId: string | null;
  loc: Record<string, unknown>;
  // Position relative to the wrapper, in px.
  x: number;
  y: number;
};

// Optimistic placeholder id while the annotation is being minted.
const isPending = (id: string) => id.startsWith("pending-");

export function HighlightLayer({
  documentId,
  children,
}: {
  documentId: string;
  children: React.ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<PendingPill | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Fetch existing highlights for this document on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/highlights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "list", documentId }),
        });
        const data = await res.json().catch(() => ({}));
        if (alive && Array.isArray(data.highlights)) {
          setHighlights(data.highlights as Highlight[]);
        }
      } catch {
        // A failed list never blocks reading.
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [documentId]);

  // On mouseup inside the wrapper, capture a non-empty selection.
  const onMouseUp = useCallback(() => {
    const wrap = wrapperRef.current;
    if (!wrap) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setPill(null);
      return;
    }
    const quote = sel.toString().replace(/\s+/g, " ").trim();
    if (quote.length < 2) {
      setPill(null);
      return;
    }

    const range = sel.getRangeAt(0);
    // The selection must originate inside our reading surface.
    if (!wrap.contains(range.commonAncestorContainer)) {
      setPill(null);
      return;
    }

    // Attribute the highlight to the enclosing reading paragraph.
    const anchorNode = range.startContainer;
    const anchorEl =
      anchorNode.nodeType === Node.ELEMENT_NODE
        ? (anchorNode as Element)
        : anchorNode.parentElement;
    const chunkEl = anchorEl?.closest("[data-chunk-id]") as HTMLElement | null;
    const sourceEl = anchorEl?.closest("[data-source-id]") as HTMLElement | null;
    const chunkId = chunkEl?.dataset.chunkId ?? null;
    const sourceId = sourceEl?.dataset.sourceId ?? null;

    // ~280-char window of surrounding text from the paragraph the quote sits in.
    const para = (chunkEl?.textContent ?? "").replace(/\s+/g, " ").trim();
    const context = surroundingWindow(para, quote, CONTEXT_RADIUS);

    // Position the pill just below the selection, relative to the wrapper.
    const rect = range.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const x = rect.left - wrapRect.left + rect.width / 2;
    const y = rect.bottom - wrapRect.top + 8;

    const loc: Record<string, unknown> = {
      quote_len: quote.length,
      ...(chunkId ? { chunk_id: chunkId } : {}),
      ...(sourceId ? { source_id: sourceId } : {}),
    };

    setPill({ quote, context, sourceId, chunkId, loc, x, y });
  }, []);

  // Dismiss the pill on any click that collapses the selection elsewhere.
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-capture-pill]")) return;
      setPill(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // Click the capture pill → optimistic insert, then mint the annotation.
  async function capture() {
    if (!pill) return;
    const captured = pill;
    setPill(null);
    window.getSelection()?.removeAllRanges();

    const tempId = `pending-${crypto.randomUUID()}`;
    const optimistic: Highlight = {
      id: tempId,
      sourceId: captured.sourceId,
      chunkId: captured.chunkId,
      color: "accent",
      loc: captured.loc,
      quote: captured.quote,
      annotation: null,
      recallQuestion: null,
      triage: "inbox",
      context: captured.context,
      createdAt: new Date().toISOString(),
    };
    setHighlights((prev) => [optimistic, ...prev]);

    try {
      const res = await fetch("/api/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "annotate",
          documentId,
          sourceId: captured.sourceId,
          chunkId: captured.chunkId,
          quote: captured.quote,
          context: captured.context,
          loc: captured.loc,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.highlight) throw new Error(data?.error || "annotation failed");
      const real = data.highlight as Highlight;
      setHighlights((prev) => prev.map((h) => (h.id === tempId ? real : h)));
    } catch {
      // The mark stays painted; flag the card for an inline retry.
      setHighlights((prev) =>
        prev.map((h) =>
          h.id === tempId ? { ...h, annotation: "__error__", recallQuestion: null } : h
        )
      );
    }
  }

  async function retry(h: Highlight) {
    setHighlights((prev) =>
      prev.map((x) => (x.id === h.id ? { ...x, annotation: null } : x))
    );
    try {
      const res = await fetch("/api/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "annotate",
          documentId,
          sourceId: h.sourceId,
          chunkId: h.chunkId,
          quote: h.quote,
          context: h.context,
          loc: h.loc,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.highlight) throw new Error("retry failed");
      // The retry mints a new row; drop the broken optimistic one.
      const real = data.highlight as Highlight;
      setHighlights((prev) => [real, ...prev.filter((x) => x.id !== h.id)]);
    } catch {
      setHighlights((prev) =>
        prev.map((x) => (x.id === h.id ? { ...x, annotation: "__error__" } : x))
      );
    }
  }

  async function setTriage(id: string, triage: Triage) {
    if (isPending(id)) return;
    const prevTriage = highlights.find((h) => h.id === id)?.triage ?? "inbox";
    setHighlights((prev) =>
      triage === "dismissed"
        ? prev.filter((h) => h.id !== id)
        : prev.map((h) => (h.id === id ? { ...h, triage } : h))
    );
    try {
      const res = await fetch("/api/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "triage", highlightId: id, triage }),
      });
      if (!res.ok) throw new Error("triage failed");
    } catch {
      if (triage !== "dismissed") {
        setHighlights((prev) =>
          prev.map((h) => (h.id === id ? { ...h, triage: prevTriage as Triage } : h))
        );
      }
    }
  }

  return (
    <div ref={wrapperRef} onMouseUp={onMouseUp} className="relative">
      {children}

      {/* Glassmorphic capture pill near the selection */}
      {pill && (
        <button
          data-capture-pill
          onClick={capture}
          style={{ left: pill.x, top: pill.y }}
          className="ob-glass animate-pop-spring absolute z-30 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-pill px-3 py-1.5 text-caption-sm font-semibold text-content-primary shadow-float"
          aria-label="Highlight selection"
        >
          <Highlighter className="h-3.5 w-3.5 text-content-primary" />
          Highlight
        </button>
      )}

      {/* Captured highlights rail */}
      <HighlightsRail
        highlights={highlights}
        loaded={loaded}
        onRetry={retry}
        onTriage={setTriage}
      />
    </div>
  );
}

/** Right-aligned floating stack of captured-highlight cards. */
function HighlightsRail({
  highlights,
  loaded,
  onRetry,
  onTriage,
}: {
  highlights: Highlight[];
  loaded: boolean;
  onRetry: (h: Highlight) => void;
  onTriage: (id: string, triage: Triage) => void;
}) {
  return (
    <aside className="pointer-events-none fixed inset-y-0 right-0 z-20 hidden w-[340px] xl:block">
      <div className="pointer-events-auto flex h-full flex-col px-4 py-6">
        <div className="mb-3 flex items-center gap-2 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
          <Highlighter className="h-3.5 w-3.5" /> Highlights
          {highlights.length > 0 && (
            <span className="tabular-nums text-content-tertiary">· {highlights.length}</span>
          )}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {!loaded ? (
            <Skeleton className="h-28 w-full rounded-card" />
          ) : highlights.length === 0 ? (
            <div className="rounded-card border border-dashed border-border bg-surface-sunken/60 p-5 text-center">
              <span className="mx-auto grid h-9 w-9 place-items-center rounded-pill bg-accent-subtle">
                <Highlighter className="h-4 w-4 text-content-primary" />
              </span>
              <p className="mt-3 text-callout font-medium text-content-primary">
                Highlight anything.
              </p>
              <p className="mt-1 text-caption text-content-secondary">
                We&rsquo;ll make it stick — every mark becomes a recall question.
              </p>
            </div>
          ) : (
            highlights.map((h) => (
              <HighlightCard
                key={h.id}
                h={h}
                onRetry={onRetry}
                onTriage={onTriage}
              />
            ))
          )}
        </div>
      </div>
    </aside>
  );
}

type GradeState =
  | { phase: "idle" }
  | { phase: "answering" }
  | { phase: "grading" }
  | {
      phase: "graded";
      verdict: "correct" | "partial" | "missed";
      feedback: string;
      missedPoints: string[];
    }
  | { phase: "error" };

function HighlightCard({
  h,
  onRetry,
  onTriage,
}: {
  h: Highlight;
  onRetry: (h: Highlight) => void;
  onTriage: (id: string, triage: Triage) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<GradeState>({ phase: "idle" });
  const fieldId = useId();

  const loading = !isPending(h.id) ? h.annotation === null : true;
  const errored = h.annotation === "__error__";
  const settled = h.triage === "got_it" || h.triage === "confused" || h.triage === "forged";

  async function submitRecall() {
    const a = answer.trim();
    if (!a) return;
    setGrade({ phase: "grading" });
    try {
      const res = await fetch("/api/highlights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grade", highlightId: h.id, answer: a }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "grade failed");
      setGrade({
        phase: "graded",
        verdict: data.verdict,
        feedback: data.feedback ?? "",
        missedPoints: Array.isArray(data.missedPoints) ? data.missedPoints : [],
      });
      onTriage(h.id, data.verdict === "correct" ? "got_it" : "confused");
    } catch {
      setGrade({ phase: "error" });
    }
  }

  return (
    <div
      className={cn(
        "animate-scale-in rounded-card border border-border bg-surface p-4 shadow-e1",
        h.triage === "confused" && "ring-1 ring-warning/40"
      )}
    >
      {/* lime-left-border quote */}
      <div className="border-l-2 border-l-accent pl-3">
        <p className="text-callout leading-relaxed text-content-primary">
          <span className="bg-accent-subtle box-decoration-clone px-0.5">{h.quote}</span>
        </p>
      </div>

      {/* Haiku annotation — shimmer until loaded */}
      <div className="mt-3">
        {errored ? (
          <button
            onClick={() => onRetry(h)}
            className="inline-flex items-center gap-1.5 text-caption font-medium text-content-secondary hover:text-content-primary"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Retry annotation
          </button>
        ) : loading ? (
          <Skeleton className="h-4 w-full" />
        ) : (
          <p className="text-caption leading-relaxed text-content-secondary">{h.annotation}</p>
        )}
      </div>

      {/* recall question — muted italic with a lime "you'll be asked this" dot */}
      {!loading && !errored && h.recallQuestion && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-pill bg-accent"
            />
            <div className="min-w-0 flex-1">
              <p className="text-caption italic leading-relaxed text-content-tertiary">
                {h.recallQuestion}
              </p>
              <span className="mt-1 inline-flex items-center gap-1 text-caption-sm font-medium uppercase tracking-[0.05em] text-content-tertiary">
                <Sparkles className="h-3 w-3 text-content-primary" /> you&rsquo;ll be asked this
              </span>
            </div>
          </div>

          {/* triage row */}
          {grade.phase === "idle" && !settled && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <TriageButton
                tone="success"
                Icon={Check}
                label="I get it"
                onClick={() => onTriage(h.id, "got_it")}
              />
              <TriageButton
                tone="warning"
                Icon={HelpCircle}
                label="Confused"
                onClick={() => onTriage(h.id, "confused")}
              />
              <button
                onClick={() => setGrade({ phase: "answering" })}
                className="ml-auto text-caption-sm font-medium text-content-secondary underline-offset-2 hover:text-content-primary hover:underline"
              >
                Recall it
              </button>
            </div>
          )}

          {/* settled badge */}
          {grade.phase === "idle" && settled && (
            <div className="mt-3">
              {h.triage === "got_it" || h.triage === "forged" ? (
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-success-subtle px-2.5 py-1 text-caption-sm font-medium text-success">
                  <Check className="h-3.5 w-3.5" /> Got it
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-pill bg-warning-subtle px-2.5 py-1 text-caption-sm font-medium text-warning">
                  <CircleDashed className="h-3.5 w-3.5" /> Confused — revisit
                </span>
              )}
            </div>
          )}

          {/* inline recall grading */}
          {grade.phase === "answering" && (
            <div className="mt-3">
              <label htmlFor={fieldId} className="sr-only">
                Answer the recall question
              </label>
              <textarea
                id={fieldId}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void submitRecall();
                  }
                }}
                rows={2}
                placeholder="Answer from memory…"
                className="w-full resize-none rounded-md border border-border-strong bg-surface p-2.5 text-callout text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={submitRecall}
                  disabled={!answer.trim()}
                  className="inline-flex items-center gap-1.5 rounded-pill bg-cta px-3 py-1.5 text-caption-sm font-semibold text-cta-foreground transition-opacity disabled:opacity-40"
                >
                  Check answer
                </button>
                <button
                  onClick={() => setGrade({ phase: "idle" })}
                  className="text-caption-sm text-content-tertiary hover:text-content-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {grade.phase === "grading" && (
            <div className="mt-3 flex items-center gap-2 text-caption text-content-tertiary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Grading against your highlight…
            </div>
          )}

          {grade.phase === "graded" && <GradeResult grade={grade} quote={h.quote} />}

          {grade.phase === "error" && (
            <div className="mt-3 rounded-md border border-border bg-surface-sunken p-2.5">
              <p className="text-caption font-medium text-content-primary">
                Couldn&rsquo;t grade — here&rsquo;s the source passage.
              </p>
              <p className="mt-1 text-caption italic text-content-secondary">{h.quote}</p>
            </div>
          )}
        </div>
      )}

      {/* dismiss */}
      {!isPending(h.id) && (
        <button
          onClick={() => onTriage(h.id, "dismissed")}
          aria-label="Dismiss highlight"
          className="mt-2 inline-flex items-center gap-1 text-caption-sm text-content-tertiary hover:text-content-secondary"
        >
          <X className="h-3 w-3" /> Dismiss
        </button>
      )}
    </div>
  );
}

function GradeResult({
  grade,
  quote,
}: {
  grade: Extract<GradeState, { phase: "graded" }>;
  quote: string;
}) {
  const tone =
    grade.verdict === "correct"
      ? { cls: "bg-success-subtle text-success", Icon: Check, label: "Got it" }
      : grade.verdict === "partial"
        ? { cls: "bg-warning-subtle text-warning", Icon: CircleDashed, label: "Almost" }
        : { cls: "bg-danger-subtle text-danger", Icon: RotateCcw, label: "Let's revisit" };
  const ToneIcon = tone.Icon;

  return (
    <div className="mt-3 animate-fade-in">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption-sm font-semibold uppercase tracking-[0.05em]",
          tone.cls
        )}
      >
        <ToneIcon className="h-3.5 w-3.5" /> {tone.label}
      </span>
      {grade.feedback && (
        <p className="mt-2 text-caption leading-relaxed text-content-secondary">{grade.feedback}</p>
      )}
      {grade.verdict !== "correct" && (
        <div className="mt-2 border-l-2 border-l-accent pl-3">
          <p className="text-caption italic leading-relaxed text-content-primary">{quote}</p>
        </div>
      )}
    </div>
  );
}

function TriageButton({
  tone,
  Icon,
  label,
  onClick,
}: {
  tone: "success" | "warning";
  Icon: typeof Check;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-caption-sm font-medium transition-colors",
        tone === "success"
          ? "border-success/30 text-success hover:bg-success-subtle"
          : "border-warning/30 text-warning hover:bg-warning-subtle"
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

/** Extract a ~radius-char window of text centred on the quote within a paragraph. */
function surroundingWindow(para: string, quote: string, radius: number): string {
  if (!para) return quote;
  const idx = para.indexOf(quote);
  if (idx === -1) return para.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(para.length, idx + quote.length + radius);
  let window = para.slice(start, end);
  if (start > 0) window = "…" + window;
  if (end < para.length) window = window + "…";
  return window;
}
