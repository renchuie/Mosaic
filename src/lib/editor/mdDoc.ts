// Markdown ⇄ editor document (ProseMirror JSON) for the Mosaic note page (N1b).
// Notes stay plain .md files; inside the app they are blocks with no visible syntax.
// Pure, no imports, so it can be tested with plain node.
//
// The document is FLAT, like a Notion page: every line is a block, and lists are blocks with
// an `indent` level instead of nested list nodes. That keeps the Markdown round trip close to
// what she typed (each Enter = one line in the file, nested bullets = 2 more spaces).
//
// Blank lines: between two "flow" blocks (paragraph, bullet, numbered, to-do) every blank line
// is an empty paragraph, so the spacing she typed stays. Next to any other block (heading,
// table, quote, callout, code, divider, image) one blank line is part of the layout and is not
// shown; extra blank lines become empty paragraphs.
//
// Anything we don't understand (HTML blocks, $$ maths …) becomes a `raw` block that is written
// back exactly as it was read.

export type PMMark = { type: string; attrs?: Record<string, unknown> };
export type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: PMMark[] };

const ID_RE = /\s*<!--sd:([a-z0-9]{4,})-->/;
const FLOW = new Set(["paragraph", "bullet", "ordered", "todo"]);

// ---- inline: Markdown → nodes ----------------------------------------------------------------

const PUNCT = /[!-/:-@[-`{-~]/;
const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);
const isWord = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

type Ctx = { arrow: boolean; cell?: boolean };

function text(t: string, marks: PMMark[]): PMNode {
  const n: PMNode = { type: "text", text: t };
  if (marks.length) n.marks = marks.map((m) => ({ ...m, attrs: m.attrs ? { ...m.attrs } : undefined })).map((m) => (m.attrs ? m : { type: m.type }));
  return n;
}
function withMarks(n: PMNode, marks: PMMark[]): PMNode {
  if (marks.length) n.marks = marks.map((m) => (m.attrs ? { type: m.type, attrs: { ...m.attrs } } : { type: m.type }));
  return n;
}

/** Closing delimiter `d` after `from`: content must not start or end with a space. */
function closing(s: string, d: string, from: number, word = false): number {
  if (isSpace(s[from])) return -1;
  for (let j = from + 1; j <= s.length - d.length; j++) {
    if (s[j] === "\\") {
      j++;
      continue;
    }
    if (s.startsWith(d, j) && !isSpace(s[j - 1])) {
      if (d === "*" && (s[j + 1] === "*" || s[j - 1] === "*")) continue;
      // "***x***": bold closes at the end of the run, so the italic sits inside it
      if (d === "**") while (s[j + 2] === "*") j++;
      if (word && isWord(s[j + d.length])) continue;
      return j;
    }
  }
  return -1;
}

export function parseInline(s: string, marks: PMMark[] = [], ctx: Ctx = { arrow: false }): PMNode[] {
  const out: PMNode[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push(text(buf, marks));
    buf = "";
  };
  const inner = (str: string, mark: PMMark) => {
    flush();
    out.push(...parseInline(str, [...marks, mark], ctx));
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const rest = s.slice(i);
    if (c === "\\" && i + 1 < s.length && PUNCT.test(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (c === "`") {
      const run = /^`+/.exec(rest)![0];
      const end = s.indexOf(run, i + run.length);
      if (end > i + run.length - 1 && end > i) {
        // the run must not be part of a longer run
        let e = end;
        while (e >= 0 && s.slice(e, e + run.length) === run && s[e + run.length] === "`") e = s.indexOf(run, e + run.length + 1);
        if (e > i) {
          flush();
          out.push(text(s.slice(i + run.length, e), [...marks, { type: "code" }]));
          i = e + run.length;
          continue;
        }
      }
      buf += run;
      i += run.length;
      continue;
    }
    let m: RegExpExecArray | null;
    if (c === "[" && (m = /^\[\[([^\]\n]+?)\]\]/.exec(rest))) {
      flush();
      const bar = m[1].indexOf("|");
      out.push(withMarks({ type: "wikilink", attrs: { target: bar < 0 ? m[1] : m[1].slice(0, bar), alias: bar < 0 ? null : m[1].slice(bar + 1) } }, marks));
      i += m[0].length;
      continue;
    }
    if (c === "{" && (m = /^\{\{(?:c(\d+)::)?([^{}]+?)(?:::([^{}]*))?\}\}/.exec(rest))) {
      inner(m[2], { type: "cloze", attrs: { n: m[1] ? Number(m[1]) : null, hint: m[3] ?? null } });
      i += m[0].length;
      continue;
    }
    if (c === "!" && (m = /^!\[([^\]\n]*)\]\(([^)\s]+)\)/.exec(rest))) {
      flush();
      out.push(withMarks({ type: "inlineImage", attrs: { src: m[2], alt: m[1] } }, marks));
      i += m[0].length;
      continue;
    }
    if (c === "[" && (m = /^\[((?:\\.|[^\]\n\\])+)\]\(([^)\s]+)(?:\s+"[^"\n]*")?\)/.exec(rest))) {
      inner(m[1], { type: "link", attrs: { href: m[2] } });
      i += m[0].length;
      continue;
    }
    if (c === "<" && (m = /^<mark(?:\s+class="([\w-]+)")?\s*>([\s\S]*?)<\/mark>/.exec(rest))) {
      inner(m[2], { type: "highlight", attrs: { color: m[1] && m[1] !== "yellow" ? m[1] : null } });
      i += m[0].length;
      continue;
    }
    const pair = (d: string, mark: PMMark, word = false) => {
      if (!rest.startsWith(d)) return false;
      if (word && isWord(s[i - 1])) return false;
      const j = closing(s, d, i + d.length, word);
      if (j < 0) return false;
      inner(s.slice(i + d.length, j), mark);
      i = j + d.length;
      return true;
    };
    if (c === "=" && pair("==", { type: "highlight", attrs: { color: null } })) continue;
    if (c === "*" && pair("**", { type: "bold" })) continue;
    if (c === "_" && pair("__", { type: "bold" }, true)) continue;
    if (c === "~" && pair("~~", { type: "strike" })) continue;
    if (c === "*" && s[i + 1] !== "*" && pair("*", { type: "italic" })) continue;
    if (c === "_" && s[i + 1] !== "_" && pair("_", { type: "italic" }, true)) continue;
    if (!ctx.arrow && !ctx.cell && /\s/.test(c) && i > 0 && !isSpace(s[i - 1]) && (m = /^[ \t]+(:{2,3})(?=\s|$)[ \t]?/.exec(rest))) {
      flush();
      ctx.arrow = true;
      out.push(withMarks({ type: "arrow", attrs: { two: m[1].length === 3 } }, marks));
      i += m[0].length;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

// ---- inline: nodes → Markdown ----------------------------------------------------------------

const RANK: Record<string, number> = { cloze: 0, link: 1, highlight: 2, bold: 3, italic: 4, strike: 5 };
const sameMark = (a: PMMark, b: PMMark) => a.type === b.type && JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {});

