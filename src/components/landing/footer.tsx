"use client";

import { Moon, Sun } from "lucide-react";
import { Wordmark } from "@/components/ui/wordmark";
import { Halftone } from "@/components/ui/halftone";
import { useTheme } from "@/components/providers/theme-provider";

export function Footer() {
  const { resolved, toggle } = useTheme();
  return (
    <footer className="relative overflow-hidden border-t border-border px-6 py-14">
      <Halftone from="center" opacity={0.04} />
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-8 sm:flex-row sm:items-end">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-xs text-caption text-content-tertiary">
            Active learning, not content delivery. Built for how memory actually works.
          </p>
        </div>

        <div className="flex items-center gap-6">
          <nav className="flex items-center gap-5 text-caption text-content-secondary">
            <a href="#story" className="hover:text-content-primary">Method</a>
            <a href="#adapt" className="hover:text-content-primary">Access</a>
            <a href="#start" className="hover:text-content-primary">Start</a>
          </nav>
          <button
            onClick={toggle}
            aria-label="Toggle light or dark mode"
            className="grid h-10 w-10 place-items-center rounded-pill border border-border bg-surface text-content-secondary transition-colors hover:text-content-primary"
          >
            {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="mx-auto mt-10 max-w-5xl text-caption-sm uppercase tracking-[0.1em] text-content-tertiary">
        © {2026} OpenBook · A study companion that stays.
      </div>
    </footer>
  );
}
