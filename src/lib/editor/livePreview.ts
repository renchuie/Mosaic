// Live preview for the notes editor (N1): Markdown stays Markdown on disk, but formatting
// marks are hidden on every line except the ones the cursor or selection is on, so notes read
// like a document (Obsidian's "live preview"). Also: clickable checkboxes, dividers, quote and
// callout boxes, real tables (raw again while the cursor is inside), table keys, and the "/" menu.
import { EditorSelection, Prec, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import { mdInline } from "../md";

// ---- which lines are "active" (show raw Markdown) ------------------------------------------

function activeLines(state: EditorState): Set<number> {
  const out = new Set<number>();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    const b = state.doc.lineAt(r.to).number;
    for (let i = a; i <= b; i++) out.add(i);
  }
  return out;
}

// ---- widgets -------------------------------------------------------------------------------

class Bullet extends WidgetType {
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-bullet";
    s.textContent = "•";
    return s;
  }
  ignoreEvent() {
    return false;
  }
}

class Check extends WidgetType {
  constructor(readonly on: boolean, readonly pos: number) {
    super();
  }
  eq(o: Check) {
    return o.on === this.on && o.pos === this.pos;
  }
  toDOM() {
    const b = document.createElement("span");
    b.className = "cm-check" + (this.on ? " on" : "");
    b.setAttribute("role", "checkbox");
    b.setAttribute("aria-checked", String(this.on));
    b.dataset.pos = String(this.pos);
    b.innerHTML = this.on ? '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M5 12l5 5 9-10" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : "";
    return b;
  }
  ignoreEvent() {
    return false;
  }
}

class Rule extends WidgetType {
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-rule";
    return s;
  }
}

const CALLOUTS: Record<string, string> = { note: "✎", tip: "✦", info: "ℹ", warning: "!", exam: "★", important: "!", example: "◆", question: "?", danger: "!" };
class CalloutIcon extends WidgetType {
  constructor(readonly kind: string, readonly title: string) {
    super();
  }
  eq(o: CalloutIcon) {
    return o.kind === this.kind && o.title === this.title;
  }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-callout-badge";
    s.textContent = `${CALLOUTS[this.kind] ?? "✎"} ${this.title || this.kind[0].toUpperCase() + this.kind.slice(1)}`;
    return s;
  }
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());

class TableWidget extends WidgetType {
  constructor(readonly text: string, readonly firstLine: number) {
    super();
  }
  eq(o: TableWidget) {
    return o.text === this.text && o.firstLine === this.firstLine;
  }
  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "cm-tablew";
    wrap.dataset.line = String(this.firstLine);
    wrap.title = "Click to edit the table";
    const rows = this.text.split("\n");
    const head = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    const cols = Math.max(head.length, ...body.map((r) => r.length));
    const cell = (tag: string, s = "") => `<${tag}>${mdInline(s.replace(/<!--sd:[a-z0-9]+-->/g, "").replace(/\\\|/g, "|")) || "&nbsp;"}</${tag}>`;
    let html = `<table><thead><tr data-row="0">${Array.from({ length: cols }, (_, i) => cell("th", head[i])).join("")}</tr></thead><tbody>`;
    body.forEach((r, i) => (html += `<tr data-row="${i + 2}">${Array.from({ length: cols }, (_, j) => cell("td", r[j])).join("")}</tr>`));
    wrap.innerHTML = html + "</tbody></table>";
    return wrap;
  }
  ignoreEvent() {
    return false;
  }
}

// ---- inline decorations (hidden marks, bullets, checks, quotes, callouts, rules) ------------

const hide = Decoration.replace({});
const lineDeco = (cls: string) => Decoration.line({ class: cls });

