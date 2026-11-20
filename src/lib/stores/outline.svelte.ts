// The course hub (H1, Nov 20; board "One Mosaic folder, with the course as the hub"): a course
// is split into exams, and each exam into lectures (or topics, weeks). A lecture LINKS the things
// that belong to it (notes, PDFs, quizzes, interactive pages, other files, decks); files stay where
// they are. Synced collection `lectures`. Exams are the calendar's exams for the course (key from
// `exams()`: "<event id>@<date>" or "folder:<rel>"); a lecture with no exam sits under "Other".
import { del, entries, get, newId, put } from "./synced.svelte";

export type LinkKind = "note" | "pdf" | "file" | "deck";
/** note = notes rel, pdf = PDF folder rel, file = Materials rel (quiz, interactive page, any file), deck = deck id */
export type Link = { kind: LinkKind; ref: string };
export type Lecture = {
  course: string;
  /** exam key from exams(), "" = not under an exam */
  exam: string;
  title: string;
  date?: string;
  order: number;
  links: Link[];
};

export const lectures = (course?: string) =>
  entries<Lecture>("lectures")
    .filter(([, l]) => !course || l.course === course)
    .sort((a, b) => a[1].order - b[1].order || (a[1].date ?? "").localeCompare(b[1].date ?? "") || a[1].title.localeCompare(b[1].title));
export const getLecture = (id: string) => get<Lecture>("lectures", id);

export function addLecture(course: string, exam: string, title: string, date?: string): string {
  const id = `lec-${newId()}`;
  const order = Math.max(0, ...lectures(course).map(([, l]) => l.order + 1));
  put("lectures", id, { course, exam, title: title.trim() || "Untitled", ...(date ? { date } : {}), order, links: [] });
  return id;
}
export function saveLecture(id: string, patch: Partial<Lecture>) {
  const l = getLecture(id);
  if (l) put("lectures", id, { ...l, ...patch });
}
export const deleteLecture = (id: string) => del("lectures", id);

const same = (a: Link, b: Link) => a.kind === b.kind && a.ref === b.ref;
export function addLinks(id: string, add: Link[]) {
  const l = getLecture(id);
  if (!l) return;
  const links = [...l.links];
  for (const x of add) if (!links.some((y) => same(x, y))) links.push(x);
  put("lectures", id, { ...l, links });
}
export function removeLink(id: string, x: Link) {
  const l = getLecture(id);
  if (l) put("lectures", id, { ...l, links: l.links.filter((y) => !same(x, y)) });
}

/** Lectures an item is linked to (for "in Heart failure" chips and the picker). */
export const lecturesWith = (x: Link) => lectures().filter(([, l]) => l.links.some((y) => same(x, y)));

/** A note (or a folder of notes) moved or was renamed: follow it. */
export function relinkNotes(from: string, to: string | null) {
  for (const [id, l] of entries<Lecture>("lectures")) {
    let changed = false;
    const links = l.links.flatMap((x) => {
      if (x.kind !== "note" || !(x.ref === from || x.ref.startsWith(from + "/"))) return [x];
      changed = true;
      return to === null ? [] : [{ kind: "note" as const, ref: to + x.ref.slice(from.length) }];
    });
    if (changed) put("lectures", id, { ...l, links });
  }
}
/** A course was renamed: its lectures follow. */
export function renameLectureCourse(from: string, to: string) {
  for (const [id, l] of entries<Lecture>("lectures")) if (l.course === from) put("lectures", id, { ...l, course: to });
}

export const lectureHref = (courseId: string, id: string) => `#/courses/${courseId}/l/${id}`;
