"use client";

import { useMemo, useState } from "react";
import {
  Zap,
  Clock,
  Layers,
  CheckCircle2,
  MoonStar,
  BrainCircuit,
  CalendarClock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ReviewDrawer } from "@/components/analytics/review-drawer";

type SnoozeReason = "already_know" | "no_time" | "too_hard";

const SNOOZE_REASONS: { value: SnoozeReason; label: string; Icon: typeof CheckCircle2 }[] = [
  { value: "already_know", label: "I already know it", Icon: CheckCircle2 },
  { value: "no_time", label: "No time right now", Icon: CalendarClock },
  { value: "too_hard", label: "Too hard today", Icon: BrainCircuit },
];

/**
 * The forced-decision "Today's Move" card (BUILD_SPEC §7.10, step ②). The math
 * for WHICH concept and WHY is decided server-side and passed in; this component
 * only owns the decision (Start / Snooze-with-reason), the in-surface review
 * drawer, and the live re-measure (ring + decay clock reset on grade).
 */
export function TodaysMove({
  conceptId,
  conceptLabel,
  rationale,
  estMinutes,
  hoursToThreshold,
  prereqFanout,
  initialMastery,
}: {
  conceptId: string;
  conceptLabel: string;
  rationale: string;
  estMinutes: number;
  hoursToThreshold: number | null;
  prereqFanout: number;
  initialMastery: number;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resolved, setResolved] = useState<"none" | "started" | "snoozed">("none");
  const [snoozing, setSnoozing] = useState(false);
  const [pickReason, setPickReason] = useState(false);
  const [mastery, setMastery] = useState(initialMastery);
  const [reviewed, setReviewed] = useState(false);

  // The decay-clock fill: full lime when fresh, draining toward desaturated as
  // the predicted-recall threshold approaches. Capped at a 72h horizon.
  const clockPct = useMemo(() => {
    if (reviewed) return 1; // just reviewed → clock reset to full
    if (hoursToThreshold == null) return 0.5;
    if (hoursToThreshold <= 0) return 0.04;
    return Math.max(0.04, Math.min(1, hoursToThreshold / 72));
  }, [hoursToThreshold, reviewed]);

  const clockLabel = useMemo(() => {
    if (reviewed) return "Clock reset — recall back up";
    if (hoursToThreshold == null) return "New concept — first decay clock starts on review";
    if (hoursToThreshold <= 0) return "Recall already slipping below 80%";
    if (hoursToThreshold < 48) return `~${Math.max(1, Math.round(hoursToThreshold))}h until recall drops below 80%`;
    return `~${Math.round(hoursToThreshold / 24)} days until recall drops below 80%`;
  }, [hoursToThreshold, reviewed]);

  async function start() {
    setDrawerOpen(true);
    setResolved("started");
    // Fire-and-forget: mark the move started so the forced decision is recorded.
    fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", conceptId }),
    }).catch(() => {});
  }

  async function snooze(reason: SnoozeReason) {
    setSnoozing(true);
    try {
      await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "snooze", conceptId, reason }),
      });
      setResolved("snoozed");
      setPickReason(false);
    } catch {
      // Best-effort; the card still resolves locally.
      setResolved("snoozed");
      setPickReason(false);
    } finally {
      setSnoozing(false);
    }
  }

  // -------- resolved: snoozed --------
  if (resolved === "snoozed") {
    return (
      <section className="rounded-card border border-border bg-surface p-6 shadow-e2 animate-fade-in">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-pill bg-surface-sunken">
            <MoonStar className="h-5 w-5 text-content-secondary" />
          </span>
          <div>
            <div className="text-headline text-content-primary">
              Snoozed “{conceptLabel}”.
            </div>
            <div className="text-caption text-content-tertiary">
              Noted. It will resurface when the clock says it matters.
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section
        className={cn(
          "relative overflow-hidden rounded-card border border-accent-ring/60 bg-surface p-6 shadow-accent sm:p-8",
          "animate-scale-in"
        )}
      >
        <div className="flex items-center gap-2 text-caption-sm uppercase tracking-[0.12em] text-content-tertiary">
          <Zap className="h-3.5 w-3.5 text-accent" /> Today&rsquo;s Move
        </div>

        {/* big SF Pro Display concept name */}
        <h2 className="mt-3 font-display text-display-lg text-content-primary">{conceptLabel}</h2>

        {/* deterministic rationale line */}
        <p className="mt-2 max-w-prose text-body-lg text-content-secondary">{rationale}</p>

        {/* meta pills */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-caption text-content-tertiary">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> {clockLabel}
          </span>
          {prereqFanout > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" /> underpins {prereqFanout} other concept
              {prereqFanout > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* the decay clock: thin bar, lime fading to desaturated */}
        <div className="mt-5">
          <div
            className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunken"
            role="img"
            aria-label={clockLabel}
          >
            <div
              className={cn(
                "h-full rounded-pill transition-[width,background-color] duration-slow",
                clockPct > 0.5 ? "bg-accent" : clockPct > 0.2 ? "bg-warning" : "bg-content-tertiary"
              )}
              style={{ width: `${Math.round(clockPct * 100)}%` }}
            />
          </div>
        </div>

        {/* FORCED DECISION */}
        {!pickReason ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button variant="accent" size="lg" onClick={start}>
              <Zap className="h-4 w-4" /> Start {estMinutes}-min review
            </Button>
            <Button variant="ghost" onClick={() => setPickReason(true)}>
              Snooze
            </Button>
            {resolved === "started" && (
              <button
                onClick={() => setDrawerOpen(true)}
                className="text-caption font-medium text-content-secondary hover:text-content-primary"
              >
                Reopen review →
              </button>
            )}
          </div>
        ) : (
          <div className="mt-6 animate-fade-in" aria-live="polite">
            <div className="mb-2.5 text-caption-sm uppercase tracking-[0.1em] text-content-tertiary">
              Why snooze? Pick one — it tunes your schedule.
            </div>
            <div className="flex flex-wrap gap-2">
              {SNOOZE_REASONS.map((r) => {
                const RIcon = r.Icon;
                return (
                  <button
                    key={r.value}
                    disabled={snoozing}
                    onClick={() => snooze(r.value)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-pill border border-border px-3.5 py-2 text-callout text-content-primary transition-colors",
                      "hover:border-border-strong hover:bg-surface-sunken disabled:opacity-50"
                    )}
                  >
                    {snoozing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RIcon className="h-4 w-4 text-content-tertiary" />}
                    {r.label}
                  </button>
                );
              })}
              <button
                onClick={() => setPickReason(false)}
                disabled={snoozing}
                className="px-2 text-caption font-medium text-content-tertiary hover:text-content-secondary disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      <ReviewDrawer
        open={drawerOpen}
        conceptId={conceptId}
        conceptLabel={conceptLabel}
        startMastery={mastery}
        onClose={() => setDrawerOpen(false)}
        onMasteryChange={(m) => {
          setMastery(m);
          setReviewed(true);
        }}
      />
    </>
  );
}
