"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Loader2, Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { REGISTERS, getRegister, type RegisterId } from "@/lib/register";

type Stage =
  | { kind: "idle" }
  | { kind: "recall"; target: RegisterId; question: string; answer: string; concept: string }
  | { kind: "switched" };

/**
 * Global floating register pill (BUILD_SPEC §7.9). Bottom-right so it never
 * overlaps the bottom-left Accessibility pill. Switching is gated behind a
 * one-question micro-recall in the NEW register — register-surfing as avoidance
 * is blocked: you have to actually engage to flip.
 */
export function RegisterPill({ currentRegister }: { currentRegister: RegisterId }) {
  const router = useRouter();
  const [active, setActive] = useState<RegisterId>(currentRegister);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Esc closes the popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const activeReg = getRegister(active);

  // Step 1: tapping a new register fetches a 1-concept micro-recall in that voice.
  async function startFlip(target: RegisterId) {
    if (target === active || busy) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "render" }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResponse("");
      setStage({
        kind: "recall",
        target,
        concept: data.concept as string,
        question: `In your own words, what is "${data.concept}"?`,
        answer: (data.renders as Record<RegisterId, string>)[target],
      });
    } catch {
      setFeedback("Couldn't load a quick check. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Step 2: grade the micro-recall; only flip when the gist is there.
  async function submitFlip() {
    if (stage.kind !== "recall" || !response.trim() || busy) return;
    const { target, question, answer } = stage;
    setBusy(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "recall",
          registerId: target,
          question,
          answer,
          source: "register_flip",
        }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { correct: boolean; feedback: string; reexplanation: string };
      if (!data.correct) {
        setFeedback(data.reexplanation || data.feedback || "Not quite — give it another go.");
        return;
      }
      await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", registerId: target }),
      });
      setActive(target);
      setStage({ kind: "switched" });
      setFeedback(null);
      router.refresh();
    } catch {
      setFeedback("Couldn't switch just now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setStage({ kind: "idle" });
    setResponse("");
    setFeedback(null);
  }

  return (
    <div className="fixed bottom-5 right-5 z-[60] print:hidden">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-label="Communication mode"
            className="mb-3 w-[320px] rounded-xl border border-border bg-surface-elevated p-4 shadow-float"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-title-3 text-content-primary">How I talk</h2>
              <button
                onClick={close}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-pill text-content-tertiary hover:bg-surface-sunken"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {stage.kind === "recall" ? (
              <div aria-live="polite">
                <div className="mb-1 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
                  Quick check · {getRegister(stage.target).emoji} {getRegister(stage.target).label}
                </div>
                <p className="text-callout text-content-primary">{stage.question}</p>
                <textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  rows={2}
                  placeholder="Answer to switch…"
                  className="mt-3 w-full resize-none rounded-md border border-border-strong bg-surface p-2.5 text-callout text-content-primary outline-none placeholder:text-content-tertiary focus:border-focus-ring"
                />
                {feedback && (
                  <p className="mt-2 rounded-md bg-surface-sunken p-2.5 text-caption text-content-secondary">
                    {feedback}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={submitFlip}
                    disabled={busy || !response.trim()}
                    className="inline-flex items-center gap-2 rounded-pill bg-cta px-3.5 py-1.5 text-caption font-medium text-cta-foreground disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {busy ? "Checking…" : "Switch"}
                  </button>
                  <button
                    onClick={() => {
                      setStage({ kind: "idle" });
                      setFeedback(null);
                    }}
                    className="text-caption font-medium text-content-secondary hover:text-content-primary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  {REGISTERS.map((r) => {
                    const selected = r.id === active;
                    return (
                      <button
                        key={r.id}
                        onClick={() => startFlip(r.id)}
                        disabled={busy}
                        aria-pressed={selected}
                        className={cn(
                          "flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors disabled:opacity-60",
                          selected ? "bg-accent-subtle" : "hover:bg-surface-sunken"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span className="text-body" aria-hidden>
                            {r.emoji}
                          </span>
                          <span className="text-callout font-medium text-content-primary">{r.label}</span>
                        </span>
                        {selected && <Check className="h-4 w-4 text-content-primary" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
                {stage.kind === "switched" && (
                  <p className="mt-2 px-1 text-caption text-success" aria-live="polite">
                    Switched to {activeReg.emoji} {activeReg.label}.
                  </p>
                )}
                {feedback && (
                  <p className="mt-2 px-1 text-caption text-content-tertiary" aria-live="polite">
                    {feedback}
                  </p>
                )}
                <Link
                  href="/settings/communication"
                  className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-caption font-medium text-content-secondary hover:text-content-primary"
                >
                  <Settings2 className="h-3.5 w-3.5" /> Recalibrate from scratch
                </Link>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Communication mode: ${activeReg.label}`}
        className="ob-glass flex h-12 items-center gap-2 rounded-pill px-4 text-callout font-medium text-content-primary shadow-float transition-transform duration-fast hover:-translate-y-0.5 active:scale-95"
      >
        <span className="text-body" aria-hidden>
          {activeReg.emoji}
        </span>
        <span className="sr-only sm:not-sr-only">{activeReg.label}</span>
      </button>
    </div>
  );
}
