// Spaced repetition for the cards written in notes, scheduled with FSRS (ts-fsrs).
// Synced collections: "srs" (one record per card key) and "reviewDays" (counts per day).
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card as FCard, type Grade } from "ts-fsrs";
import { assignIds, cardId, extractCards, type NoteCard } from "../cards";
import { addDays, fromKey, todayKey, toKey } from "../calendar";
import type { Mask } from "../cardTypes";
import { exams } from "./calendar.svelte";
import { courseByName } from "./courses.svelte";
import { cardsOfItem, getType, items, previewImages } from "./library.svelte";
import { joinNote, splitNote } from "../notes";
import { markStudyDay } from "./labs.svelte";
import { imageUrl, noteHref, notes, saveNote, type NoteEntry } from "./notes.svelte";
import { settings } from "./settings.svelte";
import { del, entries, get, put } from "./synced.svelte";
import { deckMatcher, getDeck } from "./decks.svelte";
import { getLecture, lectures, type Lecture } from "./outline.svelte";

/** FSRS card state as stored (dates as ms). */
export type SrsRec = {
  due: number;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: number;
  suspended?: boolean;
  /** forgotten LEECH_AT times or more (and flagged again every half of that after) */
  leech?: boolean;
  /** when it was first reviewed (Nov 19 on; older cards have none): new-card counts per deck */
  born?: number;
};
export type DayRev = { reviews: number; new: number; again: number; ms: number };
/** A reviewable card from a note or from the card library. */
export type CardRef = {
  card: NoteCard & { masks?: Mask[]; target?: string; image?: string };
  course?: string;
  rec?: SrsRec;
  note?: NoteEntry;
  item?: { id: string; type: string; deck?: string };
  /** where it came from, and a link there */
  title: string;
  href: string;
  /** resolves image paths written in the card */
  img: (src: string) => string;
};
/** note scope with `section`: only cards under that heading path (a section's Review button) */
/** filter: the Filtered decks (missed this week, keeps slipping, due in the next 2 days), on all
 *  cards or inside another scope; notes: the note cards of one course ("" = notes with no course) */
export type FilterId = "missed" | "leech" | "ahead" | "hard";
export type Scope =
  | { kind: "all" }
  | { kind: "deck"; id: string }
  | { kind: "course"; name: string }
  | { kind: "note"; rel: string; section?: string[] }
  | { kind: "library" }
  | { kind: "notes"; course: string }
  /** a lecture of the course hub, or every lecture under one exam of a course */
  | { kind: "lecture"; id: string }
  | { kind: "unit"; course: string; exam: string }
  | { kind: "filter"; id: FilterId; in?: Scope };

/** A scope as one string, for routes: all | library | deck:<id> | course:<name> | note:<rel>[#a › b] */
export function scopeKey(s: Scope): string {
  if (s.kind === "filter") return `filter:${s.id}${s.in ? `|${scopeKey(s.in)}` : ""}`;
  if (s.kind === "notes") return `notes:${s.course}`;
  if (s.kind === "lecture") return `lecture:${s.id}`;
  if (s.kind === "unit") return `unit:${s.course}|${s.exam}`;
  if (s.kind === "deck") return `deck:${s.id}`;
  if (s.kind === "course") return `course:${s.name}`;
  if (s.kind === "note") return `note:${s.rel}${s.section?.length ? `#${s.section.join(" › ")}` : ""}`;
  return s.kind;
}
export function parseScope(k: string): Scope {
  if (k.startsWith("filter:")) {
    const [id, ...rest] = k.slice(7).split("|");
    return { kind: "filter", id: id as FilterId, ...(rest.length ? { in: parseScope(rest.join("|")) } : {}) };
  }
  if (k.startsWith("notes:")) return { kind: "notes", course: k.slice(6) };
  if (k.startsWith("lecture:")) return { kind: "lecture", id: k.slice(8) };
  if (k.startsWith("unit:")) {
    const [course, ...exam] = k.slice(5).split("|");
    return { kind: "unit", course, exam: exam.join("|") };
  }
  if (k.startsWith("course:")) return { kind: "course", name: k.slice(7) };
  if (k.startsWith("deck:")) return { kind: "deck", id: k.slice(5) };
  if (k.startsWith("note:")) {
    const [rel, sec] = k.slice(5).split("#");
    return { kind: "note", rel, section: sec ? sec.split(" › ").filter(Boolean) : undefined };
  }
  return k === "library" ? { kind: "library" } : { kind: "all" };
}
/** what a scope is called */
export const FILTER_NAMES: Record<FilterId, string> = { missed: "Missed this week", leech: "Keeps slipping", ahead: "Due in the next 2 days", hard: "Hardest cards" };
export function scopeName(s: Scope): string {
  if (s.kind === "filter") return FILTER_NAMES[s.id] + (s.in ? ` · ${scopeName(s.in)}` : "");
  if (s.kind === "notes") return s.course ? `${courseByName(s.course)?.[1].code || s.course} notes` : "Other notes";
  if (s.kind === "all") return "All cards";
  if (s.kind === "library") return "Card library";
  if (s.kind === "deck") return getDeck(s.id)?.name ?? "Deck";
  if (s.kind === "course") return s.name;
  if (s.kind === "lecture") return getLecture(s.id)?.title ?? "Lecture";
  if (s.kind === "unit") {
    const e = exams().find((x) => x.key === s.exam);
    return e ? e.title : `${courseByName(s.course)?.[1].code || s.course} · Other`;
  }
  return (notes.files[s.rel]?.p.title ?? "Note") + (s.section?.length ? ` › ${s.section.join(" › ")}` : "");
}

