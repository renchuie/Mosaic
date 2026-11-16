// Quiz progress (synced collection "quizzes", one record per quiz id): what was answered,
// right or wrong, per question, and the last attempts. The quiz file itself is never changed.
import { todayKey } from "../calendar";
import { get, put } from "./synced.svelte";
import { markStudyDay } from "./labs.svelte";

export type QStat = { seen: number; right: number; last: number; lastRight: boolean };
export type Attempt = { at: number; mode: "practice" | "missed"; n: number; right: number; ms: number; missed: string[]; topics: Record<string, [number, number]> };
export type QuizRec = { title: string; rel: string; qs: Record<string, QStat>; attempts: Attempt[] };

export const quizRec = (id: string) => get<QuizRec>("quizzes", id);

export function recordAnswer(id: string, title: string, rel: string, qid: string, right: boolean) {
  const r = quizRec(id) ?? { title, rel, qs: {}, attempts: [] };
  const s = r.qs[qid] ?? { seen: 0, right: 0, last: 0, lastRight: false };
  put("quizzes", id, { ...r, title, rel, qs: { ...r.qs, [qid]: { seen: s.seen + 1, right: s.right + (right ? 1 : 0), last: Date.now(), lastRight: right } } });
}

export function finishAttempt(id: string, a: Attempt) {
  const r = quizRec(id);
  if (!r) return;
  put("quizzes", id, { ...r, attempts: [...r.attempts, a].slice(-30) });
  markStudyDay("labs");
}

/** Questions whose latest answer was wrong. */
export const missedIds = (id: string) => Object.entries(quizRec(id)?.qs ?? {}).filter(([, s]) => !s.lastRight).map(([q]) => q);
export function quizSummary(id: string) {
  const r = quizRec(id);
  const at = r?.attempts ?? [];
  const best = at.length ? Math.max(...at.filter((a) => a.mode === "practice").map((a) => Math.round((a.right / a.n) * 100)), 0) : null;
  const last = at[at.length - 1];
  return { attempts: at.length, best: at.some((a) => a.mode === "practice") ? best : null, last: last ? Math.round((last.right / last.n) * 100) : null, lastAt: last?.at ?? 0, missed: missedIds(id).length, today: last ? new Date(last.at).toDateString() === new Date().toDateString() : false, todayKey: todayKey() };
}
