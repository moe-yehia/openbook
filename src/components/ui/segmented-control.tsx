"use client";

import { useId } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = {
  value: T;
  label: React.ReactNode;
};

/** iOS-style segmented control with a sliding puck (framer-motion layoutId). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "md",
  className,
  ariaLabel,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}) {
  const groupId = useId();
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border border-border bg-surface-sunken p-1",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative rounded-pill font-medium transition-colors duration-fast",
              size === "sm" ? "h-7 px-3 text-caption" : "h-9 px-4 text-callout",
              active ? "text-content-primary" : "text-content-tertiary hover:text-content-secondary"
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${groupId}`}
                transition={{ type: "spring", stiffness: 480, damping: 38 }}
                className="absolute inset-0 -z-10 rounded-pill bg-surface shadow-e2"
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
