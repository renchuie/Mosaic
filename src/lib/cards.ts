// Flashcards written inside notes, RemNote-style. Pure, no imports, node-tested.
//
//   Question :: Answer            basic card
//   Front ::: Back                two cards, one each way
//   Answer <:: Question           reverse card (Nov 18): shows the right side, asks for the left
//   Text with {{hidden}} part     cloze (each {{…}} is its own card; {{c1::a}} … {{c1::b}} hide together)
//   {{answer::hint}}              cloze with a hint shown in the gap
//   List question ::              list card: the answer is the indented bullets under it
//   :: table                      on the line above a Markdown table: one card per filled cell,
//                                 "**Row** · Column?" → cell
//
// Each card line gets a hidden id comment, `<!--sd:k3x9ab-->`, so review history survives edits.

export type CardKind = "basic" | "reverse" | "cloze" | "list" | "table" | "item";

export type NoteCard = {
  /** review key: line id + which card (":r", ":c2") */
  key: string;
  lineId: string | null;
  kind: CardKind;
  /** Markdown */
  front: string;
  back: string;
  /** heading path and parent bullets, for context on the card */
  context: string[];
  /** 0-based line in the note body */
  line: number;
};

export const ID_RE = /\s*<!--sd:([a-z0-9]{4,})-->/;
const CLOZE_RE = /\{\{(?:c(\d+)::)?([^{}]+?)(?:::([^{}]*))?\}\}/g;

type Line = { i: number; raw: string; indent: number; text: string; id: string | null; bullet: boolean };

