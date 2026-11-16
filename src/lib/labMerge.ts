// Merges two versions of one lab's saved progress (localStorage recallLab.<slug>.v3)
// from two machines. Pure, no imports, so it can be tested with plain node.
//
// - best:  highest score per section from either side
// - known: flashcards known on either side
// - sims:  every exam-simulation run from both sides (deduplicated by time)
// - missed and every other key: taken from the newer side, because the
//   missed list also shrinks as you answer questions right.

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** `newer` and `older` are raw JSON strings. Returns a raw JSON string. */
export function mergeLabValue(newer: string, older: string): string {
  let a: unknown, b: unknown;
  try {
    a = JSON.parse(newer);
  } catch {
    return newer;
  }
  try {
    b = JSON.parse(older);
  } catch {
    return newer;
  }
  if (!isObj(a) || !isObj(b)) return newer;

  const out: Obj = { ...b, ...a };

  if (isObj(a.best) || isObj(b.best)) {
    const best: Obj = { ...(isObj(b.best) ? b.best : {}) };
    for (const [k, v] of Object.entries(isObj(a.best) ? a.best : {})) {
      const o = best[k];
      best[k] = typeof v === "number" && typeof o === "number" ? Math.max(v, o) : v;
    }
    out.best = best;
  }

  if (Array.isArray(a.known) || Array.isArray(b.known)) {
    const seen = new Set<string>();
    out.known = [...(Array.isArray(a.known) ? a.known : []), ...(Array.isArray(b.known) ? b.known : [])].filter((x) => {
      const k = JSON.stringify(x);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  if (Array.isArray(a.sims) || Array.isArray(b.sims)) {
    const byKey = new Map<string, unknown>();
    for (const s of [...(Array.isArray(b.sims) ? b.sims : []), ...(Array.isArray(a.sims) ? a.sims : [])]) {
      const k = isObj(s) && s.d !== undefined ? `d:${s.d}` : JSON.stringify(s);
      byKey.set(k, s);
    }
    out.sims = [...byKey.values()].sort((x, y) => Number(isObj(x) ? x.d : 0) - Number(isObj(y) ? y.d : 0));
  }

  return JSON.stringify(out);
}
