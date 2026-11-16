// Local calendar: event shape, dates as "YYYY-MM-DD" strings (local time, no
// time-zone surprises), and expansion of weekly repeats. Pure, no imports.

export type EventKind = "class" | "exam" | "study" | "other";

export type CalEvent = {
  title: string;
  kind: EventKind;
  course?: string;
  /** first (or only) day */
  date: string;
  allDay?: boolean;
  /** "HH:MM", 24 h */
  start?: string;
  end?: string;
  location?: string;
  notes?: string;
  /** weekly repeat: weekdays 0 = Monday … 6 = Sunday, last day inclusive */
  repeat?: { weekdays: number[]; until: string };
  /** repeat days that were deleted */
  skip?: string[];
};

export type Occurrence = { id: string; ev: CalEvent; date: string };

export const KIND_LABEL: Record<EventKind, string> = { class: "Class", exam: "Exam", study: "Study", other: "Other" };
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const pad = (n: number) => String(n).padStart(2, "0");
export const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const todayKey = () => toKey(new Date());
export const addDays = (k: string, n: number) => {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
};
/** 0 = Monday … 6 = Sunday */
export const weekday = (k: string) => (fromKey(k).getDay() + 6) % 7;
export const mondayOf = (k: string) => addDays(k, -weekday(k));
export const daysBetween = (from: string, to: string) => Math.round((fromKey(to).getTime() - fromKey(from).getTime()) / 864e5);
export const minutes = (hhmm?: string) => {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
export const fmtTime = (hhmm?: string) => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m || 0)} ${h < 12 ? "AM" : "PM"}`;
};

/** Every occurrence on days from..to (inclusive), sorted by day then start time. */
export function occurrences(events: [string, CalEvent][], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const [id, ev] of events) {
    if (!ev.repeat || !ev.repeat.weekdays.length) {
      if (ev.date >= from && ev.date <= to) out.push({ id, ev, date: ev.date });
      continue;
    }
    const first = ev.date > from ? ev.date : from;
    const last = ev.repeat.until < to ? ev.repeat.until : to;
    for (let d = first; d <= last; d = addDays(d, 1)) {
      if (ev.repeat.weekdays.includes(weekday(d)) && !ev.skip?.includes(d)) out.push({ id, ev, date: d });
    }
  }
  return out.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : (a.ev.allDay ? -1 : minutes(a.ev.start)) - (b.ev.allDay ? -1 : minutes(b.ev.start)),
  );
}

/** Exam = type "exam", or type "other" with a keyword in the title (case-insensitive,
 *  whole word). Study blocks and classes never count, so "Exam 4 sim run" stays a study block. */
export function isExam(ev: CalEvent, keywords: string[]): boolean {
  if (ev.kind === "exam") return true;
  if (ev.kind !== "other") return false;
  return keywords.some((k) => k.trim() && new RegExp(`\\b${k.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(ev.title));
}