function buildInline(view: EditorView): DecorationSet {
  const { state } = view;
  const active = activeLines(state);
  const out: Range<Decoration>[] = [];
  const lineOf = (pos: number) => state.doc.lineAt(pos).number;
  const isActive = (pos: number) => active.has(lineOf(pos));
  const tree = syntaxTree(state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (n) => {
        const name = n.name;
        if (/^ATXHeading(\d)$/.test(name)) {
          out.push(lineDeco(`cm-h cm-h${name.slice(-1)}`).range(state.doc.lineAt(n.from).from));
          return;
        }
        if (name === "HeaderMark") {
          if (isActive(n.from)) return;
          const after = state.sliceDoc(n.to, n.to + 1) === " " ? n.to + 1 : n.to;
          // only the leading # marks (closing ### stay hidden too)
          out.push(hide.range(n.from, after));
          return;
        }
        if (name === "EmphasisMark" || name === "StrikethroughMark" || (name === "CodeMark" && n.node.parent?.name === "InlineCode")) {
          if (!isActive(n.from)) out.push(hide.range(n.from, n.to));
          return;
        }
        if (name === "Link") {
          if (isActive(n.from)) return;
          const text = state.sliceDoc(n.from, n.to);
          const m = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(text);
          if (m) {
            out.push(hide.range(n.from, n.from + 1));
            out.push(Decoration.mark({ class: "cm-mdlink", attributes: { "data-href": m[2].split(/\s/)[0], title: m[2] } }).range(n.from + 1, n.from + 1 + m[1].length));
            out.push(hide.range(n.from + 1 + m[1].length, n.to));
          }
          return false;
        }
        if (name === "HorizontalRule") {
          if (!isActive(n.from)) out.push(Decoration.replace({ widget: new Rule() }).range(n.from, n.to));
          return;
        }
        if (name === "FencedCode") {
          for (let p = n.from; p <= n.to; ) {
            const l = state.doc.lineAt(p);
            out.push(lineDeco("cm-codeline").range(l.from));
            p = l.to + 1;
          }
          return false;
        }
        if (name === "Blockquote") {
          const first = state.doc.lineAt(n.from);
          const call = /^\s*>\s*\[!(\w+)\]\s*(.*)$/.exec(first.text);
          for (let p = n.from; p <= n.to; ) {
            const l = state.doc.lineAt(p);
            const cls = call ? `cm-callout cm-callout-${call[1].toLowerCase()}${l.number === first.number ? " cm-callout-first" : ""}${l.to >= n.to ? " cm-callout-last" : ""}` : "cm-quote";
            out.push(lineDeco(cls).range(l.from));
            if (!active.has(l.number)) {
              const q = /^(\s*>\s?)/.exec(l.text);
              if (q) out.push(hide.range(l.from, l.from + q[1].length));
              if (call && l.number === first.number) {
                const start = l.text.indexOf("[!");
                out.push(Decoration.replace({ widget: new CalloutIcon(call[1].toLowerCase(), call[2].trim()) }).range(l.from + start, l.to));
              }
            }
            p = l.to + 1;
          }
          return;
        }
        if (name === "ListMark") {
          const item = n.node.parent;
          const isBullet = item?.parent?.name === "BulletList";
          const task = item?.getChild("Task");
          if (task) {
            const marker = task.getChild("TaskMarker");
            if (marker && !isActive(n.from)) {
              const on = /x/i.test(state.sliceDoc(marker.from, marker.to));
              const end = state.sliceDoc(marker.to, marker.to + 1) === " " ? marker.to + 1 : marker.to;
              out.push(Decoration.replace({ widget: new Check(on, marker.from) }).range(n.from, end));
              if (on) out.push(Decoration.mark({ class: "cm-done" }).range(end, state.doc.lineAt(n.from).to));
            }
            return;
          }
          if (isBullet) out.push(Decoration.replace({ widget: new Bullet() }).range(n.from, n.to));
          return;
        }
      },
    });
    // wiki links, ==highlights== and <mark class="…"> colours (not in the Markdown grammar)
    for (let p = from; p <= to; ) {
      const l = state.doc.lineAt(p);
      p = l.to + 1;
      if (active.has(l.number)) continue;
      for (const m of l.text.matchAll(/\[\[([^\]|\n]+)(\|[^\]\n]+)?\]\]/g)) {
        const a = l.from + m.index!;
        out.push(hide.range(a, a + 2 + (m[2] ? m[1].length + 1 : 0)));
        out.push(hide.range(a + m[0].length - 2, a + m[0].length));
      }
      for (const m of l.text.matchAll(/==([^=\n]+)==/g)) {
        const a = l.from + m.index!;
        out.push(hide.range(a, a + 2));
        out.push(hide.range(a + m[0].length - 2, a + m[0].length));
      }
      for (const m of l.text.matchAll(/<mark(?:\s+class="(\w+)")?>(.*?)<\/mark>/g)) {
        const a = l.from + m.index!;
        const open = m[0].indexOf(">") + 1;
        out.push(hide.range(a, a + open));
        out.push(Decoration.mark({ class: `cm-hl cm-hl-${m[1] ?? "yellow"}` }).range(a + open, a + open + m[2].length));
        out.push(hide.range(a + open + m[2].length, a + m[0].length));
      }
    }
  }
  return Decoration.set(out, true);
}

const inlinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(v: EditorView) {
      this.decorations = buildInline(v);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = buildInline(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// ---- tables: rendered as a real table unless the cursor is inside ---------------------------

export function findTables(state: EditorState): { from: number; to: number; first: number; last: number }[] {
  const out: { from: number; to: number; first: number; last: number }[] = [];
  const doc = state.doc;
  let i = 1;
  const isRow = (t: string) => /^\s*\|.*\|\s*$/.test(t);
  while (i < doc.lines) {
    const a = doc.line(i).text;
    const b = doc.line(i + 1).text;
    if (isRow(a) && /^\s*\|?\s*:?-+/.test(b) && b.includes("|")) {
      let j = i + 1;
      while (j + 1 <= doc.lines && isRow(doc.line(j + 1).text)) j++;
      out.push({ from: doc.line(i).from, to: doc.line(j).to, first: i, last: j });
      i = j + 1;
    } else i++;
  }
  return out;
}

function tableDecos(state: EditorState): DecorationSet {
  const active = activeLines(state);
  const out: Range<Decoration>[] = [];
  for (const t of findTables(state)) {
    let inside = false;
    for (let l = t.first; l <= t.last; l++) if (active.has(l)) inside = true;
    if (inside) {
      for (let l = t.first; l <= t.last; l++) out.push(lineDeco("cm-tableraw").range(state.doc.line(l).from));
    } else out.push(Decoration.replace({ widget: new TableWidget(state.sliceDoc(t.from, t.to), t.first), block: true }).range(t.from, t.to));
  }
  return Decoration.set(out, true);
}

const tableField = StateField.define<DecorationSet>({
  create: tableDecos,
  update: (d, tr) => (tr.docChanged || tr.selection ? tableDecos(tr.state) : d),
  provide: (f) => EditorView.decorations.from(f),
});

const isTableLine = (state: EditorState, pos: number) => /^\s*\|/.test(state.doc.lineAt(pos).text);

/** Tab / Shift-Tab between cells; Enter adds a row below. */
const tableKeys = Prec.high(
  keymap.of([
    {
      key: "Tab",
      run: (v) => {
        const s = v.state.selection.main;
        if (!s.empty || !isTableLine(v.state, s.head)) return false;
        const line = v.state.doc.lineAt(s.head);
        const rest = line.text.slice(s.head - line.from);
        const next = rest.indexOf("|", rest.startsWith("|") ? 1 : 0);
        if (next >= 0 && line.text.slice(s.head - line.from + next + 1).trim()) {
          selectCell(v, line.from, s.head - line.from + next + 1);
          return true;
        }
        // next row (skipping the divider), or a new row at the end
        let n = line.number + 1;
        if (n <= v.state.doc.lines && /^\s*\|?\s*:?-+/.test(v.state.doc.line(n).text)) n++;
        if (n <= v.state.doc.lines && isTableLine(v.state, v.state.doc.line(n).from)) {
          const l = v.state.doc.line(n);
          selectCell(v, l.from, l.text.indexOf("|") + 1);
          return true;
        }
        return addRow(v);
      },
    },
    {
      key: "Shift-Tab",
      run: (v) => {
        const s = v.state.selection.main;
        if (!s.empty || !isTableLine(v.state, s.head)) return false;
        const line = v.state.doc.lineAt(s.head);
        const before = line.text.slice(0, s.head - line.from);
        const cur = before.lastIndexOf("|");
        const prev = before.lastIndexOf("|", cur - 1);
        if (prev >= 0) {
          selectCell(v, line.from, prev + 1);
          return true;
        }
        return true;
      },
    },
    { key: "Enter", run: (v) => (v.state.selection.main.empty && isTableLine(v.state, v.state.selection.main.head) ? addRow(v) : false) },
    {
      // Enter on an empty quote / callout line ends the quote (like Obsidian and Notion)
      key: "Enter",
      run: (v) => {
        const s = v.state.selection.main;
        const line = v.state.doc.lineAt(s.head);
        if (!s.empty || !/^\s*>\s*$/.test(line.text)) return false;
        // leave a blank line so what comes next isn't read as part of the quote
        v.dispatch({ changes: { from: line.from, to: line.to, insert: "\n" }, selection: { anchor: line.from + 1 } });
        return true;
      },
    },
  ]),
);

/** Select a cell's text (so typing replaces it); `start` is the index just after its "|". */
function selectCell(v: EditorView, lineFrom: number, start: number) {
  const text = v.state.doc.lineAt(lineFrom).text;
  let end = text.indexOf("|", start);
  if (end < 0) end = text.length;
  const raw = text.slice(start, end);
  const a = start + (raw.length - raw.trimStart().length);
  const b = end - (raw.length - raw.trimEnd().length);
  if (b > a) v.dispatch({ selection: { anchor: lineFrom + a, head: lineFrom + b } });
  else v.dispatch({ selection: { anchor: lineFrom + Math.min(start + 1, end) } });
}

function addRow(v: EditorView): boolean {
  const line = v.state.doc.lineAt(v.state.selection.main.head);
  // Enter on an empty row leaves the table: the row becomes a normal line
  if (cells(line.text).every((c) => !c) && line.number > 2) {
    v.dispatch({ changes: { from: line.from, to: line.to, insert: "" }, selection: { anchor: line.from } });
    return true;
  }
  const n = Math.max(1, cells(line.text).length);
  const row = "\n|" + "  |".repeat(n);
  v.dispatch({ changes: { from: line.to, insert: row }, selection: { anchor: line.to + 3 } });
  return true;
}

// ---- clicks: checkboxes toggle, tables open for editing, links ------------------------------

const clicks = EditorView.domEventHandlers({
  mousedown(e, v) {
    const target = e.target as HTMLElement;
    const check = target.closest<HTMLElement>(".cm-check");
    if (check && e.button === 0) {
      e.preventDefault();
      const pos = Number(check.dataset.pos);
      const cur = v.state.sliceDoc(pos, pos + 3);
      v.dispatch({ changes: { from: pos, to: pos + 3, insert: /x/i.test(cur) ? "[ ]" : "[x]" } });
      return true;
    }
    const tw = target.closest<HTMLElement>(".cm-tablew");
    if (tw && e.button === 0) {
      e.preventDefault();
      const first = Number(tw.dataset.line);
      const tr = target.closest<HTMLElement>("tr");
      const row = tr ? Number(tr.dataset.row ?? 0) : 0;
      const td = target.closest("td, th");
      const col = td ? [...(td.parentElement?.children ?? [])].indexOf(td) : 0;
      const line = v.state.doc.line(Math.min(v.state.doc.lines, first + row));
      // put the cursor at the start of the clicked cell
      let pos = line.from;
      let seen = -1;
      for (let i = 0; i < line.text.length; i++) {
        if (line.text[i] === "|") {
          seen++;
          if (seen === col) {
            pos = line.from + i + (line.text[i + 1] === " " ? 2 : 1);
            break;
          }
        }
      }
      v.dispatch({ selection: EditorSelection.cursor(Math.min(pos, line.to)) });
      v.focus();
      return true;
    }
    const link = target.closest<HTMLElement>(".cm-mdlink");
    if (link && (e.ctrlKey || e.metaKey) && link.dataset.href) {
      e.preventDefault();
      window.open(link.dataset.href, "_blank");
      return true;
    }
    return false;
  },
});

// ---- the "/" menu --------------------------------------------------------------------------

type Slash = { label: string; detail: string; insert: string; cursor?: number; select?: [number, number]; line?: boolean };
const SLASH: Slash[] = [
  { label: "Heading 1", detail: "Big section title", insert: "# ", line: true },
  { label: "Heading 2", detail: "Medium title", insert: "## ", line: true },
  { label: "Heading 3", detail: "Small title", insert: "### ", line: true },
  { label: "Bullet list", detail: "• item", insert: "- ", line: true },
  { label: "Numbered list", detail: "1. item", insert: "1. ", line: true },
  { label: "Checklist", detail: "☐ to-do", insert: "- [ ] ", line: true },
  { label: "Table", detail: "3 columns", insert: "| Drug | Class | Key point |\n| --- | --- | --- |\n|  |  |  |", select: [2, 6] },
  { label: "Callout: note", detail: "Coloured box", insert: "> [!note] Note\n> ", line: true },
  { label: "Callout: tip", detail: "Green box", insert: "> [!tip] Tip\n> ", line: true },
  { label: "Callout: warning", detail: "Rose box", insert: "> [!warning] Watch out\n> ", line: true },
  { label: "Callout: exam", detail: "High-yield for the exam", insert: "> [!exam] High-yield\n> ", line: true },
  { label: "Quote", detail: "Indented quote", insert: "> ", line: true },
  { label: "Divider", detail: "Line across", insert: "---\n", line: true },
  { label: "Code block", detail: "Monospace", insert: "```\n\n```", cursor: 4 },
  { label: "Flashcard", detail: "Question :: Answer", insert: "Question :: Answer", select: [0, 8] },
  { label: "Two-way flashcard", detail: "Term ::: Definition", insert: "Term ::: Definition", select: [0, 4] },
  { label: "Cloze", detail: "Hide a part: {{answer}}", insert: "{{}}", cursor: 2 },
  { label: "Link to a note", detail: "[[Note name]]", insert: "[[]]", cursor: 2 },
  { label: "Highlight", detail: "==highlighted==", insert: "====", cursor: 2 },
];

export function slashMenu(ctx: CompletionContext): CompletionResult | null {
  const m = ctx.matchBefore(/(?:^|\s)\/[\w ]*$/);
  if (!m) return null;
  const slash = m.from + m.text.indexOf("/");
  const line = ctx.state.doc.lineAt(slash);
  if (/^\s*```/.test(line.text)) return null;
  return {
    from: slash,
    filter: true,
    options: SLASH.map(
      (s): Completion => ({
        label: "/" + s.label,
        displayLabel: s.label,
        detail: s.detail,
        type: "slash",
        apply: (view, _c, from, to) => {
          const ln = view.state.doc.lineAt(from);
          const atStart = !ln.text.slice(0, from - ln.from).trim();
          const pick = (base: number) => (s.select ? { anchor: base + s.select[0], head: base + s.select[1] } : { anchor: base + (s.cursor ?? s.insert.length) });
          if (s.line && !atStart) {
            // a block type typed mid-line: drop "/…" and start a new line below
            const base = ln.to - (to - from) + 1;
            view.dispatch({ changes: [{ from, to, insert: "" }, { from: ln.to, insert: "\n" + s.insert }], selection: pick(base) });
          } else {
            view.dispatch({ changes: { from, to, insert: s.insert }, selection: pick(from) });
          }
        },
      }),
    ),
  };
}

export const livePreview = (): Extension => [inlinePlugin, tableField, tableKeys, clicks];

export const livePreviewTheme = EditorView.theme({
  ".cm-h": { paddingTop: "0.35em" },
  ".cm-h1": { paddingTop: "0.6em" },
  ".cm-check": {
    display: "inline-grid",
    placeItems: "center",
    width: "18px",
    height: "18px",
    margin: "0 8px 0 2px",
    verticalAlign: "-3px",
    borderRadius: "6px",
    border: "2px solid color-mix(in srgb, var(--text-muted) 50%, transparent)",
    cursor: "pointer",
    transition: "transform .25s cubic-bezier(.34,1.56,.64,1), background-color .15s",
  },
  ".cm-check:hover": { transform: "scale(1.15)" },
  ".cm-check.on": { backgroundColor: "var(--sage-deep)", borderColor: "var(--sage-deep)" },
  ".cm-done": { textDecoration: "line-through", color: "var(--text-muted)" },
  ".cm-rule": { display: "inline-block", width: "100%", height: "2px", verticalAlign: "middle", background: "linear-gradient(90deg, transparent, var(--hairline) 15%, var(--hairline) 85%, transparent)" },
  ".cm-quote": { borderLeft: "3px solid color-mix(in srgb, var(--text-muted) 35%, transparent)", paddingLeft: "14px !important", color: "var(--text-muted)" },
  ".cm-callout": { backgroundColor: "color-mix(in srgb, var(--lavender) 22%, transparent)", paddingLeft: "16px !important", paddingRight: "16px !important" },
  ".cm-callout-first": { borderTopLeftRadius: "14px", borderTopRightRadius: "14px", paddingTop: "8px !important", fontWeight: "600" },
  ".cm-callout-last": { borderBottomLeftRadius: "14px", borderBottomRightRadius: "14px", paddingBottom: "8px !important" },
  ".cm-callout-tip, .cm-callout-example": { backgroundColor: "color-mix(in srgb, var(--sage) 30%, transparent)" },
  ".cm-callout-warning, .cm-callout-danger, .cm-callout-important": { backgroundColor: "color-mix(in srgb, var(--rose) 32%, transparent)" },
  ".cm-callout-exam": { backgroundColor: "color-mix(in srgb, var(--butter) 55%, transparent)" },
  ".cm-callout-info, .cm-callout-question": { backgroundColor: "color-mix(in srgb, #b9d4ee 40%, transparent)" },
  ".cm-callout-badge": { fontWeight: "700" },
  ".cm-codeline": { fontFamily: "ui-monospace, monospace", fontSize: "0.9em", backgroundColor: "var(--chip)", paddingLeft: "14px !important" },
  ".cm-mdlink": { color: "#5b4bb0", textDecoration: "underline", textUnderlineOffset: "3px", cursor: "pointer" },
  ".cm-hl-rose": { backgroundColor: "color-mix(in srgb, var(--rose) 60%, transparent) !important" },
  ".cm-hl-sage": { backgroundColor: "color-mix(in srgb, var(--sage) 60%, transparent) !important" },
  ".cm-hl-peach": { backgroundColor: "color-mix(in srgb, var(--peach) 70%, transparent) !important" },
  ".cm-hl-lavender": { backgroundColor: "color-mix(in srgb, var(--lavender) 55%, transparent) !important" },
  ".cm-hl-blue": { backgroundColor: "color-mix(in srgb, #b9d4ee 70%, transparent) !important" },
  ".cm-tablew": { margin: "8px 0", overflowX: "auto", cursor: "text" },
  ".cm-tablew table": { borderCollapse: "separate", borderSpacing: "0", width: "100%", fontSize: "0.95em", borderRadius: "14px", overflow: "hidden", boxShadow: "0 0 0 1px var(--hairline)" },
  ".cm-tablew th": { backgroundColor: "var(--chip)", fontWeight: "600", textAlign: "left", padding: "8px 12px" },
  ".cm-tablew td": { padding: "8px 12px", borderTop: "1px solid var(--hairline)", verticalAlign: "top" },
  ".cm-tablew td + td, .cm-tablew th + th": { borderLeft: "1px solid var(--hairline)" },
  ".cm-tablew:hover table": { boxShadow: "0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent)" },
  ".cm-tableraw": { fontFamily: "ui-monospace, monospace", fontSize: "0.88em", backgroundColor: "color-mix(in srgb, var(--accent) 7%, transparent)" },
  ".cm-tooltip-autocomplete .cm-completionDetail": { marginLeft: "10px", fontStyle: "normal", color: "var(--text-muted)", fontSize: "0.85em" },
});
