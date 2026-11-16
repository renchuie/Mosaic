// Grade maths for course pages. Pure, no imports, so it can be tested with plain node.
//
// Two ways a syllabus can grade:
//  - "category": weighted categories (Exams 60 %, Quizzes 20 % …). Inside a category,
//    scores add up as points; the lowest N can be dropped.
//  - "points":   every assessment's points add up; grade = earned / possible.

export type Category = { id: string; name: string; weight: number; drop?: number };

export type Assessment = {
  courseId: string;
  name: string;
  /** category id (category mode) */
  category?: string;
  /** null / undefined = not graded yet */
  score?: number | null;
  max: number;
  date?: string;
  /** extra credit: its points count, its maximum doesn't */
  extra?: boolean;
  /** left out of the grade entirely (e.g. a dropped quiz the instructor excused) */
  excluded?: boolean;
  /** Top 200/300 quizzes: drugs covered */
  drugs?: { from: number; to: number };
  notes?: string;
  created: number;
};

export type ScaleStep = { letter: string; min: number };
export type Grading = { mode: "category" | "points"; categories: Category[]; target: number; scale: ScaleStep[] };

export const DEFAULT_SCALE: ScaleStep[] = [
  { letter: "A", min: 90 },
  { letter: "B", min: 80 },
  { letter: "C", min: 70 },
  { letter: "D", min: 60 },
  { letter: "F", min: 0 },
];

export const GPA_POINTS: Record<string, number> = {
  "A+": 4, A: 4, "A-": 3.7, "B+": 3.3, B: 3, "B-": 2.7, "C+": 2.3, C: 2, "C-": 1.7, "D+": 1.3, D: 1, "D-": 0.7, F: 0,
};

export const isGraded = (a: Assessment) => a.score !== null && a.score !== undefined && !a.excluded;
export const pctOf = (a: Assessment) => (a.max > 0 && isGraded(a) ? (a.score! / a.max) * 100 : null);

export function letterFor(pct: number | null, scale: ScaleStep[] = DEFAULT_SCALE): string | null {
  if (pct === null) return null;
  const s = [...scale].sort((a, b) => b.min - a.min);
  return (s.find((x) => pct >= x.min - 1e-9) ?? s[s.length - 1])?.letter ?? null;
}

type Part = { earned: number; gradedMax: number; remainingMax: number; graded: Assessment[]; remaining: Assessment[]; dropped: Assessment[] };

/** Points earned / possible in a set of assessments, after dropping the lowest `drop` graded ones. */
function part(items: Assessment[], drop = 0): Part {
  const live = items.filter((a) => !a.excluded);
  let graded = live.filter(isGraded);
  const remaining = live.filter((a) => !isGraded(a));
  let dropped: Assessment[] = [];
  if (drop > 0) {
    const droppable = graded.filter((a) => !a.extra && a.max > 0).sort((a, b) => a.score! / a.max - b.score! / b.max);
    // never drop everything that's graded
    dropped = droppable.slice(0, Math.min(drop, Math.max(0, droppable.length - 1)));
    graded = graded.filter((a) => !dropped.includes(a));
  }
  return {
    earned: graded.reduce((n, a) => n + (a.score ?? 0), 0),
    gradedMax: graded.filter((a) => !a.extra).reduce((n, a) => n + a.max, 0),
    remainingMax: remaining.filter((a) => !a.extra).reduce((n, a) => n + a.max, 0),
    graded,
    remaining,
    dropped,
  };
}

export type CategoryResult = {
  id: string;
  name: string;
  weight: number;
  pct: number | null;
  earned: number;
  gradedMax: number;
  remainingMax: number;
  gradedCount: number;
  remainingCount: number;
  dropped: string[];
};

