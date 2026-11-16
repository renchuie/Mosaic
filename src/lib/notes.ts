// Notes are Markdown files. This module reads and writes their front matter and
// finds what they link to. Pure, no imports, so it can be tested with plain node.

export type Meta = { course?: string; tags?: string[]; date?: string; event?: string; template?: string; [k: string]: unknown };

/** Split "---\nkey: value\n---\nbody" into meta and body. Unknown keys are kept. */
export function splitNote(text: string): { meta: Meta; body: string; raw: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: {}, body: text, raw: "" };
  const meta: Meta = {};
  let listKey: string | null = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (meta[listKey] as string[]).push(unquote(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, k, v] = kv;
    if (v === "") {
      meta[k] = [];
      listKey = k;
    } else if (/^\[.*\]$/.test(v)) {
      meta[k] = v.slice(1, -1).split(",").map((x) => unquote(x.trim())).filter(Boolean);
      listKey = null;
    } else {
      meta[k] = unquote(v);
      listKey = null;
    }
  }
  return { meta, body: text.slice(m[0].length), raw: m[0] };
}

const unquote = (s: string) => s.trim().replace(/^(["'])(.*)\1$/, "$2");
const quote = (s: string) => (/[:#\[\]{},]|^\s|\s$/.test(s) ? JSON.stringify(s) : s);

/** Put meta back on top of a body. Empty values are left out; no meta → no block. */
export function joinNote(meta: Meta, body: string): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
    if (Array.isArray(v)) lines.push(`${k}: [${v.map((x) => quote(String(x))).join(", ")}]`);
    else lines.push(`${k}: ${quote(String(v))}`);
  }
  const b = body.replace(/^\n+/, "");
  return lines.length ? `---\n${lines.join("\n")}\n---\n\n${b}` : b;
}

export type Parsed = { title: string; links: string[]; /** [[folder/file.pdf#p3]] links: PDF paths */ pdfs: string[]; tags: string[]; headings: { level: number; text: string; line: number }[]; meta: Meta; words: number };

/** Title, [[links]], #tags and headings of a note. Code blocks are skipped. */
export function parseNote(text: string, fileName: string): Parsed {
  const { meta, body } = splitNote(text);
  const lines = body.split(/\r?\n/);
  const links = new Set<string>();
  const pdfs = new Set<string>();
  const tags = new Set<string>((meta.tags ?? []).map((t) => String(t).replace(/^#/, "")));
  const headings: Parsed["headings"] = [];
  let inCode = false;
  let words = 0;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      inCode = !inCode;
      return;
    }
    if (inCode) return;
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) headings.push({ level: h[1].length, text: h[2], line: i });
    for (const m of line.matchAll(/\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|[^\]\n]*)?\]\]/g)) {
      const t = m[1].trim();
      (/\.pdf$/i.test(t) ? pdfs : links).add(t);
    }
    for (const m of line.replace(/`[^`]*`/g, "").matchAll(/(?:^|\s)#([A-Za-z][\w/-]*)/g)) if (!h || m.index! > 0) tags.add(m[1]);
    words += (line.match(/\S+/g) ?? []).length;
  });
  const first = headings.find((x) => x.level === 1);
  return { title: first?.text ?? fileName.replace(/\.md$/i, ""), links: [...links], pdfs: [...pdfs], tags: [...tags], headings, meta, words };
}

/** Name used to match [[links]]: case-insensitive, extension-free, last path part. */
export const linkKey = (s: string) => s.trim().replace(/\.md$/i, "").split("/").pop()!.toLowerCase();

/** A safe file name from a title. */
export function fileNameFor(title: string): string {
  const s = title.replace(/[\\/:*?"<>|#^[\]]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return `${s || "Untitled"}.md`;
}

/** Replace [[Old]] / [[Old|alias]] / [[Old#heading]] with the new name. */
export function renameLinks(text: string, from: string, to: string): string {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`\\[\\[${esc}((?:#[^\\]|\\n]*)?(?:\\|[^\\]\\n]*)?)\\]\\]`, "gi"), `[[${to}$1]]`);
}

/** A short snippet around the first match of `q`. */
export function snippet(text: string, q: string, len = 90): string {
  const body = splitNote(text).body.replace(/\s+/g, " ");
  const i = body.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return body.slice(0, len);
  const start = Math.max(0, i - 30);
  return (start ? "…" : "") + body.slice(start, start + len) + (start + len < body.length ? "…" : "");
}

// ---- templates ------------------------------------------------------------------

export const TEMPLATES: Record<string, { label: string; body: (title: string) => string; tags?: string[] }> = {
  blank: { label: "Blank", body: (t) => `# ${t}\n\n` },
  lecture: {
    label: "Lecture",
    tags: ["lecture"],
    body: (t) => `# ${t}\n\n## Objectives\n- \n\n## Notes\n- \n\n## High-yield\n- \n\n## Questions to ask\n- \n`,
  },
  drug: {
    label: "Drug monograph",
    tags: ["drug"],
    body: (t) =>
      `# ${t}\n\n- **Brand** :: \n- **Class** :: \n- **Mechanism** :: \n- **Indications** :: \n- **Dosing** :: \n- **Adverse effects** :: \n- **Contraindications** :: \n- **Interactions** :: \n- **Monitoring** :: \n- **Counselling** :: \n\n## Pearls\n- \n`,
  },
  disease: {
    label: "Disease state",
    tags: ["disease"],
    body: (t) =>
      `# ${t}\n\n## Pathophysiology\n- \n\n## Presentation\n- \n\n## Diagnosis\n- \n\n## Goals of therapy\n- \n\n## Treatment\n### Non-pharmacologic\n- \n### Pharmacologic\n| Drug / class | Role | Dose | Key monitoring |\n| --- | --- | --- | --- |\n|  |  |  |  |\n\n## Monitoring\n- \n\n## Counselling\n- \n`,
  },
  case: {
    label: "Patient case (SOAP)",
    tags: ["case"],
    body: (t) => `# ${t}\n\n## Subjective\n- CC: \n- HPI: \n- PMH: \n- Meds: \n- Allergies: \n\n## Objective\n- Vitals: \n- Labs: \n\n## Assessment\n- \n\n## Plan\n- \n\n## Follow-up / monitoring\n- \n`,
  },
};
