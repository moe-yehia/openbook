"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { TutorPill } from "./primitives";

const OPTIONS = [
  { id: "o2", label: "It runs out of oxygen", correct: true },
  { id: "atp", label: "It makes too much ATP", correct: false },
  { id: "glu", label: "It runs out of glucose", correct: false },
];

type Status = "asking" | "wrong" | "correct" | "revealed";

export function Ask() {
  const [status, setStatus] = useState<Status>("asking");
  const [picked, setPicked] = useState<string | null>(null);

  const choose = (id: string, correct: boolean) => {
    setPicked(id);
    setStatus(correct ? "correct" : "wrong");
  };

  const solved = status === "correct" || status === "revealed";

  return (
    <section id="ask" className="relative mx-auto max-w-3xl px-6 py-32">
      <div className="mb-3 text-center text-caption-sm uppercase tracking-[0.14em] text-content-tertiary">
        It learns to ask
      </div>
      <h2 className="mb-10 text-balance text-center font-display text-display-lg text-content-primary">
        This is where reading becomes learning.
      </h2>

      <motion.div
        animate={status === "wrong" ? { x: [0, -8, 8, -5, 0] } : {}}
        transition={{ duration: 0.32 }}
        className="mx-auto max-w-xl rounded-card border border-border bg-surface p-7 shadow-float sm:p-9"
      >
        <p className="text-headline text-content-primary">
          Without looking back — why does respiration stall without oxygen?
        </p>

        <div className="mt-6 space-y-2.5">
          {OPTIONS.map((o) => {
            const isPicked = picked === o.id;
            const showCorrect = solved && o.correct;
            const showWrong = status === "wrong" && isPicked && !o.correct;
            return (
              <button
                key={o.id}
                disabled={solved}
                onClick={() => choose(o.id, o.correct)}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border px-4 py-3.5 text-left text-body transition-all duration-fast",
                  showCorrect && "border-accent-ring bg-accent-subtle text-content-primary",
                  showWrong && "border-danger/50 bg-danger-subtle text-content-primary",
                  !showCorrect && !showWrong && "border-border hover:border-border-strong hover:bg-surface-sunken",
                  solved && !o.correct && "opacity-50"
                )}
              >
                {o.label}
                {showCorrect && (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-foreground">
                    <Check className="h-4 w-4" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex min-h-[2.5rem] items-center justify-between gap-4">
          <AnimatePresence mode="wait">
            {status === "asking" && (
              <motion.button
                key="reveal"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setPicked("o2");
                  setStatus("revealed");
                }}
                className="text-caption text-content-tertiary underline-offset-4 hover:text-content-secondary hover:underline"
              >
                Reveal answer
              </motion.button>
            )}
            {status === "wrong" && (
              <motion.div
                key="wrong"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <TutorPill text="Not quite — let's look again." active />
              </motion.div>
            )}
            {solved && (
              <motion.div
                key="correct"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <TutorPill
                  text={status === "revealed" ? "Now you've seen it — you'll be asked again." : "That's it. Locked into memory."}
                  active
                />
              </motion.div>
            )}
          </AnimatePresence>

          {status === "wrong" && (
            <button
              onClick={() => {
                setStatus("asking");
                setPicked(null);
              }}
              className="shrink-0 text-caption font-medium text-content-secondary hover:text-content-primary"
            >
              Try again →
            </button>
          )}
        </div>
      </motion.div>

      <p className="mt-8 text-center text-caption text-content-tertiary">
        No tool you&rsquo;ve used makes you answer first. That&rsquo;s the whole difference.
      </p>
    </section>
  );
}
