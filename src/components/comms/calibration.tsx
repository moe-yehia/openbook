"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { REGISTERS, getRegister, type RegisterId } from "@/lib/register";
import { Skeleton } from "@/components/ui/skeleton";

type Renders = Record<RegisterId, string>;
type Phase = "loading" | "pick" | "recall" | "locked" | "error";
type Recall = { correct: boolean; feedback: string; reexplanation: string };

/**
 * Communication Mode calibration (BUILD_SPEC §7.9). The voice is not a passive
 * toggle: the student reads one concept rendered in all four registers, picks
 * one, then must produce correct free-recall in that register before it locks.
 */
export function Calibration({ currentRegister }: { currentRegister: RegisterId }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [concept, setConcept] = useState("");
  const [conceptId, setConceptId] = useState<string | null>(null);
  const [renders, setRenders] = useState<Renders | null>(null);
  const [picked, setPicked] = useState<RegisterId | null>(null);

  const [answer, setAnswer] = useState("");
  const [grading, setGrading] = useState(false);
  const [recall, setRecall] = useState<Recall | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "render" }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setConcept(data.concept as string);
        setConceptId((data.conceptId as string | null) ?? null);
        setRenders(data.renders as Renders);
        setPhase("pick");
      } catch {
        setPhase("error");
      }
    })();
  }, []);

  function choose(id: RegisterId) {
    setPicked(id);
    setAnswer("");
    setRecall(null);
    setPhase("recall");
  }

  async function submitRecall() {
    if (!answer.trim() || !picked || !renders) return;
    setGrading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "recall",
          registerId: picked,
          conceptId,
          question: `In your own words, explain "${concept}".`,
          answer: renders[picked],
          source: "calibration",
        }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Recall;
      setRecall(data);
      if (data.correct) {
        await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "set", registerId: picked }),
        });
        setPhase("locked");
      }
    } catch {
      setRecall({
        correct: false,
        feedback: "Hmm, that check didn't go through. Give it another go.",
        reexplanation: "",
      });
    } finally {
      setGrading(false);
    }
  }

  const pickedReg = picked ? getRegister(picked) : null;
  const current = getRegister(currentRegister);

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center gap-2 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
        <Sparkles className="h-3.5 w-3.5" /> Communication mode
      </div>
      <h1 className="mt-3 font-display text-display-lg leading-[1.05] text-content-primary">
        How should OpenBook talk to you?
      </h1>
      <p className="mt-3 max-w-xl text-body-lg text-content-secondary">
        Here&rsquo;s the same idea in four voices. Pick the one that lands — then show
        you actually got it. The voice only changes; the truth never does.
      </p>
      <p className="mt-2 text-caption text-content-tertiary">
        Currently: {current.emoji} {current.label}
      </p>

      {/* ---------- PICK (or loading skeletons) ---------- */}
      {(phase === "loading" || phase === "pick" || phase === "recall" || phase === "locked") && (
        <div className="mt-8">
          {concept && (
            <div className="mb-4 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
              Concept · {concept}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {phase === "loading"
              ? REGISTERS.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-card border border-border bg-surface p-5"
                  >
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="mt-3 h-4 w-full" />
                    <Skeleton className="mt-2 h-4 w-11/12" />
                    <Skeleton className="mt-2 h-4 w-4/5" />
                  </div>
                ))
              : REGISTERS.map((r) => {
                  const selected = picked === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => choose(r.id)}
                      disabled={phase === "locked"}
                      aria-pressed={selected}
                      className={cn(
                        "group relative rounded-card border bg-surface p-5 text-left transition-[transform,box-shadow,border-color] duration-fast ease-standard",
                        "hover:-translate-y-0.5 hover:shadow-e3 disabled:pointer-events-none",
                        selected
                          ? "border-accent-ring shadow-e2"
                          : "border-border hover:border-border-strong"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-title-3" aria-hidden>
                            {r.emoji}
                          </span>
                          <span className="font-display text-headline text-content-primary">
                            {r.label}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "grid h-6 w-6 place-items-center rounded-pill border transition-colors",
                            selected
                              ? "border-accent bg-accent text-accent-foreground"
                              : "border-border text-transparent"
                          )}
                          aria-hidden
                        >
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      </div>
                      <p className="mt-3 text-body leading-relaxed text-content-secondary">
                        {renders?.[r.id]}
                      </p>
                    </button>
                  );
                })}
          </div>
        </div>
      )}

      {/* ---------- RECALL stress test (gates the lock) ---------- */}
      <AnimatePresence>
        {phase === "recall" && pickedReg && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 rounded-card border border-border border-l-2 border-l-accent bg-surface p-6"
            aria-live="polite"
          >
            <div className="mb-1 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
              Quick check · {pickedReg.emoji} {pickedReg.label}
            </div>
            <p className="text-headline text-content-primary">
              No peeking — in your own words, what is &ldquo;{concept}&rdquo;?
            </p>

            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={3}
              placeholder="Explain it like you'd tell a friend…"
              className="mt-4 w-full resize-none rounded-md border border-border-strong bg-surface p-3 text-body text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring"
            />

            {recall && !recall.correct && (
              <div className="mt-3 rounded-md bg-surface-sunken p-3">
                <p className="text-body text-content-primary">{recall.feedback}</p>
                {recall.reexplanation && (
                  <p className="mt-2 text-body text-content-secondary">{recall.reexplanation}</p>
                )}
              </div>
            )}

            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={submitRecall}
                disabled={grading || !answer.trim()}
                className="inline-flex items-center gap-2 rounded-pill bg-cta px-4 py-2 text-callout font-medium text-cta-foreground disabled:opacity-40"
              >
                {grading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {grading ? "Checking…" : recall && !recall.correct ? "Try again" : "Lock it in"}
              </button>
              <button
                onClick={() => {
                  setPhase("pick");
                  setRecall(null);
                  setAnswer("");
                }}
                className="text-caption font-medium text-content-secondary hover:text-content-primary"
              >
                ← Pick a different voice
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- LOCKED confirmation (soft success) ---------- */}
      {phase === "locked" && pickedReg && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 flex items-center gap-3 rounded-card border border-success/30 bg-success-subtle p-5"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-pill bg-success/15 text-success">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-headline text-content-primary">
              Locked in {pickedReg.emoji} {pickedReg.label}.
            </p>
            <p className="text-body text-content-secondary">
              OpenBook will speak this way everywhere. {recall?.feedback}
            </p>
          </div>
        </motion.div>
      )}

      {phase === "error" && (
        <div className="mt-8 rounded-card border border-danger/30 bg-danger-subtle p-5 text-body text-content-primary">
          Couldn&rsquo;t set up calibration just now. Refresh to try again.
        </div>
      )}
    </div>
  );
}
