<script lang="ts" module>
  export type MenuItem = { id: string; label: string; icon: string; hint?: string; keys?: string; group?: string };
</script>

<script lang="ts">
  // The Mosaic note editor (N1b): blocks with no visible Markdown, saved as plain .md.
  // "/" menu, [[ note links, #tags, a toolbar on selected text, block handles (+ and drag),
  // flashcard arrows (→ one way, ⇄ both ways) and cloze, rich paste from Docs / web pages.
  import { onDestroy, onMount, untrack } from "svelte";
  import { Editor } from "@tiptap/core";
  import { NodeSelection, TextSelection } from "@tiptap/pm/state";
  import { CellSelection } from "@tiptap/pm/tables";
  import { getMarkRange } from "@tiptap/core";
  import type { Node as PMNode } from "@tiptap/pm/model";
  import { mosaicExtensions, setPaletteSource, FLOW, MAX_COLUMNS } from "../editor/blocks";
  import { activePalette, hlColor, hlColors, styleManager, visibleCallouts } from "../stores/blockStyles.svelte";
  setPaletteSource(activePalette);
  import { docToMd, mdToDoc, type PMNode as JNode } from "../editor/mdDoc";
  import { htmlToMd, richHtml } from "../editor/htmlToMd";
  import "../editor/editor.css";

  let {
    value,
    onchange,
    onopenlink,
    linkNames,
    tagNames,
    imageUrl,
    onpasteimage,
    onfocuschange,
    onleave,
  }: {
    value: string;
    onchange: () => void;
    onopenlink: (name: string) => void;
    linkNames: () => string[];
    tagNames: () => string[];
    imageUrl: (src: string) => string;
    onpasteimage: (dataUrl: string, ext: string) => Promise<string>;
    /** true while she is typing in the note (the editor has focus) */
    onfocuschange?: (typing: boolean) => void;
    /** called with the note's Markdown when the editor closes with changes not yet asked for */
    onleave?: (md: string) => void;
  } = $props();

  let host: HTMLDivElement;
  let wrap: HTMLDivElement;
  let editor = $state<Editor>();
  let tick = $state(0); // bumps on every transaction so the toolbars re-read the editor

  // ---- menus (slash, [[link, #tag) -----------------------------------------------------------
  type Menu = { kind: "slash" | "link" | "tag"; from: number; to: number; q: string; x: number; y: number; up: boolean };
  let menu = $state<Menu | null>(null);
  let sel = $state(0);
  let menuEl = $state<HTMLDivElement>();

  const SLASH_BASE: (MenuItem & { run: () => void })[] = [
    { id: "p", label: "Text", icon: "¶", group: "Basic", run: () => turnInto("paragraph") },
    { id: "h1", label: "Heading 1", icon: "H1", group: "Basic", keys: "#", run: () => turnInto("heading", { level: 1 }) },
    { id: "h2", label: "Heading 2", icon: "H2", group: "Basic", keys: "##", run: () => turnInto("heading", { level: 2 }) },
    { id: "h3", label: "Heading 3", icon: "H3", group: "Basic", keys: "###", run: () => turnInto("heading", { level: 3 }) },
    { id: "ul", label: "Bullet list", icon: "•", group: "Basic", keys: "-", run: () => turnInto("bullet") },
    { id: "ol", label: "Numbered list", icon: "1.", group: "Basic", keys: "1.", run: () => turnInto("ordered") },
    { id: "todo", label: "To-do", icon: "☐", group: "Basic", keys: "[]", run: () => turnInto("todo") },
    { id: "quote", label: "Quote", icon: "❝", group: "Basic", keys: ">", run: () => editor?.chain().focus().wrapIn("blockquote").run() },
    { id: "table", label: "Table", icon: "▦", group: "Basic", run: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: "hr", label: "Divider", icon: "―", group: "Basic", keys: "---", run: () => insertAfter({ type: "hr" }) },
    { id: "cols2", label: "2 columns", icon: "▥", group: "Basic", hint: "or drag a block beside another", run: () => insertColumns(2) },
    { id: "cols3", label: "3 columns", icon: "▥▥", group: "Basic", run: () => insertColumns(3) },
    { id: "code", label: "Code", icon: "</>", group: "Basic", keys: "```", run: () => editor?.chain().focus().setNode("codeBlock").run() },
    { id: "image", label: "Image", icon: "▣", group: "Basic", hint: "or paste one", run: () => pickImage() },
    { id: "link", label: "Link to a note", icon: "↗", group: "Basic", keys: "[[", run: () => editor?.chain().focus().insertContent("[[").run() },
    { id: "card", label: "Flashcard", icon: "→", group: "Study", hint: "Question → answer", keys: "::", run: () => editor?.chain().focus().insertContent({ type: "arrow", attrs: { two: false } }).run() },
    { id: "listcard", label: "List flashcard", icon: "→•", group: "Study", hint: "the bullets under it are the answer", keys: "::", run: () => listCard() },
    { id: "card2", label: "Two-way flashcard", icon: "⇄", group: "Study", hint: "both directions", keys: ":::", run: () => editor?.chain().focus().insertContent({ type: "arrow", attrs: { two: true } }).run() },
    { id: "cloze", label: "Cloze (hidden part)", icon: "{ }", group: "Study", hint: "select text, then Cloze", keys: "{{ }}", run: () => insertCloze() },
    { id: "tcards", label: "Table of flashcards", icon: "▦→", group: "Study", hint: "one card per cell", run: () => tableCards() },
  ];
  /** The "/" menu: basic and study blocks, then her callout types. */
  const slashItems = (): (MenuItem & { run: () => void })[] => [
    ...SLASH_BASE,
    { id: "q-src", label: "Quote with source", icon: "❝—", group: "Basic", hint: "the last line, starting with —, is the source", run: () => quoteWithSource() },
    ...visibleCallouts().map(([k, t]) => ({ id: `c-${k}`, label: `${t.label} callout`, icon: t.icon || "•", group: "Callouts", run: () => editor?.chain().focus().wrapIn("callout", { kind: k, title: "" }).run() })),
  ];

  const items = $derived.by((): (MenuItem & { run?: () => void; value?: string })[] => {
    if (!menu) return [];
    const q = menu.q.toLowerCase();
    if (menu.kind === "slash") {
      const inCol = inColumn();
      const hits = slashItems().filter((i) => !(inCol && i.id.startsWith("cols"))).filter((i) => !q || i.label.toLowerCase().includes(q) || i.id.startsWith(q) || (i.group ?? "").toLowerCase().startsWith(q));
      // names that start with what she typed come first ("list" → List flashcard before Bullet list)
      if (q) hits.sort((a, b) => Number(!a.label.toLowerCase().startsWith(q)) - Number(!b.label.toLowerCase().startsWith(q)));
      return hits.slice(0, 30);
    }
    if (menu.kind === "link") {
      const names = linkNames();
      const hits = names.filter((n) => n.toLowerCase().includes(q)).sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q))).slice(0, 8);
      const out: (MenuItem & { value?: string })[] = hits.map((n) => ({ id: `n:${n}`, label: n, icon: "↗", value: n }));
      if (menu.q.trim() && !names.some((n) => n.toLowerCase() === q.trim())) out.push({ id: "new", label: `New note “${menu.q.trim()}”`, icon: "+", value: menu.q.trim() });
      return out;
    }
    return tagNames().filter((t) => t.toLowerCase().startsWith(q) && t.toLowerCase() !== q).slice(0, 8).map((t) => ({ id: `t:${t}`, label: `#${t}`, icon: "#", value: t }));
  });
  $effect(() => {
    void items.length;
    if (sel >= items.length) sel = 0;
  });

  /** Open / update the "/", [[ and # menus. A menu only OPENS while she types (clicking into an
   *  existing #tag or link must not offer to replace it); moving the cursor keeps or closes it. */
  function detectMenu(typed = true) {
    if (!editor) return;
    const { state, view } = editor;
    const { $from: rf, empty } = state.selection;
    if (!empty || !rf.parent.isTextblock || rf.parent.type.spec.code) return closeMenu();
    const before = rf.parent.textBetween(0, rf.parentOffset, undefined, "￼");
    let m: RegExpExecArray | null;
    let kind: Menu["kind"] | null = null;
    let len = 0;
    let q = "";
    if ((m = /\[\[([^\]\n￼]*)$/.exec(before))) [kind, len, q] = ["link", m[0].length, m[1]];
    else if ((m = /(?:^|\s)\/([\w -]{0,24})$/.exec(before)) && !/\s{2}|^\s/.test(m[1])) [kind, len, q] = ["slash", m[1].length + 1, m[1]];
    else if ((m = /(?:^|\s)#([\w/-]{1,30})$/.exec(before))) [kind, len, q] = ["tag", m[1].length, m[1]];
    if (!kind) return closeMenu();
    // the cursor is in the middle of a word (e.g. inside "#high-yield"): no menu
    const after = rf.parent.textBetween(rf.parentOffset, Math.min(rf.parent.content.size, rf.parentOffset + 1), undefined, "￼");
    if (kind !== "link" && /[\w/-]/.test(after)) return closeMenu();
    const from = rf.pos - len;
    if (!typed && !(menu && menu.kind === kind && menu.from === from)) return closeMenu();
    const c = view.coordsAtPos(from);
    const up = c.bottom + 320 > window.innerHeight;
    if (!menu || menu.kind !== kind || menu.from !== from) sel = 0;
    menu = { kind, from, to: rf.pos, q, x: Math.min(c.left, window.innerWidth - 300), y: up ? c.top - 6 : c.bottom + 6, up };
  }
  function closeMenu() {
    if (menu) menu = null;
  }
  function choose(i: number) {
    const it = items[i];
    if (!it || !menu || !editor) return;
    const m = menu;
    menu = null;
    if (m.kind === "slash") {
      editor.chain().focus().deleteRange({ from: m.from, to: m.to }).run();
      (it as { run: () => void }).run();
    } else if (m.kind === "link") {
      const name = (it as { value: string }).value;
      // replace "[[query" (and a "]]" the user may have typed) with the link
      const after = editor.state.doc.textBetween(m.to, Math.min(m.to + 2, editor.state.selection.$from.end()));
      editor.chain().focus().insertContentAt({ from: m.from, to: m.to + (after === "]]" ? 2 : 0) }, [{ type: "wikilink", attrs: { target: name, alias: null } }, { type: "text", text: " " }]).run();
    } else {
      editor.chain().focus().insertContentAt({ from: m.from, to: m.to }, `${(it as { value: string }).value} `).run();
    }
  }

  // ---- block commands --------------------------------------------------------------------

  /** Change the current line's block type, keeping its text, indent and card id. */
  function turnInto(type: string, attrs: Record<string, unknown> = {}, at?: number) {
    if (!editor) return;
    const { state } = editor;
    const rp = at !== undefined ? state.doc.resolve(at + 1) : state.selection.$from;
    const node = rp.parent;
    if (!node.isTextblock) return;
    const pos = rp.before();
    const nt = state.schema.nodes[type];
    const keep = { sid: node.attrs.sid ?? null, ...(FLOW.includes(type) && FLOW.includes(node.type.name) ? { indent: node.attrs.indent ?? 0 } : {}) };
    const tr = node.type.spec.code ? state.tr.setBlockType(pos, pos + node.nodeSize, nt, { ...keep, ...attrs }) : state.tr.setNodeMarkup(pos, nt, { ...keep, ...attrs });
    editor.view.dispatch(tr);
    editor.commands.focus();
  }
  function insertAfter(json: JNode) {
    if (!editor) return;
    const { $from: rf } = editor.state.selection;
    const node = rf.parent;
    const pos = rf.before(rf.depth);
    if (node.isTextblock && !node.content.size && node.type.name === "paragraph") editor.chain().focus().insertContentAt({ from: pos, to: pos + node.nodeSize }, [json, { type: "paragraph" }]).run();
    else editor.chain().focus().insertContentAt(rf.after(rf.depth), [json, { type: "paragraph" }]).run();
  }
  // ---- columns ---------------------------------------------------------------------------------
  /** Is the cursor inside a column? (columns can't go inside columns) */
  function inColumn(): boolean {
    const rf = editor?.state.selection.$from;
    if (!rf) return false;
    for (let d = rf.depth; d > 0; d--) if (rf.node(d).type.name === "column") return true;
    return false;
  }
  /** "/2 columns": empty columns where the empty line was (or after the current line). */
  function insertColumns(n: number) {
    if (!editor || inColumn()) return;
    const { $from: rf } = editor.state.selection;
    // the block the cursor is in, at the level where columns can go (the page or a half)
    let d = 1;
    for (let k = rf.depth; k > 0; k--) if (rf.node(k - 1).type.name === "doc" || rf.node(k - 1).type.name === "pagecol") { d = k; break; }
    const top = rf.before(d);
    const node = editor.state.doc.nodeAt(top);
    if (!node) return;
    const json = { type: "columns", content: Array.from({ length: n }, () => ({ type: "column", content: [{ type: "paragraph" }] })) };
    const empty = node.type.name === "paragraph" && !node.content.size;
    const at = empty ? top : top + node.nodeSize;
    const chain = editor.chain().focus();
    if (empty) chain.insertContentAt({ from: top, to: top + node.nodeSize }, json);
    else chain.insertContentAt(at, json);
    chain.setTextSelection(at + 3).run();
  }
  /** Take the blocks out of their columns, one column after the other. */
  function unwrapColumns(pos: number) {
    if (!editor) return;
    const node = editor.state.doc.nodeAt(pos);
    if (node?.type.name !== "columns") return;
    const kids: PMNode[] = [];
    node.forEach((col) => col.forEach((b) => kids.push(b)));
    editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + node.nodeSize, kids));
  }
  /** The columns node a block at `pos` sits in (null for a top-level block). */
  function columnsOf(pos: number): number | null {
    if (!editor) return null;
    const rp = editor.state.doc.resolve(pos);
    for (let d = rp.depth; d > 0; d--) if (rp.node(d).type.name === "columns") return rp.before(d);
    return editor.state.doc.nodeAt(pos)?.type.name === "columns" ? pos : null;
  }

  // dragging a block next to another one makes columns (a bar shows where it will go)
  let sideDrop = $state<{ x: number; y: number; h: number } | null>(null);
  type Side = { pos: number; side: "left" | "right" };
  function sideTarget(e: DragEvent): Side | null {
    if (!editor) return null;
    const b = blockAt(e.clientX, e.clientY);
    if (!b || b.node.type.name === "columns" || b.node.type.name === "pages") return null;
    const r = b.dom.getBoundingClientRect();
    const side = e.clientX > r.right - 70 ? "right" : e.clientX < r.left + 14 ? "left" : null;
    if (!side) return null;
    const sel = editor.state.selection;
    if (sel instanceof NodeSelection && sel.from === b.pos) return null; // onto itself
    const cp = columnsOf(b.pos);
    if (cp !== null) {
      const cols = editor.state.doc.nodeAt(cp);
      const fromSame = sel instanceof NodeSelection && columnsOf(sel.from) === cp;
      if (cols && cols.childCount >= MAX_COLUMNS && !fromSame) return null;
    }
    return { pos: b.pos, side };
  }
  $effect(() => {
    // hide the usual line-between-blocks marker while a drop would make columns
    document.documentElement.classList.toggle("mosaic-sidedrop", !!sideDrop);
  });
  function showSide(e: DragEvent) {
    const t = sideTarget(e);
    if (!t || !editor) return (sideDrop = null);
    const dom = editor.view.nodeDOM(t.pos) as HTMLElement | null;
    if (!dom) return (sideDrop = null);
    const r = dom.getBoundingClientRect();
    const wr = wrap.getBoundingClientRect();
    sideDrop = { x: (t.side === "right" ? r.right + 6 : r.left - 8) - wr.left, y: r.top - wr.top, h: r.height };
  }
  /** A block plus the lines indented under it, moved up so the first one has no indent. */
  function withChildren(doc: PMNode, pos: number): { nodes: PMNode[]; end: number } {
    const node = doc.nodeAt(pos)!;
    const nodes: PMNode[] = [node];
    let end = pos + node.nodeSize;
    if (!("indent" in node.attrs)) return { nodes, end };
    const base = Number(node.attrs.indent ?? 0);
    const rp = doc.resolve(pos);
    for (let k = rp.index() + 1; k < rp.parent.childCount; k++) {
      const c = rp.parent.child(k);
      if (!("indent" in c.attrs) || Number(c.attrs.indent ?? 0) <= base) break;
      nodes.push(c);
      end += c.nodeSize;
    }
    return { nodes: nodes.map((c) => ("indent" in c.attrs ? c.type.create({ ...c.attrs, indent: Math.max(0, Number(c.attrs.indent ?? 0) - base) }, c.content, c.marks) : c)), end };
  }
  /** Drop beside a block: put both in columns (or add a column to the columns it is in). */
  function dropBeside(e: DragEvent): boolean {
    sideDrop = null;
    const t = sideTarget(e);
    if (!t || !editor) return false;
    const sel = editor.state.selection;
    if (!(sel instanceof NodeSelection)) return false;
    // the dragged line takes the lines indented under it along (like Notion)
    const { nodes: lifted, end } = withChildren(editor.state.doc, sel.from);
    // don't drop a block onto one of its own indented lines
    if (t.pos > sel.from && t.pos < end) return false;
    const schema = editor.schema;
    const tr = editor.state.tr.delete(sel.from, end);
    const tp = tr.mapping.map(t.pos);
    const target = tr.doc.nodeAt(tp);
    if (!target) return false;
    const rp = tr.doc.resolve(tp);
    const col = rp.depth >= 2 && rp.node(rp.depth).type.name === "column" ? rp.depth : -1;
    const newCol = schema.nodes.column.create(null, lifted);
    if (col < 0) {
      // the target keeps its indented lines too
      const group = withChildren(tr.doc, tp);
      const a = schema.nodes.column.create(null, group.nodes);
      tr.replaceWith(tp, group.end, schema.nodes.columns.create(null, t.side === "right" ? [a, newCol] : [newCol, a]));
    } else {
      const colPos = rp.before(col);
      const colNode = rp.node(col);
      const colsPos = rp.before(col - 1);
      tr.insert(t.side === "right" ? colPos + colNode.nodeSize : colPos, newCol);
      tr.setNodeMarkup(colsPos, undefined, { ...tr.doc.nodeAt(colsPos)!.attrs, w: null });
    }
    e.preventDefault();
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.dragging = null;
    dragging = false;
    return true;
  }

  function insertCloze() {
    if (!editor) return;
    const { empty } = editor.state.selection;
    if (!empty) editor.chain().focus().toggleMark("cloze").run();
    else {
      // placeholder comes in selected, so typing replaces it (and stays a cloze)
      const at = editor.state.selection.from;
      editor.chain().focus().insertContent({ type: "text", text: "hidden part", marks: [{ type: "cloze" }] }).setTextSelection({ from: at, to: at + 11 }).run();
    }
  }
  function tableCards() {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).updateAttributes("table", { cards: true }).run();
  }
  let fileInput: HTMLInputElement;
  function pickImage() {
    fileInput.value = "";
    fileInput.click();
  }
  function readImage(file: File) {
    const r = new FileReader();
    r.onload = async () => {
      const path = await onpasteimage(String(r.result), file.type.split("/")[1]?.replace("jpeg", "jpg") || "png");
      putImage(path);
    };
    r.readAsDataURL(file);
  }

  /** An image on its own line, at the indent of the line it was pasted on, then a fresh line to keep typing. */
  function putImage(src: string) {
    if (!editor) return;
    const { state } = editor;
    const rf = state.selection.$from;
    const node = rf.parent;
    const indent = node.attrs.indent ?? 0;
    const blank = FLOW.includes(node.type.name) && !node.content.size;
    const before = rf.before(rf.depth);
    const at = blank ? before : rf.after(rf.depth);
    const img = state.schema.nodes.image.create({ src, alt: "", indent });
    const para = state.schema.nodes.paragraph.create({ indent: FLOW.includes(node.type.name) ? indent : 0 });
    const tr = blank ? state.tr.replaceWith(at, at + node.nodeSize, [img, para]) : state.tr.insert(at, [img, para]);
    tr.setSelection(TextSelection.create(tr.doc, at + img.nodeSize + 1));
    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
  }

  /** "List flashcard": the line becomes the question, the bullets indented under it are the answer. */
  function listCard() {
    if (!editor) return;
    const { state } = editor;
    const rf = state.selection.$from;
    const node = rf.parent;
    if (!node.isTextblock || node.type.spec.code) return;
    let has = false;
    node.forEach((c) => (has ||= c.type.name === "arrow"));
    const end = rf.end();
    const indent = FLOW.includes(node.type.name) ? (node.attrs.indent ?? 0) : 0;
    const tr = state.tr;
    if (!has) tr.insert(end, state.schema.nodes.arrow.create({ two: false }));
    const after = tr.mapping.map(rf.after());
    tr.insert(after, state.schema.nodes.bullet.create({ indent: indent + 1 }));
    tr.setSelection(TextSelection.create(tr.doc, after + 1));
    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
  }

  // ---- clozes on one line: separate cards or one card -----------------------------------------
  function clozeRanges(pos: number) {
    const node = editor?.state.doc.nodeAt(pos);
    const out: { from: number; to: number; n: number | null; hint: string | null }[] = [];
    if (!node?.isTextblock) return out;
    node.forEach((c, off) => {
      const m = c.marks.find((x) => x.type.name === "cloze");
      if (!m) return;
      const from = pos + 1 + off;
      const last = out[out.length - 1];
      if (last && last.to === from && last.n === m.attrs.n && last.hint === m.attrs.hint) last.to = from + c.nodeSize;
      else out.push({ from, to: from + c.nodeSize, n: m.attrs.n, hint: m.attrs.hint });
    });
    return out;
  }
  function toggleTogether(pos: number) {
    if (!editor) return;
    const rs = clozeRanges(pos);
    const together = rs.length > 1 && rs.every((r) => r.n !== null && r.n === rs[0].n);
    const type = editor.schema.marks.cloze;
    const tr = editor.state.tr;
    for (const r of rs) tr.removeMark(r.from, r.to, type).addMark(r.from, r.to, type.create({ n: together ? null : 1, hint: r.hint }));
    editor.view.dispatch(tr);
  }

  // ---- pairing clozes: which card each hidden part belongs to -------------------------------------
  /** The cloze the cursor is in, on a line with two or more clozes. */
  const clozeBar = $derived.by(() => {
    void tick;
    if (!editor || !wrap) return null;
    const { state, view } = editor;
    const sel = state.selection;
    if (!sel.empty || !view.hasFocus()) return null;
    const rf = sel.$from;
    if (!rf.parent.isTextblock) return null;
    const type = state.schema.marks.cloze;
    const range = getMarkRange(rf, type) ?? (rf.pos > rf.start() ? getMarkRange(state.doc.resolve(rf.pos - 1), type) : undefined);
    if (!range) return null;
    const all = clozeRanges(rf.before());
    if (all.length < 2) return null;
    const me = all.find((r) => r.from <= range.from && r.to >= range.to);
    if (!me) return null;
    const groups = [...new Set(all.map((r) => r.n).filter((n): n is number => n !== null))].sort((a, b) => a - b);
    const c = view.coordsAtPos(me.from);
    const w = wrap.getBoundingClientRect();
    return { me, groups, next: (groups[groups.length - 1] ?? 0) + 1, x: c.left - w.left, y: c.top - w.top };
  });
  function setClozeGroup(r: { from: number; to: number; hint: string | null }, n: number | null) {
    if (!editor) return;
    const type = editor.schema.marks.cloze;
    editor.view.dispatch(editor.state.tr.removeMark(r.from, r.to, type).addMark(r.from, r.to, type.create({ n, hint: r.hint })));
    editor.commands.focus();
  }

  // ---- selection toolbar ---------------------------------------------------------------------
  let bubble = $state<{ x: number; y: number } | null>(null);
  // selected table cells: ONE rounded outline around the whole selected area, which glides as
  // the selection changes (the cells themselves only get a soft tint)
  // While she drags it snaps to the selection (no animation: smoothest, costs nothing); when the
  // selection jumps in one go (Ctrl+A growing, a click) it glides once, briefly.
  let cellBox = $state<{ x: number; y: number; w: number; h: number; glide: boolean } | null>(null);
  function placeCellBox() {
    if (!editor || !wrap) return;
    const sel = editor.state.selection;
    if (!(sel instanceof CellSelection)) {
      if (cellBox) cellBox = null;
      return;
    }
    const w = wrap.getBoundingClientRect();
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    sel.forEachCell((_n, pos) => {
      const dom = editor!.view.nodeDOM(pos) as HTMLElement | null;
      if (!dom) return;
      const c = dom.getBoundingClientRect();
      l = Math.min(l, c.left); t = Math.min(t, c.top); r = Math.max(r, c.right); b = Math.max(b, c.bottom);
    });
    if (l === Infinity) return (cellBox = null);
    cellBox = { x: l - w.left, y: t - w.top, w: r - l, h: b - t, glide: !!cellBox && !mouseDown };
  }
  let bubbleEl = $state<HTMLDivElement>();
  // the toolbar is centred over the selection; near an edge it slides over so all of it shows
  $effect(() => {
    if (!bubble || !bubbleEl || !wrap) return;
    const half = bubbleEl.offsetWidth / 2;
    const max = wrap.clientWidth - half - 6;
    const x = Math.max(half + 6, Math.min(bubble.x, max));
    if (Math.abs(x - bubble.x) > 1) bubble = { ...bubble, x };
  });
  let linkInput = $state<string | null>(null);
  let mouseDown = false;
  function placeBubble() {
    if (!editor) return;
    const { state, view } = editor;
    const s = state.selection;
    if (mouseDown) {
      if (linkInput === null) bubble = null;
      return;
    }
    if (s.empty || !(s instanceof TextSelection) || s.$from.parent.type.spec.code || !view.hasFocus()) {
      if (linkInput === null) bubble = null;
      return;
    }
    const a = view.coordsAtPos(s.from);
    const b = view.coordsAtPos(s.to);
    const r = wrap.getBoundingClientRect();
    bubble = { x: Math.max(8, Math.min((a.left + b.left) / 2 - r.left, r.width - 8)), y: Math.min(a.top, b.top) - r.top };
  }
  const active = (m: string, attrs?: Record<string, unknown>) => (void tick, editor?.isActive(m, attrs) ?? false);
  function makeCard(two = false) {
    if (!editor) return;
    const { state } = editor;
    const { from, to, $from: rf } = state.selection;
    // selected text at the start of the line = the question; otherwise it is the answer
    const at = rf.parentOffset === 0 ? to : from;
    let start = at;
    while (start > rf.start() && /\s/.test(state.doc.textBetween(start - 1, start))) start--;
    editor.chain().focus().insertContentAt({ from: start, to: at }, { type: "arrow", attrs: { two } }).run();
  }
  function noteLink() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to).trim();
    if (text) editor.chain().focus().insertContentAt({ from, to }, { type: "wikilink", attrs: { target: text, alias: null } }).run();
  }
  function setLink(href: string) {
    if (!editor) return;
    if (href.trim()) editor.chain().focus().extendMarkRange("link").setMark("link", { href: href.trim() }).run();
    else editor.chain().focus().extendMarkRange("link").unsetMark("link").run();
    linkInput = null;
  }

  // ---- block handle ------------------------------------------------------------------------
  let handle = $state<{ y: number; pos: number; h: number; x: number | null; stack?: boolean } | null>(null);
  /** the block the handle belongs to, in screen coordinates (to keep the handle while the mouse
   *  travels from the line to it, e.g. across the gap left of a column) */
  let handleFor: { left: number; top: number; bottom: number } | null = null;
  let blockMenu = $state<{ pos: number; y: number; x: number | null; type: string; clozes: number; together: boolean; cols: number | null; line: boolean; half: boolean } | null>(null);
  /** Nodes whose children get their own block handle: a column, a side-by-side half. */
  const HOLDERS = new Set(["column", "pagecol"]);
  /** The block under the mouse: a top-level block, or a block inside a column or half. */
  function blockAt(x: number, y: number): { pos: number; dom: HTMLElement; node: PMNode } | null {
    if (!editor) return null;
    const view = editor.view;
    const r = view.dom.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(view.dom).paddingLeft) || 0;
    const hit = view.posAtCoords({ left: Math.max(r.left + pad + 12, Math.min(x, r.right - pad - 12)), top: y });
    if (!hit) return null;
    const at = hit.inside >= 0 ? hit.inside : hit.pos;
    const rp = view.state.doc.resolve(at);
    let pos: number;
    if (rp.depth === 0) {
      const n = view.state.doc.nodeAt(at);
      if (!n) return null;
      pos = at;
      // between the blocks of a column row: the block at the inside position, if it's in a column
      if ((n.type.name === "columns" || n.type.name === "pages") && hit.inside >= 0 && hit.pos !== at) {
        const inner = view.state.doc.resolve(hit.pos);
        for (let d = inner.depth; d > 0; d--) {
          if (HOLDERS.has(inner.node(d - 1).type.name)) {
            pos = inner.before(d);
            break;
          }
        }
      }
    } else {
      pos = rp.before(1);
      for (let d = rp.depth; d > 0; d--) {
        if (HOLDERS.has(rp.node(d - 1).type.name)) {
          pos = rp.before(d);
          break;
        }
      }
      // inside a column / half itself (not in one of its blocks)
      if (HOLDERS.has(rp.node(rp.depth).type.name) && rp.depth >= 1) {
        const n = view.state.doc.nodeAt(at);
        if (n && n.type.name !== "column") pos = at;
      }
    }
    const node = view.state.doc.nodeAt(pos);
    const dom = view.nodeDOM(pos) as HTMLElement | null;
    if (!node || !dom || !(dom instanceof HTMLElement)) return null;
    // the two halves of a side-by-side note are the page, not a block: no handle for them
    if (node.type.name === "pages" || node.type.name === "pagecol") return null;
    return { pos, dom, node };
  }
  function onMove(e: MouseEvent) {
    if (blockMenu || dragging) return;
    if ((e.target as HTMLElement).closest?.(".handle")) return;
    // on the way from a line to its handle (the strip just left of the line): keep it
    if (handle && handleFor && e.clientY >= handleFor.top - 4 && e.clientY <= handleFor.bottom + 4 && e.clientX < handleFor.left + 8 && e.clientX > handleFor.left - 64) return;
    // (the stacked handle in a column sits 6–30px left of the text, inside that zone)
    const b = blockAt(e.clientX, e.clientY);
    if (!b) return;
    const wr = wrap.getBoundingClientRect();
    const br = b.dom.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(b.dom).lineHeight) || 26;
    // a block in a later column (stacked handle) or in the right half gets its handle just left of it
    const holder = b.dom.parentElement;
    const inCol = !!holder?.classList.contains("b-col");
    const inHalf = !!holder?.classList.contains("b-pagecol");
    const later = (inCol || inHalf) && !!holder?.previousElementSibling;
    handle = { y: br.top - wr.top + Math.min(br.height, lh) / 2, pos: b.pos, h: br.height, x: later ? br.left - wr.left - (inCol ? 30 : 52) : null, stack: later && inCol };
    handleFor = { left: br.left, top: br.top, bottom: br.top + Math.max(Math.min(br.height, lh), 26) };
  }
  let dragging = false;
  function dragStart(e: DragEvent) {
    if (!editor || !handle) return;
    const view = editor.view;
    const pos = handle.pos;
    const node = view.state.doc.nodeAt(pos);
    if (!node) return;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    const slice = view.state.selection.content();
    const dom = view.nodeDOM(pos) as HTMLElement | null;
    e.dataTransfer?.setData("text/plain", node.textContent);
    if (dom && e.dataTransfer) e.dataTransfer.setDragImage(dom, 0, 10);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    view.dragging = { slice, move: true };
    dragging = true;
  }
  function plus() {
    if (!editor || !handle) return;
    const node = editor.state.doc.nodeAt(handle.pos);
    if (!node) return;
    const after = handle.pos + node.nodeSize;
    if (node.type.name === "paragraph" && !node.content.size) editor.chain().focus().setTextSelection(handle.pos + 1).insertContent("/").run();
    else editor.chain().focus().insertContentAt(after, { type: "paragraph" }).setTextSelection(after + 1).insertContent("/").run();
  }
  function openBlockMenu() {
    if (!editor || !handle) return;
    const node = editor.state.doc.nodeAt(handle.pos);
    if (!node) return;
    const rs = clozeRanges(handle.pos);
    // x: beside the handle that opened it (a column's handle), else the usual spot left of the page
    const mx = handle.x !== null ? Math.max(0, Math.min(handle.x, wrap.clientWidth - 238)) : null;
    blockMenu = { pos: handle.pos, y: handle.y, x: mx, type: node.type.name, clozes: rs.length, together: rs.length > 1 && rs.every((r) => r.n !== null && r.n === rs[0].n), cols: columnsOf(handle.pos), line: false, half: false };
    { const rp = editor.state.doc.resolve(handle.pos); for (let d = rp.depth; d > 0; d--) if (rp.node(d).type.name === "pagecol") blockMenu.half = true; }
    if (blockMenu.cols !== null) blockMenu.line = !!editor.state.doc.nodeAt(blockMenu.cols)?.attrs.line;
  }
  function blockAction(a: string) {
    if (!editor || !blockMenu) return;
    const { pos } = blockMenu;
    const state = editor.state;
    const node = state.doc.nodeAt(pos);
    blockMenu = null;
    if (!node) return;
    if (a === "together") toggleTogether(pos);
    else if (a === "delete") editor.view.dispatch(state.tr.delete(pos, pos + node.nodeSize));
    else if (a === "dup") editor.view.dispatch(state.tr.insert(pos + node.nodeSize, node.type.create({ ...node.attrs, sid: null }, node.content, node.marks)));
    else if (a === "up" || a === "down") {
      const rp = state.doc.resolve(pos);
      const idx = rp.index();
      const parent = rp.parent;
      if (a === "up" && idx > 0) {
        const prev = parent.child(idx - 1);
        const tr = state.tr.delete(pos, pos + node.nodeSize).insert(pos - prev.nodeSize, node);
        editor.view.dispatch(tr);
      } else if (a === "down" && idx < parent.childCount - 1) {
        const next = parent.child(idx + 1);
        const tr = state.tr.delete(pos, pos + node.nodeSize).insert(pos + next.nodeSize, node);
        editor.view.dispatch(tr);
      }
    } else if (a === "cards") editor.view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, cards: !node.attrs.cards }));
    else if (a === "join") togglePages();
    else if (a === "colline") {
      const cp = columnsOf(pos);
      const cols = cp !== null ? state.doc.nodeAt(cp) : null;
      if (cp !== null && cols) editor.view.dispatch(state.tr.setNodeMarkup(cp, undefined, { ...cols.attrs, line: !cols.attrs.line }));
    } else if (a === "uncols") {
      const cp = columnsOf(pos);
      if (cp !== null) unwrapColumns(cp);
    } else if (a === "unwrap") editor.chain().setTextSelection(pos + 2).lift(node.type.name).run();
    else if (a === "source") addSource(pos);
    else if (a.startsWith("to:")) {
      const [, type, lvl] = a.split(":");
      turnInto(type, type === "heading" ? { level: Number(lvl) } : {}, pos);
    }
    editor.commands.focus();
  }

  let cellPick = $state(false);
  $effect(() => {
    if (!tableBar) cellPick = false;
  });
  /** The cells of the table the cursor is in, with their row and column. */
  function tableCells(): { pos: number; node: PMNode; row: number; col: number }[] {
    if (!editor || !tableBar) return [];
    const pos = tableBar.pos;
    const table = editor.state.doc.nodeAt(pos);
    if (!table) return [];
    const out: { pos: number; node: PMNode; row: number; col: number }[] = [];
    let rp = pos + 1;
    table.forEach((row, _o, r) => {
      let cp = rp + 1;
      row.forEach((cell, _o2, c) => {
        out.push({ pos: cp, node: cell, row: r, col: c });
        cp += cell.nodeSize;
      });
      rp += row.nodeSize;
    });
    return out;
  }
  /** Positions of the selected cells (all dragged-across cells, or the one with the cursor). */
  function selectedCellPositions(): Set<number> {
    const set = new Set<number>();
    if (!editor) return set;
    const sel = editor.state.selection;
    if (sel instanceof CellSelection) sel.forEachCell((_n, p) => set.add(p));
    else {
      const rf = sel.$from;
      for (let d = rf.depth; d > 0; d--) {
        const n = rf.node(d).type.name;
        if (n === "tableCell" || n === "tableHeader") {
          set.add(rf.before(d));
          break;
        }
      }
    }
    return set;
  }
  /** Colour (or clear, with null) EVERY selected cell, whatever colour each had before. */
  function setCellsBg(bg: string | null) {
    if (!editor) return;
    const tr = editor.state.tr;
    const sel = selectedCellPositions();
    for (const c of tableCells()) if (sel.has(c.pos) && (c.node.attrs.bg ?? null) !== bg) tr.setNodeMarkup(c.pos, undefined, { ...c.node.attrs, bg });
    if (tr.docChanged) editor.view.dispatch(tr);
    editor.commands.focus();
  }
  /** Even out (like Google Docs' "distribute columns"): the selected columns, or every column when
   *  only the cursor is in the table, share the space left equally. Columns she sized and didn't
   *  select keep their width. */
  function evenOut() {
    if (!editor || !tableBar) return;
    const cells = tableCells();
    const sel = editor.state.selection;
    let cols: Set<number>;
    if (sel instanceof CellSelection) {
      const picked = selectedCellPositions();
      cols = new Set(cells.filter((c) => picked.has(c.pos)).map((c) => c.col));
    } else cols = new Set(cells.map((c) => c.col));
    const tr = editor.state.tr;
    for (const c of cells) if (cols.has(c.col) && c.node.attrs.colwidth) tr.setNodeMarkup(c.pos, undefined, { ...c.node.attrs, colwidth: null });
    if (tr.docChanged) editor.view.dispatch(tr);
    editor.commands.focus();
  }

  // ---- callouts and quotes ------------------------------------------------------------------------
  let calloutMenu = $state<{ pos: number; x: number; y: number } | null>(null);
  function setCalloutKind(kind: string) {
    if (!editor || !calloutMenu) return;
    const node = editor.state.doc.nodeAt(calloutMenu.pos);
    if (node?.type.name === "callout") editor.view.dispatch(editor.state.tr.setNodeMarkup(calloutMenu.pos, undefined, { ...node.attrs, kind }));
    calloutMenu = null;
    editor.commands.focus();
  }
  /** A source line at the end of a quote ("— Pharmacotherapy, ch. 4"). */
  function addSource(pos: number) {
    if (!editor) return;
    const node = editor.state.doc.nodeAt(pos);
    if (node?.type.name !== "blockquote") return;
    const end = pos + node.nodeSize - 1;
    const tr = editor.state.tr.insert(end, editor.schema.nodes.paragraph.create(null, editor.schema.text("— ")));
    tr.setSelection(TextSelection.create(tr.doc, end + 3));
    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
  }
  function quoteWithSource() {
    if (!editor) return;
    editor.chain().focus().wrapIn("blockquote").run();
    const rf = editor.state.selection.$from;
    for (let d = rf.depth; d > 0; d--) {
      if (rf.node(d).type.name === "blockquote") {
        const pos = rf.before(d);
        const tr = editor.state.tr.insert(pos + rf.node(d).nodeSize - 1, editor.schema.nodes.paragraph.create(null, editor.schema.text("— ")));
        editor.view.dispatch(tr);
        break;
      }
    }
  }

  // ---- table toolbar ---------------------------------------------------------------------------
  const tableBar = $derived.by(() => {
    void tick;
    if (!editor) return null;
    const { $from: rf } = editor.state.selection;
    for (let d = rf.depth; d > 0; d--) {
      const n = rf.node(d);
      if (n.type.name === "table") {
        const dom = editor.view.nodeDOM(rf.before(d)) as HTMLElement | null;
        if (!dom || !wrap) return null;
        const r = dom.getBoundingClientRect();
        const w = wrap.getBoundingClientRect();
        let sized = false;
        n.descendants((c) => {
          if (Array.isArray(c.attrs.colwidth) && c.attrs.colwidth.some((x: unknown) => typeof x === "number")) sized = true;
          return !sized && c.type.name === "tableRow";
        });
        return { y: r.top - w.top, x: r.left - w.left, cards: !!n.attrs.cards, pos: rf.before(d), sized };
      }
    }
    return null;
  });

  // ---- lifecycle -----------------------------------------------------------------------------
  onMount(() => {
    editor = new Editor({
      element: host,
      extensions: mosaicExtensions({
        imageUrl,
        onOpenLink: (t) => onopenlink(t),
        onCalloutMenu: (pos, rect) => {
          const w = wrap.getBoundingClientRect();
          calloutMenu = { pos, x: rect.left - w.left, y: rect.bottom - w.top + 6 };
        },
        onOpenUrl: (h) => window.open(h, "_blank"),
      }),
      content: mdToDoc(value),
      editorProps: {
        attributes: { class: "mosaic-doc", spellcheck: "true" },
        handleDrop: (_v, e, _slice, moved) => moved && dropBeside(e as DragEvent),
        handleDOMEvents: {
          // a click in the empty space under a column's text writes on in THAT column (newspaper)
          mousedown: (view, e) => {
            const t = e.target as HTMLElement;
            if (e.button !== 0) return false;
            // below everything, when the last thing is a row of columns: a new full-width line there
            const holderBelow = t === view.dom ? view.state.doc : null;
            const halfBelow = t.classList?.contains("b-pagecol") ? t : null;
            if (holderBelow || halfBelow) {
              const at = holderBelow ? -1 : view.posAtDOM(t, 0);
              const parent = holderBelow ?? view.state.doc.resolve(at).parent;
              const last = parent.lastChild;
              const lastDom = last && (t.lastElementChild as HTMLElement | null);
              if (last && last.type.name === "columns" && lastDom && e.clientY > lastDom.getBoundingClientRect().bottom) {
                const end = holderBelow ? view.state.doc.content.size : view.state.doc.resolve(at).end();
                const tr = view.state.tr.insert(end, view.state.schema.nodes.paragraph.create());
                tr.setSelection(TextSelection.create(tr.doc, end + 1));
                e.preventDefault();
                view.focus();
                view.dispatch(tr.scrollIntoView());
                return true;
              }
            }
            if (!(t.classList?.contains("b-col") || t.classList?.contains("b-pagecol"))) return false;
            const at = view.posAtDOM(t, 0);
            const rp = view.state.doc.resolve(at);
            const end = rp.end(rp.depth);
            e.preventDefault();
            view.focus();
            view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(end), -1)).scrollIntoView());
            return true;
          },
          dragover: (_v, e) => {
            showSide(e as DragEvent);
            return false;
          },
        },
        handleKeyDown: (_v, e) => {
          if (blockMenu && e.key === "Escape") {
            blockMenu = null;
            return true;
          }
          if (!menu || !items.length) {
            if (menu && e.key === "Escape") {
              menu = null;
              return true;
            }
            return false;
          }
          if (e.key === "ArrowDown") sel = (sel + 1) % items.length;
          else if (e.key === "ArrowUp") sel = (sel - 1 + items.length) % items.length;
          else if (e.key === "Enter" || e.key === "Tab") choose(sel);
          else if (e.key === "Escape") menu = null;
          else return false;
          return true;
        },
        handlePaste: (view, e) => {
          const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
          if (file) {
            e.preventDefault();
            readImage(file);
            return true;
          }
          const inCode = view.state.selection.$from.parent.type.spec.code;
          if (inCode) return false;
          const html = e.clipboardData?.getData("text/html") ?? "";
          const plain = e.clipboardData?.getData("text/plain") ?? "";
          // copied from inside the editor: let ProseMirror keep the blocks as they are
          if (/data-pm-slice/.test(html)) return false;
          let md = "";
          if (html && richHtml(html)) md = htmlToMd(html);
          else if (/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|\|.*\|)|\*\*|\[\[|\{\{|\s::\s|==\S|<mark\b/im.test(plain)) md = plain;
          if (!md) return false;
          const doc = mdToDoc(md);
          editor?.chain().focus().insertContent(doc.content ?? []).run();
          return true;
        },
        clipboardTextSerializer: (slice) => {
          const json = slice.content.toJSON() as JNode[];
          if (!json?.length) return "";
          if (!slice.content.firstChild?.isBlock) return docToMd({ type: "doc", content: [{ type: "paragraph", content: json }] }).md.trimEnd();
          return docToMd({ type: "doc", content: json }).md.trimEnd();
        },
      },
      // Editor events can fire while Svelte is rebuilding the page (focus leaves as a note closes),
      // and page state can't change mid-rebuild: pass them on right after (a microtask, before paint).
      onTransaction: ({ transaction }) => {
        if (closing) return; // the editor's own last updates while it closes
        if (transaction.docChanged) dirty = true;
        const changed = transaction.docChanged;
        queueMicrotask(() => {
          if (closing || !editor || editor.isDestroyed) return;
          tick++;
          detectMenu(changed);
          placeBubble();
          placeCellBox();
          if (changed) onchange();
        });
      },
      onFocus: () => queueMicrotask(() => !closing && onfocuschange?.(true)),
      onBlur: () => {
        queueMicrotask(() => !closing && onfocuschange?.(false));
        setTimeout(() => {
          if (!editor || editor.isDestroyed) return;
          if (!editor.view.hasFocus() && linkInput === null) bubble = null;
        }, 150);
      },
    });
  });
  // the page is going away (another note or page): hand over what wasn't saved yet
  let dirty = false;
  let closing = false;
  const leave = untrack(() => onleave);
  onDestroy(() => {
    closing = true;
    if (editor && !editor.isDestroyed && dirty && leave) {
      try {
        leave(docToMd(editor.getJSON() as JNode).md);
      } catch (e) {
        console.error("saving on leave", e);
      }
    }
    editor?.destroy();
  });

  // ---- for the page -------------------------------------------------------------------------
  let lastOwners: ReturnType<typeof docToMd>["owners"] = [];
  /** The note as Markdown (front matter and title not included). */
  export function markdown(): string {
    if (!editor) return value;
    const r = docToMd(editor.getJSON() as JNode);
    lastOwners = r.owners;
    dirty = false;
    return r.md;
  }
  const posOfPath = (path: number[]): number | null => {
    if (!editor) return null;
    let node: PMNode = editor.state.doc;
    let pos = 0;
    for (let d = 0; d < path.length; d++) {
      const idx = path[d];
      if (idx >= node.childCount) return null;
      for (let k = 0; k < idx; k++) pos += node.child(k).nodeSize;
      if (d < path.length - 1) {
        node = node.child(idx);
        pos += 1;
      }
    }
    return pos;
  };
  /** Give card lines their ids (from `assignIds` on the last `markdown()`): sets the hidden attr. */
  export function setIds(inserted: { line: number; text: string }[]) {
    if (!editor || !inserted.length) return;
    const tr = editor.state.tr;
    for (const x of inserted) {
      const o = lastOwners.find((o) => o.line === x.line);
      const id = /sd:([a-z0-9]+)/.exec(x.text)?.[1];
      if (!o || !id) continue;
      const pos = posOfPath(o.path);
      const node = pos !== null ? tr.doc.nodeAt(pos) : null;
      if (pos !== null && node && "sid" in node.attrs) tr.setNodeMarkup(pos, undefined, { ...node.attrs, sid: id });
    }
    tr.setMeta("addToHistory", false);
    if (tr.docChanged) editor.view.dispatch(tr);
  }
  /** Scroll to the block on (or just before) a line of the Markdown. */
  export function gotoLine(line: number) {
    if (!editor) return;
    markdown();
    const o = [...lastOwners].reverse().find((o) => o.line <= line);
    const pos = o ? posOfPath(o.path) : 0;
    if (pos === null) return;
    const node = editor.state.doc.nodeAt(pos);
    const inside = node?.isTextblock ? pos + 1 + node.content.size : pos + 1;
    editor.chain().focus().setTextSelection(Math.min(inside, editor.state.doc.content.size)).scrollIntoView().run();
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    dom?.scrollIntoView({ block: "center", behavior: "smooth" });
    dom?.classList.add("b-flash");
    setTimeout(() => dom?.classList.remove("b-flash"), 1400);
  }
  /** Jump to the n-th heading with this text. */
  export function gotoHeading(text: string, nth = 0) {
    if (!editor) return;
    let k = 0;
    let found = -1;
    editor.state.doc.descendants((n, pos) => {
      if (found >= 0) return false;
      if (n.type.name === "heading" && n.textContent.trim() === text.trim() && k++ === nth) found = pos;
      return !n.isTextblock;
    });
    if (found < 0) return;
    editor.chain().focus().setTextSelection(found + 1).run();
    (editor.view.nodeDOM(found) as HTMLElement | null)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }
  export function run(cmd: string, arg?: string) {
    if (!editor) return;
    const c = editor.chain().focus();
    if (cmd === "mark") c.toggleMark(arg!).run();
    else if (cmd === "hl") (arg === "yellow" ? c.toggleMark("highlight", { color: null }) : c.toggleMark("highlight", { color: arg })).run();
    else if (cmd === "hl-off") c.unsetMark("highlight").run();
    else if (cmd === "block") {
      const [t, l] = (arg ?? "paragraph").split(":");
      turnInto(t, t === "heading" ? { level: Number(l) } : {});
    } else {
      const it = slashItems().find((s) => s.id === cmd) ?? (cmd.startsWith("c-") ? slashItems().find((s) => s.id.startsWith("c-")) : undefined);
      it?.run();
    }
  }
  /** Side by side: is the note split into two halves? */
  export function hasPages(): boolean {
    let found = false;
    editor?.state.doc.forEach((n) => void (n.type.name === "pages" && (found = true)));
    return found;
  }
  /** Side by side on: everything so far goes in the left half, the right half starts empty.
   *  Off: the left half, then the right half, back on one page. */
  export function togglePages() {
    if (!editor) return;
    const { state, schema } = editor;
    let at = -1;
    state.doc.forEach((n, pos) => void (n.type.name === "pages" && at < 0 && (at = pos)));
    const tr = state.tr;
    if (at >= 0) {
      const pages = state.doc.nodeAt(at)!;
      const kids: PMNode[] = [];
      pages.forEach((half) => half.forEach((b) => kids.push(b)));
      tr.replaceWith(at, at + pages.nodeSize, kids);
    } else {
      const all: PMNode[] = [];
      state.doc.forEach((n) => all.push(n));
      const left = schema.nodes.pagecol.create(null, all);
      const right = schema.nodes.pagecol.create(null, schema.nodes.paragraph.create());
      tr.replaceWith(0, state.doc.content.size, schema.nodes.pages.create(null, [left, right]));
    }
    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
  }
  export function focus() {
    editor?.commands.focus();
  }