const scheduler = () => fsrs(generatorParameters({ request_retention: settings.retention || 0.9, enable_fuzz: true, maximum_interval: 3650 }));

const toF = (r: SrsRec): FCard => ({ ...r, due: new Date(r.due), last_review: r.last_review ? new Date(r.last_review) : undefined, state: r.state as State } as FCard);
const fromF = (c: FCard, keep?: SrsRec): SrsRec => ({
  due: c.due.getTime(),
  stability: c.stability,
  difficulty: c.difficulty,
  scheduled_days: c.scheduled_days,
  learning_steps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  last_review: c.last_review ? c.last_review.getTime() : undefined,
  ...(keep?.suspended ? { suspended: true } : {}),
  ...(keep?.born ? { born: keep.born } : {}),
  ...(keep?.leech ? { leech: true } : {}),
});

// ---- cards in notes -------------------------------------------------------------------

const cache = new Map<string, { mtime: number; cards: NoteCard[] }>();
function cardsOf(e: NoteEntry): NoteCard[] {
  const c = cache.get(e.rel);
  if (c && c.mtime === e.mtime) return c.cards;
  // a conflict copy ("<note> (other version …)", front matter `conflict:`) repeats the note's
  // cards: they'd count twice, so it has none until it's merged or deleted
  const cards = e.p.meta.conflict ? [] : extractCards(splitNote(e.text).body);
  cache.set(e.rel, { mtime: e.mtime, cards });
  return cards;
}

const libImg = (src: string) => previewImages.get(src) ?? imageUrl("", src);

/** Every card in every note and in the library (note cards need an id before they can be reviewed). */
export function allCards(): CardRef[] {
  const out: CardRef[] = [];
  for (const e of Object.values(notes.files)) {
    const course = e.p.meta.course ? String(e.p.meta.course) : undefined;
    for (const card of cardsOf(e))
      out.push({ card, note: e, course, rec: get<SrsRec>("srs", card.key), title: e.p.title, href: noteHref(e.rel), img: (s) => imageUrl(e.rel, s) });
  }
  for (const [id, it] of items()) {
    const t = getType(it.type);
    for (const g of cardsOfItem(id, it))
      out.push({
        card: { key: g.key, lineId: g.key, kind: "item", front: g.front, back: g.back, context: [t?.name ?? "Card", ...(it.tags ?? []).map((x) => `#${x}`)], line: 0, masks: g.masks, target: g.target, image: g.image },
        item: { id, type: it.type, ...(it.deck ? { deck: it.deck } : {}) },
        course: it.course,
        rec: get<SrsRec>("srs", g.key),
        title: (t?.kind === "occlusion" ? it.fields.Header : t?.fields.map((f) => it.fields[f]).find((v) => v?.trim()))?.slice(0, 60) || t?.name || "Card",
        href: `#/study/cards/library/${id}`,
        img: libImg,
      });
  }
  return out;
}

