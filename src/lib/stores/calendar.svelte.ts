// Local calendar, stored in the synced store (collection "events") so it
// follows you between machines through the Drive folder.
import { addDays, daysBetween, isExam, occurrences, todayKey, type CalEvent } from "../calendar";
import { folderExams } from "./labs.svelte";
import { settings } from "./settings.svelte";
import { del, entries, get, newId, put, seed } from "./synced.svelte";

export function initCalendar() {
  // The two exams you told me about, so countdowns work on day one.
  seed("events", "seed-ther4-exam4", { title: "Ther IV Exam 4", kind: "exam", course: "Therapeutics IV", date: "2026-11-17", start: "09:00", end: "11:00" } satisfies CalEvent);
  seed("events", "seed-ther4-exam5", { title: "Ther IV Exam 5", kind: "exam", course: "Therapeutics IV", date: "2026-12-04", start: "09:00", end: "11:00" } satisfies CalEvent);
}

export const keywords = () => settings.examKeywords.split(",").map((s) => s.trim()).filter(Boolean);
export const events = () => entries<CalEvent>("events");
export const occ = (from: string, to: string) => occurrences(events(), from, to);
export const getEvent = (id: string) => get<CalEvent>("events", id);

export function saveEvent(id: string | null, ev: CalEvent) {
  put("events", id ?? newId(), ev);
}
export const deleteEvent = (id: string) => del("events", id);
export function skipDay(id: string, date: string) {
  const ev = getEvent(id);
  if (ev) put("events", id, { ...ev, skip: [...(ev.skip ?? []), date] });
}

export type Exam = { key: string; title: string; course: string; date: string; start?: string; days: number; id?: string; rel?: string };

/** Calendar exams (kind "exam" or a keyword in the title) plus folders with an exam date. */
export function exams(): Exam[] {
  const today = todayKey();
  const cal: Exam[] = occurrences(
    events().filter(([, e]) => isExam(e, keywords())),
    addDays(today, -180),
    addDays(today, 400),
  ).map((o) => ({ key: `${o.id}@${o.date}`, title: o.ev.title, course: o.ev.course ?? "", date: o.date, start: o.ev.allDay ? undefined : o.ev.start, days: 0, id: o.id }));
  const taken = new Set(cal.map((e) => e.date));
  const fromFolders: Exam[] = folderExams()
    .map((f) => ({ key: `folder:${f.rel}`, title: f.title, course: f.course, date: f.date.slice(0, 10), days: 0, rel: f.rel }))
    .filter((f) => !taken.has(f.date));
  return [...cal, ...fromFolders]
    .map((e) => ({ ...e, days: daysBetween(today, e.date) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ---- the shared event editor (one dialog, opened from anywhere) ----------

export const editor = $state({
  open: false,
  id: null as string | null,
  /** the occurrence that was clicked, for "delete this day" */
  date: null as string | null,
  draft: null as CalEvent | null,
});

export function newEvent(partial: Partial<CalEvent> = {}) {
  editor.id = null;
  editor.date = null;
  editor.draft = { title: "", kind: "study", date: todayKey(), start: "16:00", end: "17:00", ...partial };
  editor.open = true;
}

export function editEvent(id: string, date: string) {
  const ev = getEvent(id);
  if (!ev) return;
  editor.id = id;
  editor.date = date;
  editor.draft = structuredClone($state.snapshot(ev) as CalEvent);
  editor.open = true;
}