export type GradeResult = {
  /** grade on what's graded so far */
  current: number | null;
  letter: string | null;
  categories: CategoryResult[];
  /** share of the course (0–1) that already has grades */
  gradedShare: number;
  /** final grade if everything left scores 0 % / 100 % */
  floor: number | null;
  ceiling: number | null;
  /** average needed on everything left to finish at the target */
  needed: { pct: number; status: "secured" | "reachable" | "out-of-reach" } | null;
  /** assessments not in any category (category mode only) */
  uncategorized: number;
};

/**
 * Grade for a course. `whatIf` fills in hypothetical scores (by assessment key) for ungraded items.
 * The final grade is linear in the average x scored on everything left: final(x) = A + B·x.
 */
export function courseGrade(g: Grading, items: [string, Assessment][], whatIf: Record<string, number> = {}): GradeResult {
  const list = items.map(([id, a]) => (whatIf[id] !== undefined && !isGraded(a) ? { ...a, score: whatIf[id] } : a));
  const byId = new Map(items.map(([id], i) => [list[i], id]));
  let A = 0;
  let B = 0;
  let W = 0;
  let curNum = 0;
  let curDen = 0;
  let gradedShare = 0;
  const categories: CategoryResult[] = [];
  let uncategorized = 0;

  const add = (weight: number, p: Part) => {
    const total = p.gradedMax + p.remainingMax;
    W += weight;
    if (total === 0) {
      if (p.earned > 0 && p.gradedMax === 0) A += 0; // extra credit alone in a category: ignore
      B += weight; // nothing entered yet for this weight: all of it is still to come
    } else {
      A += (weight * (p.earned / total)) * 100;
      B += weight * (p.remainingMax / total);
      gradedShare += weight * (p.gradedMax / total);
    }
    if (p.gradedMax > 0) {
      curNum += weight * (p.earned / p.gradedMax) * 100;
      curDen += weight;
    }
  };

  if (g.mode === "points") {
    const p = part(list);
    add(1, p);
    categories.push({
      id: "all", name: "All points", weight: 100, pct: p.gradedMax ? (p.earned / p.gradedMax) * 100 : null,
      earned: p.earned, gradedMax: p.gradedMax, remainingMax: p.remainingMax, gradedCount: p.graded.length, remainingCount: p.remaining.length, dropped: [],
    });
  } else {
    const ids = new Set(g.categories.map((c) => c.id));
    uncategorized = list.filter((a) => !a.category || !ids.has(a.category)).length;
    for (const c of g.categories) {
      const p = part(list.filter((a) => a.category === c.id), c.drop ?? 0);
      add(c.weight, p);
      categories.push({
        id: c.id, name: c.name, weight: c.weight, pct: p.gradedMax ? (p.earned / p.gradedMax) * 100 : null,
        earned: p.earned, gradedMax: p.gradedMax, remainingMax: p.remainingMax, gradedCount: p.graded.length, remainingCount: p.remaining.length,
        dropped: p.dropped.map((a) => byId.get(a) ?? ""),
      });
    }
  }

  const current = curDen > 0 ? curNum / curDen : null;
  if (W <= 0) return { current, letter: letterFor(current, g.scale), categories, gradedShare: 0, floor: null, ceiling: null, needed: null, uncategorized };
  const floor = A / W;
  const ceiling = (A + B * 100) / W;
  let needed: GradeResult["needed"] = null;
  if (B > 1e-9) {
    const x = (g.target * W - A) / B;
    needed = { pct: x, status: x <= 0 ? "secured" : x > 100 ? "out-of-reach" : "reachable" };
  }
  return { current, letter: letterFor(current, g.scale), categories, gradedShare: gradedShare / W, floor, ceiling, needed, uncategorized };
}

/** Term GPA estimate from letters and credits. */
export function gpa(rows: { letter: string | null; credits: number }[]): number | null {
  const ok = rows.filter((r) => r.letter && GPA_POINTS[r.letter] !== undefined && r.credits > 0);
  const cr = ok.reduce((n, r) => n + r.credits, 0);
  return cr ? ok.reduce((n, r) => n + GPA_POINTS[r.letter!] * r.credits, 0) / cr : null;
}