const plainHead = (t: string) => t.replace(/[*_`=~]+/g, "").replace(/\s+/g, " ").trim().toLowerCase();
/** the card's heading path starts with the section's path */
const underSection = (ctx: string[], path: string[]) => {
  const c = ctx.map(plainHead);
  const p = path.map(plainHead);
  return p.length <= c.length && p.every((x, k) => c[k] === x);
};
const WEEK = 7 * 86_400_000;
/** a Filtered deck's rule */
function filterMatch(id: FilterId): (r: CardRef) => boolean {
  const now = Date.now();
  if (id === "leech") return (r) => !!r.rec?.leech;
  if (id === "hard") return (r) => !!r.rec && !r.rec.suspended && r.rec.lapses >= 2;
  // forgotten at least once and seen in the last week (the review log isn't kept per card)
  if (id === "missed") return (r) => !!r.rec && r.rec.lapses > 0 && !!r.rec.last_review && now - r.rec.last_review < WEEK;
  return (r) => !!r.rec && !r.rec.suspended && r.rec.state !== State.New && r.rec.due <= now + 2 * 86_400_000;
}
/** cards of some hub lectures: their linked notes' cards and their linked decks' cards */
function linksMatcher(list: Lecture[]): (r: CardRef) => boolean {
  const rels = new Set(list.flatMap((l) => l.links.filter((x) => x.kind === "note").map((x) => x.ref)));
  const ds = [...new Set(list.flatMap((l) => l.links.filter((x) => x.kind === "deck").map((x) => x.ref)))].map((id) => deckMatcher(getDeck(id), id));
  return (r) => (!!r.note && rels.has(r.note.rel)) || ds.some((m) => m(r));
}
export const inScope = (s: Scope): ((r: CardRef) => boolean) =>
  s.kind === "lecture"
    ? linksMatcher([getLecture(s.id)].filter((l): l is Lecture => !!l))
    : s.kind === "unit"
      ? linksMatcher(lectures(s.course).map(([, l]) => l).filter((l) => l.exam === s.exam))
      : s.kind === "deck"
    ? deckMatcher(getDeck(s.id), s.id)
    : s.kind === "filter"
      ? ((m, inner) => (r: CardRef) => m(r) && (!inner || inner(r)))(filterMatch(s.id), s.in ? inScope(s.in) : null)
      : s.kind === "notes"
        ? (r: CardRef) => !!r.note && String(r.note.p.meta.course ?? "") === s.course
        : (r: CardRef) =>
  s.kind === "all"
    ? true
    : s.kind === "course"
      ? r.course === s.name
      : s.kind === "library"
        ? !!r.item
        : r.note?.rel === s.rel && (!s.section?.length || underSection(r.card.context ?? [], s.section));

/** Write ids into card lines that don't have one yet (skipping the note open in the editor). */
export async function ensureIds(): Promise<number> {
  let n = 0;
  for (const e of Object.values(notes.files)) {
    if (e.rel === notes.editing || !cardsOf(e).some((c) => !c.lineId)) continue;
    const { meta, body } = splitNote(e.text);
    const r = assignIds(body, cardId);
    if (!r.inserted.length) continue;
    try {
      await saveNote(e.rel, joinNote(meta, r.body), e.mtime);
      n += r.inserted.length;
    } catch {
      /* changed elsewhere: try again next time */
    }
  }
  return n;
}

// ---- what's due --------------------------------------------------------------------------

const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};
export const LEARN_AHEAD = 20 * 60000;

export type Status = "new" | "learning" | "review" | "later" | "suspended";
export function statusOf(rec: SrsRec | undefined, now = Date.now()): Status {
  if (!rec) return "new";
  if (rec.suspended) return "suspended";
  if (rec.state === State.Learning || rec.state === State.Relearning) return rec.due <= now + LEARN_AHEAD ? "learning" : "later";
  return rec.due <= endOfToday() ? "review" : "later";
}

export const dayRev = (d = todayKey()) => get<DayRev>("reviewDays", d) ?? { reviews: 0, new: 0, again: 0, ms: 0 };
export const newLeftToday = () => Math.max(0, (settings.newPerDay ?? 20) - dayRev().new);

const isToday = (ms?: number) => !!ms && toKey(new Date(ms)) === todayKey();
/** cards introduced / reviewed today among these (a card counts once, however many times it came back) */
function doneToday(list: CardRef[]) {
  let n = 0, rev = 0;
  for (const r of list) {
    if (!r.rec || !isToday(r.rec.last_review)) continue;
    if (isToday(r.rec.born)) n++;
    else rev++;
  }
  return { new: n, reviews: rev };
}
/** How many new cards and reviews a session in this scope may still show today: the global
 *  allowance, and for a deck its own limits on top. Learning cards are never held back. */
export function limitsLeft(s: Scope, list?: CardRef[]): { new: number; reviews: number } {
  let newLeft = newLeftToday();
  let revLeft = Infinity;
  // the whole card list is only read when a limit needs it (counts() runs once per deck row)
  if (settings.reviewsPerDay) revLeft = Math.max(0, settings.reviewsPerDay - doneToday(allCards()).reviews);
  const d = s.kind === "deck" ? getDeck(s.id) : undefined;
  if (d && (d.newPerDay != null || d.reviewsPerDay != null)) {
    const done = doneToday(list ?? allCards().filter(inScope(s)));
    if (d?.newPerDay != null) newLeft = Math.min(newLeft, Math.max(0, d.newPerDay - done.new));
    if (d?.reviewsPerDay != null) revLeft = Math.min(revLeft, Math.max(0, d.reviewsPerDay - done.reviews));
  }
  return { new: newLeft, reviews: revLeft };
}

/** Siblings: cards from the same note line (both sides of ⇄, a line's clozes, a concept's two
 *  cards) or the same library item. Table cells don't count: a table is many separate facts. */
export function siblingGroup(r: CardRef): string | null {
  if (r.item) return `item:${r.item.id}`;
  if (r.card.kind === "table" || !r.card.lineId) return null;
  return `line:${r.card.lineId}`;
}

/** What a session in this scope asks today: learning cards, then reviews and new cards within
 *  the daily limits; with burying on, one card per sibling group a day (a group already seen
 *  today, or with a card in learning, holds its other new / review cards back until tomorrow). */
function plan(s: Scope, list: CardRef[]) {
  const now = Date.now();
  const left = limitsLeft(s, list);
  const bury = settings.burySiblings !== false;
  const taken = new Set<string>();
  if (bury) for (const r of list) if (r.rec && isToday(r.rec.last_review)) { const g = siblingGroup(r); if (g) taken.add(g); }
  const take = (r: CardRef) => {
    if (!bury) return true;
    const g = siblingGroup(r);
    if (!g) return true;
    if (taken.has(g)) return false;
    taken.add(g);
    return true;
  };
  const learning = list.filter((r) => statusOf(r.rec, now) === "learning").sort((a, b) => a.rec!.due - b.rec!.due);
  for (const r of learning) { const g = siblingGroup(r); if (g && bury) taken.add(g); }
  const allReview = list.filter((r) => statusOf(r.rec, now) === "review").sort((a, b) => a.rec!.due - b.rec!.due);
  const review: CardRef[] = [];
  let buried = 0;
  for (const r of allReview) {
    if (review.length >= left.reviews) break;
    if (take(r)) review.push(r);
    else buried++;
  }
  // a section reviewed right after class gets all of its new cards, not just today's allowance
  const max = s.kind === "note" && s.section?.length ? Infinity : left.new;
  const fresh: CardRef[] = [];
  for (const r of list) {
    if (r.rec) continue;
    if (fresh.length >= max) break;
    if (take(r)) fresh.push(r);
    else buried++;
  }
  return { learning, review, fresh, held: allReview.length - review.length - buried, buried };
}

export function counts(s: Scope = { kind: "all" }) {
  const list = allCards().filter((r) => r.card.lineId).filter(inScope(s));
  const now = Date.now();
  let n = 0, review = 0, later = 0, suspended = 0, mature = 0, leeches = 0;
  for (const r of list) {
    const st = statusOf(r.rec, now);
    if (st === "new") n++;
    else if (st === "review") review++;
    else if (st === "suspended") suspended++;
    else if (st === "later") later++;
    if (r.rec && r.rec.scheduled_days >= 21) mature++;
    if (r.rec?.leech) leeches++;
  }
  const p = plan(s, list);
  return {
    total: list.length, new: n, newToday: p.fresh.length, learning: p.learning.length, review, later, suspended, mature, leeches,
    // `due` is what a session will ask; reviews over a limit (`held`) or behind a sibling (`buried`) wait
    due: p.learning.length + p.review.length, held: p.held, buried: p.buried,
  };
}

/** Cards for a review session: learning, then reviews, with today's new cards mixed in. */
export function queue(s: Scope): CardRef[] {
  const list = allCards().filter((r) => r.card.lineId).filter(inScope(s));
  const { learning, review, fresh } = plan(s, list);
  const out = [...learning];
  let i = 0;
  for (const r of review) {
    out.push(r);
    if (++i % 4 === 0 && fresh.length) out.push(fresh.shift()!);
  }
  return [...out, ...fresh];
}

// ---- grading ---------------------------------------------------------------------------

export const RATINGS: { grade: Grade; label: string; key: string }[] = [
  { grade: Rating.Again, label: "Again", key: "1" },
  { grade: Rating.Hard, label: "Hard", key: "2" },
  { grade: Rating.Good, label: "Good", key: "3" },
  { grade: Rating.Easy, label: "Easy", key: "4" },
];

/** When each rating would bring the card back, e.g. "10 min", "3 d". */
export function preview(key: string): Record<number, string> {
  const rec = get<SrsRec>("srs", key);
  const now = new Date();
  const p = scheduler().repeat(rec ? toF(rec) : createEmptyCard(now), now);
  const out: Record<number, string> = {};
  for (const r of RATINGS) out[r.grade] = fmtInterval(p[r.grade].card.due.getTime() - now.getTime());
  return out;
}

export function fmtInterval(ms: number): string {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} d`;
  const mo = d / 30.4;
  return mo < 12 ? `${Math.round(mo * 10) / 10} mo` : `${Math.round((d / 365) * 10) / 10} y`;
}

let last: { key: string; rec?: SrsRec; day: string; dayRec?: DayRev } | null = null;

/** Next exam (from tomorrow on) for a course, if any. */
export function nextExam(course?: string) {
  return course ? exams().find((e) => e.course === course && e.days >= 1) : undefined;
}
/** The evening before an exam: the latest a card should come due. */
export const beforeExam = (date: string) => fromKey(date).getTime() - 6 * 3600000;

export const LEECH_AT = 8;
/** Rate a card. Returns true when this rating made it a leech. */
export function grade(key: string, g: Grade, ms: number, course?: string): boolean {
  const rec = get<SrsRec>("srs", key);
  const now = new Date();
  const next = scheduler().next(rec ? toF(rec) : createEmptyCard(now), now, g).card;
  // exam-aware: never schedule a card in an exam's course past the evening before it
  const ex = settings.examAware !== false ? nextExam(course) : undefined;
  if (ex) {
    const cap = beforeExam(ex.date);
    if (next.due.getTime() > cap && cap > now.getTime() + 3600000) next.due = new Date(cap);
  }
  const day = todayKey();
  const d = dayRev(day);
  last = { key, rec, day, dayRec: get<DayRev>("reviewDays", day) };
  const after: SrsRec = { ...fromF(next, rec), born: rec ? rec.born : now.getTime() };
  // a leech: forgotten LEECH_AT times, then again every half of that (8, 12, 16… like Anki)
  const at = settings.leechAt ?? LEECH_AT;
  const leech = !!at && after.lapses > (rec?.lapses ?? 0) && after.lapses >= at && (after.lapses - at) % Math.max(1, Math.ceil(at / 2)) === 0;
  if (leech) {
    after.leech = true;
    if (settings.leechAction === "suspend") after.suspended = true;
  }
  put("srs", key, after);
  put("reviewDays", day, { reviews: d.reviews + 1, new: d.new + (rec ? 0 : 1), again: d.again + (g === Rating.Again ? 1 : 0), ms: d.ms + Math.min(ms, 120000) });
  if (d.reviews === 0) markStudyDay("reviews");
  return leech;
}

/** Undo the last rating. Returns the card key, or null if there's nothing to undo. */
export function undo(): string | null {
  if (!last) return null;
  const l = last;
  last = null;
  if (l.rec) put("srs", l.key, l.rec);
  else del("srs", l.key); // it was new: back to new
  if (l.dayRec) put("reviewDays", l.day, l.dayRec);
  return l.key;
}

/** Cram: count the review for today and the streak, but leave the schedule alone. */
export function cramReviewed(again: boolean, ms: number) {
  const day = todayKey();
  const d = dayRev(day);
  put("reviewDays", day, { ...d, reviews: d.reviews + 1, again: d.again + (again ? 1 : 0), ms: d.ms + Math.min(ms, 120000) });
  if (d.reviews === 0) markStudyDay("reviews");
}

/** Every card in scope, most-forgotten first, then new ones: for cramming. */
export function cramQueue(s: Scope): CardRef[] {
  const list = allCards().filter((r) => r.card.lineId && !r.rec?.suspended).filter(inScope(s));
  return [...list.filter((r) => r.rec).sort((a, b) => a.rec!.due - b.rec!.due), ...list.filter((r) => !r.rec)];
}

/** Upcoming exams with their course's cards: how many are new or due only after the exam. */
export function examReadiness(days = 45) {
  const out = [];
  for (const ex of exams().filter((e) => e.days >= 1 && e.days <= days && e.course)) {
    const cards = allCards().filter((r) => r.card.lineId && r.course === ex.course && !r.rec?.suspended);
    if (!cards.length) continue;
    const cap = beforeExam(ex.date);
    out.push({ exam: ex, total: cards.length, unseen: cards.filter((r) => !r.rec).length, late: cards.filter((r) => r.rec && r.rec.due > cap).length });
  }
  return out;
}

/** Spread the course's cards that are due after the exam over the days before it. */
export function fitBeforeExam(course: string, date: string): number {
  const cap = beforeExam(date);
  const late = allCards()
    .filter((r) => r.course === course && r.rec && !r.rec.suspended && r.rec.due > cap)
    .sort((a, b) => a.rec!.stability - b.rec!.stability);
  const today = todayKey();
  const days = Math.max(1, Math.round((fromKey(date).getTime() - fromKey(today).getTime()) / 864e5) - 1);
  late.forEach((r, i) => {
    const day = addDays(today, 1 + Math.floor((i * days) / Math.max(1, late.length)));
    const due = Math.min(fromKey(day).getTime() + 18 * 3600000, cap);
    put("srs", r.card.key, { ...r.rec!, due });
  });
  return late.length;
}

// ---- card browser actions (Nov 19, F1) ----------------------------------------------------

/** Start a card over as new (its review history is dropped). */
export function forget(key: string) {
  if (get<SrsRec>("srs", key)) del("srs", key);
}
/** Make a reviewed card due at `when` (a new card is left as it is: it has no schedule yet). */
export function reschedule(key: string, when: number) {
  const rec = get<SrsRec>("srs", key);
  if (rec && rec.state !== State.New) put("srs", key, { ...rec, due: when });
}
/** a line's indentation and list marker ("  - ", "1. ", "- [ ] "): kept as it is when a card's line is edited */
const LINE_LEAD = /^\s*(?:(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?/;
/** The note line a card comes from (without its hidden id, indent and list marker); null when it can't be edited there. */
export function cardLine(r: CardRef): string | null {
  if (!r.note || !r.card.lineId) return null;
  const tag = `<!--sd:${r.card.lineId}-->`;
  const line = r.note.text.split("\n").find((l) => l.includes(tag));
  return line === undefined ? null : line.replace(/\s*<!--sd:[a-z0-9]+-->/g, "").replace(LINE_LEAD, "").trim();
}
/** Rewrite a card's line in its note (the id stays, so the card keeps its history). */
export async function saveCardLine(r: CardRef, text: string): Promise<void> {
  if (!r.note || !r.card.lineId) throw new Error("This card can't be edited here.");
  const e = notes.files[r.note.rel];
  if (!e) throw new Error("The note isn't there any more.");
  const tag = `<!--sd:${r.card.lineId}-->`;
  const lines = e.text.split("\n");
  const i = lines.findIndex((l) => l.includes(tag));
  if (i < 0) throw new Error("The card's line changed. Open the note to edit it.");
  const clean = text.replace(/\r?\n/g, " ").replace(/\s*<!--sd:[a-z0-9]+-->/g, "").trim();
  // the line keeps its indentation and list marker (they place the card in its list)
  const lead = lines[i].match(LINE_LEAD)![0];
  lines[i] = `${lead}${clean.replace(LINE_LEAD, "")} ${tag}`;
  await saveNote(e.rel, lines.join("\n"), e.mtime);
}

/** Clear a card's leech flag (it stays in its schedule). */
export function clearLeech(key: string) {
  const rec = get<SrsRec>("srs", key);
  if (rec?.leech) put("srs", key, { ...rec, leech: undefined });
}

export function setSuspended(key: string, on: boolean) {
  const rec = get<SrsRec>("srs", key) ?? fromF(createEmptyCard(new Date()));
  put("srs", key, { ...rec, suspended: on || undefined });
}

// ---- stats -----------------------------------------------------------------------------

/** Reviews due on each of the next `days` days (overdue counted today). */
export function forecast(days = 14): { date: string; n: number }[] {
  const today = todayKey();
  const out = Array.from({ length: days }, (_, i) => ({ date: addDays(today, i), n: 0 }));
  for (const [, r] of entries<SrsRec>("srs")) {
    if (!r || r.suspended) continue;
    const d = toKey(new Date(r.due));
    const i = d <= today ? 0 : out.findIndex((x) => x.date === d);
    if (i >= 0) out[i].n++;
  }
  return out;
}

/** Share of reviews answered without "Again" over the last `days` days. */
export function retention(days = 30): number | null {
  const from = addDays(todayKey(), -days);
  let rev = 0;
  let again = 0;
  for (const [d, r] of entries<DayRev>("reviewDays")) if (d >= from) {
    rev += r.reviews;
    again += r.again;
  }
  return rev ? (rev - again) / rev : null;
}

/** The chance (0–1) of remembering a reviewed card right now, from its FSRS memory state. */
export function recallOf(rec: SrsRec, now = Date.now()): number {
  const r = scheduler().retrievability(toF(rec), new Date(now));
  return typeof r === "number" ? r : parseFloat(String(r)) / 100;
}

/** Seconds a review takes her, from the last 30 days (8 s until there is any history). */
export function pace(): number {
  const from = addDays(todayKey(), -30);
  let n = 0, ms = 0;
  for (const [d, r] of entries<DayRev>("reviewDays")) if (d >= from) {
    n += r.reviews;
    ms += r.ms;
  }
  return n >= 20 ? Math.max(3, ms / n / 1000) : 8;
}
/** How ready a set of cards is for an exam: `ready` = seen and coming due again by the evening
 *  before it (so they get reviewed in time); `unseen` new, `late` due only after the exam. */
export function readiness(list: CardRef[], date: string) {
  const cap = beforeExam(date);
  const cards = list.filter((r) => !r.rec?.suspended);
  const unseen = cards.filter((r) => !r.rec || r.rec.state === State.New).length;
  const late = cards.filter((r) => r.rec && r.rec.state !== State.New && r.rec.due > cap).length;
  return { total: cards.length, ready: cards.length - unseen - late, unseen, late };
}

// ---- flags (Browse, her canvas board: coloured flags that match the highlight colours) ----
export const FLAGS = [
  { id: "rose", name: "Rose", colour: "var(--rose-deep)" },
  { id: "butter", name: "Butter", colour: "var(--butter)" },
  { id: "sage", name: "Sage", colour: "var(--sage-deep)" },
] as const;
export type FlagId = (typeof FLAGS)[number]["id"];
/** a card's flag (synced collection "cardFlags", keyed by card key) */
export const flagOf = (key: string) => get<{ c: FlagId }>("cardFlags", key)?.c;
export function setFlag(key: string, c: FlagId | null) {
  if (c) put("cardFlags", key, { c });
  else if (get("cardFlags", key)) del("cardFlags", key);
}
