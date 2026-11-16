// Data not yet backed by a real store: the current study block is a sample
// until Phase 4 (daily study plan with timer).

export type Tone = "rose" | "peach" | "sage" | "butter";

/** Card tones, cycled across lab and course cards. */
export const TONES: Tone[] = ["rose", "sage", "peach", "butter"];



export const focusBlock = { title: "Exam 4 sim run", minutes: 60, elapsed: "24:10", next: "Missed questions · 45 min" };
