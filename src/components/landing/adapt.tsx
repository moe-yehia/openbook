"use client";

import { useState } from "react";
import { Crosshair, Type, Search, Palette, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useA11y } from "@/components/providers/accessibility-provider";

const SAMPLE = [
  "Glycolysis splits one glucose molecule into two pyruvate.",
  "That step alone nets the cell two molecules of ATP.",
  "The rest is harvested later, in the mitochondria, with oxygen.",
];

type Lens = "focus" | "read" | "color";

export function Adapt() {
  const { prefs, set } = useA11y();
  const [on, setOn] = useState<Record<Lens, boolean>>({ focus: false, read: false, color: false });
  const see = prefs.lens === "magnify";

  const toggle = (l: Lens) => setOn((s) => ({ ...s, [l]: !s[l] }));
  const toggleSee = () => set("lens", see ? "off" : "magnify");

  const toggles = [
    { key: "focus", label: "Focus", icon: Crosshair, active: on.focus, onClick: () => toggle("focus"), hint: "Dim everything but the line you're on." },
    { key: "read", label: "Read", icon: Type, active: on.read, onClick: () => toggle("read"), hint: "Looser spacing, heavier weight." },
    { key: "see", label: "See", icon: Search, active: see, onClick: toggleSee, hint: "A magnifier follows your cursor — try it." },
    { key: "color", label: "Color", icon: Palette, active: on.color, onClick: () => toggle("color"), hint: "Meaning by icon + shape, not colour alone." },
  ] as const;

  return (
    <section id="adapt" className="relative mx-auto max-w-3xl px-6 py-32">
      <div className="mb-3 text-center text-caption-sm uppercase tracking-[0.14em] text-content-tertiary">
        It learns you
      </div>
      <h2 className="mb-4 text-balance text-center font-display text-display-lg text-content-primary">
        However you need to read it.
      </h2>
      <p className="mx-auto mb-10 max-w-lg text-center text-body-lg text-content-secondary">
        Not a settings menu buried three screens deep. The tutor simply meets you where you are —
        flip a lens and watch this very paragraph change.
      </p>

      <div className="mb-7 flex flex-wrap justify-center gap-2.5">
        {toggles.map((t) => (
          <button
            key={t.key}
            onClick={t.onClick}
            aria-pressed={t.active}
            className={cn(
              "inline-flex items-center gap-2 rounded-pill border px-4 py-2 text-callout font-medium transition-all duration-fast",
              t.active
                ? "border-accent-ring bg-accent text-accent-foreground shadow-accent"
                : "border-border-strong bg-surface text-content-secondary hover:text-content-primary"
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="mx-auto max-w-xl rounded-card border border-border bg-surface p-7 shadow-e3 sm:p-9">
        <div className={cn("space-y-3.5", on.focus && "group")}>
          {SAMPLE.map((line, i) => (
            <p
              key={i}
              className={cn(
                "transition-all duration-base",
                on.read
                  ? "text-body-lg font-medium tracking-[0.03em] leading-loose text-content-primary"
                  : "text-body text-content-secondary",
                on.focus && "opacity-40 hover:opacity-100"
              )}
            >
              {line}
            </p>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2.5 border-t border-border pt-5">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-caption-sm uppercase tracking-[0.05em]",
              on.color
                ? "border-success/40 bg-success-subtle text-success"
                : "border-border bg-surface-sunken text-content-secondary"
            )}
          >
            {on.color && <Check className="h-3 w-3" />}
            Mastered
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1 text-caption-sm uppercase tracking-[0.05em]",
              on.color
                ? "border-warning/40 bg-warning-subtle text-warning"
                : "border-border bg-surface-sunken text-content-secondary"
            )}
          >
            {on.color && <AlertTriangle className="h-3 w-3" />}
            Review soon
          </span>
        </div>

        <p className="mt-5 text-caption text-content-tertiary">
          {toggles.find((t) => t.active)?.hint ?? "Flip any lens above."}
        </p>
      </div>
    </section>
  );
}
