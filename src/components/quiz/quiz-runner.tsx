"use client";

import { useState } from "react";
import {
  Check,
  CircleDashed,
  RotateCcw,
  Loader2,
  Quote,
  Sparkles,
  Layers,
  ArrowRight,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { MasteryRing } from "@/components/ui/mastery-ring";
import { SegmentedControl } from "@/components/ui/segmented-control";

type Item = {
  id: string;
  kind: "mcq" | "short_answer";
  stem: string;
  options: { id: string; text: string }[] | null;
  conceptId: string | null;
  conceptLabel: string | null;
  explanation: string | null;
  targetMisconception: string | null;
  passage: { quote: string; locLabel: string } | null;
};

type GradeResult = {
  isCorrect: boolean;
  partialCredit: number;
  misconceptionLabel: string | null;
  feedback: string;
  explanation: string | null;
  seeded: boolean;
};

type Confidence = "guessing" | "unsure" | "confident";
const CONFIDENCE_VALUE: Record<Confidence, number> = { guessing: 0, unsure: 1, confident: 2 };

type Verdict = "correct" | "partial" | "miss";
const VERDICT = {
  correct: { tone: "success", Icon: Check, label: "Got it" },
  partial: { tone: "warning", Icon: CircleDashed, label: "Almost" },
  miss: { tone: "danger", Icon: RotateCcw, label: "Let's revisit" },
} as const;

function verdictOf(r: GradeResult): Verdict {
  if (r.isCorrect) return "correct";
  if (r.partialCredit >= 0.5) return "partial";
  return "miss";
}

type Graded = { item: Item; answer: string; result: GradeResult };

export function QuizRunner({
  documentId,
}: {
  documentId: string;
  docTitle?: string;
  docEmoji?: string;
}) {
  const [phase, setPhase] = useState<"idle" | "loading" | "running" | "debrief">("idle");
  const [error, setError] = useState<string | null>(null);

  const [quizId, setQuizId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [totalConcepts, setTotalConcepts] = useState(0);
  const [index, setIndex] = useState(0);

  const [confidence, setConfidence] = useState<Confidence>("unsure");
  const [choice, setChoice] = useState<string | null>(null); // mcq option id
  const [text, setText] = useState(""); // short answer
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);

  const [graded, setGraded] = useState<Graded[]>([]);

  async function start() {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", documentId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Could not build a quiz.");
      const data = await res.json();
      if (!Array.isArray(data.items) || data.items.length === 0) throw new Error("No items were generated.");
      setQuizId(typeof data.quizId === "string" ? data.quizId : null);
      setItems(data.items as Item[]);
      setTotalConcepts(data.totalConcepts ?? data.conceptsProbed ?? data.items.length);
      setIndex(0);
      resetItemState();
      setGraded([]);
      setPhase("running");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setPhase("idle");
    }
  }

  function resetItemState() {
    setConfidence("unsure");
    setChoice(null);
    setText("");
    setResult(null);
  }

  const current = items[index];

  async function submit() {
    if (!current || result) return;
    const answer = current.kind === "mcq" ? choice ?? "" : text.trim();
    if (!answer) return;
    setGrading(true);
    try {
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "grade",
          quizItemId: current.id,
          answer,
          confidence: CONFIDENCE_VALUE[confidence],
        }),
      });
      if (!res.ok) throw new Error("Grading failed.");
      const data = (await res.json()) as GradeResult;
      setResult(data);
      setGraded((g) => [...g, { item: current, answer, result: data }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grading failed.");
    } finally {
      setGrading(false);
    }
  }

  function overallScore(rows: Graded[]) {
    if (rows.length === 0) return 0;
    return (
      rows.reduce((s, g) => s + (g.result.isCorrect ? 1 : g.result.partialCredit), 0) / rows.length
    );
  }

  // Persist completion once, when the runner reaches the debrief.
  async function complete(rows: Graded[]) {
    if (!quizId) return;
    try {
      await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", quizId, score: overallScore(rows) }),
      });
    } catch {
      // The debrief still shows; persistence is best-effort here.
    }
  }

  function next() {
    if (index + 1 >= items.length) {
      void complete(graded);
      setPhase("debrief");
      return;
    }
    setIndex((i) => i + 1);
    resetItemState();
  }

  // -------- coverage pill: how many distinct concepts probed so far --------
  const probedConcepts = new Set(
    items.slice(0, index + (result ? 1 : 0)).map((i) => i.conceptId).filter(Boolean)
  ).size;
  const answeredAnswer = current?.kind === "mcq" ? choice : text.trim();

  // ============================================================ IDLE / INTRO
  if (phase === "idle" || phase === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <span className="grid h-12 w-12 place-items-center rounded-pill bg-accent-subtle">
          <Target className="h-6 w-6 text-content-primary" />
        </span>
        <h1 className="mt-5 font-display text-title-1 text-content-primary">
          An adaptive diagnostic, not a test.
        </h1>
        <p className="mt-2 text-body-lg text-content-secondary">
          One question at a time, one per concept. A wrong answer is never a dead end — every miss
          becomes a flashcard and resurfaces until it sticks.
        </p>
        {error && (
          <div className="mt-6 flex items-start gap-2 rounded-md border border-danger/30 bg-danger-subtle px-3.5 py-3 text-callout text-content-primary">
            <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            {error}
          </div>
        )}
        <div className="mt-7">
          <Button variant="accent" onClick={start} disabled={phase === "loading"}>
            {phase === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Building your quiz…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Start the diagnostic
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  // ================================================================ DEBRIEF
  if (phase === "debrief") {
    return <Debrief graded={graded} totalConcepts={totalConcepts} onRetake={start} />;
  }

  // ================================================================ RUNNER
  if (!current) return null;
  const v = result ? VERDICT[verdictOf(result)] : null;
  const VIcon = v?.Icon ?? Check;

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      {/* coverage, never "Q3/10" */}
      <div className="mb-5 flex items-center justify-between">
        <Pill tone="accent" icon={<Layers className="h-3.5 w-3.5" />}>
          {probedConcepts} of {totalConcepts} concepts probed
        </Pill>
        <span className="text-caption text-content-tertiary">
          {index + 1} / {items.length}
        </span>
      </div>

      <div className="rounded-card border border-border bg-surface p-7 shadow-e2 animate-scale-in">
        {current.conceptLabel && (
          <div className="mb-2 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
            {current.conceptLabel}
          </div>
        )}
        <p className="text-title-3 font-display text-content-primary">{current.stem}</p>

        {/* BEFORE answering: confidence */}
        {!result && (
          <div className="mt-5">
            <div className="mb-2 text-caption-sm uppercase tracking-[0.1em] text-content-tertiary">
              How sure are you?
            </div>
            <SegmentedControl<Confidence>
              ariaLabel="Confidence"
              value={confidence}
              onChange={setConfidence}
              options={[
                { value: "guessing", label: "Guessing" },
                { value: "unsure", label: "Unsure" },
                { value: "confident", label: "Confident" },
              ]}
            />
          </div>
        )}

        {/* answer input */}
        <div className="mt-5">
          {current.kind === "mcq" && current.options ? (
            <div className="space-y-2">
              {current.options.map((o) => {
                const selected = choice === o.id;
                return (
                  <button
                    key={o.id}
                    disabled={!!result}
                    onClick={() => setChoice(o.id)}
                    className={cn(
                      "flex w-full items-center rounded-lg border px-3.5 py-3 text-left text-body transition-colors disabled:cursor-default",
                      selected
                        ? "border-accent-ring bg-accent-subtle text-content-primary"
                        : "border-border hover:border-border-strong hover:bg-surface-sunken",
                      result && "opacity-90"
                    )}
                  >
                    {o.text}
                  </button>
                );
              })}
            </div>
          ) : (
            <textarea
              value={text}
              disabled={!!result}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="Answer in your own words — no peeking…"
              className="w-full resize-none rounded-md border border-border-strong bg-surface p-3.5 text-body text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring disabled:opacity-90"
            />
          )}
        </div>

        {/* submit */}
        {!result && (
          <div className="mt-5">
            <Button onClick={submit} disabled={grading || !answeredAnswer}>
              {grading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Checking…
                </>
              ) : (
                "Submit answer"
              )}
            </Button>
          </div>
        )}

        {/* FEEDBACK */}
        {result && v && (
          <div className="mt-6 animate-fade-in" aria-live="polite">
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption-sm font-semibold uppercase tracking-[0.05em]",
                v.tone === "success" && "bg-success-subtle text-success",
                v.tone === "warning" && "bg-warning-subtle text-warning",
                v.tone === "danger" && "bg-danger-subtle text-danger"
              )}
            >
              <VIcon className="h-3.5 w-3.5" />
              {v.label}
            </div>

            <p className="mt-3 text-body text-content-primary">{result.feedback}</p>

            {result.explanation && (
              <p className="mt-3 rounded-md bg-surface-sunken p-3.5 text-body text-content-secondary">
                {result.explanation}
              </p>
            )}

            {current.passage && (
              <div className="mt-3 rounded-lg border border-accent-ring/50 bg-accent-subtle/40 p-4">
                <div className="mb-1.5 flex items-center gap-1.5 text-caption-sm font-semibold text-content-secondary">
                  <Quote className="h-3.5 w-3.5" /> {current.passage.locLabel}
                </div>
                <p className="text-callout leading-relaxed text-content-primary">
                  {current.passage.quote}
                </p>
              </div>
            )}

            {result.seeded && (
              <div className="mt-3 inline-flex items-center gap-1.5 text-caption text-content-tertiary">
                <Layers className="h-3.5 w-3.5" /> Saved as a flashcard for review.
              </div>
            )}

            <div className="mt-5">
              <Button onClick={next}>
                {index + 1 >= items.length ? "See your debrief" : "Next concept"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-5 rounded-md border border-danger/30 bg-danger-subtle px-3.5 py-3 text-callout text-content-primary">
          {error}
        </div>
      )}
    </div>
  );
}

