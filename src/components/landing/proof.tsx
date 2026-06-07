"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";
import { useReducedMotionSafe } from "./primitives";

function useCountUp(target: number, active: boolean) {
  const reduced = useReducedMotionSafe();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reduced) {
      setN(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const dur = 1400;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, reduced]);
  return n;
}

export function Proof() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-25%" });
  const pct = useCountUp(2, inView); // 2× — placeholder evidence figure

  return (
    <section ref={ref} className="relative mx-auto max-w-3xl px-6 py-32 text-center">
      <div className="font-mono text-mono-numeral tabular-nums text-content-tertiary">
        THE EVIDENCE
      </div>
      <div className="mt-4 font-display text-display-2xl tabular-nums text-content-primary">
        {pct}.0×
      </div>
      <p className="mx-auto mt-3 max-w-md text-body-lg text-content-secondary">
        Active recall produces roughly double the long-term retention of rereading — decades of
        learning science, built into every screen.
      </p>

      <figure className="mx-auto mt-16 max-w-xl">
        <blockquote className="text-balance font-display text-title-1 text-content-primary">
          &ldquo;For the first time, studying didn&rsquo;t feel lonely.&rdquo;
        </blockquote>
        <figcaption className="mt-3 text-caption text-content-tertiary">
          — a student, week three
        </figcaption>
      </figure>

      <p className="mt-20 font-display text-display-lg text-content-primary">
        A summary is not studying.
      </p>
    </section>
  );
}
