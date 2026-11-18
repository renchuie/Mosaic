// Her own decks (F1, Nov 19): a saved filter over every card (notes + library), with its own daily
// limits. Synced collection "decks". Decks overlap freely (a card can be in several), like Anki's
// filtered decks; the course / note / library lists on the Cards page stay as automatic decks.
import { exams, type Exam } from "./calendar.svelte";
import { del, entries, get, newId, put } from "./synced.svelte";
import type { CardRef } from "./srs.svelte";

export type Deck = {
  name: string;
  /** an Icon value (line icon "i:name:colour", emoji, or a built-in name) */
  icon?: string;
  /** cards from these courses (by name) */
  courses?: string[];
  /** note folders (rel paths, everything under them) and single notes (rel paths) */
  folders?: string[];
  notes?: string[];
  /** the card library counts as a source too */
  library?: boolean;
  /** #tags on the note or library item */
  tags?: string[];
  /** an exam (key from exams()): its course's cards from notes dated after the course's previous
   *  exam up to this one (undated notes count) */
  exam?: string;
  /** daily limits; unset = the default (Settings) / no limit */
  newPerDay?: number | null;
  reviewsPerDay?: number | null;
  order: number;
};

export const decks = () => entries<Deck>("decks").sort((a, b) => a[1].order - b[1].order || a[1].name.localeCompare(b[1].name));
export const getDeck = (id: string) => get<Deck>("decks", id);
export function saveDeck(id: string | null, d: Deck): string {
  const key = id ?? newId();
  put("decks", key, d);
  return key;
}
export const deleteDeck = (id: string) => del("decks", id);

export const hasRules = (d: Deck) => !!(d.courses?.length || d.folders?.length || d.notes?.length || d.library || d.tags?.length || d.exam);

/** an exam's window: the day after the course's previous exam, up to the exam day */
export function examWindow(key: string, all: Exam[] = exams()): { exam: Exam; from: string | null } | null {
  const exam = all.find((e) => e.key === key);
  if (!exam) return null;
  const prev = all.filter((e) => e.course === exam.course && e.date < exam.date).pop();
  return { exam, from: prev ? prev.date : null };
}

const tagsOf = (r: CardRef): string[] =>
  r.note ? r.note.p.tags : (r.card.context ?? []).filter((t) => t.startsWith("#")).map((t) => t.slice(1));

/** A matcher for a deck: each kind of rule that is set must match (courses AND where AND tags AND
 *  exam); inside one kind any entry is enough. A deck without rules matches nothing. */
export function deckMatcher(d: Deck | undefined): (r: CardRef) => boolean {
  if (!d || !hasRules(d)) return () => false;
  const courses = d.courses?.length ? new Set(d.courses) : null;
  const where = d.folders?.length || d.notes?.length || d.library;
  const folders = (d.folders ?? []).map((f) => f.replace(/\/$/, "") + "/");
  const noteSet = new Set(d.notes ?? []);
  const tags = d.tags?.length ? new Set(d.tags.map((t) => t.toLowerCase())) : null;
  const win = d.exam ? examWindow(d.exam) : null;
  if (d.exam && !win) return () => false;
  return (r) => {
    if (courses && !(r.course && courses.has(r.course))) return false;
    if (where) {
      const rel = r.note?.rel;
      const ok = rel ? noteSet.has(rel) || folders.some((f) => rel.startsWith(f)) : !!d.library && !!r.item;
      if (!ok) return false;
    }
    if (tags && !tagsOf(r).some((t) => tags.has(t.toLowerCase()))) return false;
    if (win) {
      if (r.course !== win.exam.course) return false;
      const date = r.note?.p.meta.date ? String(r.note.p.meta.date).slice(0, 10) : null;
      if (date && (date > win.exam.date || (win.from && date <= win.from))) return false;
    }
    return true;
  };
}
