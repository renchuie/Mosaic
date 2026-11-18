// Line-by-line differences between two texts (note history: what changed since a version).
// Pure, imports nothing. Longest common subsequence on lines; the common start and end are
// trimmed first, so a long note with a few edits stays cheap.

export type DiffLine = { t: "same" | "add" | "del"; text: string };

export function lineDiff(from: string, to: string): DiffLine[] {
  const a = from.split("\n");
  const b = to.split("\n");
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let e = 0;
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++;
  const A = a.slice(s, a.length - e);
  const B = b.slice(s, b.length - e);
  const n = A.length;
  const m = B.length;
  const mid: DiffLine[] = [];
  if (n * m > 4_000_000) {
    // too different to compare line by line cheaply: show it as replaced
    A.forEach((text) => mid.push({ t: "del", text }));
    B.forEach((text) => mid.push({ t: "add", text }));
  } else {
    const L: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) {
        mid.push({ t: "same", text: A[i] });
        i++;
        j++;
      } else if (L[i + 1][j] >= L[i][j + 1]) mid.push({ t: "del", text: A[i++] });
      else mid.push({ t: "add", text: B[j++] });
    }
    while (i < n) mid.push({ t: "del", text: A[i++] });
    while (j < m) mid.push({ t: "add", text: B[j++] });
  }
  return [...a.slice(0, s).map((text) => ({ t: "same" as const, text })), ...mid, ...a.slice(a.length - e).map((text) => ({ t: "same" as const, text }))];
}

export const diffCounts = (d: DiffLine[]) => ({ add: d.filter((x) => x.t === "add").length, del: d.filter((x) => x.t === "del").length });
