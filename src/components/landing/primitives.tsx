"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Reduced-motion that respects BOTH the OS pref AND our in-app toggles
 * (data-reduced-motion / ADHD focus). Reactive to attribute changes.
 */
export function useReducedMotionSafe(): boolean {
  const osReduced = useReducedMotion();
  const [attrReduced, setAttrReduced] = useState(false);

  useEffect(() => {
    const read = () => {
      const d = document.documentElement;
      setAttrReduced(
        d.getAttribute("data-reduced-motion") === "on" ||
          d.getAttribute("data-focus") === "on"
      );
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-reduced-motion", "data-focus"],
    });
    return () => obs.disconnect();
  }, []);

  return Boolean(osReduced) || attrReduced;
}

/**
 * WakeText — animates a run of text from "asleep" (desaturated, greyed, slightly
 * blurred + nudged) to "awake" (full ink). The most-reused landing primitive.
 */
export function WakeText({
  children,
  awake,
  className,
  as: Tag = "span",
}: {
  children: React.ReactNode;
  awake: boolean;
  className?: string;
  as?: "span" | "p" | "h2" | "h3";
}) {
  const reduced = useReducedMotionSafe();
  const MotionTag = motion[Tag];
  return (
    <MotionTag
      className={cn(className)}
      initial={false}
      animate={{
        color: awake ? "rgb(var(--ob-text-primary))" : "rgb(var(--ob-text-asleep))",
        filter: awake ? "saturate(1) blur(0px)" : "saturate(0) blur(0.4px)",
        y: awake ? 0 : 2,
      }}
      transition={reduced ? { duration: 0 } : { duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  );
}

/**
 * MarkerSweep — a lime highlight that sweeps left→right behind text via an
 * animated clip-path, with a pen-pressure taper. Wrap an inline run.
 */
export function MarkerSweep({
  children,
  active,
  className,
}: {
  children: React.ReactNode;
  active: boolean;
  className?: string;
}) {
  const reduced = useReducedMotionSafe();
  return (
    <span className={cn("relative inline", className)}>
      <motion.span
        aria-hidden
        className="absolute inset-x-[-2px] inset-y-0 -z-10 rounded-[3px] bg-accent/55"
        initial={false}
        animate={{ clipPath: active ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)" }}
        transition={reduced ? { duration: 0 } : { duration: 0.6, ease: [0.22, 0.61, 0.36, 1] }}
        style={{ originX: 0 }}
      />
      {children}
    </span>
  );
}

/**
 * Typewriter — types a string out (respecting reduced motion → instant).
 */
export function useTypewriter(text: string, active: boolean, speed = 26) {
  const reduced = useReducedMotionSafe();
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!active) {
      setOut("");
      return;
    }
    if (reduced) {
      setOut(text);
      return;
    }
    let i = 0;
    setOut("");
    const id = setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, active, reduced, speed]);
  return out;
}

/**
 * TutorPill — the first-person tutor speaking from the margin. Types its line
 * with a lime caret while "speaking".
 */
export function TutorPill({
  text,
  active,
  className,
}: {
  text: string;
  active: boolean;
  className?: string;
}) {
  const typed = useTypewriter(text, active);
  const done = typed.length >= text.length;
  return (
    <motion.div
      initial={false}
      animate={{ opacity: active ? 1 : 0, x: active ? 0 : -8 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "inline-flex max-w-xs items-center gap-2 rounded-xl rounded-bl-sm border border-border bg-surface-elevated px-3.5 py-2 text-callout text-content-primary shadow-e3",
        className
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
      <span className={cn(!done && active && "ob-caret")}>{typed}</span>
    </motion.div>
  );
}
