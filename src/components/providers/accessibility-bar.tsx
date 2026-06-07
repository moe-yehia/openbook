"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Accessibility, Moon, Sun, Monitor, X } from "lucide-react";
import { useA11y } from "./accessibility-provider";
import { useTheme, type Theme } from "./theme-provider";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";

const themeOpts: { value: Theme; label: React.ReactNode }[] = [
  { value: "light", label: <Sun className="h-4 w-4" aria-hidden /> },
  { value: "dark", label: <Moon className="h-4 w-4" aria-hidden /> },
  { value: "system", label: <Monitor className="h-4 w-4" aria-hidden /> },
];

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-callout font-medium text-content-primary">{label}</div>
        {hint && <div className="text-caption text-content-tertiary">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function AccessibilityBar() {
  const { prefs, set, toggle } = useA11y();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  // Esc closes the sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="fixed bottom-5 left-5 z-[60] print:hidden">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            role="dialog"
            aria-label="Accessibility settings"
            className="mb-3 w-[320px] rounded-xl border border-border bg-surface-elevated p-4 shadow-float"
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-display text-title-3 text-content-primary">Accessibility</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-pill text-content-tertiary hover:bg-surface-sunken"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="divide-y divide-border">
              <Row label="Appearance">
                <SegmentedControl
                  size="sm"
                  ariaLabel="Theme"
                  options={themeOpts}
                  value={theme}
                  onChange={(v) => setTheme(v as Theme)}
                />
              </Row>

              <Row label="Reading lens" hint="Magnify or bold anything you hover">
                <SegmentedControl
                  size="sm"
                  ariaLabel="Reading lens"
                  options={[
                    { value: "off", label: "Off" },
                    { value: "magnify", label: "Zoom" },
                    { value: "bold", label: "Bold" },
                  ]}
                  value={prefs.lens}
                  onChange={(v) => set("lens", v as typeof prefs.lens)}
                />
              </Row>

              <Row label="Dyslexia-friendly" hint="OpenDyslexic + relaxed spacing">
                <Switch checked={prefs.dyslexia} onChange={() => toggle("dyslexia")} label="Dyslexia mode" />
              </Row>

              <Row label="Focus mode" hint="Spotlight one thing at a time">
                <Switch checked={prefs.focus} onChange={() => toggle("focus")} label="Focus mode" />
              </Row>

              <Row label="Reduce motion">
                <Switch checked={prefs.reduceMotion} onChange={() => toggle("reduceMotion")} label="Reduce motion" />
              </Row>

              <Row label="Colour vision">
                <SegmentedControl
                  size="sm"
                  ariaLabel="Colour vision mode"
                  options={[
                    { value: "none", label: "Off" },
                    { value: "deut", label: "Deut" },
                    { value: "prot", label: "Prot" },
                    { value: "trit", label: "Trit" },
                  ]}
                  value={prefs.cvd}
                  onChange={(v) => set("cvd", v as typeof prefs.cvd)}
                />
              </Row>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Accessibility settings"
        className="ob-glass flex h-12 items-center gap-2 rounded-pill px-4 text-callout font-medium text-content-primary shadow-float transition-transform duration-fast hover:-translate-y-0.5 active:scale-95"
      >
        <Accessibility className="h-5 w-5" aria-hidden />
        <span className="sr-only sm:not-sr-only">Access</span>
      </button>
    </div>
  );
}
