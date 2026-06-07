"use client";

import { cn } from "@/lib/utils";

export function Switch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      id={id}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-pill border transition-colors duration-fast",
        checked ? "border-accent-ring bg-accent" : "border-border-strong bg-surface-sunken"
      )}
    >
      <span
        className={cn(
          "ml-0.5 h-5 w-5 rounded-full bg-surface shadow-e2 transition-transform duration-fast ease-standard",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}