function lines(body: string): Line[] {
  const out: Line[] = [];
  let code = false;
  body.split("\n").forEach((raw, i) => {
    if (/^\s*```/.test(raw)) {
      code = !code;
      return;
    }
    if (code) return;
    const idm = ID_RE.exec(raw);
    const noId = idm ? raw.replace(ID_RE, "") : raw;
    const lead = /^[ \t]*/.exec(noId)![0];
    const indent = lead.replace(/\t/g, "  ").length;
    const m = /^(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/.exec(noId.slice(lead.length));
    out.push({ i, raw, indent, text: noId.slice(lead.length + (m ? m[0].length : 0)).trimEnd(), id: idm ? idm[1] : null, bullet: !!m });
  });
  return out;
}

/** "Front :: Back" / "Front ::: Back" / "Left <:: Right" split, or null. Front must not be empty. */
function splitCard(text: string): { front: string; back: string; two: boolean; rev: boolean } | null {
  const m = /^(.*?\S)\s+(<::|:{2,3})(?:\s+(.*))?$/.exec(text);
  if (!m || /\{\{[^}]*$/.test(m[1])) return null; // a "::" inside an unfinished {{c1::…}} isn't a card separator
  return { front: m[1].trim(), back: (m[3] ?? "").trim(), two: m[2] === ":::", rev: m[2] === "<::" };
}

const plain = (s: string) => s.replace(CLOZE_RE, (_a, _n, t) => t).replace(/\s+(?:<::|:{2,3})\s+.*$/, "").replace(/\*\*|__/g, "").trim();

/** Children of line k: following lines indented deeper, until one that isn't. */
function children(ls: Line[], k: number): Line[] {
  const out: Line[] = [];
  for (let j = k + 1; j < ls.length; j++) {
    if (!ls[j].text) continue;
    if (ls[j].indent <= ls[k].indent) break;
    out.push(ls[j]);
  }
  return out;
}

const TABLE_RE = /^::\s*table\b/i;
const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/** The table right under a ":: table" line: header and body rows. */
function tableAfter(ls: Line[], k: number): { header: string[]; rows: string[][] } | null {
  let j = k + 1;
  while (j < ls.length && !ls[j].text.trim()) j++;
  // the editor's hidden line for column widths and cell colours sits right above the table
  if (j < ls.length && /^\s*<!--\s*mosaic-table\b/.test(ls[j].raw)) j++;
  const tl: string[] = [];
  for (; j < ls.length && /^\s*\|/.test(ls[j].raw); j++) tl.push(ls[j].raw);
  if (tl.length < 3 || !/^\s*\|?\s*:?-+/.test(tl[1])) return null;
  return { header: cells(tl[0]), rows: tl.slice(2).map(cells) };
}

/** Short stable hash so a table cell keeps its review history while the row/column names stay the same. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).slice(0, 6);
}

function kindOf(ls: Line[], k: number): "card" | "cloze" | "list" | "table" | null {
  const l = ls[k];
  if (TABLE_RE.test(l.text)) return tableAfter(ls, k) ? "table" : null;
  const c = splitCard(l.text);
  if (c) {
    if (c.back) return "card";
    return children(ls, k).length ? "list" : null; // "**Brand** ::" with nothing yet: not a card
  }
  // a non-global test: the shared global CLOZE_RE would carry lastIndex into later matchAll calls
  return /\{\{[^{}]+\}\}/.test(l.text) ? "cloze" : null;
}

export function extractCards(body: string): NoteCard[] {
  const ls = lines(body);
  const out: NoteCard[] = [];
  const heads: { level: number; text: string }[] = [];
  const parents: { indent: number; text: string }[] = [];
  ls.forEach((l, k) => {
    const h = /^(#{1,6})\s+(.*)$/.exec(l.text);
    if (h && !l.bullet) {
      while (heads.length && heads[heads.length - 1].level >= h[1].length) heads.pop();
      heads.push({ level: h[1].length, text: h[2].replace(/#+\s*$/, "").trim() });
      parents.length = 0;
      return;
    }
    if (!l.text) return;
    while (parents.length && parents[parents.length - 1].indent >= l.indent) parents.pop();
    const context = [...heads.map((x) => x.text), ...parents.slice(-2).map((p) => plain(p.text))].filter(Boolean);
    const kind = kindOf(ls, k);
    const key = (suffix = "") => (l.id ? l.id + suffix : `new-${l.i}${suffix}`);
    if (kind === "table") {
      const t = tableAfter(ls, k)!;
      const strip = (s: string) => s.replace(/\*\*/g, "").trim();
      for (const row of t.rows) {
        const name = row[0]?.trim();
        if (!name) continue;
        t.header.forEach((col, ci) => {
          if (ci === 0 || !row[ci]?.trim() || !col.trim()) return;
          out.push({
            key: key(`:t${hash(`${strip(name).toLowerCase()}|${strip(col).toLowerCase()}`)}`),
            lineId: l.id, kind: "table",
            front: `**${strip(name)}** · ${strip(col)}?`, back: row[ci].replace(/<br\s*\/?>/gi, "\n").trim(),
            context: [...context, ...(t.header[0] ? [t.header[0]] : [])], line: l.i,
          });
        });
      }
      return;
    }
    if (kind === "card") {
      const c = splitCard(l.text)!;
      // a reverse card is the ":r" half of a two-way card on its own (switching ⇄ ↔ ← keeps its history)
      if (c.rev) out.push({ key: key(":r"), lineId: l.id, kind: "reverse", front: c.back, back: c.front, context, line: l.i });
      else out.push({ key: key(), lineId: l.id, kind: "basic", front: c.front, back: c.back, context, line: l.i });
      if (c.two) out.push({ key: key(":r"), lineId: l.id, kind: "reverse", front: c.back, back: c.front, context, line: l.i });
    } else if (kind === "list") {
      const c = splitCard(l.text)!;
      const kids = children(ls, k);
      const base = kids[0].indent;
      out.push({
        key: key(), lineId: l.id, kind: "list", front: c.front,
        back: kids.map((x) => `${"  ".repeat(Math.max(0, (x.indent - base) / 2))}- ${x.text}`).join("\n"), context, line: l.i,
      });
    } else if (kind === "cloze") {
      // group by cN; un-numbered clozes are each their own group
      const groups: string[] = [];
      let auto = 0;
      for (const m of l.text.matchAll(CLOZE_RE)) {
        const g = m[1] ? `c${m[1]}` : `a${++auto}`;
        if (!groups.includes(g)) groups.push(g);
      }
      groups.forEach((g, gi) => {
        let n = 0;
        const front = l.text.replace(CLOZE_RE, (_all, num, text, hint) => {
          const mine = (num ? `c${num}` : `a${++n}`) === g;
          if (!num && !mine) return text;
          return mine ? `[${hint?.trim() || "…"}]` : text;
        });
        let n2 = 0;
        const back = l.text.replace(CLOZE_RE, (_all, num, text) => ((num ? `c${num}` : `a${++n2}`) === g ? `==${text}==` : text));
        out.push({ key: key(`:c${gi + 1}`), lineId: l.id, kind: "cloze", front, back, context, line: l.i });
      });
    }
    if (l.bullet || l.indent > 0) parents.push({ indent: l.indent, text: l.text });
  });
  return out;
}

/** Add an id to every card line that lacks one. Returns the new body and what was inserted where. */
export function assignIds(body: string, newId: () => string): { body: string; inserted: { line: number; text: string }[] } {
  const ls = lines(body);
  const raw = body.split("\n");
  const inserted: { line: number; text: string }[] = [];
  ls.forEach((l, k) => {
    if (l.id || !kindOf(ls, k)) return;
    const text = ` <!--sd:${newId()}-->`;
    raw[l.i] = raw[l.i].replace(/\s+$/, "") + text;
    inserted.push({ line: l.i, text });
  });
  return { body: raw.join("\n"), inserted };
}

export const cardId = () => Math.random().toString(36).slice(2, 8).padEnd(6, "0");

// ---- showing cards ----------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Inline Markdown to safe HTML: bold, italic, code, ==highlight==, [[links]], images, cloze gaps. */
export function inline(md: string, img: (src: string) => string = (s) => s): string {
  let s = esc(md.replace(ID_RE, ""));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) => `<img src="${esc(img(src))}" alt="${alt}">`);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
  s = s.replace(/==([^=]+)==/g, "<mark>$1</mark>");
  s = s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => `<span class="lk">${b ?? a}</span>`);
  s = s.replace(/\[(…|[^\]]{1,60})\]/g, (m, x) => (x === "…" || !/^\d/.test(x) ? `<span class="gap">[${x}]</span>` : m));
  return s;
}

/** Card side to HTML: runs of "- " lines become lists, other lines become paragraphs. */
export function cardHtml(md: string, img?: (src: string) => string): string {
  const rows = md.split("\n");
  if (rows.length === 1 && !/^\s*- /.test(md)) return inline(md, img);
  let html = "";
  let list: string[] = [];
  const flush = () => {
    if (list.length) html += `<ul>${list.join("")}</ul>`;
    list = [];
  };
  for (const r of rows) {
    if (/^\s*[-*] /.test(r)) list.push(`<li style="margin-left:${(/^\s*/.exec(r)![0].length / 2) * 18}px">${inline(r.replace(/^\s*[-*]\s*/, ""), img)}</li>`);
    else {
      flush();
      if (r.trim()) html += `<p>${inline(r, img)}</p>`;
    }
  }
  flush();
  return html;
}
