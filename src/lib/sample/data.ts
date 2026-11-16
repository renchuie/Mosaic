// Data not yet backed by a real store: tasks and the current study block are
// samples until Phase 4.

export type Tone = "rose" | "peach" | "sage" | "butter";

/** Card tones, cycled across lab and course cards. */
export const TONES: Tone[] = ["rose", "sage", "peach", "butter"];


export const today = {
  tasks: [
    { title: "Top 200 quiz 9", course: "Top 200/300", due: "Today", done: false, overdue: false },
    { title: "PGx case write-up", course: "Clinical Pharmacogenetics", due: "Today", done: false, overdue: false },
    { title: "Innovation project slides", course: "Adv. Pharmacy Practice", due: "Yesterday", done: false, overdue: true },
    { title: "Law reading ch. 12", course: "Pharmacy Law", due: "Today", done: true, overdue: false },
  ],
};

export const focusBlock = { title: "Exam 4 sim run", minutes: 60, elapsed: "24:10", next: "Missed questions · 45 min" };
