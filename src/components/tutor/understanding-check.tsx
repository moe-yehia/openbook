"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleDashed, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Verdict = "correct" | "partial" | "misconception";
type CheckObj = {
  prompt: string;
  type: "mcq" | "free";
  options: { id: string; text: string }[] | null;
  correctOptionId: string | null;
  modelAnswer: string;
  conceptLabel: string | null;
  conceptId: string | null;
};
type Result = { verdict: Verdict; feedback: string; reexplanation: string };

const VERDICT = {
  correct: { tone: "success", Icon: Check, label: "Got it" },
  partial: { tone: "warning", Icon: CircleDashed, label: "Almost" },
  misconception: { tone: "danger", Icon: RotateCcw, label: "Let's revisit" },
} as const;

/**
 * The retention engine (BUILD_SPEC §7.1): after a tutor answer, the student
 * must retrieve. Graded by meaning; the result updates spaced-repetition
 * mastery server-side so misses resurface later.
 */
export function UnderstandingCheck({
  documentId,
  question,
  answer,
}: {
  documentId: string;
  question: string;
  answer: string;
}) {
  const [check, setCheck] = useState<CheckObj | null>(null);
  const [failed, setFailed] = useState(false);
  const [response, setResponse] = useState("");
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch("/api/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate", documentId, question, answer }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setCheck(data.check as CheckObj);
      } catch {
        setFailed(true);
      }
    })();
  }, [documentId, question, answer]);

  async function submit(value: string) {
    if (!value.trim() || !check) return;
    setGrading(true);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grade", documentId, check, studentResponse: value }),
      });
      const data = await res.json();
      setResult(data as Result);
    } catch {
      setFailed(true);
    } finally {
      setGrading(false);
    }
  }

  if (failed) return null;

  if (!check) {
    return (
      <div className="mt-7 flex items-center gap-2 rounded-xl border-l-2 border-l-accent border border-border bg-surface px-4 py-3 text-caption text-content-tertiary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing a quick check…
      </div>
    );
  }

  const v = result ? VERDICT[result.verdict] : null;
  const VIcon = v?.Icon ?? Check;

  return (
    <div className="mt-7 rounded-xl border border-border border-l-2 border-l-accent bg-surface p-5" aria-live="polite">
      <div className="mb-1 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
        Quick check{check.conceptLabel ? ` · ${check.conceptLabel}` : ""}
      </div>
      <p className="text-headline text-content-primary">{check.prompt}</p>

      {!result ? (
        <div className="mt-4">
          {check.type === "mcq" && check.options ? (
            <div className="space-y-2">
              {check.options.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setResponse(o.text)}
                  className={cn(
                    "flex w-full items-center rounded-lg border px-3.5 py-2.5 text-left text-body transition-colors",
                    response === o.text
                      ? "border-accent-ring bg-accent-subtle text-content-primary"
                      : "border-border hover:border-border-strong hover:bg-surface-sunken"
                  )}
                >
                  {o.text}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              rows={2}
              placeholder="Answer in your own words — no peeking…"
              className="w-full resize-none rounded-md border border-border-strong bg-surface p-3 text-body text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring"
            />
          )}
          <button
            onClick={() => submit(response)}
            disabled={grading || !response.trim()}
            className="mt-3 inline-flex items-center gap-2 rounded-pill bg-cta px-4 py-2 text-callout font-medium text-cta-foreground disabled:opacity-40"
          >
            {grading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {grading ? "Checking…" : "Check my understanding"}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <div
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-caption-sm font-semibold uppercase tracking-[0.05em]",
              v?.tone === "success" && "bg-success-subtle text-success",
              v?.tone === "warning" && "bg-warning-subtle text-warning",
              v?.tone === "danger" && "bg-danger-subtle text-danger"
            )}
          >
            <VIcon className="h-3.5 w-3.5" />
            {v?.label}
          </div>
          <p className="mt-3 text-body text-content-primary">{result.feedback}</p>
          {result.reexplanation && (
            <p className="mt-2 rounded-md bg-surface-sunken p-3 text-body text-content-secondary">
              {result.reexplanation}
            </p>
          )}
          {result.verdict !== "correct" && (
            <button
              onClick={() => {
                setResult(null);
                setResponse("");
              }}
              className="mt-3 text-caption font-medium text-content-secondary hover:text-content-primary"
            >
              Try again →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
