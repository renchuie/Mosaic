// Sample data for Phase 1. Later phases replace each export with a real store.

export type Tone = "rose" | "peach" | "sage" | "butter";

/** Card tones, cycled across lab and course cards. */
export const TONES: Tone[] = ["rose", "sage", "peach", "butter"];

export const user = { name: "Jazmine" };

export const exams = [
  { id: "ther4-exam4", title: "Ther IV Exam 4", course: "Therapeutics IV", date: "2026-11-17T09:00" },
  { id: "ther4-exam5", title: "Ther IV Exam 5", course: "Therapeutics IV", date: "2026-12-04T09:00" },
  { id: "law-final", title: "Pharmacy Law Final", course: "Pharmacy Law", date: "2026-12-10T13:00" },
];

export const labs = [
  {
    slug: "ther4-exam5",
    title: "Ther IV Exam 5 lab",
    version: "3.14.1",
    sectionsTried: 4,
    avgBest: 71,
    missed: 12,
    lastSim: 74,
    bestSim: 78,
    lastOpened: "Today, 8:12 PM",
  },
  {
    slug: "ther4-exam4",
    title: "Ther IV Exam 4 lab",
    version: "3.14.1",
    sectionsTried: 9,
    avgBest: 88,
    missed: 5,
    lastSim: 86,
    bestSim: 91,
    lastOpened: "Yesterday",
  },
];

export const lectures = [
  { title: "Heart failure", lab: "ther4-exam5", progress: 82, revisit: 3 },
  { title: "Arrhythmias", lab: "ther4-exam5", progress: 64, revisit: 6 },
  { title: "Anticoagulation", lab: "ther4-exam5", progress: 45, revisit: 3 },
  { title: "Stroke", lab: "ther4-exam5", progress: 0, revisit: 0 },
];

export const today = {
  events: [
    { start: "08:00", end: "09:50", title: "Therapeutics IV", kind: "class" },
    { start: "10:00", end: "11:15", title: "Pharmacy Law", kind: "class" },
    { start: "13:00", end: "14:30", title: "Clinical Applications lab", kind: "class" },
    { start: "16:00", end: "17:00", title: "Study: Exam 4 sim run", kind: "study" },
    { start: "19:30", end: "20:30", title: "Study: missed questions", kind: "study" },
  ],
  tasks: [
    { title: "Top 200 quiz 9", course: "Top 200/300", due: "Today", done: false, overdue: false },
    { title: "PGx case write-up", course: "Clinical Pharmacogenetics", due: "Today", done: false, overdue: false },
    { title: "Innovation project slides", course: "Adv. Pharmacy Practice", due: "Yesterday", done: false, overdue: true },
    { title: "Law reading ch. 12", course: "Pharmacy Law", due: "Today", done: true, overdue: false },
  ],
};

export const focusBlock = { title: "Exam 4 sim run", minutes: 60, elapsed: "24:10", next: "Missed questions · 45 min" };

export const streak = { days: 6, week: [true, true, true, false, true, true, true] };
