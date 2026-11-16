// Spaced repetition for the cards written in notes, scheduled with FSRS (ts-fsrs).
// Synced collections: "srs" (one record per card key) and "reviewDays" (counts per day).
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card as FCard, type Grade } from "ts-fsrs";
import { assignIds, cardId, extractCards, type NoteCard } from "../cards";
import { addDays, fromKey, todayKey, toKey } from "../calendar";
import type { Mask } from "../cardTypes";
import { exams } from "./calendar.svelte";
import { cardsOfItem, getType, items, previewImages } from "./library.svelte";
import { joinNote, splitNote } from "../notes";
import { markStudyDay } from "./labs.svelte";
import { imageUrl, noteHref, notes, saveNote, type NoteEntry } from "./notes.svelte";
import { settings } from "./settings.svelte";
import { del, entries, get, put } from "./synced.svelte";

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
};
export type DayRev = { reviews: number; new: number; again: number; ms: number };
/** A reviewable card from a note or from the card library. */
export type CardRef = {
  card: NoteCard & { masks?: Mask[]; target?: string; image?: string };
  course?: string;
  rec?: SrsRec;
  note?: NoteEntry;
  item?: { id: string; type: string };
  /** where it came from, and a link there */
  title: string;
  href: string;
  /** resolves image paths written in the card */
  img: (src: string) => string;
};
export type Scope = { kind: "all" } | { kind: "course"; name: string } | { kind: "note"; rel: string } | { kind: "library" };

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
});

// ---- cards in notes -------------------------------------------------------------------

const cache = new Map<string, { mtime: number; cards: NoteCard[] }>();
function cardsOf(e: NoteEntry): NoteCard[] {
  const c = cache.get(e.rel);
  if (c && c.mtime === e.mtime) return c.cards;
  const cards = extractCards(splitNote(e.text).body);
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
        item: { id, type: it.type },
        course: it.course,
        rec: get<SrsRec>("srs", g.key),
        title: (t?.kind === "occlusion" ? it.fields.Header : t?.fields.map((f) => it.fields[f]).find((v) => v?.trim()))?.slice(0, 60) || t?.name || "Card",
        href: `#/study/cards/library/${id}`,
        img: libImg,
      });
  }
  return out;
}

export const inScope = (s: Scope) => (r: CardRef) =>
  s.kind === "all" ? true : s.kind === "course" ? r.course === s.name : s.kind === "library" ? !!r.item : r.note?.rel === s.rel;

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

export function counts(s: Scope = { kind: "all" }) {
  const list = allCards().filter((r) => r.card.lineId).filter(inScope(s));
  const now = Date.now();
  let n = 0, learning = 0, review = 0, later = 0, suspended = 0, mature = 0;
  for (const r of list) {
    const st = statusOf(r.rec, now);
    if (st === "new") n++;
    else if (st === "learning") learning++;
    else if (st === "review") review++;
    else if (st === "suspended") suspended++;
    else later++;
    if (r.rec && r.rec.scheduled_days >= 21) mature++;
  }
  const newToday = Math.min(n, newLeftToday());
  return { total: list.length, new: n, newToday, learning, review, later, suspended, mature, due: learning + review };
}

/** Cards for a review session: learning, then reviews, with today's new cards mixed in. */
export function queue(s: Scope): CardRef[] {
  const now = Date.now();
  const list = allCards().filter((r) => r.card.lineId).filter(inScope(s));
  const learning = list.filter((r) => statusOf(r.rec, now) === "learning").sort((a, b) => a.rec!.due - b.rec!.due);
  const review = list.filter((r) => statusOf(r.rec, now) === "review").sort((a, b) => a.rec!.due - b.rec!.due);
  const fresh = list.filter((r) => !r.rec).slice(0, newLeftToday());
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
const beforeExam = (date: string) => fromKey(date).getTime() - 6 * 3600000;

export function grade(key: string, g: Grade, ms: number, course?: string) {
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
  put("srs", key, fromF(next, rec));
  put("reviewDays", day, { reviews: d.reviews + 1, new: d.new + (rec ? 0 : 1), again: d.again + (g === Rating.Again ? 1 : 0), ms: d.ms + Math.min(ms, 120000) });
  if (d.reviews === 0) markStudyDay("reviews");
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
