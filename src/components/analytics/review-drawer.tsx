"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Loader2,
  Eye,
  RotateCcw,
  TriangleAlert,
  Check,
  CheckCheck,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MasteryRing } from "@/components/ui/mastery-ring";

type Item = { prompt: string; modelAnswer: string };

type Grade = { value: 1 | 2 | 3 | 4; label: string; Icon: typeof RotateCcw; tone: string };

// Colorblind-safe: distinct icon + word for every step, never colour alone.
const GRADES: Grade[] = [
  { value: 1, label: "Again", Icon: RotateCcw, tone: "danger" },
  { value: 2, label: "Hard", Icon: TriangleAlert, tone: "warning" },
  { value: 3, label: "Good", Icon: Check, tone: "info" },
  { value: 4, label: "Easy", Icon: CheckCheck, tone: "success" },
];

export function ReviewDrawer({
  open,
  conceptId,
  conceptLabel,
  startMastery,
  onClose,
  onMasteryChange,
}: {
  open: boolean;
  conceptId: string;
  conceptLabel: string;
  startMastery: number;
  onClose: () => void;
  /** Bubble the latest mastery up so the page's ring + clock stay in sync. */
  onMasteryChange: (mastery: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);
  const [mastery, setMastery] = useState(startMastery);
  const [reviewed, setReviewed] = useState(0);
  const [done, setDone] = useState(false);
  const fetched = useRef(false);

  // Fetch the review items once when the drawer opens.
  useEffect(() => {
    if (!open || fetched.current) return;
    fetched.current = true;
    (async () => {
      try {
        const res = await fetch("/api/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "items", conceptId }),
        });
        if (!res.ok)
          throw new Error((await res.json().catch(() => ({})))?.error || "Could not build a review.");
        const data = await res.json();
        if (!Array.isArray(data.items) || data.items.length === 0)
          throw new Error("No review items were generated.");
        setItems(data.items as Item[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, conceptId]);

  // Esc closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const current = items[index];
  const isLast = index + 1 >= items.length;

  async function grade(value: 1 | 2 | 3 | 4) {
    if (grading) return;
    setGrading(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grade", conceptId, grade: value }),
      });
      if (!res.ok) throw new Error("Could not save your rating.");
      const data = (await res.json()) as { mastery: number };
      // Animate the ring to its new value; the decay clock resets on the page.
      setMastery(data.mastery);
      onMasteryChange(data.mastery);
      setReviewed((n) => n + 1);
      if (isLast) {
        setDone(true);
      } else {
        setIndex((i) => i + 1);
        setRevealed(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your rating.");
    } finally {
      setGrading(false);
    }
  }

  const tone = mastery < 0.4 ? "weak" : mastery < 0.75 ? "shaky" : "solid";

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Review ${conceptLabel}`}>
      {/* dimmed backdrop */}
      <div
        className="absolute inset-0 bg-content-primary/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden
      />

      {/* drawer: slides in from the right on desktop, full-height sheet on mobile */}
      <div className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l border-border bg-surface shadow-float animate-scale-in">
        {/* header */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <MasteryRing
              value={mastery}
              tone={done ? tone : "next"}
              size={40}
              label={`${Math.round(mastery * 100)}`}
            />
            <div className="min-w-0">
              <div className="text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
                Reviewing
              </div>
              <div className="truncate text-headline text-content-primary">{conceptLabel}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close review"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-pill text-content-tertiary hover:bg-surface-sunken hover:text-content-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-7">
          {loading && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-content-tertiary">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
              <p className="text-callout">Building your review…</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-subtle px-3.5 py-3 text-callout text-content-primary">
              <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              {error}
            </div>
          )}

          {/* ----------------------------------------------------- DONE SUMMARY */}
          {done && !loading && (
            <div className="flex h-full flex-col items-center justify-center text-center animate-fade-in">
              <MasteryRing value={mastery} tone={tone} size={88} stroke={6} className="animate-pop-spring" />
              <h2 className="mt-6 font-display text-title-2 text-content-primary">
                Clock reset.
              </h2>
              <p className="mt-2 max-w-xs text-body text-content-secondary">
                You reviewed {reviewed} {reviewed === 1 ? "item" : "items"} on{" "}
                <span className="text-content-primary">{conceptLabel}</span>. Recall is back up and the
                decay clock starts again.
              </p>
              <div className="mt-7">
                <Button variant="accent" onClick={onClose}>
                  <Sparkles className="h-4 w-4" /> Back to the map
                </Button>
              </div>
            </div>
          )}

          {/* ----------------------------------------------------- ONE ITEM */}
          {current && !done && !loading && !error && (
            <div key={index} className="animate-fade-in">
              <div className="mb-4 flex items-center justify-between text-caption text-content-tertiary">
                <span>
                  Item {index + 1} of {items.length}
                </span>
                <span className="tabular-nums">free recall</span>
              </div>

              {/* huge centred prompt */}
              <p className="text-title-3 font-display leading-snug text-content-primary">
                {current.prompt}
              </p>

              {!revealed ? (
                <div className="mt-8">
                  <p className="mb-4 text-callout text-content-secondary">
                    Answer it in your head first — out loud is even better. Then check yourself.
                  </p>
                  <Button variant="outline" onClick={() => setRevealed(true)}>
                    <Eye className="h-4 w-4" /> Reveal model answer
                  </Button>
                </div>
              ) : (
                <div className="mt-6 animate-fade-in">
                  <div className="rounded-card border border-border bg-surface-sunken p-4">
                    <div className="mb-1.5 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
                      Model answer
                    </div>
                    <p className="text-body leading-relaxed text-content-primary">
                      {current.modelAnswer}
                    </p>
                  </div>

                  <div className="mt-6">
                    <div className="mb-2.5 text-caption-sm uppercase tracking-[0.1em] text-content-tertiary">
                      How well did you recall it?
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {GRADES.map((g) => {
                        const GIcon = g.Icon;
                        return (
                          <button
                            key={g.value}
                            disabled={grading}
                            onClick={() => grade(g.value)}
                            className={cn(
                              "flex flex-col items-center gap-1.5 rounded-lg border border-border px-2 py-3 transition-colors disabled:opacity-50",
                              "hover:border-border-strong hover:bg-surface-sunken",
                              g.tone === "danger" && "hover:border-danger/40",
                              g.tone === "warning" && "hover:border-warning/40",
                              g.tone === "info" && "hover:border-info/40",
                              g.tone === "success" && "hover:border-success/40"
                            )}
                          >
                            <GIcon
                              className={cn(
                                "h-5 w-5",
                                g.tone === "danger" && "text-danger",
                                g.tone === "warning" && "text-warning",
                                g.tone === "info" && "text-info",
                                g.tone === "success" && "text-success"
                              )}
                            />
                            <span className="text-caption font-medium text-content-secondary">
                              {g.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {grading && (
                      <div className="mt-3 flex items-center gap-1.5 text-caption text-content-tertiary">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating mastery…
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* footer hint */}
        {!done && !loading && (
          <div className="flex items-center justify-between border-t border-border px-6 py-3 text-caption text-content-tertiary">
            <span>{conceptLabel}</span>
            <span className="inline-flex items-center gap-1">
              {isLast ? "Last item" : "Next item"} <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
