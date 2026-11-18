// Flashcards written inside notes, RemNote-style. Pure, no imports, node-tested.
//
//   Question :: Answer            basic card
//   Front ::: Back                two cards, one each way
//   Answer <:: Question           reverse card (Nov 18): shows the right side, asks for the left
//   **Term** ::: Meaning          concept (Nov 18): a both-ways card whose left side is all bold;
//                                 the same two cards as :::, shown as a concept
//   Property ;; Value             descriptor (Nov 18), indented under a concept (or any line, or
//                                 a heading): asks "Concept › Property"
//   Text with {{hidden}} part     cloze (each {{…}} is its own card; {{c1::a}} … {{c1::b}} hide together)
//   {{answer::hint}}              cloze with a hint shown in the gap
//   List question ::              list card: the answer is the indented bullets under it
//   :: table                      on the line above a Markdown table: one card per filled cell,
//                                 "**Row** · Column?" → cell
//
// Each card line gets a hidden id comment, `<!--sd:k3x9ab-->`, so review history survives edits.

export type CardKind = "basic" | "reverse" | "cloze" | "list" | "table" | "item" | "concept" | "descriptor";

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
  /** a basic or reverse card that is one of the two cards of a "⇄ both ways" line */
  two?: boolean;
  /** concept: true on the "which concept?" card (meaning → term) */
  rev?: boolean;
  /** descriptor / table cell: the concept (or row) it is about, and the property asked */
  concept?: string;
  prop?: string;
  /** table "← which row?": the key column's header ("Agent"), for "Which agent?" */
  ask?: string;
  /** table "each row": the row's asked cells, [column, value] */
  rows?: [string, string][];
  /** table "cloze rows": the row as a mini table, `hide` = which cell is the gap */
  grid?: { header: string[]; cells: string[]; hide: number };
};

/** Table flashcard options (the table bar's ▾ Flashcards menu; saved in the mosaic-table line as "c"). */
export type TableCardOpts = {
  /** cell: one card per cell (default) · row: one card per row · cloze: the row with one cell hidden */
  mode?: "cell" | "row" | "cloze";
  /** fwd: ask the fact (default) · both: also "which row?" · rev: only "which row?" (cell mode) */
  dir?: "fwd" | "both" | "rev";
  /** columns not asked about */
  skip?: number[];
  /** the key column (what each row is about), default 0 */
  key?: number;
};

export const ID_RE = /\s*<!--sd:([a-z0-9]{4,})-->/;
/** a cloze gap with nothing written in it yet: underscores, dots, dashes, a question mark */
const BLANK_GAP = /^[\s_.…?\-–—]*$/;
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

/** "Front :: Back" / "Front ::: Back" / "Left <:: Right" / "Term ;; Meaning" (concept) /
 *  "Property ;;; Value" (descriptor) split, or null. Front must not be empty. Since Nov 18 (her ask)
 *  `;;` is the concept and `;;;` the descriptor; `**Term** ::: meaning` still reads as a concept. */
