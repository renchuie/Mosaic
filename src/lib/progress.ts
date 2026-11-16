// Turns a lab's stored JSON (localStorage recallLab.<slug>.v3) into dashboard numbers.

export type Progress = {
  sectionsTried: number;
  avgBest: number | null;
  missed: number;
  known: number;
  simCount: number;
  lastSim: number | null;
  bestSim: number | null;
};

export const EMPTY: Progress = { sectionsTried: 0, avgBest: null, missed: 0, known: 0, simCount: 0, lastSim: null, bestSim: null };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseProgress(raw: string | null | undefined): Progress {
  if (!raw) return EMPTY;
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (!d || typeof d !== "object") return EMPTY;

  const best = d.best && typeof d.best === "object" ? Object.values(d.best as object).map(num).filter((n): n is number => n !== null) : [];
  const sims = Array.isArray(d.sims)
    ? (d.sims as Record<string, unknown>[])
        .filter((s) => s && num(s.pct) !== null)
        .sort((a, b) => (num(a.d) ?? 0) - (num(b.d) ?? 0))
    : [];
  const pcts = sims.map((s) => num(s.pct)!);
  return {
    sectionsTried: best.length,
    avgBest: best.length ? Math.round(best.reduce((a, b) => a + b, 0) / best.length) : null,
    missed: Array.isArray(d.missed) ? d.missed.length : 0,
    known: Array.isArray(d.known) ? d.known.length : 0,
    simCount: sims.length,
    lastSim: pcts.length ? Math.round(pcts[pcts.length - 1]) : null,
    bestSim: pcts.length ? Math.round(Math.max(...pcts)) : null,
  };
}

/** Combine several labs: sums for counts, mean of averages, max of bests. */
export function combine(list: Progress[]): Progress {
  const avgs = list.map((p) => p.avgBest).filter((n): n is number => n !== null);
  const bests = list.map((p) => p.bestSim).filter((n): n is number => n !== null);
  return {
    sectionsTried: list.reduce((n, p) => n + p.sectionsTried, 0),
    avgBest: avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null,
    missed: list.reduce((n, p) => n + p.missed, 0),
    known: list.reduce((n, p) => n + p.known, 0),
    simCount: list.reduce((n, p) => n + p.simCount, 0),
    lastSim: null,
    bestSim: bests.length ? Math.max(...bests) : null,
  };
}