// =================================================================== DEBRIEF
function Debrief({
  graded,
  totalConcepts,
  onRetake,
}: {
  graded: Graded[];
  totalConcepts: number;
  onRetake: () => void;
}) {
  // Per-concept rollup.
  type Roll = { label: string; correct: number; total: number; score: number };
  const byConcept = new Map<string, Roll>();
  for (const g of graded) {
    const key = g.item.conceptId ?? g.item.conceptLabel ?? g.item.id;
    const label = g.item.conceptLabel ?? "Concept";
    const r = byConcept.get(key) ?? { label, correct: 0, total: 0, score: 0 };
    r.total += 1;
    r.score += g.result.isCorrect ? 1 : g.result.partialCredit;
    if (g.result.isCorrect) r.correct += 1;
    byConcept.set(key, r);
  }
  const rolls = Array.from(byConcept.values()).map((r) => ({
    ...r,
    mastery: r.total ? r.score / r.total : 0,
  }));
  rolls.sort((a, b) => a.mastery - b.mastery);

  const misconceptions = graded
    .filter((g) => !g.result.isCorrect && g.result.misconceptionLabel)
    .map((g) => g.result.misconceptionLabel as string);
  const uniqueMis = Array.from(new Set(misconceptions));
  const seededCount = graded.filter((g) => g.result.seeded).length;
  const overall =
    graded.length === 0
      ? 0
      : graded.reduce((s, g) => s + (g.result.isCorrect ? 1 : g.result.partialCredit), 0) /
        graded.length;

  const tone = (m: number): "weak" | "shaky" | "solid" =>
    m < 0.4 ? "weak" : m < 0.75 ? "shaky" : "solid";

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center gap-2 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
        <Target className="h-3.5 w-3.5" /> Debrief
      </div>
      <h1 className="mt-2 font-display text-title-1 text-content-primary">
        {probedSentence(rolls.length, totalConcepts)}
      </h1>
      <p className="mt-2 text-body-lg text-content-secondary">
        You scored {Math.round(overall * 100)}% across {graded.length}{" "}
        {graded.length === 1 ? "question" : "questions"}. Here&rsquo;s where you stand.
      </p>

      {/* per-concept mastery rings */}
      <div className="mt-7 space-y-3">
        {rolls.map((r) => (
          <div
            key={r.label}
            className="flex items-center gap-4 rounded-card border border-border bg-surface p-4"
          >
            <MasteryRing
              value={r.mastery}
              tone={tone(r.mastery)}
              size={44}
              label={`${Math.round(r.mastery * 100)}`}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-headline text-content-primary">{r.label}</div>
              <div className="text-caption text-content-tertiary">
                {r.correct} of {r.total} correct
              </div>
            </div>
            <Pill
              tone={r.mastery < 0.4 ? "danger" : r.mastery < 0.75 ? "warning" : "success"}
              icon={
                r.mastery < 0.4 ? (
                  <RotateCcw className="h-3.5 w-3.5" />
                ) : r.mastery < 0.75 ? (
                  <CircleDashed className="h-3.5 w-3.5" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )
              }
            >
              {tone(r.mastery)}
            </Pill>
          </div>
        ))}
      </div>

      {/* top misconceptions */}
      {uniqueMis.length > 0 && (
        <div className="mt-7">
          <div className="mb-2 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
            Top misconceptions to clear up
          </div>
          <div className="flex flex-wrap gap-2">
            {uniqueMis.map((m) => (
              <Pill key={m} tone="warning" icon={<CircleDashed className="h-3.5 w-3.5" />}>
                {m}
              </Pill>
            ))}
          </div>
        </div>
      )}

      {/* flashcards created */}
      <div className="mt-7 flex items-center gap-3 rounded-card border border-accent-ring/50 bg-accent-subtle/40 p-4">
        <span className="grid h-10 w-10 place-items-center rounded-pill bg-accent-subtle">
          <Layers className="h-5 w-5 text-content-primary" />
        </span>
        <div>
          <div className="text-headline text-content-primary">
            {seededCount} {seededCount === 1 ? "flashcard" : "flashcards"} created
          </div>
          <div className="text-caption text-content-secondary">
            Your misses are queued for spaced review so they resurface until they stick.
          </div>
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <Button variant="accent" onClick={onRetake}>
          <RotateCcw className="h-4 w-4" /> Run another diagnostic
        </Button>
      </div>
    </div>
  );
}

function probedSentence(probed: number, total: number): string {
  if (probed >= total && total > 0) return "You probed every concept.";
  return `You probed ${probed} of ${total} concepts.`;
}
