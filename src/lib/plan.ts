// Daily study plan and activity heatmap: shapes and pure helpers.
// No imports, so it can be tested with plain node.

export type Block = {
  id: string;
  title: string;
  minutes: number;
  kind: "study" | "break";
  done: boolean;
  doneAt?: number;
  /** time spent on it so far (ms), saved whenever the timer pauses */
  spentMs: number;
  /** where it came from, for "open" buttons */
  taskId?: string;
  labRel?: string;
  course?: string;
  /** a link the block opens (e.g. a flashcard review) */
  href?: string;
};

/** One plan per day (synced collection "plans", keyed by "YYYY-MM-DD"). */
export type Plan = { blocks: Block[]; start?: string };

/** Running timer: one per machine. */
export type Timer = { date: string; blockId: string; startedAt: number | null };

const pad = (n: number) => String(n).padStart(2, "0");
export const hhmm = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** "1 h 15 min", "45 min" */
export function fmtDuration(min: number): string {
  min = Math.round(min);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** "12:05" or "1:02:05" from milliseconds */
export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/** When each block would run if the plan starts at `start` and done blocks keep their slot. */
export function schedule(blocks: Block[], start: string): { id: string; from: string; to: string }[] {
  let t = toMin(start);
  return blocks.map((b) => {
    const from = t;
    t += b.minutes;
    return { id: b.id, from: hhmm(from), to: hhmm(t) };
  });
}

export const planMinutes = (blocks: Block[], kind?: Block["kind"]) =>
  blocks.filter((b) => !kind || b.kind === kind).reduce((n, b) => n + b.minutes, 0);

/** Minutes actually studied in a plan: time on the clock, or the planned time for blocks ticked without the timer. */
export const studiedMinutes = (plan: Plan | undefined) =>
  (plan?.blocks ?? [])
    .filter((b) => b.kind === "study")
    .reduce((n, b) => n + (b.spentMs > 0 ? b.spentMs / 60000 : b.done ? b.minutes : 0), 0);

/** The block to work on next: the running one, else the first not done. */
export const currentBlock = (blocks: Block[], timer: Timer | null, date: string) =>
  (timer && timer.date === date && blocks.find((b) => b.id === timer.blockId && !b.done)) || blocks.find((b) => !b.done);

/** Move an item from one index to another (returns a new array). */
export function move<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, x);
  return out;
}

// ---- activity ----------------------------------------------------------------

export type DayActivity = { minutes: number; labs: number; tasks: number; blocks: number; reviews?: number };

/** One number per day for the heatmap: study minutes, plus credit for labs opened and tasks finished. */
export const activityScore = (a: DayActivity) => a.minutes + 20 * a.labs + 10 * a.tasks + (a.reviews ?? 0) / 2;

/** 0–4 for the heatmap colour. */
export function activityLevel(score: number): 0 | 1 | 2 | 3 | 4 {
  if (score <= 0) return 0;
  if (score < 30) return 1;
  if (score < 60) return 2;
  if (score < 120) return 3;
  return 4;
}

/** Longest run of consecutive active days in a sorted list of "YYYY-MM-DD". */
export function bestStreak(days: string[]): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of sorted) {
    const [y, m, dd] = d.split("-").map(Number);
    const t = Date.UTC(y, m - 1, dd) / 864e5;
    run = prev !== null && t - prev === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}
