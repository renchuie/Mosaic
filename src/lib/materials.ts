// Materials: recognising uploaded files and choosing where they go. Pure (imports nothing),
// so it is tested with plain node. The lab checks mirror the Rust scanner in labs.rs.

export type Inspected = {
  /** a recall lab (has <meta name="recall-lab-version">) */
  isLab: boolean;
  title: string;
  /** progress key slug: recallLab.<slug>.v3 */
  slug: string;
  slugGuessed: boolean;
  version: string;
};

function attr(tag: string, key: string): string | undefined {
  const re = new RegExp(`\\b${key}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = re.exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4]) : undefined;
}

/** The value of <meta name="…" content="…"> in any attribute order. */
export function findMeta(html: string, name: string): string | undefined {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    if ((attr(m[0], "name") ?? "").toLowerCase() === name) return attr(m[0], "content") ?? "";
  }
  return undefined;
}

export function findTitle(html: string): string | undefined {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const t = m?.[1].replace(/\s+/g, " ").trim();
  return t ? decodeEntities(t) : undefined;
}

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");

/** The most frequent literal recallLab.<slug>.v3 in the file. */
export function findSlug(text: string): string | undefined {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/recallLab\.([A-Za-z0-9_-]+)\.v3/g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  let best: string | undefined;
  let n = 0;
  for (const [s, c] of counts) if (c > n) [best, n] = [s, c];
  return best;
}

export function slugify(s: string): string {
  return s
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function inspectHtml(text: string, fileName: string): Inspected {
  const version = findMeta(text, "recall-lab-version");
  const slug = findSlug(text);
  return {
    isLab: version !== undefined,
    title: findTitle(text) ?? fileName.replace(/\.[^.]+$/, ""),
    slug: slug ?? slugify(fileName),
    slugGuessed: !slug,
    version: version ?? "",
  };
}

/** A folder or file name that is safe on Drive and Linux (keeps spaces and case). */
export function safeName(s: string): string {
  return s
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120) || "Untitled";
}

/** Where an upload goes: "<course folder>/<exam folder>/<file>" (parts may be empty). */
export function destRel(courseDir: string, examDir: string, file: string): string {
  return [courseDir, examDir].map((x) => x.trim()).filter(Boolean).map(safeName).concat(safeName(file)).join("/");
}

/** "lab.html" → "lab (2).html" until `taken` says no. */
export function uniqueRel(rel: string, taken: (rel: string) => boolean): string {
  if (!taken(rel)) return rel;
  const m = /^(.*?)(\.[^./]+)?$/.exec(rel)!;
  for (let i = 2; i < 100; i++) {
    const r = `${m[1]} (${i})${m[2] ?? ""}`;
    if (!taken(r)) return r;
  }
  return rel;
}
