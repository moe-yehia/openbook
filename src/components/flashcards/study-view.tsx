"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Loader2,
  Eye,
  Layers,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  ThumbsUp,
  Zap,
  Flame,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { previewIntervals, type FsrsFields, type Grade } from "@/lib/fsrs";

type Card = FsrsFields & {
  id: string;
  front: string;
  back: string;
  origin: string;
};

type Phase = "recall" | "revealed";

// Colorblind-safe confidence ramp: each grade pairs a distinct icon + text
// label with its tone (never colour alone).
const GRADES: {
  grade: Grade;
  label: string;
  hint: string;
  Icon: typeof RotateCcw;
  ring: string;
  tint: string;
  text: string;
}[] = [
  {
    grade: "again",
    label: "Again",
    hint: "Missed it",
    Icon: RotateCcw,
    ring: "border-danger/40 hover:border-danger",
    tint: "bg-danger-subtle",
    text: "text-danger",
  },
  {
    grade: "hard",
    label: "Hard",
    hint: "Struggled",
    Icon: AlertTriangle,
    ring: "border-warning/40 hover:border-warning",
    tint: "bg-warning-subtle",
    text: "text-warning",
  },
  {
    grade: "good",
    label: "Good",
    hint: "Recalled it",
    Icon: ThumbsUp,
    ring: "border-info/40 hover:border-info",
    tint: "bg-info-subtle",
    text: "text-info",
  },
  {
    grade: "easy",
    label: "Easy",
    hint: "Effortless",
    Icon: Zap,
    ring: "border-success/40 hover:border-success",
    tint: "bg-success-subtle",
    text: "text-success",
  },
];

