"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MasteryRing } from "@/components/ui/mastery-ring";
import { ReviewDrawer } from "@/components/analytics/review-drawer";

type Tone = "weak" | "shaky" | "solid";

/**
 * A concept node on the mastery map (BUILD_SPEC §7.10). Decaying nodes pulse and
 * carry the single lime "review next" ring tone; solid ones dim. Clicking a node
 * opens the in-surface review drawer and re-measures live.
 */
export function MasteryNode({
  conceptId,
  label,
  mastery,
  tone,
  decaying,
}: {
  conceptId: string;
  label: string;
  mastery: number;
  tone: Tone;
  decaying: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(mastery);

  // Decaying nodes get the lime accent ring; otherwise the mastery tone.
  const ringTone = decaying ? "next" : tone;
  const solidDim = !decaying && tone === "solid";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-3.5 rounded-card border bg-surface p-4 text-left transition-[transform,box-shadow,border-color] duration-fast",
          "hover:-translate-y-0.5 hover:shadow-e3",
          decaying ? "border-accent-ring/60 shadow-accent" : "border-border shadow-e1",
          solidDim && "opacity-70 hover:opacity-100"
        )}
      >
        <span className="relative inline-grid place-items-center">
          {decaying && (
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-accent/15 motion-safe:animate-pulse"
            />
          )}
          <MasteryRing value={value} tone={ringTone} size={48} label={`${Math.round(value * 100)}`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-callout font-medium text-content-primary">{label}</span>
          <span className="text-caption text-content-tertiary">
            {decaying ? "Decaying — review next" : tone === "solid" ? "Solid" : tone === "shaky" ? "Shaky" : "Weak"}
          </span>
        </span>
      </button>

      <ReviewDrawer
        open={open}
        conceptId={conceptId}
        conceptLabel={label}
        startMastery={value}
        onClose={() => setOpen(false)}
        onMasteryChange={setValue}
      />
    </>
  );
}