function escapeText(t: string, cell: boolean): string {
  let o = "";
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    const next = t[i + 1];
    const r = t.slice(i);
    if (c === "\\" && next !== undefined && PUNCT.test(next)) o += "\\\\";
    else if (c === "*" && (next === "*" || !isSpace(next))) o += "\\*";
    else if (c === "_" && !isWord(t[i - 1]) && !isSpace(next)) o += "\\_";
    else if (((c === "~" && next === "~") || (c === "=" && next === "=")) && !isSpace(t[i + 2])) o += "\\" + c;
    else if (c === "`") o += "\\`";
    else if ((c === "[" && (next === "[" || /^\[[^\]\n]*\]\(/.test(r))) || (c === "{" && next === "{")) o += "\\" + c;
    else if (c === "!" && next === "[") o += "\\!";
    else if (c === "<" && /^<\/?mark\b/.test(r)) o += "\\<";
    else if (c === "|" && cell) o += "\\|";
    else o += c;
  }
  return o;
}

function open(m: PMMark, prevOut: string): string {
  switch (m.type) {
    case "bold":
      return "**";
    case "italic":
      return prevOut.endsWith("*") ? "_" : "*";
    case "strike":
      return "~~";
    case "highlight":
      return m.attrs?.color ? `<mark class="${m.attrs.color}">` : "==";
    case "link":
      return "[";
    case "cloze":
      return "{{" + (m.attrs?.n ? `c${m.attrs.n}::` : "");
  }
  return "";
}
function close(m: PMMark, opener: string): string {
  switch (m.type) {
    case "bold":
      return "**";
    case "italic":
      return opener;
    case "strike":
      return "~~";
    case "highlight":
      return m.attrs?.color ? "</mark>" : "==";
    case "link":
      return `](${m.attrs?.href ?? ""})`;
    case "cloze":
      return (m.attrs?.hint !== null && m.attrs?.hint !== undefined ? `::${m.attrs.hint}` : "") + "}}";
  }
  return "";
}

