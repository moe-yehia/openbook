"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Halftone } from "@/components/ui/halftone";
import { DocumentCard } from "./document-card";
import { TutorPill, useReducedMotionSafe } from "./primitives";

export function Hero() {
  const reduced = useReducedMotionSafe();
  const [lit, setLit] = useState(0);
  const [highlights, setHighlights] = useState<number[]>([]);
  const [tutor, setTutor] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const wake = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (reduced) {
      setLit(0.28);
      setHighlights([0]);
      setTutor(true);
      return;
    }
    setLit(0);
    setHighlights([]);
    setTutor(false);
    const t = timers.current;
    t.push(setTimeout(() => setLit(0.28), 500));
    t.push(setTimeout(() => setHighlights([0]), 1200));
    t.push(setTimeout(() => setTutor(true), 1900));
  }, [reduced]);

  useEffect(() => {
    const id = setTimeout(wake, 700);
    return () => {
      clearTimeout(id);
      timers.current.forEach(clearTimeout);
    };
  }, [wake]);

  return (
    <section className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 pt-28">
      <Halftone from="top-left" opacity={0.05} />
      <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
        {/* Left — the claim */}
        <div>
          <h1 className="text-balance font-display text-display-xl leading-[0.95] text-content-primary sm:text-display-2xl">
            Reading isn&rsquo;t
            <br />
            learning.
          </h1>
          <p className="mt-7 max-w-md text-pretty text-body-lg text-content-secondary">
            Every other tool hands you a summary and walks away. OpenBook stays — it reads with you,
            asks the hard questions, and makes it stick.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button href="/signup" size="lg" variant="primary">
              Start learning free
            </Button>
            <Button href="#story" size="lg" variant="ghost">
              See how it works ↓
            </Button>
          </div>
        </div>

        {/* Right — the protagonist, half-awake */}
        <div className="relative mx-auto w-full max-w-md" onMouseEnter={wake}>
          <DocumentCard lit={lit} highlights={highlights} />
          <div className="pointer-events-none absolute -bottom-6 -left-4 sm:-left-10">
            <TutorPill text="Why does this matter?" active={tutor} />
          </div>
        </div>
      </div>

      <motion.a
        href="#story"
        aria-label="Scroll to wake the page"
        className="absolute inset-x-0 bottom-7 mx-auto flex w-max flex-col items-center gap-1.5 text-caption text-content-tertiary"
        animate={reduced ? {} : { y: [0, 6, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        Scroll to wake the page
        <ArrowDown className="h-4 w-4" />
      </motion.a>
    </section>
  );
}