function splitCard(text: string): { front: string; back: string; two: boolean; rev: boolean; desc: boolean; concept: boolean } | null {
  // card syntax inside `code` is just text (Nov 18 bug: her pasted test instructions became cards)
  const masked = maskCode(text);
  const m = /^(.*?\S)\s+(<::|:{2,3}|;{2,3})(?:\s+(.*))?$/d.exec(masked);
  if (!m || /\{\{[^}]*$/.test(m[1])) return null; // a "::" inside an unfinished {{c1::…}} isn't a card separator
  const [fs, fe] = m.indices![1] as [number, number];
  const back = m.indices![3] ? text.slice(m.indices![3][0], m.indices![3][1]) : "";
  return { front: text.slice(fs, fe).trim(), back: back.trim(), two: m[2] === ":::", rev: m[2] === "<::", desc: m[2] === ";;;", concept: m[2] === ";;" };
}
/** The line with every `code span` blanked out (same length, so positions still match). */
const maskCode = (t: string) => t.replace(/`[^`\n]*`/g, (c) => "\u0001".repeat(c.length));
/** "**Term**" (the whole left side bold): the term, else null */
const conceptTerm = (front: string): string | null => {
  const m = /^\*\*([^*]+?)\*\*$/.exec(front.trim());
  return m ? m[1].trim() : null;
};

const plain = (s: string) => s.replace(CLOZE_RE, (_a, _n, t) => t).replace(/\s+(?:<::|:{2,3}|;{2,3})(?:\s+.*)?$/, "").replace(/\*\*|__/g, "").trim();

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

/** A list card's answer: the lines under it. Nested cards (Nov 18, her ask, RemNote-style): an item
 *  that is a card of its own shows as clean text ("Remember the side effects", no " ::"), and when
 *  it is a list card its own sub-items are left out here: they are that card's answer. */
function listBack(ls: Line[], k: number): string {
  const kids = children(ls, k);
  if (!kids.length) return "";
  const base = kids[0].indent;
  const out: string[] = [];
  let skipBelow = -1;
  for (const x of kids) {
    if (skipBelow >= 0 && x.indent > skipBelow) continue;
    skipBelow = -1;
    let text = x.text;
    const c = splitCard(x.text);
    if (c) {
      text = c.back ? `${c.front}: ${c.back}` : c.front;
      if (!c.back && children(ls, ls.indexOf(x)).length) skipBelow = x.indent; // a nested list card
    }
    out.push(`${"  ".repeat(Math.max(0, (x.indent - base) / 2))}- ${text}`);
  }
  return out.join("\n");
}

const TABLE_RE = /^::\s*table\b/i;
const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/** The table right under a ":: table" line: header and body rows, and its card options. */
function tableAfter(ls: Line[], k: number): { header: string[]; rows: string[][]; opts: TableCardOpts } | null {
  let j = k + 1;
  while (j < ls.length && !ls[j].text.trim()) j++;
  // the editor's hidden line for column widths, cell colours and card options sits right above
  let opts: TableCardOpts = {};
  if (j < ls.length && /^\s*<!--\s*mosaic-table\b/.test(ls[j].raw)) {
    try {
      const m = /^\s*<!--\s*mosaic-table\s+(\{.*?\})\s*-->/.exec(ls[j].raw);
      const c = m ? JSON.parse(m[1]).c : null;
      if (c && typeof c === "object") opts = c;
    } catch {}
    j++;
    // blank lines between that line and the table are fine (Nov 18: Claude wrote one)
    while (j < ls.length && !ls[j].text.trim()) j++;
  }
  const tl: string[] = [];
  for (; j < ls.length && /^\s*\|/.test(ls[j].raw); j++) tl.push(ls[j].raw);
  if (tl.length < 3 || !/^\s*\|?\s*:?-+/.test(tl[1])) return null;
  return { header: cells(tl[0]), rows: tl.slice(2).map(cells), opts };
}

/** Short stable hash so a table cell keeps its review history while the row/column names stay the same. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).slice(0, 6);
}

function kindOf(ls: Line[], k: number): "card" | "cloze" | "list" | "table" | "desc" | null {
  const l = ls[k];
  if (TABLE_RE.test(l.text)) return tableAfter(ls, k) ? "table" : null;
  // a table row is never a card line of its own (Nov 18 bug: "A :: B" typed in a cell made the whole
  // row a card and its id became an extra column); tables make cards through ▾ Flashcards only
  if (/^\s*\|/.test(l.text)) return null;
  const c = splitCard(l.text);
  if (c?.desc) return c.back || children(ls, k).length ? "desc" : null;
  if (c) {
    if (c.back) return "card";
    // a concept still to be filled in ("Lithium ;;" with descriptors under it, guided notes) is
    // no card yet: never a list card of its property names
    if (c.concept) return null;
    return children(ls, k).length ? "list" : null; // "**Brand** ::" with nothing yet: not a card
  }
  // a non-global test: the shared global CLOZE_RE would carry lastIndex into later matchAll calls
  return /\{\{[^{}]+\}\}/.test(maskCode(l.text)) ? "cloze" : null;
}

/** The cards a table makes, by its options (see TableCardOpts). Keys: a cell ":t<hash(row|col)>"
 *  (unchanged from before the options), its reverse ":t<hash>r", a row ":tr<hash(row)>", a cloze
 *  cell ":tc<hash(row|col)>". */
function tableCards(t: { header: string[]; rows: string[][]; opts: TableCardOpts }, key: (sfx: string) => string, l: Line, context: string[]): NoteCard[] {
  const out: NoteCard[] = [];
  const strip = (s: string) => s.replace(/\*\*/g, "").trim();
  const cellText = (s: string) => s.replace(/<br\s*\/?>/gi, "\n").trim();
  const mode = t.opts.mode ?? "cell";
  const dir = t.opts.dir ?? "fwd";
  const kc = Math.min(Math.max(0, t.opts.key ?? 0), Math.max(0, t.header.length - 1));
  const skip = new Set(t.opts.skip ?? []);
  const asked = t.header.map((h, i) => i).filter((i) => i !== kc && !skip.has(i) && t.header[i]?.trim());
  const keyName = strip(t.header[kc] ?? "");
  for (const row of t.rows) {
    const name = strip(row[kc] ?? "");
    if (!name) continue;
    const filled = asked.filter((ci) => row[ci]?.trim());
    if (!filled.length) continue;
    const id = (col: string) => hash(`${name.toLowerCase()}|${strip(col).toLowerCase()}`);
    if (mode === "row") {
      const cols = filled.map((ci) => strip(t.header[ci]));
      out.push({
        key: key(`:tr${hash(name.toLowerCase())}`), lineId: l.id, kind: "table", line: l.i, context,
        front: `**${name}**: ${cols.join(" and ").toLowerCase()}?`,
        back: filled.map((ci) => `- **${strip(t.header[ci])}:** ${cellText(row[ci]).replace(/\n/g, " ")}`).join("\n"),
        concept: name, rows: filled.map((ci) => [strip(t.header[ci]), cellText(row[ci])] as [string, string]),
      });
      continue;
    }
    for (const ci of filled) {
      const col = strip(t.header[ci]);
      const val = cellText(row[ci]);
      if (mode === "cloze") {
        const shown = [kc, ...asked];
        out.push({
          key: key(`:tc${id(col)}`), lineId: l.id, kind: "table", line: l.i, context,
          front: shown.map((i) => (i === ci ? `${strip(t.header[i])}: [...]` : `${strip(t.header[i])}: ${cellText(row[i] ?? "").replace(/\n/g, " ")}`)).join(" · "),
          back: val, concept: name, prop: col,
          grid: { header: shown.map((i) => strip(t.header[i])), cells: shown.map((i) => cellText(row[i] ?? "")), hide: shown.indexOf(ci) },
        });
        continue;
      }
      if (dir !== "rev") out.push({ key: key(`:t${id(col)}`), lineId: l.id, kind: "table", line: l.i, context, front: `**${name}** › ${col}`, back: val, concept: name, prop: col });
      if (dir !== "fwd") out.push({ key: key(`:t${id(col)}r`), lineId: l.id, kind: "table", line: l.i, context, front: `${col}: ${val.replace(/\n/g, " ")}`, back: name, rev: true, concept: name, prop: col, ask: keyName });
    }
  }
  return out;
}

export function extractCards(body: string): NoteCard[] {
  const ls = lines(body);
  const out: NoteCard[] = [];
  const heads: { level: number; text: string }[] = [];
  const parents: { indent: number; text: string }[] = [];
  // a toggle holds its own heading: once it closes, the headings from before it apply again
  // (Nov 18: a table after a closed toggle took the toggle's heading as its context)
  const toggles: { level: number; text: string }[][] = [];
  const splits: { level: number; text: string }[][] = [];
  ls.forEach((l, k) => {
    if (/^<!--\s*mosaic-toggle\b/.test(l.text)) {
      toggles.push(heads.slice());
      parents.length = 0;
      return;
    }
    if (/^<!--\s*\/mosaic-toggle\s*-->/.test(l.text)) {
      const before = toggles.pop();
      if (before) heads.splice(0, heads.length, ...before);
      parents.length = 0;
      return;
    }
    // side by side (pages) and columns: each half / column, and what follows them, starts from the
    // headings above the split, not the headings of the half or column before it
    if (/^<!--\s*mosaic-(?:pages|cols)\b/.test(l.text)) {
      splits.push(heads.slice());
      parents.length = 0;
      return;
    }
    if (/^<!--\s*mosaic-(?:page|col)\s*-->/.test(l.text) || /^<!--\s*\/mosaic-(?:pages|cols)\s*-->/.test(l.text)) {
      const top = splits[splits.length - 1];
      if (top) heads.splice(0, heads.length, ...top);
      if (/^<!--\s*\//.test(l.text)) splits.pop();
      parents.length = 0;
      return;
    }
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
      out.push(...tableCards(tableAfter(ls, k)!, (sfx) => key(sfx), l, context));
      return;
    }
    if (kind === "card" || kind === "desc") {
      const c = splitCard(l.text)!;
      if (c.desc) {
        // descriptor: about the nearest line above it that it is indented under, else the heading
        const owner = parents.length ? plain(parents[parents.length - 1].text) : heads[heads.length - 1]?.text ?? "";
        const prop = plain(c.front);
        const back = c.back || listBack(ls, k);
        out.push({ key: key(), lineId: l.id, kind: "descriptor", front: owner ? `${owner} › ${prop}` : prop, back, context, line: l.i, concept: owner || undefined, prop });
      } else if (c.concept || (c.two && conceptTerm(c.front))) {
        // concept (`Term ;; meaning`, or the older `**Term** ::: meaning`): the same two cards (same
        // keys) as a both-ways line, so switching between them keeps the history
        const term = conceptTerm(c.front) ?? c.front.replace(/\*\*|__/g, "").trim();
        out.push({ key: key(), lineId: l.id, kind: "concept", front: term, back: c.back, context, line: l.i, two: true, concept: term });
        out.push({ key: key(":r"), lineId: l.id, kind: "concept", front: c.back, back: term, context, line: l.i, two: true, rev: true, concept: term });
        return void (parents.push({ indent: l.indent, text: l.text }));
      } else {
      // a reverse card is the ":r" half of a two-way card on its own (switching ⇄ ↔ ← keeps its history)
      if (c.rev) out.push({ key: key(":r"), lineId: l.id, kind: "reverse", front: c.back, back: c.front, context, line: l.i });
      else out.push({ key: key(), lineId: l.id, kind: "basic", front: c.front, back: c.back, context, line: l.i, ...(c.two ? { two: true } : {}) });
      if (c.two) out.push({ key: key(":r"), lineId: l.id, kind: "reverse", front: c.back, back: c.front, context, line: l.i, two: true });
      }
    } else if (kind === "list") {
      const c = splitCard(l.text)!;
      out.push({ key: key(), lineId: l.id, kind: "list", front: c.front, back: listBack(ls, k), context, line: l.i });
    } else if (kind === "cloze") {
      // group by cN; un-numbered clozes are each their own group
      const groups: string[] = [];
      const filled = new Set<string>();
      let auto = 0;
      for (const m of l.text.matchAll(CLOZE_RE)) {
        const g = m[1] ? `c${m[1]}` : `a${++auto}`;
        if (!groups.includes(g)) groups.push(g);
        if (!BLANK_GAP.test(m[2])) filled.add(g);
      }
      groups.forEach((g, gi) => {
        // a gap still blank (guided notes: {{_____}} to fill in during class) is no card yet; the
        // index gi still counts it, so the card keeps its key once it's filled in
        if (!filled.has(g)) return;
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
    // lines that can own the lines indented under them (a bold line too: a concept without a card;
    // and since Nov 18 any line with lines indented under it, e.g. an unbulleted "Topic ::")
    if (l.bullet || l.indent > 0 || /^\*\*[^*]+\*\*/.test(l.text) || children(ls, k).length) parents.push({ indent: l.indent, text: l.text });
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
