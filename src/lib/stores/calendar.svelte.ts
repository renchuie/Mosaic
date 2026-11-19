// Local calendar and its tags, stored in the synced store (collections
// "events" and "tags") so they follow you between machines.
import {
  BUILTIN_TAGS, DEFAULT_TAGS, DEFAULT_TAG_ICON, addDays, daysBetween, inkOn, isExam, occurrences, todayKey, type CalEvent, type Tag, type Task,
} from "../calendar";
import { folderExams } from "./labs.svelte";
import { settings } from "./settings.svelte";
import { del, entries, get, newId, put, seed } from "./synced.svelte";

export function initCalendar() {
  for (const [id, t] of Object.entries(DEFAULT_TAGS)) seed("tags", id, t);
}

// ---- tags --------------------------------------------------------------------

export const tags = () =>
  entries<Tag>("tags").sort((a, b) => a[1].order - b[1].order || a[1].name.localeCompare(b[1].name));

export function tagOf(id: string): Tag {
  return get<Tag>("tags", id) ?? get<Tag>("tags", "other") ?? DEFAULT_TAGS.other;
}

/** The icon a tag wears on cards (its own, or a default). */
export const tagIcon = (id: string) => tagOf(id).icon ?? DEFAULT_TAG_ICON[id] ?? "star";

/** CSS custom properties for anything coloured by a tag. */
export function tagStyle(id: string): string {
  const c = tagOf(id).color;
  return `--tag: ${c}; --tag-ink: ${inkOn(c)};`;
}

export function saveTag(id: string | null, t: Omit<Tag, "order"> & { order?: number }) {
  const order = t.order ?? Math.max(-1, ...tags().map(([, x]) => x.order)) + 1;
  put("tags", id ?? `tag-${newId()}`, { ...t, order });
}

/** Deleting a tag moves its events to "Other" and its tasks to "Task". Built-in tags can be renamed and recoloured, not deleted. */
export function deleteTag(id: string) {
  if (BUILTIN_TAGS.includes(id)) return;
  for (const [eid, ev] of events()) if (ev.kind === id) put("events", eid, { ...ev, kind: "other" });
  for (const [tid, t] of entries<Task>("tasks")) if (t.tag === id) put("tasks", tid, { ...t, tag: "task" });
  del("tags", id);
}

// ---- events ------------------------------------------------------------------

export const keywords = () => settings.examKeywords.split(",").map((s) => s.trim()).filter(Boolean);
export const events = () => entries<CalEvent>("events");
export const occ = (from: string, to: string) => occurrences(events(), from, to);
export const getEvent = (id: string) => get<CalEvent>("events", id);
const tagIsExam = (id: string) => !!get<Tag>("tags", id)?.exam;
export const eventIsExam = (ev: CalEvent) => isExam(ev, keywords(), tagIsExam);

export function saveEvent(id: string | null, ev: CalEvent) {
  put("events", id ?? newId(), ev);
}
export const deleteEvent = (id: string) => del("events", id);
export function skipDay(id: string, date: string) {
  const ev = getEvent(id);
  if (ev) put("events", id, { ...ev, skip: [...(ev.skip ?? []), date] });
}

export type Exam = { key: string; title: string; course: string; date: string; start?: string; end?: string; kind: string; location?: string; days: number; id?: string; rel?: string };

