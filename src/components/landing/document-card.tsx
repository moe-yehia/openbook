"use client";

import { cn } from "@/lib/utils";
import { WakeText, MarkerSweep } from "./primitives";

/** The single source paragraph the whole landing is built around. */
export const REAL_LINES = [
  "The mitochondrion is the cell's power plant.",
  "It converts glucose into ATP through cellular respiration.",
  "Without oxygen, respiration stalls at glycolysis.",
  "ATP is the energy currency every cell spends.",
];

// Faux filler bars interleaved with the real sentences (visual texture).
const LAYOUT: ({ real: number } | { faux: string })[] = [
  { real: 0 },
  { faux: "94%" },
  { faux: "82%" },
  { real: 1 },
  { faux: "88%" },
  { real: 2 },
  { faux: "76%" },
  { faux: "91%" },
  { real: 3 },
  { faux: "70%" },
];

/**
 * DocumentCard — the protagonist. One consistent page design used at the Hero,
 * through the scrollytelling story, and at the Close. `lit` (0..1) wakes it from
 * grey to full ink; `highlights` lime-sweeps specific real sentences.
 */
export function DocumentCard({
  lit = 0,
  highlights = [],
  className,
  children,
  footer,
}: {
  lit?: number;
  highlights?: number[];
  className?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const realCount = REAL_LINES.length;
  return (
    <div
      className={cn(
        "relative w-full max-w-md rounded-card border border-border bg-surface p-7 shadow-float sm:p-8",
        className
      )}
      style={{ transition: "filter var(--ob-dur-slow) var(--ob-ease-standard)" }}
    >
      {/* kicker + title */}
      <div className="mb-1 text-caption-sm uppercase tracking-[0.14em] text-content-tertiary">
        Biology · Chapter 4
      </div>
      <WakeText
        as="h3"
        awake={lit > 0.05}
        className="font-display text-title-2 font-semibold"
      >
        Cellular Respiration
      </WakeText>

      <div className="mt-5 space-y-3.5">
        {LAYOUT.map((row, i) => {
          if ("faux" in row) {
            return (
              <div
                key={`f${i}`}
                className="h-2.5 rounded-pill"
                style={{
                  width: row.faux,
                  background: "rgb(var(--ob-border))",
                  opacity: 0.5 + lit * 0.35,
                  transition: "opacity var(--ob-dur-base) var(--ob-ease-standard)",
                }}
              />
            );
          }
          const idx = row.real;
          const awake = lit > (idx + 0.5) / (realCount + 0.5);
          return (
            <p key={`r${i}`} className="text-body leading-relaxed">
              <MarkerSweep active={highlights.includes(idx)}>
                <WakeText awake={awake || highlights.includes(idx)}>
                  {REAL_LINES[idx]}
                </WakeText>
              </MarkerSweep>
            </p>
          );
        })}
      </div>

      {footer}
      {children}
    </div>
  );
}
