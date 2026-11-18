// The deck list shared by the Cards home, a deck page's tree and a parent deck's sub-deck rows
// (canvas "Flashcards tab: A + C"): My decks (her own decks, nested, plus the card library),
// From your notes (one per course, opening to its notes), Filtered (missed this week, keeps
// slipping).
import { exams, type Exam } from "./calendar.svelte";
import { courseByName, courses } from "./courses.svelte";
import { childrenOf, decks, examWindow, getDeck } from "./decks.svelte";
import { notes } from "./notes.svelte";
import { allCards, counts, inScope, scopeKey, type Scope } from "./srs.svelte";

export type DeckRow = {
  key: string;
  scope: Scope;
  name: string;
  icon: string;
  /** the icon tile's colour */
  tint: string;
  /** a small pill after the name: an exam ("Exam 5 · 16 d") or a note */
  pill?: { text: string; exam?: boolean };
  k: ReturnType<typeof counts>;
  kids: DeckRow[];
  /** her own deck's id (it has options) */
  deck?: string;
};
export type DeckGroup = { title: string; rows: DeckRow[] };

/** "Ther IV Exam 5" → "Exam 5" (the course is already on the row) */
export function shortExam(e: Exam): string {
  const c = courseByName(e.course)?.[1];
  let t = e.title;
  for (const p of [c?.code, c?.name, e.course]) if (p && t.toLowerCase().startsWith(p.toLowerCase() + " ")) t = t.slice(p.length + 1);
  return t;
}
/** the exam a deck is about: its own exam, else the next exam of its one course */
export function examOf(scope: Scope): Exam | undefined {
  const upcoming = (course: string) => exams().find((e) => e.course === course && e.days >= 0);
  if (scope.kind === "deck") {
    const d = getDeck(scope.id);
    if (d?.exam) {
      const w = examWindow(d.exam);
      return w && w.exam.days >= 0 ? w.exam : undefined;
    }
    return d?.courses?.length === 1 ? upcoming(d.courses[0]) : undefined;
  }
  if (scope.kind === "notes" || scope.kind === "course") return upcoming(scope.kind === "notes" ? scope.course : scope.name);
  return undefined;
}
const examPill = (scope: Scope) => {
  const e = examOf(scope);
  return e ? { text: `${shortExam(e)} · ${e.days === 0 ? "today" : `${e.days} d`}`, exam: true } : undefined;
};

function deckRow(id: string): DeckRow {
  const d = getDeck(id)!;
  const scope: Scope = { kind: "deck", id };
  const c = d.courses?.length === 1 ? courseByName(d.courses[0])?.[1] : undefined;
  return {
    key: scopeKey(scope),
    scope,
    name: d.name,
    icon: d.icon || "i:layers",
    tint: c?.color ?? "var(--lavender)",
    pill: examPill(scope),
    k: counts(scope),
    kids: childrenOf(id).map(([k]) => deckRow(k)),
    deck: id,
  };
}

export function noteRow(rel: string): DeckRow {
  const e = notes.files[rel];
  const scope: Scope = { kind: "note", rel };
  const c = e?.p.meta.course ? courseByName(String(e.p.meta.course))?.[1] : undefined;
  return { key: scopeKey(scope), scope, name: e?.p.title ?? rel, icon: e?.p.meta.icon ? String(e.p.meta.icon) : "i:file-text", tint: c?.color ?? "var(--hairline)", k: counts(scope), kids: [] };
}

/** the note cards per course: one row per course, its notes inside */
function notesRows(): DeckRow[] {
  const byCourse = new Map<string, string[]>();
  for (const r of allCards()) {
    if (!r.note || !r.card.lineId) continue;
    const c = String(r.note.p.meta.course ?? "");
    const list = byCourse.get(c) ?? [];
    if (!list.includes(r.note.rel)) list.push(r.note.rel);
    byCourse.set(c, list);
  }
  const order = courses().map(([, c]) => c.name);
  return [...byCourse.entries()]
    .sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : order.indexOf(a[0]) - order.indexOf(b[0])))
    .map(([course, rels]) => {
      const scope: Scope = { kind: "notes", course };
      const c = course ? courseByName(course)?.[1] : undefined;
      const kids = rels.map(noteRow).sort((a, b) => a.name.localeCompare(b.name));
      return {
        key: scopeKey(scope),
        scope,
        name: course ? `${c?.code || course} notes` : "Other notes",
        icon: "i:notebook-pen",
        tint: c?.color ?? "var(--hairline)",
        pill: examPill(scope) ?? { text: `${rels.length} ${rels.length === 1 ? "note" : "notes"}` },
        k: counts(scope),
        kids,
      };
    });
}

/** Every group for the home list. Empty groups are left out (Filtered keeps "Missed this week"). */
export function deckGroups(): DeckGroup[] {
  const mine = decks()
    .filter(([, d]) => !d.parent || !getDeck(d.parent))
    .map(([id]) => deckRow(id));
  const lib: Scope = { kind: "library" };
  const libK = counts(lib);
  if (libK.total) mine.push({ key: "library", scope: lib, name: "Card library", icon: "book", tint: "var(--lavender)", k: libK, kids: [] });
  const fromNotes = notesRows();
  const missed: Scope = { kind: "filter", id: "missed" };
  const leech: Scope = { kind: "filter", id: "leech" };
  const filtered: DeckRow[] = [{ key: scopeKey(missed), scope: missed, name: "Missed this week", icon: "i:rotate-ccw", tint: "var(--peach)", k: counts(missed), kids: [] }];
  const lk = counts(leech);
  if (lk.total) filtered.push({ key: scopeKey(leech), scope: leech, name: "Keeps slipping", icon: "i:flag", tint: "var(--rose)", k: lk, kids: [] });
  return [
    ...(mine.length ? [{ title: "My decks", rows: mine }] : []),
    ...(fromNotes.length ? [{ title: "From your notes", rows: fromNotes }] : []),
    { title: "Filtered", rows: filtered },
  ];
}

/** The rows inside a deck: a deck's sub-decks, a course's notes. */
export function subRows(scope: Scope): DeckRow[] {
  if (scope.kind === "deck") return childrenOf(scope.id).map(([k]) => deckRow(k));
  if (scope.kind === "notes" || scope.kind === "course") {
    const course = scope.kind === "notes" ? scope.course : scope.name;
    const m = inScope({ kind: "notes", course });
    const rels = [...new Set(allCards().filter((r) => r.card.lineId && m(r)).map((r) => r.note!.rel))];
    return rels.map(noteRow).sort((a, b) => a.name.localeCompare(b.name));
  }
  return [];
}

// which rows are open (per machine)
function readOpen(): string[] {
  try {
    return JSON.parse(localStorage.getItem("mosaic.deckOpen") || "[]");
  } catch {
    return [];
  }
}
export const deckOpen = $state({ keys: readOpen() });
export function toggleOpen(k: string) {
  deckOpen.keys = deckOpen.keys.includes(k) ? deckOpen.keys.filter((x) => x !== k) : [...deckOpen.keys, k];
  try {
    localStorage.setItem("mosaic.deckOpen", JSON.stringify(deckOpen.keys));
  } catch {}
}