</script>

<svelte:window onmouseup={() => { if (mouseDown) { mouseDown = false; setTimeout(placeBubble, 0); } }} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="bwrap" bind:this={wrap} onmousemove={onMove} onmousedown={(e) => { if ((e.target as HTMLElement).closest(".mosaic-doc")) mouseDown = true; }} onmouseleave={() => !blockMenu && (handle = null)}>
  <div class="bhost" bind:this={host}></div>

  {#if cellBox}<div class="cellbox" class:glide={cellBox.glide} style="transform: translate({cellBox.x}px, {cellBox.y}px); width: {cellBox.w}px; height: {cellBox.h}px" aria-hidden="true"></div>{/if}
  {#if sideDrop}<div class="sidedrop" style="left: {sideDrop.x}px; top: {sideDrop.y}px; height: {sideDrop.h}px" aria-hidden="true"></div>{/if}
  {#if handle && !blockMenu}
    <!-- in a column after the first, + and ⠿ stack so the handle fits in the gap (and clears the divider line) -->
    <div class="handle" class:stack={!!handle.stack} style="top: {handle.y}px{handle.x !== null ? `; left: ${handle.x}px` : ''}">
      <button type="button" class="hb" title="Add a block below" aria-label="Add a block below" onmousedown={(e) => e.preventDefault()} onclick={plus}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none" /></svg></button>
      <button type="button" class="hb grip" title="Drag to move · click for options" aria-label="Block options" draggable="true"
        ondragstart={dragStart} ondragend={() => { dragging = false; sideDrop = null; }} onclick={openBlockMenu}><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><g fill="currentColor"><circle cx="5.5" cy="3.5" r="1.4" /><circle cx="10.5" cy="3.5" r="1.4" /><circle cx="5.5" cy="8" r="1.4" /><circle cx="10.5" cy="8" r="1.4" /><circle cx="5.5" cy="12.5" r="1.4" /><circle cx="10.5" cy="12.5" r="1.4" /></g></svg></button>
    </div>
  {/if}

  {#if blockMenu}
    <button type="button" class="scrim" aria-label="Close" onclick={() => (blockMenu = null)}></button>
    <div class="menu bmenu" style="top: {blockMenu.y + 14}px{blockMenu.x !== null ? `; left: ${blockMenu.x}px` : ''}" role="menu" data-type={blockMenu.type}>
      {#if FLOW.includes(blockMenu.type) || blockMenu.type === "heading" || blockMenu.type === "codeBlock"}
        <div class="mh">Turn into</div>
        <div class="turn">
          {#each [["to:paragraph", "¶", "Text"], ["to:heading:1", "H1", "Heading 1"], ["to:heading:2", "H2", "Heading 2"], ["to:heading:3", "H3", "Heading 3"], ["to:bullet", "•", "Bullet"], ["to:ordered", "1.", "Numbered"], ["to:todo", "☐", "To-do"]] as [a, i, l]}
            <button type="button" title={l} aria-label={l} onclick={() => blockAction(a)}>{i}</button>
          {/each}
        </div>
      {/if}
      {#if blockMenu.type === "table"}
        <button type="button" class="mi" onclick={() => blockAction("cards")}><span class="ic">▦→</span>Flashcards from this table</button>
      {/if}
      {#if blockMenu.clozes > 1}
        <div class="mh">{blockMenu.clozes} clozes on this line</div>
        <div class="opt">
          <button type="button" class:on={!blockMenu.together} onclick={() => blockMenu?.together && blockAction("together")}>One card each</button>
          <button type="button" class:on={blockMenu.together} onclick={() => !blockMenu?.together && blockAction("together")}>All in one card</button>
        </div>
      {/if}
      {#if blockMenu.type === "blockquote"}
        <button type="button" class="mi" onclick={() => blockAction("source")}><span class="ic">—</span>Add a source line</button>
      {/if}
      {#if blockMenu.type === "blockquote" || blockMenu.type === "callout"}
        <button type="button" class="mi" onclick={() => blockAction("unwrap")}><span class="ic">¶</span>Back to plain text</button>
        <button type="button" class="mi" onclick={() => { blockMenu = null; styleManager.tab = "callouts"; styleManager.open = true; }}><span class="ic">🎨</span>Edit callout and quote styles…</button>
      {/if}
      {#if blockMenu.half}
        <button type="button" class="mi" onclick={() => blockAction("join")}><span class="ic">▤</span>Join halves into one page (left, then right)</button>
      {/if}
      {#if blockMenu.cols !== null}
        <button type="button" class="mi" role="menuitemcheckbox" aria-checked={blockMenu.line} onclick={() => blockAction("colline")}><span class="ic">{blockMenu.line ? "✓" : "│"}</span>Divider line between columns</button>
        <button type="button" class="mi" onclick={() => blockAction("uncols")}><span class="ic">▤</span>Remove columns (keep everything)</button>
      {/if}
      <button type="button" class="mi" onclick={() => blockAction("up")}><span class="ic">↑</span>Move up</button>
      <button type="button" class="mi" onclick={() => blockAction("down")}><span class="ic">↓</span>Move down</button>
      <button type="button" class="mi" onclick={() => blockAction("dup")}><span class="ic">⧉</span>Duplicate</button>
      <button type="button" class="mi del" onclick={() => blockAction("delete")}><span class="ic">✕</span>Delete</button>
    </div>
  {/if}

  {#if bubble && !menu}
    <div class="bubble" bind:this={bubbleEl} style="left: {bubble.x}px; top: {bubble.y}px" role="toolbar" tabindex="-1" aria-label="Format selection" onmousedown={(e) => { if (!(e.target as HTMLElement).closest("input")) e.preventDefault(); }}>
      {#if linkInput !== null}
        <!-- svelte-ignore a11y_autofocus -->
        <input class="lin" autofocus placeholder="Paste a web link, Enter" bind:value={linkInput}
          onkeydown={(e) => { if (e.key === "Enter") setLink(linkInput ?? ""); if (e.key === "Escape") { linkInput = null; editor?.commands.focus(); } }} />
      {:else}
        <button type="button" class:on={active("bold")} title="Bold (Ctrl+B)" onclick={() => run("mark", "bold")}><b>B</b></button>
        <button type="button" class:on={active("italic")} title="Italic (Ctrl+I)" onclick={() => run("mark", "italic")}><i>I</i></button>
        <button type="button" class:on={active("strike")} title="Strike (Ctrl+Shift+X)" onclick={() => run("mark", "strike")}><s>S</s></button>
        <button type="button" class:on={active("code")} title="Code (Ctrl+E)" onclick={() => run("mark", "code")}>{"</>"}</button>
        <span class="sw">
          {#each activePalette() as c, i (c)}
            <button type="button" class="dot" data-color={c} title="{hlColor(c)?.label ?? c} (Ctrl+Shift+{i + 1})" aria-label="Highlight {hlColor(c)?.label ?? c}" onclick={() => run("hl", c)}></button>
          {/each}
          <button type="button" class="dot none" title="No highlight (Ctrl+Shift+0)" aria-label="Remove highlight" onclick={() => run("hl-off")}></button>
          <button type="button" class="pal" title="Highlight colours and palettes" aria-label="Highlight colours and palettes" onclick={() => { styleManager.tab = "highlights"; styleManager.open = true; }}>🎨</button>
        </span>
        <span class="sep"></span>
        <!-- the same icons as the main toolbar: → card, ⇄ two-way card, { } cloze -->
        <button type="button" class="study" title="Flashcard: question → this answer" aria-label="Make a flashcard" onclick={() => makeCard()}>→</button>
        <button type="button" class="study" title="Two-way flashcard: question ⇄ this answer" aria-label="Make a two-way flashcard" onclick={() => makeCard(true)}>⇄</button>
        <button type="button" class="study" class:on={active("cloze")} title="Cloze: hide this part" aria-label="Cloze" onclick={() => run("mark", "cloze")}>{"{ }"}</button>
        <span class="sep"></span>
        <button type="button" title="Link to a note with this name" onclick={noteLink}>[[ ]]</button>
        <button type="button" class:on={active("link")} title="Web link" onclick={() => (linkInput = editor?.getAttributes("link").href ?? "")}>🔗</button>
      {/if}
    </div>
  {/if}

  {#if calloutMenu}
    <button type="button" class="scrim" aria-label="Close" onclick={() => (calloutMenu = null)}></button>
    <div class="menu cmenu" style="left: {calloutMenu.x}px; top: {calloutMenu.y}px" role="menu">
      <div class="mh">Callout type</div>
      {#each visibleCallouts() as [k, t] (k)}
        <button type="button" class="mi" class:on={editor?.state.doc.nodeAt(calloutMenu.pos)?.attrs.kind === k} onclick={() => setCalloutKind(k)}>
          <span class="ic" style="background: color-mix(in srgb, {t.color} 60%, white)">{t.icon}</span>{t.label}
        </button>
      {/each}
      <button type="button" class="mi edit" onclick={() => { calloutMenu = null; styleManager.tab = "callouts"; styleManager.open = true; }}><span class="ic">🎨</span>Edit styles…</button>
    </div>
  {/if}

  {#if clozeBar && !bubble && !menu}
    <div class="cbar" style="left: {clozeBar.x}px; top: {clozeBar.y}px" role="toolbar" tabindex="-1" aria-label="Which card hides this part" onmousedown={(e) => e.preventDefault()}>
      <span class="grp">Hide with</span>
      <button type="button" class:on={clozeBar.me.n === null} title="Its own card" onclick={() => setClozeGroup(clozeBar.me, null)}>Own card</button>
      {#each clozeBar.groups as g}
        <button type="button" class="num" class:on={clozeBar.me.n === g} title="Hidden together with the other parts marked {g}" onclick={() => setClozeGroup(clozeBar.me, g)}>{g}</button>
      {/each}
      <button type="button" class="num new" title="Start a new card with this part" onclick={() => setClozeGroup(clozeBar.me, clozeBar.next)}>+</button>
    </div>
  {/if}

  {#if tableBar}
    <div class="tbar" style="top: {tableBar.y}px; left: {tableBar.x}px" onmousedown={(e) => e.preventDefault()} role="toolbar" tabindex="-1" aria-label="Table">
      <span class="grp">Row</span>
      <button type="button" title="Add a row above" aria-label="Add a row above" onclick={() => editor?.chain().focus().addRowBefore().run()}>↑+</button>
      <button type="button" title="Add a row below" aria-label="Add a row below" onclick={() => editor?.chain().focus().addRowAfter().run()}>↓+</button>
      <button type="button" title="Delete this row" aria-label="Delete this row" onclick={() => editor?.chain().focus().deleteRow().run()}>−</button>
      <span class="sep"></span>
      <span class="grp">Column</span>
      <button type="button" title="Add a column to the left" aria-label="Add a column to the left" onclick={() => editor?.chain().focus().addColumnBefore().run()}>←+</button>
      <button type="button" title="Add a column to the right" aria-label="Add a column to the right" onclick={() => editor?.chain().focus().addColumnAfter().run()}>→+</button>
      <button type="button" title="Delete this column" aria-label="Delete this column" onclick={() => editor?.chain().focus().deleteColumn().run()}>−</button>
      <span class="sep"></span>
      <span class="cwrap">
        <button type="button" title="Cell colour (select several cells by dragging across them)" aria-label="Cell colour" aria-expanded={cellPick} onclick={() => (cellPick = !cellPick)}>🎨 Colour</button>
        {#if cellPick}
          <span class="cpop" role="menu">
            {#each hlColors() as [k, c] (k)}
              <button type="button" class="dot" style="background: {c.color}" title={c.label} aria-label={c.label} onclick={() => { setCellsBg(k); cellPick = false; }}></button>
            {/each}
            <button type="button" class="dot none" title="No colour" aria-label="No colour" onclick={() => { setCellsBg(null); cellPick = false; }}></button>
          </span>
        {/if}
      </span>
      {#if tableBar.sized}
        <button type="button" title="Even out: the selected columns (drag across their cells) share the space equally; with nothing selected, all columns do. Columns you sized and didn't select keep their width." onclick={evenOut}>⇔ Even out</button>
      {/if}
      <span class="sep"></span>
      <button type="button" class="study" class:on={tableBar.cards} onclick={() => editor?.chain().focus().updateAttributes("table", { cards: !tableBar.cards }).run()}>{tableBar.cards ? "✓ " : ""}Flashcards</button>
      <button type="button" onclick={() => editor?.chain().focus().deleteTable().run()} title="Delete table">✕</button>
    </div>
  {/if}

  <input type="file" accept="image/*" hidden bind:this={fileInput} onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) readImage(f); }} />
</div>

{#if menu && items.length}
  <div class="menu pop" class:up={menu.up} bind:this={menuEl} style="left: {menu.x}px; top: {menu.y}px" role="listbox" aria-label="Suggestions">
    {#each items as it, i (it.id)}
      {#if menu.kind === "slash" && it.group && (i === 0 || items[i - 1].group !== it.group)}<div class="mh">{it.group}</div>{/if}
      <button type="button" class="mi" class:on={i === sel} role="option" aria-selected={i === sel} onmousedown={(e) => { e.preventDefault(); choose(i); }} onmouseenter={() => (sel = i)}>
        <span class="ic">{it.icon}</span><span class="lb">{it.label}{#if it.hint}<small>{it.hint}</small>{/if}</span>{#if it.keys}<kbd>{it.keys}</kbd>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .bwrap {
    position: relative;
    min-height: 100%;
  }
  .bhost {
    min-height: 100%;
  }
  .handle.stack {
    flex-direction: column;
    gap: 0;
  }
  .handle.stack .hb {
    height: 22px;
  }
  .cellbox {
    position: absolute;
    left: 0;
    top: 0;
    z-index: 2;
    border-radius: 10px;
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--lavender, #c9b8f0) 75%, var(--link-ink, #5b45b3)),
      0 6px 18px -8px color-mix(in srgb, var(--lavender, #c9b8f0) 90%, transparent);
    pointer-events: none;
    /* appears with a fade (once, when a selection starts) */
    animation: cellboxin 0.15s var(--ease-out, ease) backwards;
  }
  .cellbox.glide {
    transition: transform 0.12s var(--ease-out, ease), width 0.12s var(--ease-out, ease), height 0.12s var(--ease-out, ease);
  }
  @keyframes cellboxin {
    from {
      opacity: 0;
    }
  }
  .sidedrop {
    position: absolute;
    z-index: 4;
    width: 4px;
    margin-left: -2px;
    border-radius: 4px;
    background: var(--lavender, #c9b8f0);
    box-shadow: 0 0 10px color-mix(in srgb, var(--lavender, #c9b8f0) 80%, transparent);
    pointer-events: none;
  }
  :global(html.mosaic-sidedrop .prosemirror-dropcursor-block) {
    display: none;
  }
  .handle {
    position: absolute;
    /* 52px left of the text, wherever the page width puts it (NotesView sets --note-box / --doc-pad) */
    left: max(0px, calc(50% - min(var(--note-box, 780px), 100%) / 2 + var(--doc-pad, 40px) - 52px));
    display: flex;
    gap: 1px;
    transform: translateY(-50%);
    z-index: 3;
    animation: fadein 0.15s var(--ease-out, ease) backwards;
  }
  /* both handle buttons draw an icon centred in the same box, so + and the grip line up exactly */
  .hb {
    display: grid;
    place-items: center;
    width: 24px;
    height: 26px;
    border: 0;
    border-radius: 7px;
    background: none;
    color: var(--text-muted);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    padding: 0;
  }
  .hb:hover {
    background: var(--chip);
    color: var(--text);
  }
  .grip {
    cursor: grab;
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 4;
    border: 0;
    background: none;
    cursor: default;
  }
  .menu {
    z-index: 50;
    display: grid;
    gap: 1px;
    padding: 6px;
    border-radius: 16px;
    background: var(--surface-float, var(--surface));
    box-shadow: var(--shadow-lift);
    border: var(--edge, 0);
    animation: pop 0.18s var(--spring, ease) backwards;
  }
  .pop {
    position: fixed;
    width: 280px;
    max-height: 320px;
    overflow-y: auto;
  }
  .pop.up {
    transform: translateY(-100%);
  }
  .cwrap {
    position: relative;
  }
  .cpop {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 7;
    display: grid;
    grid-template-columns: repeat(7, 22px);
    gap: 6px;
    padding: 8px;
    border-radius: 14px;
    background: var(--surface-float, var(--surface));
    box-shadow: var(--shadow-lift);
    border: var(--edge, 0);
    animation: pop 0.16s var(--spring, ease) backwards;
  }
  .tbar .cpop .dot {
    min-width: 0;
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--charcoal) 12%, transparent);
  }
  .tbar .cpop .dot.none {
    background: linear-gradient(135deg, transparent 44%, var(--alert-ink) 45% 55%, transparent 56%), var(--surface);
  }
  .cmenu {
    position: absolute;
    z-index: 6;
    width: 230px;
    max-height: 360px;
    overflow-y: auto;
  }
  .cmenu .edit {
    margin-top: 4px;
    border-top: 1px solid var(--hairline);
    border-radius: 0 0 10px 10px;
  }
  .bmenu {
    position: absolute;
    /* 52px left of the text, wherever the page width puts it (NotesView sets --note-box / --doc-pad) */
    left: max(0px, calc(50% - min(var(--note-box, 780px), 100%) / 2 + var(--doc-pad, 40px) - 52px));
    width: 230px;
    z-index: 5;
  }
  .mh {
    padding: 8px 10px 4px;
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-muted);
  }
  .mi {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 38px;
    padding: 4px 8px;
    border: 0;
    border-radius: 10px;
    background: none;
    font: inherit;
    font-size: 14px;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .mi.on,
  .mi:hover {
    background: color-mix(in srgb, var(--lavender) 30%, transparent);
  }
  .mi.del {
    color: var(--alert-ink);
  }
  .ic {
    display: grid;
    place-items: center;
    flex: none;
    min-width: 30px;
    height: 30px;
    padding: 0 4px;
    border-radius: 9px;
    background: var(--panel);
    font-size: 13px;
    font-weight: 700;
  }
  .lb {
    flex: 1;
    display: grid;
    line-height: 1.25;
  }
  .lb small {
    font-size: 12px;
    color: var(--text-muted);
  }
  kbd {
    font: inherit;
    font-size: 11.5px;
    color: var(--text-muted);
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--panel);
  }
  .opt {
    display: flex;
    gap: 2px;
    margin: 0 4px 6px;
    padding: 3px;
    border-radius: 11px;
    background: var(--panel);
  }
  .opt button {
    flex: 1;
    height: 30px;
    border: 0;
    border-radius: 9px;
    background: none;
    font: inherit;
    font-size: 12.5px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .opt button.on {
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    box-shadow: 0 2px 6px -3px rgba(40, 44, 80, 0.35);
  }
  .grp {
    padding: 0 4px 0 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .turn {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 0 4px 6px;
  }
  .turn button {
    min-width: 34px;
    height: 32px;
    border: 0;
    border-radius: 9px;
    background: var(--panel);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  .turn button:hover {
    background: color-mix(in srgb, var(--lavender) 40%, var(--panel));
  }
  .bubble,
  .tbar,
  .cbar {
    position: absolute;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 5px;
    border-radius: 14px;
    background: var(--surface-float, var(--surface));
    box-shadow: var(--shadow-lift);
    border: var(--edge, 0);
    white-space: nowrap;
  }
  .bubble {
    transform: translate(-50%, calc(-100% - 10px));
    animation: pop 0.16s var(--spring, ease) backwards;
  }
  .tbar {
    transform: translateY(calc(-100% - 6px));
    font-size: 12.5px;
  }
  .cbar {
    transform: translateY(calc(-100% - 8px));
    animation: pop 0.16s var(--spring, ease) backwards;
  }
  .cbar button {
    min-width: 30px;
    height: 28px;
    padding: 0 9px;
    border: 0;
    border-radius: 999px;
    background: none;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
  }
  .cbar button:hover {
    background: var(--panel);
    color: var(--text);
  }
  .cbar button.on {
    background: var(--cloze-line, #d9a93a);
    color: #fff;
  }
  .cbar .num {
    padding: 0;
  }
  .bubble button,
  .tbar button {
    min-width: 32px;
    height: 32px;
    padding: 0 8px;
    border: 0;
    border-radius: 9px;
    background: none;
    font: inherit;
    font-size: 13.5px;
    color: var(--text);
    cursor: pointer;
  }
  .tbar button {
    font-size: 12.5px;
  }
  .bubble button:hover,
  .tbar button:hover,
  .bubble button.on,
  .tbar button.on {
    background: var(--panel);
  }
  .bubble .study,
  .tbar .study {
    color: var(--alert-ink);
    font-weight: 600;
  }
  .bubble .study.on,
  .tbar .study.on {
    background: var(--rose-soft);
  }
  .sw {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0 4px;
  }
  .bubble .dot {
    min-width: 0;
    width: 18px;
    height: 18px;
    padding: 0;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--charcoal) 12%, transparent);
  }
  .bubble .pal {
    min-width: 26px;
    padding: 0 4px;
    font-size: 13px;
  }
  .bubble .dot.none {
    background: linear-gradient(135deg, transparent 44%, var(--alert-ink) 45% 55%, transparent 56%), var(--surface) !important;
  }
  .bubble .dot:hover {
    transform: scale(1.25);
  }
  .sep {
    width: 1px;
    height: 18px;
    margin: 0 3px;
    background: var(--hairline);
  }
  .lin {
    width: 260px;
    height: 32px;
    border: 0;
    border-radius: 9px;
    padding: 0 10px;
    background: var(--field, var(--panel));
    font: inherit;
    font-size: 13.5px;
  }
  @keyframes fadein {
    from {
      opacity: 0;
    }
  }
  @keyframes pop {
    from {
      opacity: 0;
      scale: 0.94;
    }
  }
</style>
