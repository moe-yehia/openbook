"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { FileText, FileType, Presentation, FileImage, Code2, Play, GitBranch, FileStack } from "lucide-react";
import { useReducedMotionSafe } from "./primitives";

const SOURCES = [
  { label: "PDF", icon: FileText },
  { label: "Word", icon: FileType },
  { label: "Slides", icon: Presentation },
  { label: "Google Docs", icon: FileStack },
  { label: "Images", icon: FileImage },
  { label: ".ipynb / .md", icon: Code2 },
  { label: "YouTube", icon: Play },
  { label: "GitHub", icon: GitBranch },
];

export function Sources() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-20%" });
  const reduced = useReducedMotionSafe();

  return (
    <section id="sources" className="relative mx-auto max-w-4xl px-6 py-32">
      <div className="mb-3 text-center text-caption-sm uppercase tracking-[0.14em] text-content-tertiary">
        Bring anything
      </div>
      <h2 className="mb-14 text-balance text-center font-display text-display-lg text-content-primary">
        Any source. One living page.
      </h2>

      <div ref={ref} className="relative grid place-items-center">
        {/* central living page with a single lime ripple */}
        <div className="relative z-10 grid h-32 w-32 place-items-center rounded-card border border-border bg-surface shadow-float">
          {!reduced && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-card ring-2 ring-accent"
              animate={{ scale: [1, 1.35], opacity: [0.5, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          <span className="font-display text-callout font-semibold text-content-primary">OpenBook</span>
        </div>

        {/* chips funnel inward on inView */}
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SOURCES.map((s, i) => (
            <motion.div
              key={s.label}
              initial={reduced ? false : { opacity: 0, y: 24, scale: 0.92 }}
              animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
              transition={{ duration: 0.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="inline-flex items-center gap-2.5 rounded-pill border border-border bg-surface px-4 py-2.5 shadow-e1"
            >
              <s.icon className="h-4 w-4 text-content-secondary" />
              <span className="text-callout text-content-primary">{s.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
