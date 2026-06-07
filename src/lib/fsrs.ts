import { fsrs, createEmptyCard, Rating, State, type Card, type Grade as FsrsGrade } from "ts-fsrs";

/**
 * FSRS scheduler wrapper (BUILD_SPEC §7.4). Deterministic, offline-capable —
 * the LLM never schedules. Maps the `flashcards` table's inline FSRS columns
 * to/from ts-fsrs and exposes new-card + review helpers.
 */
const scheduler = fsrs();

export type Grade = "again" | "hard" | "good" | "easy";

const RATING: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const STATE_TO_STR: Record<number, string> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};
const STR_TO_STATE: Record<string, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

/** The subset of `flashcards` columns that hold FSRS state. */
export type FsrsFields = {
  fsrs_state: string;
  due: string; // ISO
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  last_review: string | null;
};

function toFields(c: Card): FsrsFields {
  return {
    fsrs_state: STATE_TO_STR[c.state] ?? "new",
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    reps: c.reps,
    lapses: c.lapses,
    last_review: c.last_review ? c.last_review.toISOString() : null,
  };
}

function fromFields(f: FsrsFields): Card {
  return {
    due: new Date(f.due),
    stability: f.stability,
    difficulty: f.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: f.reps,
    lapses: f.lapses,
    state: STR_TO_STATE[f.fsrs_state] ?? State.New,
    last_review: f.last_review ? new Date(f.last_review) : undefined,
  };
}

/** Fresh card scheduling fields (status 'new', due now). */
export function newCard(now: Date = new Date()): FsrsFields {
  return toFields(createEmptyCard(now));
}

/** Apply a review grade → next scheduling fields (+ prev/next due for the log). */
export function review(
  prev: FsrsFields,
  grade: Grade,
  now: Date = new Date()
): FsrsFields & { prev_due: string; next_due: string } {
  const { card } = scheduler.next(fromFields(prev), now, RATING[grade]);
  const next = toFields(card);
  return { ...next, prev_due: prev.due, next_due: next.due };
}

/** Human "see again in…" label for the chosen grade, without committing. */
export function previewIntervals(prev: FsrsFields, now: Date = new Date()): Record<Grade, string> {
  const out = {} as Record<Grade, string>;
  (["again", "hard", "good", "easy"] as Grade[]).forEach((g) => {
    const { card } = scheduler.next(fromFields(prev), now, RATING[g]);
    const days = Math.max(0, Math.round((card.due.getTime() - now.getTime()) / 86_400_000));
    out[g] = days <= 0 ? "<1d" : days === 1 ? "1d" : days < 30 ? `${days}d` : `${Math.round(days / 30)}mo`;
  });
  return out;
}
