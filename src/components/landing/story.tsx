"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion, useScroll, useMotionValueEvent } from "framer-motion";
import { DocumentCard } from "./document-card";
import { TutorPill } from "./primitives";
import { ConceptNode, ConceptEdge } from "@/components/ui/concept-graph";

type Beat = "see" | "talk" | "remember";

const CAPTIONS: Record<Beat, { kicker: string; line: string }> = {
  see: { kicker: "It learns to see", line: "Signal lifts. Filler fades." },
  talk: { kicker: "It learns to talk", line: "A tutor in the margin, on this line." },
  remember: { kicker: "It learns to remember", line: "Words become a map you keep." },
};

const NODES = [
  { id: "c", label: "Cellular Respiration", x: 230, y: 26, tone: "next" as const, active: true },
  { id: "m", label: "Mitochondrion", x: 40, y: 150, tone: "solid" as const },
  { id: "g", label: "Glycolysis", x: 196, y: 224, tone: "shaky" as const },
  { id: "a", label: "ATP", x: 372, y: 150, tone: "solid" as const },
];

function clamp(v: number, a = 0, b = 1) {
  return Math.max(a, Math.min(b, v));
}

export function Story() {
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });
  const [p, setP] = useState(0);
  useMotionValueEvent(scrollYProgress, "change", (v) => setP(Math.round(v * 100) / 100));

  const lit = clamp(p / 0.5);
  const hlCount = Math.floor(clamp((p - 0.1) / 0.34) * 4 + 0.0001);
  const highlights = Array.from({ length: hlCount }, (_, i) => i);
  const talk = p > 0.42 && p < 0.66;
  const remember = clamp((p - 0.62) / 0.32);
  const beat: Beat = p < 0.42 ? "see" : p < 0.62 ? "talk" : "remember";

  return (
    <section id="story" ref={trackRef} className="relative min-h-[320vh]">
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden px-6">
        {/* caption */}
        <div className="mb-8 h-20 text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={beat}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mb-1.5 text-caption-sm uppercase tracking-[0.14em] text-content-tertiary">
                {CAPTIONS[beat].kicker}
              </div>
              <h2 className="font-display text-title-1 text-content-primary sm:text-display-lg">
                {CAPTIONS[beat].line}
              </h2>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* stage */}
        <div className="relative w-full max-w-md">
          <motion.div
            animate={{ scale: 1 - remember * 0.12, opacity: 1 - remember * 0.55 }}
            transition={{ duration: 0.2 }}
          >
            <DocumentCard lit={lit} highlights={highlights} />
          </motion.div>

          {/* talk: tutor pill in the margin */}
          <div className="pointer-events-none absolute -right-6 top-1/3 hidden sm:block lg:-right-24">
            <TutorPill text="Why does respiration stall without oxygen?" active={talk} />
          </div>

          {/* remember: words peel into a concept map */}
          {remember > 0.01 && (
            <div
              className="pointer-events-none absolute inset-0 -m-6 grid place-items-center"
              style={{ opacity: remember }}
            >
              <div className="relative h-[280px] w-[460px] max-w-full">
                <svg className="absolute inset-0 h-full w-full" aria-hidden>
                  {NODES.slice(1).map((n) => (
                    <ConceptEdge
                      key={n.id}
                      x1={230}
                      y1={44}
                      x2={n.x + 40}
                      y2={n.y}
                      variant={n.id === "g" ? "prereq" : "related"}
                      active={n.id === "g"}
                    />
                  ))}
                </svg>
                {NODES.map((n, i) => (
                  <motion.div
                    key={n.id}
                    className="absolute"
                    style={{ left: n.x, top: n.y }}
                    initial={false}
                    animate={{
                      opacity: clamp((remember - i * 0.12) / 0.3),
                      scale: 0.9 + clamp((remember - i * 0.12) / 0.3) * 0.1,
                    }}
                  >
                    <ConceptNode label={n.label} tone={n.tone} active={n.active} />
                  </motion.div>
                ))}
                <div
                  className="absolute -bottom-2 right-2 rounded-pill border border-accent-ring/60 bg-accent-subtle px-3 py-1 text-caption-sm uppercase tracking-[0.05em] text-content-primary"
                  style={{ opacity: clamp((remember - 0.5) / 0.4) }}
                >
                  Review in 2 days
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