/** Calendar exams (an exam tag, or "Other" with a keyword in the title) plus folders with an exam date. */
export function exams(): Exam[] {
  const today = todayKey();
  const cal: Exam[] = occurrences(events().filter(([, e]) => eventIsExam(e)), addDays(today, -400), addDays(today, 400)).map((o) => ({
    key: `${o.id}@${o.date}`,
    title: o.ev.title,
    course: o.ev.course ?? "",
    date: o.date,
    start: o.ev.allDay ? undefined : o.ev.start,
    end: o.ev.allDay ? undefined : o.ev.end,
    kind: o.ev.kind,
    location: o.ev.location,
    days: 0,
    id: o.id,
  }));
  const taken = new Set(cal.map((e) => e.date));
  const fromFolders: Exam[] = folderExams()
    .map((f) => ({ key: `folder:${f.rel}`, title: f.title, course: f.course, date: f.date.slice(0, 10), kind: "exam", days: 0, rel: f.rel }))
    .filter((f) => !taken.has(f.date));
  return [...cal, ...fromFolders]
    .map((e) => ({ ...e, days: daysBetween(today, e.date) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ---- calendar page state (kept while you move between pages) ------------------

function loadHidden(): string[] {
  try {
    return JSON.parse(localStorage.getItem("studydesk.hiddenTags") ?? "[]");
  } catch {
    return [];
  }
}

function loadSide(): boolean {
  try {
    return localStorage.getItem("studydesk.calSide") !== "0";
  } catch {
    return true;
  }
}

export const view = $state({
  /** the day the views are centred on */
  cursor: todayKey(),
  hidden: loadHidden(),
  /** side panel (month picker, tags) shown */
  side: loadSide(),
});

export function toggleSide() {
  view.side = !view.side;
  try {
    localStorage.setItem("studydesk.calSide", view.side ? "1" : "0");
  } catch {}
}

export function toggleTag(id: string) {
  view.hidden = view.hidden.includes(id) ? view.hidden.filter((x) => x !== id) : [...view.hidden, id];
  try {
    localStorage.setItem("studydesk.hiddenTags", JSON.stringify(view.hidden));
  } catch {}
}

/** Occurrences in a range, without hidden tags. */
export const visible = (from: string, to: string) => occ(from, to).filter((o) => !view.hidden.includes(o.ev.kind));

// ---- the shared editor (one popover for events and tasks, opened from anywhere) ----

export const editor = $state({
  open: false,
  /** event or task */
  type: "event" as "event" | "task",
  /** an existing entry can't switch type */
  canSwitch: true,
  id: null as string | null,
  /** the occurrence that was clicked, for "delete this day" and per-day ticks */
  date: null as string | null,
  draft: null as CalEvent | null,
  task: null as Task | null,
  /** where to show the popover (screen point); null = centred */
  anchor: null as { x: number; y: number } | null,
});

const anchorOf = (e?: MouseEvent | null) => (e && (e.clientX || e.clientY) ? { x: e.clientX, y: e.clientY } : null);

function openEditor(type: "event" | "task", id: string | null, date: string | null, e?: MouseEvent | null) {
  editor.type = type;
  editor.canSwitch = id === null;
  editor.id = id;
  editor.date = date;
  editor.anchor = anchorOf(e);
  editor.open = true;
}

export function newEvent(partial: Partial<CalEvent> = {}, e?: MouseEvent | null) {
  editor.draft = { title: "", kind: "study", date: todayKey(), start: "16:00", end: "17:00", ...partial };
  editor.task = null;
  openEditor("event", null, null, e);
}

export function editEvent(id: string, date: string, e?: MouseEvent | null) {
  const ev = getEvent(id);
  if (!ev) return;
  editor.draft = structuredClone($state.snapshot(ev) as CalEvent);
  editor.task = null;
  openEditor("event", id, date, e);
}

export function newTask(partial: Partial<Task> = {}, e?: MouseEvent | null) {
  editor.task = { title: "", tag: "task", priority: "normal", status: "todo", created: Date.now(), due: todayKey(), ...partial };
  editor.draft = null;
  openEditor("task", null, null, e);
}

export function editTask(id: string, date: string | null, e?: MouseEvent | null) {
  const t = get<Task>("tasks", id);
  if (!t) return;
  editor.task = structuredClone($state.snapshot(t) as Task);
  editor.draft = null;
  openEditor("task", id, date, e);
}

export const tagManager = $state({ open: false });