export function serializeInline(nodes: PMNode[] = [], cell = false): string {
  let out = "";
  const stack: { m: PMMark; opener: string }[] = [];
  let pend = "";
  const nodesMerged: PMNode[] = [];
  for (const n of nodes) {
    const last = nodesMerged[nodesMerged.length - 1];
    if (last && n.type === "text" && last.type === "text" && JSON.stringify(last.marks ?? []) === JSON.stringify(n.marks ?? [])) last.text += n.text ?? "";
    else nodesMerged.push({ ...n });
  }
  nodesMerged.forEach((n, idx) => {
    const all = n.marks ?? [];
    const code = all.some((m) => m.type === "code");
    const want = all.filter((m) => m.type !== "code" && m.type in RANK).sort((a, b) => RANK[a.type] - RANK[b.type]);
    let body = "";
    let lead = "";
    if (n.type === "text") {
      const t = n.text ?? "";
      const core = t.trim();
      if (!core) {
        // whitespace only: keep it inside whatever is open
        out += pend + t;
        pend = "";
        return;
      }
      lead = t.slice(0, t.length - t.trimStart().length);
      const trail = t.slice(t.trimEnd().length);
      if (code) {
        const runs = core.match(/`+/g) ?? [];
        const fence = "`".repeat(Math.max(0, ...runs.map((r) => r.length)) + 1);
        body = fence + (core.startsWith("`") || core.endsWith("`") ? ` ${core} ` : core) + fence;
      } else body = escapeText(core, cell);
      // the last node's trailing space goes after the closing marks
      nodesMerged[idx] = { ...n, text: core };
      (n as PMNode & { _trail?: string })._trail = trail;
    } else if (n.type === "wikilink") body = `[[${n.attrs?.target ?? ""}${n.attrs?.alias ? `|${n.attrs.alias}` : ""}]]`;
    else if (n.type === "arrow") body = idx === nodesMerged.length - 1 ? ` ${n.attrs?.two ? ":::" : "::"}` : ` ${n.attrs?.two ? ":::" : "::"} `;
    else if (n.type === "inlineImage") body = `![${n.attrs?.alt ?? ""}](${n.attrs?.src ?? ""})`;
    else if (n.type === "hardBreak") body = "<br>";
    let k = 0;
    while (k < stack.length && k < want.length && sameMark(stack[k].m, want[k])) k++;
    for (let j = stack.length - 1; j >= k; j--) out += close(stack[j].m, stack[j].opener);
    stack.length = k;
    out += pend + lead;
    pend = "";
    for (const m of want.slice(k)) {
      const o = open(m, out);
      out += o;
      stack.push({ m, opener: o });
    }
    out += body;
    pend = (n as PMNode & { _trail?: string })._trail ?? "";
    // an arrow's own spaces are part of it; drop the space the text would add before it
    if (n.type === "arrow" && /\s$/.test(out.slice(0, -body.length))) {
      const before = out.slice(0, -body.length).replace(/[ \t]+$/, "");
      out = before + body;
    }
  });
  for (let j = stack.length - 1; j >= 0; j--) out += close(stack[j].m, stack[j].opener);
  return out + pend;
}

// ---- blocks: Markdown → nodes ----------------------------------------------------------------

const block = (type: string, attrs: Record<string, unknown>, content?: PMNode[]): PMNode => {
  const n: PMNode = { type, attrs };
  if (content && content.length) n.content = content;
  return n;
};

function inlineWithId(s: string): { content: PMNode[]; sid: string | null } {
  const m = ID_RE.exec(s);
  const t = m ? s.replace(ID_RE, "") : s;
  return { content: parseInline(t), sid: m ? m[1] : null };
}

const LIST_RE = /^([ \t]*)([-*+]|\d{1,9}[.)])(?:[ \t]+|$)(\[[ xX]\](?:[ \t]+|$))?(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const width = (ws: string) => ws.replace(/\t/g, "  ").length;

function splitRow(row: string): string[] {
  let r = row.trim();
  if (r.startsWith("|")) r = r.slice(1);
  if (r.endsWith("|") && !r.endsWith("\\|")) r = r.slice(0, -1);
  return r.split(/(?<!\\)\|/).map((c) => c.trim());
}

function cell(type: "tableHeader" | "tableCell", s: string): PMNode {
  const content = parseInline(s, [], { arrow: false, cell: true });
  return { type, content: [content.length ? { type: "paragraph", attrs: { indent: 0, sid: null }, content } : { type: "paragraph", attrs: { indent: 0, sid: null } }] };
}

export function parseBlocks(lines: string[]): PMNode[] {
  const out: PMNode[] = [];
  let blanks = 0;
  let cols = [0];
  const structural = () => {
    cols = [0];
  };
  const push = (n: PMNode) => {
    const prev = out[out.length - 1];
    const bothFlow = prev && FLOW.has(prev.type) && FLOW.has(n.type);
    // no blank line where the layout would normally put one: remember it
    if (prev && !blanks && !bothFlow) n.attrs = { ...(n.attrs ?? {}), tight: true };
    if (blanks) {
      const extra = !prev ? 0 : bothFlow ? blanks : blanks - 1;
      for (let k = 0; k < extra; k++) out.push(block("paragraph", { indent: 0, sid: null }));
    }
    blanks = 0;
    out.push(n);
  };
  const levelOf = (w: number) => {
    let k = 0;
    for (let j = 1; j < cols.length; j++) if (cols[j] <= w + 1) k = j;
    return k;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      blanks++;
      continue;
    }
    let m: RegExpExecArray | null;
    // fenced code
    if ((m = /^\s*(`{3,}|~{3,})(.*)$/.exec(line))) {
      const fence = m[1];
      const body: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (new RegExp(`^\\s*${fence[0] === "`" ? "`" : "~"}{${fence.length},}\\s*$`).test(lines[j])) break;
        body.push(lines[j]);
      }
      const closed = j < lines.length;
      push(block("codeBlock", { lang: m[2].trim(), fence, open: !closed }, body.length ? [{ type: "text", text: body.join("\n") }] : undefined));
      structural();
      i = closed ? j : lines.length;
      continue;
    }
    // maths / raw HTML blocks: kept exactly
    if (/^\$\$/.test(line) || (/^\s*<(?!mark\b)[a-zA-Z!/]/.test(line) && !/^\s*<mark\b/.test(line))) {
      const body = [line];
      let j = i + 1;
      if (/^\$\$/.test(line) && !/^\$\$.*\$\$\s*$/.test(line.trim()) ) {
        for (; j < lines.length; j++) {
          body.push(lines[j]);
          if (/^\$\$/.test(lines[j].trim())) {
            j++;
            break;
          }
        }
      } else for (; j < lines.length && lines[j].trim(); j++) body.push(lines[j]);
      push(block("raw", {}, [{ type: "text", text: body.join("\n") }]));
      structural();
      i = j - 1;
      continue;
    }
    // heading
    if ((m = /^(#{1,6})[ \t]+(.*)$/.exec(line)) || (m = /^(#{1,6})$/.exec(line))) {
      const { content, sid } = inlineWithId(m[2] ?? "");
      push(block("heading", { level: m[1].length, sid }, content));
      structural();
      continue;
    }
    // divider
    if (/^ {0,3}(?:-[ \t]*){3,}$|^ {0,3}(?:\*[ \t]*){3,}$|^ {0,3}(?:_[ \t]*){3,}$/.test(line)) {
      push(block("hr", {}));
      structural();
      continue;
    }
    // ":: table" + table
    const tableAt = (k: number) => k + 1 < lines.length && /^\s*\|/.test(lines[k]) && TABLE_SEP.test(lines[k + 1]) && lines[k + 1].includes("-");
    let cardsLine: { sid: string | null } | null = null;
    let t = i;
    if ((m = /^::\s*table\b(.*)$/i.exec(line.trim()))) {
      let k = i + 1;
      while (k < lines.length && !lines[k].trim()) k++;
      if (tableAt(k)) {
        cardsLine = { sid: ID_RE.exec(line)?.[1] ?? null };
        t = k;
      }
    }
    if (tableAt(t)) {
      const rows: string[] = [lines[t]];
      let j = t + 2;
      for (; j < lines.length && /^\s*\|/.test(lines[j]); j++) rows.push(lines[j]);
      const head = splitRow(rows[0]);
      const aligns = splitRow(lines[t + 1]);
      const body = rows.slice(1).map(splitRow);
      const n = Math.max(head.length, ...body.map((r) => r.length));
      const pad = (r: string[]) => Array.from({ length: n }, (_, k) => r[k] ?? "");
      push(
        block("table", { cards: !!cardsLine, sid: cardsLine?.sid ?? null, aligns: aligns.length === n ? aligns : null }, [
          { type: "tableRow", content: pad(head).map((c) => cell("tableHeader", c)) },
          ...body.map((r) => ({ type: "tableRow", content: pad(r).map((c) => cell("tableCell", c)) })),
        ]),
      );
      structural();
      i = j - 1;
      continue;
    }
    // quote / callout
    if (/^\s{0,3}>/.test(line)) {
      const inner: string[] = [];
      let j = i;
      for (; j < lines.length && /^\s{0,3}>/.test(lines[j]); j++) inner.push(lines[j].replace(/^\s{0,3}> ?/, ""));
      const c = /^\[!([\w-]+)\]([+-]?)[ \t]*(.*)$/.exec(inner[0]);
      if (c) {
        const kids = parseBlocks(inner.slice(1));
        push(block("callout", { kind: c[1].toLowerCase(), fold: c[2], title: c[3] }, kids.length ? kids : [block("paragraph", { indent: 0, sid: null })]));
      } else {
        const kids = parseBlocks(inner);
        push(block("blockquote", {}, kids.length ? kids : [block("paragraph", { indent: 0, sid: null })]));
      }
      structural();
      i = j - 1;
      continue;
    }
    // image on its own line
    if ((m = /^\s*!\[([^\]\n]*)\]\(([^)\s]+)\)\s*$/.exec(line))) {
      push(block("image", { src: m[2], alt: m[1] }));
      structural();
      continue;
    }
    // list item
    if ((m = LIST_RE.exec(line)) && !(m[2] === "*" && /^\*/.test(m[4]))) {
      const w = width(m[1]);
      const level = levelOf(w);
      const { content, sid } = inlineWithId(m[4]);
      const ordered = /\d/.test(m[2]);
      const type = m[3] ? "todo" : ordered ? "ordered" : "bullet";
      const attrs: Record<string, unknown> = { indent: level, sid };
      if (type === "todo") attrs.checked = /x/i.test(m[3]!);
      if (ordered) attrs.num = parseInt(m[2], 10);
      push(block(type, attrs, content));
      cols = cols.slice(0, level + 1);
      cols.push(cols[level] + (ordered ? m[2].length + 1 : 2));
      continue;
    }
    // paragraph
    const lead = /^[ \t]*/.exec(line)![0];
    const level = lead ? levelOf(width(lead)) : 0;
    let s = line.slice(lead.length);
    const { content, sid } = inlineWithId(s);
    push(block("paragraph", { indent: level, sid }, content));
    cols = cols.slice(0, level + 1);
    cols.push(cols[level] + 2);
  }
  return out;
}

export function mdToDoc(md: string): PMNode {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const content = parseBlocks(lines);
  return { type: "doc", content: content.length ? content : [block("paragraph", { indent: 0, sid: null })] };
}

// ---- blocks: nodes → Markdown ----------------------------------------------------------------

/** Where each block ended up in the file: its first line and its path of child indexes. */
export type Owner = { line: number; path: number[] };

const LINE_START = /^(#{1,6}(\s|$)|[-*+](\s|$)|\d{1,9}[.)](\s|$)|>|\||```|~~~|\$\$|:: ?table|(?:-[ \t]*){3,}$|(?:\*[ \t]*){3,}$|(?:_[ \t]*){3,}$|<[a-zA-Z!/])/;

function textLine(n: PMNode, seen: Set<string>): string {
  let s = serializeInline(n.content);
  const sid = n.attrs?.sid as string | null | undefined;
  if (sid && !seen.has(sid)) {
    seen.add(sid);
    s = s.replace(/\s+$/, "") + ` <!--sd:${sid}-->`;
  }
  return s;
}

function serializeBlocks(nodes: PMNode[], seen: Set<string>, owners: Owner[], base: number, path: number[]): string[] {
  const out: string[] = [];
  let cols = [0];
  const counters: (number | undefined)[] = [];
  let prev: PMNode | undefined;
  nodes.forEach((n, idx) => {
    if (prev && !(FLOW.has(prev.type) && FLOW.has(n.type)) && !n.attrs?.tight) out.push("");
    prev = n;
    const here = [...path, idx];
    const line = base + out.length;
    const isEmptyPara = n.type === "paragraph" && !(n.content && n.content.length);
    if (FLOW.has(n.type)) {
      if (isEmptyPara) {
        out.push("");
        return;
      }
      let level = Math.max(0, Math.min(Number(n.attrs?.indent ?? 0), cols.length - 1));
      counters.length = level + 1;
      const indent = " ".repeat(cols[level]);
      let marker = "";
      if (n.type === "bullet") marker = "- ";
      else if (n.type === "todo") marker = `- [${n.attrs?.checked ? "x" : " "}] `;
      else if (n.type === "ordered") {
        const num = counters[level] !== undefined ? counters[level]! + 1 : Number(n.attrs?.num ?? 1) || 1;
        counters[level] = num;
        marker = `${num}. `;
      }
      if (n.type !== "ordered") counters[level] = undefined;
      let body = textLine(n, seen);
      if (n.type === "paragraph" && LINE_START.test(body)) body = "\\" + body;
      if (n.type === "paragraph" && /^\s/.test(body)) body = body.trimStart();
      owners.push({ line, path: here });
      out.push(indent + marker + body);
      cols = cols.slice(0, level + 1);
      cols.push(cols[level] + (marker ? (n.type === "todo" ? 2 : marker.length) : 2));
      return;
    }
    cols = [0];
    counters.length = 0;
    if (n.type !== "heading" && n.type !== "table") owners.push({ line, path: here });
    switch (n.type) {
      case "heading": {
        owners.push({ line, path: here });
        out.push(`${"#".repeat(Number(n.attrs?.level ?? 1))} ${textLine(n, seen)}`.trimEnd());
        break;
      }
      case "hr":
        out.push("---");
        break;
      case "image":
        out.push(`![${n.attrs?.alt ?? ""}](${n.attrs?.src ?? ""})`);
        break;
      case "raw":
        out.push(...(n.content?.map((c) => c.text ?? "").join("") ?? "").split("\n"));
        break;
      case "codeBlock": {
        const fence = String(n.attrs?.fence || "```");
        const code = n.content?.map((c) => c.text ?? "").join("") ?? "";
        out.push(fence + (n.attrs?.lang ?? ""), ...(code ? code.split("\n") : []));
        if (!n.attrs?.open || code) out.push(fence);
        break;
      }
      case "blockquote":
      case "callout": {
        const head = n.type === "callout" ? [`[!${n.attrs?.kind ?? "note"}]${n.attrs?.fold ?? ""} ${n.attrs?.title ?? ""}`.trimEnd()] : [];
        const kids = n.content ?? [];
        const onlyEmpty = kids.length === 1 && kids[0].type === "paragraph" && !kids[0].content?.length;
        const inner = onlyEmpty && head.length ? [] : serializeBlocks(kids, seen, owners, line + head.length, here);
        out.push(...[...head, ...inner].map((l) => (l ? `> ${l}` : ">")));
        break;
      }
      case "table": {
        const rows = n.content ?? [];
        const ncol = Math.max(1, ...rows.map((r) => r.content?.length ?? 0));
        const cells = rows.map((r) =>
          Array.from({ length: ncol }, (_, k) => {
            const c = r.content?.[k];
            return (c?.content ?? []).map((p) => serializeInline(p.content, true)).filter(Boolean).join("<br>");
          }),
        );
        if (n.attrs?.cards) {
          const sid = n.attrs?.sid as string | null;
          owners.push({ line, path: here });
          out.push(":: table" + (sid && !seen.has(sid) ? ` <!--sd:${sid}-->` : ""));
          if (sid) seen.add(sid);
        }
        const aligns = Array.isArray(n.attrs?.aligns) && (n.attrs.aligns as string[]).length === ncol ? (n.attrs.aligns as string[]) : Array(ncol).fill("---");
        const row = (r: string[]) => `| ${r.join(" | ")} |`;
        out.push(row(cells[0] ?? Array(ncol).fill("")), row(aligns), ...cells.slice(1).map(row));
        break;
      }
      default: {
        // unknown block: keep its text
        out.push(serializeInline(n.content));
      }
    }
  });
  return out;
}

export function docToMd(doc: PMNode): { md: string; owners: Owner[] } {
  const owners: Owner[] = [];
  const lines = serializeBlocks(doc.content ?? [], new Set(), owners, 0, []);
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return { md: lines.length ? lines.join("\n") + "\n" : "", owners };
}
