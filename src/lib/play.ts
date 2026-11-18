// Practice games for flashcards (Type it / Test / Match; her Nov 18 list). Pure, node-tested.
// They never change the schedule: only Review does.
import { cardHtml } from "./cards";

export type Pair = { key: string; q: string; a: string; kind: string; img?: (s: string) => string };

/** Markdown card text → plain text */
export const plainOf = (md: string) =>
  cardHtml(md)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** What a card's answer is in plain text. Cloze: only the hidden part (the back minus what
 *  the front already shows). Null when the card can't be played (images, lists, tables). */
export function answerOf(card: { kind: string; front: string; back: string; masks?: unknown; grid?: unknown; rows?: unknown }): string | null {
  if (card.masks || card.grid || card.rows || card.kind === "list") return null;
  const back = plainOf(card.back);
  if (!back || /^- /m.test(card.back)) return null;
  if (card.kind === "cloze" || /\[…\]|\[\.\.\.\]/.test(plainOf(card.front))) {
    const f = plainOf(card.front);
    let i = 0;
    while (i < f.length && i < back.length && f[i] === back[i]) i++;
    let j = 0;
    while (j < f.length - i && j < back.length - i && f[f.length - 1 - j] === back[back.length - 1 - j]) j++;
    const mid = back.slice(i, back.length - j).trim();
    return mid || null;
  }
  return back;
}

// ---- grading typed answers ------------------------------------------------------------------

const STOP = new Set("a an the of and or to in on at for with by from is are be as it its that this into than then their not no".split(" "));
export const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[→⇄←–—-]/g, " ")
    .replace(/[^\p{L}\p{N}.%/ ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export function distance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
export const similarity = (a: string, b: string) => (a || b ? 1 - distance(a, b) / Math.max(a.length, b.length) : 1);

const REF = /\((?:slide|slides|p\.|page)[^)]*\)/gi;
/** the words that carry an answer (no small words, no "(Slide 7)" references) */
export const keyWords = (answer: string) =>
  [...new Set(normalize(answer.replace(REF, "")).split(" ").filter((w) => w.length > 1 && !STOP.has(w)))];

export type Verdict = "right" | "close" | "wrong";
/** Typed answer vs the card. Short answers: the whole thing, with typos allowed. Long ones: how
 *  many of the key words are there (each with a typo allowed); words in brackets (abbreviations)
 *  are optional, and getting the main clause (before the first ; or .) is enough on its own.
 *  `hit` = the answer's words that were found (for showing). */
export function check(input: string, answer: string): { verdict: Verdict; score: number; hit: Set<string> } {
  const t = normalize(input);
  const typed = t.split(" ").filter(Boolean);
  const found = (w: string) => typed.some((x) => x === w || (w.length > 4 && similarity(x, w) >= 0.8));
  const hit = new Set(keyWords(answer).filter(found));
  if (!t) return { verdict: "wrong", score: 0, hit };
  const core = answer.replace(REF, "").replace(/\([^)]*\)/g, " ");
  const a = normalize(core);
  const words = keyWords(core);
  const cover = (ws: string[]) => (ws.length ? ws.filter(found).length / ws.length : 0);
  if (words.length <= 3 || a.length <= 30) {
    const s = Math.max(similarity(t, a), cover(words));
    return { verdict: s >= 0.85 ? "right" : s >= 0.6 ? "close" : "wrong", score: s, hit };
  }
  const first = keyWords(core.split(/[;.](?:\s|$)/)[0]);
  const s = Math.max(cover(words), first.length >= 2 && first.length < words.length ? cover(first) * 0.95 : 0);
  return { verdict: s >= 0.75 ? "right" : s >= 0.45 ? "close" : "wrong", score: s, hit };
}

// ---- multiple choice ------------------------------------------------------------------------

/** Three wrong options for a question: other answers in the deck, closest in length first, the
 *  same kind of card preferred, never the same text. `rand` for tests. */
export function distractors(p: Pair, pool: Pair[], n = 3, rand = Math.random): string[] {
  const right = normalize(p.a);
  const seen = new Set([right]);
  const cands = pool
    .filter((x) => x.key !== p.key)
    .map((x) => ({ x, d: Math.abs(x.a.length - p.a.length) / Math.max(x.a.length, p.a.length, 1) + (x.kind === p.kind ? 0 : 0.3) + rand() * 0.35 }))
    .sort((a, b) => a.d - b.d);
  const out: string[] = [];
  for (const { x } of cands) {
    const k = normalize(x.a);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x.a);
    if (out.length >= n) break;
  }
  return out;
}

export function shuffle<T>(list: T[], rand = Math.random): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