export function StudyView({
  documentId,
  deckId,
  initialDue,
  totalCards,
}: {
  documentId: string;
  deckId: string | null;
  initialDue: Card[];
  totalCards: number;
}) {
  const [queue] = useState<Card[]>(initialDue);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("recall");
  const [typed, setTyped] = useState("");
  const [usedTyped, setUsedTyped] = useState(false);
  const [grading, setGrading] = useState(false);
  // Cards we've already graded — Prev re-shows them without re-grading.
  const [gradedIds, setGradedIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [, setDeck] = useState<string | null>(deckId);

  const card = queue[index] ?? null;
  const done = !generating && queue.length > 0 && index >= queue.length;
  const reviewed = gradedIds.size;

  const intervals = useMemo(
    () => (card ? previewIntervals(card) : null),
    [card]
  );

  // A previously-graded card opens already-revealed (history view).
  const alreadyGraded = card ? gradedIds.has(card.id) : false;

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", documentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not build the deck.");
      // A fresh deck means new cards are due now — reload to study them.
      setDeck((d) => data.deckId ?? d);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setGenerating(false);
    }
  }

  function reveal(fromTyping: boolean) {
    if (phase === "revealed") return;
    setUsedTyped(fromTyping);
    setPhase("revealed");
  }

  // Step to a sibling card. Forward past the end closes the session.
  const goTo = useCallback(
    (next: number) => {
      const target = next;
      setIndex(target);
      setError(null);
      const c = queue[target];
      // Re-showing a graded card lands on its back; a fresh card resets recall.
      if (c && gradedIds.has(c.id)) {
        setPhase("revealed");
      } else {
        setPhase("recall");
      }
      setTyped("");
      setUsedTyped(false);
    },
    [queue, gradedIds]
  );

  async function grade(g: Grade) {
    if (!card || grading) return;
    setGrading(true);
    setError(null);
    try {
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grade",
          flashcardId: card.id,
          grade: g,
          recallMode: usedTyped ? "typed" : "self_graded",
          typedAnswer: usedTyped && typed.trim() ? typed.trim() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save your review.");
      setGradedIds((prev) => {
        const nextSet = new Set(prev);
        nextSet.add(card.id);
        return nextSet;
      });
      // Advance to the next card.
      goTo(index + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setGrading(false);
    }
  }

  // Arrow-key navigation through the deck (← prev, → next-if-graded).
  const canPrev = index > 0;
  const canNext = index < queue.length - 1 && alreadyGraded;
  useEffect(() => {
    if (done || queue.length === 0) return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) return;
      if (e.key === "ArrowLeft" && canPrev) {
        e.preventDefault();
        goTo(index - 1);
      } else if (e.key === "ArrowRight" && canNext) {
        e.preventDefault();
        goTo(index + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, queue.length, canPrev, canNext, index, goTo]);

  // ---------- EMPTY DECK: invite generation ----------
  if (totalCards === 0 && !done) {
    return (
      <Centered>
        <span className="grid h-12 w-12 place-items-center rounded-pill bg-accent-subtle">
          <Layers className="h-6 w-6 text-content-primary" />
        </span>
        <h1 className="mt-5 font-display text-title-1 text-content-primary">
          Build your spaced-repetition deck
        </h1>
        <p className="mt-2 max-w-md text-body-lg text-content-secondary">
          OpenBook will draft a focused deck from this material — and fold in anything you missed on
          quizzes — then schedule each card with FSRS so it resurfaces right before you&rsquo;d forget.
        </p>
        <Button
          variant="accent"
          size="lg"
          className="mt-7"
          onClick={generate}
          disabled={generating}
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Building your deck…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Generate deck
            </>
          )}
        </Button>
        {error && <ErrorNote text={error} />}
      </Centered>
    );
  }

  // ---------- CAUGHT UP: deck exists, nothing due ----------
  if (queue.length === 0 && !done) {
    return (
      <Centered>
        <span className="grid h-12 w-12 place-items-center rounded-pill bg-success-subtle">
          <CheckCircle2 className="h-6 w-6 text-success" />
        </span>
        <h1 className="mt-5 font-display text-title-1 text-content-primary">
          You&rsquo;re caught up
        </h1>
        <p className="mt-2 max-w-md text-body-lg text-content-secondary">
          No cards are due right now. FSRS will bring them back exactly when review matters most —
          come back later to keep the memory strong.
        </p>
        <Button
          variant="outline"
          size="md"
          className="mt-7"
          onClick={generate}
          disabled={generating}
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Adding cards…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Add more cards
            </>
          )}
        </Button>
        {error && <ErrorNote text={error} />}
      </Centered>
    );
  }

  // ---------- SESSION CLOSE: calm celebration ----------
  if (done) {
    return (
      <Centered>
        <span className="grid h-12 w-12 place-items-center rounded-pill bg-accent-subtle animate-pop-spring">
          <Flame className="h-6 w-6 text-content-primary" />
        </span>
        <h1 className="mt-5 font-display text-title-1 text-content-primary">Session complete</h1>
        <p className="mt-2 text-body-lg text-content-secondary">
          You reviewed{" "}
          <span className="font-semibold text-content-primary">
            {reviewed} {reviewed === 1 ? "card" : "cards"}
          </span>{" "}
          — each one rescheduled by FSRS for the perfect moment.
        </p>
        <div className="mt-7 inline-flex items-center gap-2 rounded-pill bg-accent-subtle px-4 py-2 text-callout font-medium text-content-primary ring-1 ring-accent-ring/60">
          <Sparkles className="h-4 w-4" /> Caught up — nothing more due today
        </div>
        <div className="mt-7">
          <Button variant="outline" size="md" href={`/documents/${documentId}`}>
            Back to document
          </Button>
        </div>
      </Centered>
    );
  }

  // ---------- STUDY: tactile flip card with a due-queue deck ----------
  const total = queue.length;
  const flipped = phase === "revealed";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-7rem)] w-full max-w-2xl flex-col items-center px-6 py-8">
      {/* progress pill + reviewed count */}
      <div className="flex w-full items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-pill bg-surface-sunken px-3 py-1.5 text-caption-sm font-medium tabular-nums text-content-secondary">
          <Layers className="h-3.5 w-3.5 text-content-tertiary" />
          {index + 1} / {total}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent-subtle px-3 py-1.5 text-caption-sm font-medium tabular-nums text-content-primary ring-1 ring-accent-ring/50">
          <Flame className="h-3.5 w-3.5" />
          {reviewed} reviewed
        </span>
      </div>

      {card && (
        <div className="flex w-full flex-1 flex-col items-center justify-center">
          <FlipCard
            // Re-mount per card so the flip never animates across cards.
            key={card.id}
            card={card}
            flipped={flipped}
            usedTyped={usedTyped}
            typedAnswer={typed.trim()}
          />

          {/* CONTROLS — gated reveal, then the FSRS confidence ramp */}
          <div className="mt-7 w-full">
            {!flipped ? (
              <div className="animate-fade-in">
                <textarea
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && typed.trim()) {
                      e.preventDefault();
                      reveal(true);
                    }
                  }}
                  rows={2}
                  placeholder="Type what you remember — no peeking. (Optional, but it sticks better.)"
                  className="w-full resize-none rounded-lg border border-border-strong bg-surface p-4 text-body text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring"
                />
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => reveal(typed.trim().length > 0)}
                  >
                    <Eye className="h-4 w-4" />
                    {typed.trim().length > 0 ? "Check & flip" : "I've recalled it — flip"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="animate-fade-in">
                {alreadyGraded ? (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface-sunken px-4 py-3 text-callout text-content-secondary">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Already reviewed — use Next to keep going.
                  </div>
                ) : (
                  <>
                    <div className="mb-3 text-center text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
                      How well did you recall it?
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      {GRADES.map(({ grade: g, label, hint, Icon, ring, tint, text }) => (
                        <button
                          key={g}
                          onClick={() => grade(g)}
                          disabled={grading}
                          className={cn(
                            "flex flex-col items-center gap-1 rounded-lg border bg-surface px-3 py-3 text-center transition-colors disabled:opacity-50",
                            ring
                          )}
                        >
                          <span className={cn("grid h-8 w-8 place-items-center rounded-pill", tint)}>
                            <Icon className={cn("h-4 w-4", text)} />
                          </span>
                          <span className="text-callout font-semibold text-content-primary">
                            {label}
                          </span>
                          <span className="text-caption-sm text-content-tertiary">{hint}</span>
                          <span className="text-caption-sm tabular-nums text-content-secondary">
                            {intervals ? intervals[g] : "—"}
                          </span>
                        </button>
                      ))}
                    </div>
                    {grading && (
                      <div className="mt-3 flex items-center justify-center gap-2 text-caption text-content-tertiary">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rescheduling…
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="flex w-full justify-center">
              <ErrorNote text={error} />
            </div>
          )}

          {/* DECK NAV — Prev re-shows, never un-grades */}
          <div className="mt-8 flex w-full items-center justify-center gap-3">
            <button
              onClick={() => goTo(index - 1)}
              disabled={!canPrev}
              aria-label="Previous card"
              className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-4 py-2 text-callout font-medium text-content-secondary transition-colors hover:bg-surface-sunken hover:text-content-primary disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <span className="text-caption-sm text-content-tertiary">←  →</span>
            <button
              onClick={() => goTo(index + 1)}
              disabled={!canNext}
              aria-label="Next card"
              className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-4 py-2 text-callout font-medium text-content-secondary transition-colors hover:bg-surface-sunken hover:text-content-primary disabled:pointer-events-none disabled:opacity-40"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The tactile flip card: a stacked-deck shadow behind, a single tile that
 * rotates 180° on the Y axis to reveal its back. Under reduced motion we
 * cross-fade the two faces instead (no rotation), and depth styles collapse.
 */
function FlipCard({
  card,
  flipped,
  usedTyped,
  typedAnswer,
}: {
  card: Card;
  flipped: boolean;
  usedTyped: boolean;
  typedAnswer: string;
}) {
  const reduced = usePrefersReducedMotion();

  const faceBase =
    "absolute inset-0 flex flex-col rounded-card bg-surface-elevated p-7 shadow-float ring-1 ring-border";

  return (
    <div
      className="relative w-full"
      style={{ perspective: reduced ? undefined : "1600px" }}
    >
      {/* Stacked-cards look — two faint tiles peeking out behind the active card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-3 -z-10 h-full rounded-card bg-surface ring-1 ring-border/70 shadow-e2"
        style={{ transform: "translateY(10px) scale(0.965)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-9 top-5 -z-20 h-full rounded-card bg-surface-sunken ring-1 ring-border/50"
        style={{ transform: "translateY(20px) scale(0.93)" }}
      />

      {/* The flipping tile. Min-height keeps the deck steady as faces swap. */}
      <div
        className={cn(
          "relative min-h-[19rem] w-full transition-transform duration-slow ease-spring",
          reduced && "transition-none"
        )}
        style={
          reduced
            ? undefined
            : {
                transformStyle: "preserve-3d",
                transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
              }
        }
      >
        {/* FRONT — the prompt, big and centered. */}
        <div
          className={cn(
            faceBase,
            "items-center justify-center text-center",
            reduced && "transition-opacity duration-base ease-standard",
            reduced && flipped && "pointer-events-none opacity-0"
          )}
          style={reduced ? undefined : { backfaceVisibility: "hidden" }}
        >
          {card.origin === "quiz_miss" && (
            <span className="absolute left-7 top-7 inline-flex items-center gap-1.5 rounded-pill bg-warning-subtle px-2.5 py-1 text-caption-sm uppercase tracking-[0.05em] text-warning">
              <RotateCcw className="h-3.5 w-3.5" /> From a quiz miss
            </span>
          )}
          <div className="mb-3 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
            Recall
          </div>
          <p className="font-display text-title-1 leading-snug text-content-primary">
            {card.front}
          </p>
        </div>

        {/* BACK — the answer (+ what you typed). Pre-rotated 180° so it reads
            correctly once the tile flips. */}
        <div
          className={cn(
            faceBase,
            "justify-center",
            reduced && "transition-opacity duration-base ease-standard",
            reduced && !flipped && "pointer-events-none opacity-0"
          )}
          style={
            reduced
              ? undefined
              : { backfaceVisibility: "hidden", transform: "rotateY(180deg)" }
          }
        >
          {usedTyped && typedAnswer && (
            <div className="mb-4 rounded-lg border border-border bg-surface-sunken p-4 text-left">
              <div className="mb-1 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
                Your answer
              </div>
              <p className="text-body text-content-secondary">{typedAnswer}</p>
            </div>
          )}
          <div className="border-l-2 border-l-accent pl-4 text-left">
            <div className="mb-1 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
              Answer
            </div>
            <p className="text-body-lg leading-relaxed text-content-primary">{card.back}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Honours the OS pref AND OpenBook's in-app reduced-motion / focus toggles
 * (the `data-reduced-motion` / `data-focus` attributes on <html>).
 */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const update = () =>
      setReduced(
        mq.matches ||
          root.dataset.reducedMotion === "on" ||
          root.dataset.focus === "on"
      );
    update();
    mq.addEventListener("change", update);
    const obs = new MutationObserver(update);
    obs.observe(root, { attributes: true, attributeFilter: ["data-reduced-motion", "data-focus"] });
    return () => {
      mq.removeEventListener("change", update);
      obs.disconnect();
    };
  }, []);
  return reduced;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-2xl flex-col items-center justify-center px-6 py-12 text-center">
      {children}
    </div>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <div className="mt-6 inline-flex items-center gap-2 rounded-md border border-danger/30 bg-danger-subtle px-3.5 py-3 text-callout text-content-primary">
      <AlertTriangle className="h-4 w-4 text-danger" />
      {text}
    </div>
  );
}
