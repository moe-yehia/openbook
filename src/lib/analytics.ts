/**
 * Analytics — "The Next Action Engine" math (BUILD_SPEC §7.10).
 * ALL scheduling/decay math is deterministic TypeScript — the LLM never decides
 * what to review. Reads the concept_mastery shape the tutor/quiz already write.
 */

export type MasteryRow = {
  concept_id: string;
  mastery: number;
  ease: number;
  interval_days: number;
  reps: number;
  state: string;
  last_reviewed: string | null;
  next_review: string | null;
};

const TARGET_RETENTION = 0.9; // recall ≈ 0.9 at the scheduled interval
const LN2 = Math.log(2);
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/** Predicted probability the student can recall this concept right now. */
export function recallProbability(row: MasteryRow, now: Date): number {
  if (!row.last_reviewed || row.reps <= 0) return clamp(row.mastery, 0.05, 0.98);
  const elapsedDays = Math.max(
    0,
    (now.getTime() - new Date(row.last_reviewed).getTime()) / 86_400_000
  );
  const interval = Math.max(row.interval_days, 0.5);
  // half-life chosen so recall == TARGET_RETENTION exactly at t = interval
  const halfLifeDays = interval / (Math.log(1 / TARGET_RETENTION) / LN2);
  return clamp(Math.pow(2, -elapsedDays / halfLifeDays), 0.02, 0.99);
}

export function masteryTone(mastery: number): "weak" | "shaky" | "solid" {
  return mastery < 0.4 ? "weak" : mastery < 0.75 ? "shaky" : "solid";
}

export type RankedConcept = MasteryRow & {
  recallProb: number;
  prereqFanout: number;
  overdueDays: number;
  score: number;
  decaying: boolean;
};

/** Build a map: conceptId -> how many other concepts list it as a prerequisite. */
export function prereqFanout(
  concepts: { id: string; prereq_concept_ids: string[] | null }[]
): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of concepts) {
    for (const pre of c.prereq_concept_ids ?? []) m.set(pre, (m.get(pre) ?? 0) + 1);
  }
  return m;
}

/**
 * Rank concepts by review urgency: lower current recall is more urgent, boosted
 * by how many other concepts depend on it and how overdue it is. Concepts in the
 * "desirable difficulty" band (about to slip below ~85%) score highest per the
 * spacing literature — we don't waste reps on the already-solid or the long-cold.
 */
export function rankConcepts(
  rows: MasteryRow[],
  fanout: Map<string, number>,
  now: Date
): RankedConcept[] {
  return rows
    .map((r) => {
      const recallProb = recallProbability(r, now);
      const pf = fanout.get(r.concept_id) ?? 0;
      const overdueDays = r.next_review
        ? Math.max(0, (now.getTime() - new Date(r.next_review).getTime()) / 86_400_000)
        : 0;
      // Peak urgency around the 0.7–0.85 "edge of forgetting" window.
      const edge = recallProb < 0.85 ? 0.85 - recallProb : 0;
      const window = recallProb >= 0.45 && recallProb < 0.85 ? 0.25 : 0; // sweet-spot bonus
      const score = edge * 100 + window * 40 + pf * 8 + Math.min(overdueDays, 14) * 2;
      return {
        ...r,
        recallProb,
        prereqFanout: pf,
        overdueDays,
        score,
        decaying: recallProb < 0.85 && r.reps > 0,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/** Hours until predicted recall crosses ~80% — the "decay clock". */
export function hoursUntilThreshold(row: MasteryRow, now: Date, threshold = 0.8): number | null {
  if (!row.last_reviewed || row.reps <= 0) return null;
  const interval = Math.max(row.interval_days, 0.5);
  const halfLifeDays = interval / (Math.log(1 / TARGET_RETENTION) / LN2);
  // solve 2^(-t/H) = threshold  ->  t = H * log2(1/threshold)
  const tDays = halfLifeDays * (Math.log(1 / threshold) / LN2);
  const elapsedDays = (now.getTime() - new Date(row.last_reviewed).getTime()) / 86_400_000;
  const remainingHours = (tDays - elapsedDays) * 24;
  return remainingHours;
}

/** Deterministic fallback rationale (LLM may rephrase it in the student's voice). */
export function fallbackRationale(label: string, c: RankedConcept, now: Date): string {
  const pct = Math.round(c.recallProb * 100);
  const h = hoursUntilThreshold(c, now);
  const when =
    h == null
      ? ""
      : h <= 0
      ? " — it's already slipping"
      : h < 48
      ? ` — you'll likely forget it in ~${Math.max(1, Math.round(h))}h`
      : ` — it starts fading in ~${Math.round(h / 24)} days`;
  const leverage =
    c.prereqFanout > 0
      ? `; it underpins ${c.prereqFanout} other concept${c.prereqFanout > 1 ? "s" : ""}`
      : "";
  return `Recall of "${label}" is about ${pct}%${when}${leverage}. A short review now resets the clock.`;
}

export function estimateMinutes(decayingCount: number): number {
  return Math.min(8, Math.max(3, Math.round(decayingCount * 1.2)));
}
