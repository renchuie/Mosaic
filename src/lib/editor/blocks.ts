// The Mosaic note editor's building blocks (Tiptap / ProseMirror). The document shape matches
// `mdDoc.ts`: a flat list of line blocks (paragraph, bullet, numbered, to-do with an indent
// level), headings, quotes, callouts, code, tables, images and dividers; inline: bold, italic,
// strike, code, highlight colours, links, cloze, [[note links]] and the flashcard arrow.
import { Extension, InputRule, Mark, Node, getMarkRange, markInputRule, mergeAttributes, textblockTypeInputRule, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Mark as PMMark, Node as PMNode, NodeType } from "@tiptap/pm/model";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Dropcursor, Gapcursor, Placeholder, UndoRedo } from "@tiptap/extensions";

export type EditorOpts = {
  imageUrl: (src: string) => string;
  onOpenLink: (target: string) => void;
  onOpenUrl: (href: string) => void;
};

export const FLOW = ["paragraph", "bullet", "ordered", "todo"];
/** Blocks that can be indented with Tab (images can sit under a bullet). */
const INDENTABLE = [...FLOW, "image"];
const LIST = ["bullet", "ordered", "todo"];

const indentAttr = {
  indent: {
    default: 0,
    parseHTML: (el: HTMLElement) => Number(el.getAttribute("data-indent") ?? 0) || 0,
    renderHTML: (a: Record<string, unknown>) => (a.indent ? { "data-indent": a.indent, style: `--ind: ${a.indent}` } : {}),
  },
};
const hidden = (def: unknown = null) => ({ default: def, rendered: false });

/** Card id, blank-line memory: kept on blocks but never shown. */
const Hidden = Extension.create({
  name: "hiddenAttrs",
  addGlobalAttributes() {
    return [
      { types: ["paragraph", "heading", "bullet", "ordered", "todo", "table"], attributes: { sid: hidden() } },
      { types: ["paragraph", "heading", "bullet", "ordered", "todo", "table", "blockquote", "callout", "codeBlock", "raw", "hr", "image"], attributes: { tight: hidden(false) } },
    ];
  },
});

// ---- blocks ----------------------------------------------------------------------------------

const Doc = Node.create({ name: "doc", topNode: true, content: "block+" });
const Text = Node.create({ name: "text", group: "inline" });

const Paragraph = Node.create({
  name: "paragraph",
  priority: 1000,
  group: "block",
  content: "inline*",
  addAttributes: () => ({ ...indentAttr }),
  parseHTML: () => [{ tag: "p" }],
  renderHTML: ({ HTMLAttributes }) => ["p", mergeAttributes({ class: "b-p" }, HTMLAttributes), 0],
});

const listNode = (name: string, extra: Record<string, unknown> = {}) =>
  Node.create({
    name,
    group: "block",
    content: "inline*",
    defining: true,
    addAttributes: () => ({ ...indentAttr, ...extra }),
    parseHTML: () => [{ tag: `div.b-${name}` }],
    renderHTML: ({ node, HTMLAttributes }) =>
      name === "todo"
        ? ["div", mergeAttributes({ class: `b-li b-todo`, "data-checked": node.attrs.checked ? "true" : "false" }, HTMLAttributes), ["span", { class: "tick", contenteditable: "false" }], ["span", { class: "tx" }, 0]]
        : ["div", mergeAttributes({ class: `b-li b-${name}` }, HTMLAttributes), 0],
  });
const Bullet = listNode("bullet");
const Ordered = listNode("ordered", { num: hidden(null) });
const Todo = listNode("todo", { checked: { default: false, rendered: false } });

const Heading = Node.create({
  name: "heading",
  group: "block",
  content: "inline*",
  defining: true,
  addAttributes: () => ({ level: { default: 1, rendered: false } }),
  parseHTML: () => [1, 2, 3, 4, 5, 6].map((l) => ({ tag: `h${l}`, attrs: { level: l } })),
  renderHTML: ({ node, HTMLAttributes }) => [`h${Math.min(node.attrs.level, 4)}`, mergeAttributes({ class: "b-h" }, HTMLAttributes), 0],
});

const Blockquote = Node.create({
  name: "blockquote",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML: () => [{ tag: "blockquote" }],
  renderHTML: () => ["blockquote", { class: "b-quote" }, 0],
});

export const CALLOUTS: { kind: string; label: string; icon: string }[] = [
  { kind: "note", label: "Note", icon: "✎" },
  { kind: "tip", label: "Tip", icon: "✦" },
  { kind: "exam", label: "Exam", icon: "★" },
  { kind: "warning", label: "Warning", icon: "!" },
  { kind: "info", label: "Info", icon: "i" },
  { kind: "example", label: "Example", icon: "❖" },
  { kind: "question", label: "Question", icon: "?" },
  { kind: "success", label: "Key point", icon: "✓" },
];

const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes: () => ({ kind: { default: "note", rendered: false }, fold: hidden(""), title: hidden("") }),
  parseHTML: () => [{ tag: "aside.b-callout" }],
  renderHTML: ({ node }) => ["aside", { class: "b-callout", "data-kind": node.attrs.kind }, ["div", { class: "b-cbody" }, 0]],
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let cur = node;
      const dom = document.createElement("aside");
      dom.className = "b-callout";
      const head = document.createElement("div");
      head.className = "b-chead";
      head.contentEditable = "false";
      const badge = document.createElement("button");
      badge.type = "button";
      badge.className = "b-cbadge";
      badge.title = "Change callout type";
      const title = document.createElement("input");
      title.className = "b-ctitle";
      title.placeholder = "Title";
      title.setAttribute("aria-label", "Callout title");
      head.append(badge, title);
      const body = document.createElement("div");
      body.className = "b-cbody";
      dom.append(head, body);
      const paint = () => {
        const k = CALLOUTS.find((c) => c.kind === cur.attrs.kind) ?? { kind: cur.attrs.kind, label: cur.attrs.kind, icon: "•" };
        dom.dataset.kind = k.kind;
        badge.innerHTML = `<span>${k.icon}</span>${k.label}`;
        if (document.activeElement !== title) title.value = cur.attrs.title ?? "";
      };
      paint();
      const set = (attrs: Record<string, unknown>) => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (pos === undefined) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, ...attrs }));
      };
      badge.addEventListener("mousedown", (e) => e.preventDefault());
      badge.addEventListener("click", () => {
        const i = CALLOUTS.findIndex((c) => c.kind === cur.attrs.kind);
        set({ kind: CALLOUTS[(i + 1) % CALLOUTS.length].kind });
      });
      title.addEventListener("change", () => set({ title: title.value }));
      title.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === "ArrowDown") {
          e.preventDefault();
          set({ title: title.value });
          const pos = typeof getPos === "function" ? getPos() : undefined;
          if (pos !== undefined) editor.chain().focus().setTextSelection(pos + 2).run();
        }
      });
      return {
        dom,
        contentDOM: body,
        update: (n: PMNode) => {
          if (n.type !== cur.type) return false;
          cur = n;
          paint();
          return true;
        },
        stopEvent: (e: Event) => head.contains(e.target as HTMLElement),
        ignoreMutation: (m: { target: globalThis.Node }) => head.contains(m.target),
      };
    };
  },
});

const codeLike = (name: string, cls: string) =>
  Node.create({
    name,
    group: "block",
    content: "text*",
    marks: "",
    code: true,
    defining: true,
    addAttributes: () => (name === "codeBlock" ? { lang: hidden(""), fence: hidden("```"), open: hidden(false) } : {}),
    parseHTML: () => [{ tag: `pre.${cls}`, preserveWhitespace: "full" as const }],
    renderHTML: () => ["pre", { class: cls }, ["code", 0]],
    addKeyboardShortcuts() {
      return {
        "Mod-Enter": ({ editor }) => exitBlock(editor, name),
        "Shift-Enter": ({ editor }) => exitBlock(editor, name),
      };
    },
  });
function exitBlock(editor: Editor, name: string): boolean {
  const { $from } = editor.state.selection;
  if ($from.parent.type.name !== name) return false;
  const after = $from.after();
  const tr = editor.state.tr.insert(after, editor.schema.nodes.paragraph.create());
  tr.setSelection(TextSelection.create(tr.doc, after + 1));
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}
const CodeBlock = codeLike("codeBlock", "b-code");
const Raw = codeLike("raw", "b-raw");

const Hr = Node.create({
  name: "hr",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML: () => [{ tag: "hr" }],
  renderHTML: () => ["div", { class: "b-hr" }, ["hr"]],
});

const Image = Node.create<{ imageUrl: (s: string) => string }>({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  addOptions: () => ({ imageUrl: (s: string) => s }),
  addAttributes: () => ({ src: { default: "" }, alt: { default: "" }, width: { default: null }, indent: { default: 0 } }),
  parseHTML: () => [{ tag: "figure.b-img img", getAttrs: (el) => ({ src: (el as HTMLElement).getAttribute("data-src") ?? "" }) }],
  renderHTML({ node }) {
    return ["figure", { class: "b-img" }, ["img", { src: this.options.imageUrl(node.attrs.src), "data-src": node.attrs.src, alt: node.attrs.alt }]];
  },
  addNodeView() {
    // an image with a corner handle: drag to resize (saved as ![alt|width](src)), double-click it for full size
    return ({ node, getPos, editor }) => {
      let cur = node;
      const dom = document.createElement("figure");
      dom.className = "b-img";
      const box = document.createElement("div");
      box.className = "b-imgbox";
      const img = document.createElement("img");
      const grip = document.createElement("span");
      grip.className = "b-imggrip";
      grip.title = "Drag to resize · double-click for full width";
      box.append(img, grip);
      dom.append(box);
      const paint = () => {
        img.src = this.options.imageUrl(cur.attrs.src);
        img.alt = cur.attrs.alt ?? "";
        box.style.width = cur.attrs.width ? `${cur.attrs.width}px` : "";
        dom.style.setProperty("--ind", String(cur.attrs.indent ?? 0));
      };
      paint();
      const set = (attrs: Record<string, unknown>) => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (pos !== undefined) editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, ...attrs }));
      };
      grip.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = box.getBoundingClientRect().width;
        const max = dom.getBoundingClientRect().width;
        grip.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) => {
          box.style.width = `${Math.round(Math.max(80, Math.min(max, startW + ev.clientX - startX)))}px`;
        };
        const up = () => {
          grip.removeEventListener("pointermove", move);
          const w = Math.round(box.getBoundingClientRect().width);
          set({ width: w >= max - 4 ? null : w });
        };
        grip.addEventListener("pointermove", move);
        grip.addEventListener("pointerup", up, { once: true });
      });
      grip.addEventListener("dblclick", (e) => {
        e.preventDefault();
        set({ width: null });
      });
      return {
        dom,
        update: (n: PMNode) => {
          if (n.type !== cur.type) return false;
          cur = n;
          paint();
          return true;
        },
        stopEvent: (e: Event) => grip.contains(e.target as HTMLElement),
        ignoreMutation: () => true,
      };
    };
  },
});

const MTable = Table.extend({
  addAttributes() {
    return { ...this.parent?.(), cards: { default: false, rendered: false }, aligns: hidden(null) };
  },
}).configure({ resizable: false });
const MCell = TableCell.extend({ content: "paragraph" });
const MHeader = TableHeader.extend({ content: "paragraph" });

// ---- inline nodes ----------------------------------------------------------------------------

const linkLabel = (target: string, alias: string | null) => alias || target.split("/").pop()!.replace(/\.md$/i, "").replace(/#p(\d+)$/, " · p. $1").replace(/#/, " › ");

const Wikilink = Node.create({
  name: "wikilink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ target: { default: "" }, alias: { default: null } }),
  parseHTML: () => [{ tag: "span.b-link", getAttrs: (el) => ({ target: (el as HTMLElement).dataset.target ?? "", alias: (el as HTMLElement).dataset.alias || null }) }],
  renderHTML: ({ node }) => [
    "span",
    { class: `b-link${/\.pdf(#|$)/i.test(node.attrs.target) ? " pdf" : ""}`, "data-target": node.attrs.target, "data-alias": node.attrs.alias ?? "", title: `Open ${node.attrs.target}` },
    linkLabel(node.attrs.target, node.attrs.alias),
  ],
  renderText: ({ node }) => linkLabel(node.attrs.target, node.attrs.alias),
});

const Arrow = Node.create({
  name: "arrow",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes: () => ({ two: { default: false } }),
  parseHTML: () => [{ tag: "span.b-arrow", getAttrs: (el) => ({ two: (el as HTMLElement).dataset.two === "true" }) }],
  renderHTML: ({ node }) => [
    "span",
    { class: "b-arrow", "data-two": String(node.attrs.two), title: node.attrs.two ? "Flashcard both ways (click to switch)" : "Flashcard (click to make it two-way)" },
    [
      "http://www.w3.org/2000/svg svg",
      { class: "a", viewBox: "0 0 24 24", width: "15", height: "15", fill: "none", stroke: "currentColor", "stroke-width": "2.6", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
      ["http://www.w3.org/2000/svg path", { d: node.attrs.two ? "M4 8.5h15M15.5 5l3.5 3.5-3.5 3.5M20 15.5H5M8.5 12L5 15.5 8.5 19" : "M4 12h15M14 6.5l5.5 5.5-5.5 5.5" }],
    ],
    // list card (answer = the bullets under the line): a return arrow pointing down into them
    [
      "http://www.w3.org/2000/svg svg",
      { class: "l", viewBox: "0 0 24 24", width: "15", height: "15", fill: "none", stroke: "currentColor", "stroke-width": "2.6", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
      ["http://www.w3.org/2000/svg path", { d: "M19 5v6.5a3.5 3.5 0 0 1-3.5 3.5H5.5M9.5 11l-4 4 4 4" }],
    ],
  ],
  renderText: ({ node }) => (node.attrs.two ? " ::: " : " :: "),
});

const InlineImage = Node.create<{ imageUrl: (s: string) => string }>({
  name: "inlineImage",
  group: "inline",
  inline: true,
  atom: true,
  addOptions: () => ({ imageUrl: (s: string) => s }),
  addAttributes: () => ({ src: { default: "" }, alt: { default: "" } }),
  renderHTML({ node }) {
    return ["img", { class: "b-iimg", src: this.options.imageUrl(node.attrs.src), alt: node.attrs.alt }];
  },
});

const HardBreak = Node.create({
  name: "hardBreak",
  group: "inline",
  inline: true,
  selectable: false,
  parseHTML: () => [{ tag: "br" }],
  renderHTML: () => ["br"],
});

// ---- marks -----------------------------------------------------------------------------------

const Bold = Mark.create({
  name: "bold",
  parseHTML: () => [{ tag: "strong" }, { tag: "b", getAttrs: (el) => ((el as HTMLElement).style.fontWeight !== "normal" ? null : false) }],
  renderHTML: () => ["strong", 0],
  addKeyboardShortcuts() {
    return { "Mod-b": () => this.editor.commands.toggleMark(this.name) };
  },
  addInputRules() {
    return [markInputRule({ find: /(?:^|\s)(\*\*(?!\s)([^*]+?)(?<!\s)\*\*)$/, type: this.type })];
  },
});
const Italic = Mark.create({
  name: "italic",
  parseHTML: () => [{ tag: "em" }, { tag: "i" }],
  renderHTML: () => ["em", 0],
  addKeyboardShortcuts() {
    return { "Mod-i": () => this.editor.commands.toggleMark(this.name) };
  },
  addInputRules() {
    return [markInputRule({ find: /(?:^|\s)(\*(?![\s*])([^*]+?)(?<![\s*])\*)$/, type: this.type })];
  },
});
const Strike = Mark.create({
  name: "strike",
  parseHTML: () => [{ tag: "s" }, { tag: "del" }],
  renderHTML: () => ["s", 0],
  addKeyboardShortcuts() {
    return { "Mod-Shift-x": () => this.editor.commands.toggleMark(this.name) };
  },
  addInputRules() {
    return [markInputRule({ find: /(?:^|\s)(~~(?!\s)([^~]+?)(?<!\s)~~)$/, type: this.type })];
  },
});
const Code = Mark.create({
  name: "code",
  excludes: "_",
  code: true,
  parseHTML: () => [{ tag: "code" }],
  renderHTML: () => ["code", { class: "b-icode" }, 0],
  addKeyboardShortcuts() {
    return { "Mod-e": () => this.editor.commands.toggleMark(this.name) };
  },
  addInputRules() {
    return [markInputRule({ find: /(?:^|\s)(`(?!\s)([^`]+?)`)$/, type: this.type })];
  },
});
export const HL_COLOURS = ["yellow", "rose", "sage", "peach", "lavender", "blue"];
const Highlight = Mark.create({
  name: "highlight",
  addAttributes: () => ({ color: { default: null, parseHTML: (el) => (el as HTMLElement).dataset.color || null, renderHTML: (a) => (a.color ? { "data-color": a.color } : {}) } }),
  parseHTML: () => [{ tag: "mark" }],
  renderHTML: ({ HTMLAttributes }) => ["mark", mergeAttributes({ class: "b-hl" }, HTMLAttributes), 0],
  addKeyboardShortcuts() {
    // Ctrl+Shift+1…6: yellow, rose, sage, peach, lavender, blue · Ctrl+Shift+0: no highlight
    const keys: Record<string, () => boolean> = {
      "Mod-Shift-h": () => this.editor.commands.toggleMark(this.name, { color: null }),
      "Mod-Shift-0": () => this.editor.commands.unsetMark(this.name),
    };
    HL_COLOURS.forEach((c, i) => {
      keys[`Mod-Shift-${i + 1}`] = () => this.editor.chain().unsetMark(this.name).setMark(this.name, { color: c === "yellow" ? null : c }).run();
    });
    return keys;
  },
  addInputRules() {
    return [markInputRule({ find: /(?:^|\s)(==(?!\s)([^=]+?)(?<!\s)==)$/, type: this.type })];
  },
});
const Link = Mark.create({
  name: "link",
  inclusive: false,
  addAttributes: () => ({ href: { default: "" } }),
  parseHTML: () => [{ tag: "a[href]", getAttrs: (el) => ({ href: (el as HTMLElement).getAttribute("href") }) }],
  renderHTML: ({ HTMLAttributes }) => ["a", mergeAttributes({ class: "b-a", title: "Ctrl+click to open" }, HTMLAttributes), 0],
});
const Cloze = Mark.create({
  name: "cloze",
  inclusive: false,
  addAttributes: () => ({
    n: { default: null, renderHTML: (a) => (a.n ? { "data-n": a.n } : {}), parseHTML: (el) => Number((el as HTMLElement).dataset.n) || null },
    hint: { default: null, renderHTML: (a) => (a.hint ? { "data-hint": a.hint, title: `Hint: ${a.hint}` } : {}), parseHTML: (el) => (el as HTMLElement).dataset.hint ?? null },
  }),
  parseHTML: () => [{ tag: "span.b-cloze" }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes({ class: "b-cloze" }, HTMLAttributes), 0],
  addInputRules() {
    return [markInputRule({ find: /(\{\{([^{}]+)\}\})$/, type: this.type })];
  },
  addProseMirrorPlugins() {
    // Retyping a whole hidden part keeps it hidden: typing over a fully selected cloze, or
    // erasing it (all at once or letter by letter) and then typing, stays inside the cloze.
    const type = this.type;
    /** The marks of a range that is entirely one cloze, else null. */
    const wholeCloze = (state: EditorState, from: number, to: number) => {
      let marks: readonly PMMark[] | null = null;
      let ok = from < to;
      state.doc.nodesBetween(from, to, (n) => {
        if (!ok || !n.isInline) return;
        if (!n.isText || !type.isInSet(n.marks)) ok = false;
        else marks ??= n.marks;
      });
      return ok ? marks : null;
    };
    // "retyping": after a whole cloze was typed over or erased, typing at that spot stays in the
    // cloze until the cursor moves away (click, arrows) or Esc / → is pressed.
    let retypeAt: number | null = null;
    let retypeMarks: readonly PMMark[] = [];
    const eraseKeepingMark = (view: EditorView, from: number, to: number, marks: readonly PMMark[]) => {
      retypeAt = from;
      retypeMarks = marks;
      view.dispatch(view.state.tr.delete(from, to).setStoredMarks(marks));
      return true;
    };
    const typeInCloze = (view: EditorView, from: number, to: number, text: string, marks: readonly PMMark[]) => {
      retypeAt = from + text.length;
      retypeMarks = marks;
      const tr = view.state.tr.replaceWith(from, to, view.state.schema.text(text, marks));
      view.dispatch(tr.setSelection(TextSelection.create(tr.doc, from + text.length)));
      return true;
    };
    return [
      new Plugin({
        view: () => ({
          update: (view) => {
            const s = view.state.selection;
            if (retypeAt !== null && (!s.empty || s.from !== retypeAt)) retypeAt = null;
          },
        }),
        props: {
          handleTextInput(view, from, to, text) {
            if (from === to && retypeAt === from) return typeInCloze(view, from, to, text, retypeMarks);
            const marks = wholeCloze(view.state, from, to);
            return marks ? typeInCloze(view, from, to, text, marks) : false;
          },
          handleKeyDown(view, e) {
            if (retypeAt !== null && (e.key === "Escape" || e.key === "ArrowRight")) {
              retypeAt = null;
              view.dispatch(view.state.tr.setStoredMarks([]));
              return e.key === "Escape";
            }
            if (e.key !== "Backspace" && e.key !== "Delete") return false;
            const { from, to, empty, $from } = view.state.selection;
            if (!empty) {
              const marks = wholeCloze(view.state, from, to);
              return marks ? eraseKeepingMark(view, from, to, marks) : false;
            }
            // the last letter of a cloze: erase it but keep typing inside the cloze
            const at = e.key === "Backspace" ? from - 1 : from;
            if (at < $from.start() || at >= $from.end()) return false;
            const marks = wholeCloze(view.state, at, at + 1);
            if (!marks) return false;
            const range = getMarkRange(view.state.doc.resolve(at + 1), type) ?? getMarkRange(view.state.doc.resolve(at), type);
            if (!range || range.to - range.from !== 1) return false;
            return eraseKeepingMark(view, at, at + 1, marks);
          },
        },
      }),
    ];
  },
});

// ---- typing shortcuts -------------------------------------------------------------------------

// Input rule handlers change `state.tr` in place (Tiptap dispatches it), so the typed key is
// swallowed. Returning null means "not this rule".

/** Turn the line into another block type, keeping its indent and card id. */
function retype(state: EditorState, from: number, to: number, type: NodeType, attrs: Record<string, unknown> = {}) {
  const $s = state.doc.resolve(from);
  const node = $s.parent;
  if (!FLOW.includes(node.type.name)) return null;
  state.tr.delete(from, to).setNodeMarkup($s.before(), type, { indent: node.attrs.indent ?? 0, sid: node.attrs.sid ?? null, ...attrs });
  return true;
}

const Shortcuts = Extension.create({
  name: "mosaicShortcuts",
  priority: 200,
  addInputRules() {
    const n = this.editor.schema.nodes;
    const rule = (find: RegExp, fn: (m: RegExpMatchArray) => [NodeType, Record<string, unknown>?]) =>
      new InputRule({
        find,
        handler: ({ state, range, match }) => {
          const [type, attrs] = fn(match);
          return retype(state, range.from, range.to, type, attrs) ? undefined : null;
        },
      });
    return [
      rule(/^[-*+]\s$/, () => [n.bullet]),
      rule(/^(\d{1,3})[.)]\s$/, (m) => [n.ordered, { num: Number(m[1]) }]),
      rule(/^\[([ xX]?)\]\s$/, (m) => [n.todo, { checked: /x/i.test(m[1]) }]),
      textblockTypeInputRule({ find: /^(#{1,3})\s$/, type: n.heading, getAttributes: (m) => ({ level: m[1].length }) }),
      textblockTypeInputRule({ find: /^```([\w-]*)$/, type: n.codeBlock, getAttributes: (m) => ({ lang: m[1] }) }),
      new InputRule({
        find: /^>\s$/,
        handler: ({ state, range }) => {
          const $s = state.doc.resolve(range.from);
          if ($s.parent.type.name !== "paragraph") return null;
          const tr = state.tr.delete(range.from, range.to);
          const r = tr.doc.resolve(range.from).blockRange();
          if (!r) return null;
          tr.wrap(r, [{ type: n.blockquote }]);
        },
      }),
      new InputRule({
        find: /^---$/,
        handler: ({ state, range }) => {
          const $s = state.doc.resolve(range.from);
          if ($s.parent.type.name !== "paragraph" || $s.parent.textContent !== "--") return null;
          const tr = state.tr.replaceWith($s.before(), $s.after(), [n.hr.create(), n.paragraph.create()]);
          tr.setSelection(TextSelection.create(tr.doc, $s.before() + 2));
        },
      }),
      new InputRule({
        find: /\[\[([^[\]\n]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const [t, a] = match[1].split("|");
          state.tr.replaceWith(range.from, range.to, n.wikilink.create({ target: t.trim(), alias: a?.trim() || null }));
        },
      }),
      new InputRule({
        find: /(?<=\S)[ \t]?(:{2,3})[ \t]$/,
        handler: ({ state, range, match }) => {
          const $s = state.doc.resolve(range.from);
          let has = false;
          $s.parent.forEach((c) => (has ||= c.type.name === "arrow"));
          if (has || $s.parent.type.spec.code) return null;
          state.tr.replaceWith(range.from, range.to, n.arrow.create({ two: match[1].length === 3 }));
        },
      }),
    ];
  },
  addKeyboardShortcuts() {
    const ed = () => this.editor;
    return {
      Enter: () => enter(ed()),
      Tab: () => indent(ed(), 1),
      "Shift-Tab": () => indent(ed(), -1),
      Backspace: () => backspace(ed()),
      "Mod-Enter": () => toggleTodo(ed()),
      "Mod-Alt-1": () => ed().commands.setNode("heading", { level: 1 }),
      "Mod-Alt-2": () => ed().commands.setNode("heading", { level: 2 }),
      "Mod-Alt-3": () => ed().commands.setNode("heading", { level: 3 }),
      "Mod-Alt-0": () => ed().commands.setNode("paragraph"),
    };
  },
});

function inTable(state: EditorState) {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "table") return true;
  return false;
}

function enter(editor: Editor): boolean {
  const { state } = editor;
  const { $from, empty } = state.selection;
  const node = $from.parent;
  const name = node.type.name;
  if (inTable(state)) return true; // one paragraph per cell: Tab moves on
  if (!LIST.includes(name) && !(name === "paragraph" && node.attrs.indent) && name !== "heading") return false;
  if (name === "heading") {
    if (!empty || $from.parentOffset !== node.content.size) return false;
    const tr = state.tr.insert($from.after(), state.schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, $from.after() + 1));
    editor.view.dispatch(tr.scrollIntoView());
    return true;
  }
  if (LIST.includes(name) && !node.content.size) {
    // empty list line: step out (outdent, then plain text)
    const pos = $from.before();
    const tr = node.attrs.indent > 0 ? state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: node.attrs.indent - 1 }) : state.tr.setNodeMarkup(pos, state.schema.nodes.paragraph, { indent: 0 });
    editor.view.dispatch(tr);
    return true;
  }
  const attrs = { ...node.attrs, sid: null, tight: false, ...(name === "todo" ? { checked: false } : {}), ...(name === "ordered" ? { num: null } : {}) };
  if (empty && $from.parentOffset === 0) {
    // Enter at the start: a new empty line above; the line (and its card id) moves down as it is
    editor.view.dispatch(state.tr.insert($from.before(), node.type.create(attrs)).scrollIntoView());
    return true;
  }
  const tr = state.tr;
  if (!empty) tr.deleteSelection();
  tr.split(tr.mapping.map($from.pos), 1, [{ type: node.type, attrs }]);
  editor.view.dispatch(tr.scrollIntoView());
  return true;
}

function indent(editor: Editor, dir: 1 | -1): boolean {
  const { state } = editor;
  if (inTable(state)) return false;
  const { from, to } = state.selection;
  const tr = state.tr;
  let any = false;
  state.doc.nodesBetween(from, to, (node, pos, parent, index) => {
    if (!INDENTABLE.includes(node.type.name)) return true;
    const cur = node.attrs.indent ?? 0;
    let max = 0;
    if (parent && index > 0) {
      const prev = parent.child(index - 1);
      max = INDENTABLE.includes(prev.type.name) ? (prev.attrs.indent ?? 0) + 1 : 0;
    }
    const next = Math.max(0, Math.min(cur + dir, dir > 0 ? Math.max(max, cur) : cur));
    if (next !== cur) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next });
      any = true;
    }
    return false;
  });
  if (any) editor.view.dispatch(tr);
  return true;
}

function backspace(editor: Editor): boolean {
  const { state } = editor;
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0) return false;
  const node = $from.parent;
  const pos = $from.before();
  if (LIST.includes(node.type.name) || node.type.name === "heading") {
    editor.view.dispatch(state.tr.setNodeMarkup(pos, state.schema.nodes.paragraph, { indent: node.attrs.indent ?? 0, sid: node.attrs.sid ?? null }));
    return true;
  }
  if (node.type.name === "paragraph" && node.attrs.indent > 0) {
    editor.view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: node.attrs.indent - 1 }));
    return true;
  }
  return false;
}

function toggleTodo(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  const node = $from.parent;
  if (node.type.name !== "todo") return false;
  editor.view.dispatch(editor.state.tr.setNodeMarkup($from.before(), undefined, { ...node.attrs, checked: !node.attrs.checked }));
  return true;
}

// ---- decorations: numbers, #tags, table cards, clicks ------------------------------------------------

const numKey = new PluginKey("mosaicDeco");
function decorations(doc: PMNode): DecorationSet {
  const out: Decoration[] = [];
  const walk = (parent: PMNode, start: number) => {
    const counters: (number | undefined)[] = [];
    let pos = start;
    parent.forEach((node, _off, index) => {
      const name = node.type.name;
      // an arrow ending a line whose next line is indented under it = list card
      const last = node.isTextblock ? node.lastChild : null;
      if (last?.type.name === "arrow" && FLOW.includes(name)) {
        let next: PMNode | null = null;
        for (let k = index + 1; k < parent.childCount && !next; k++) {
          const c = parent.child(k);
          if (!(c.type.name === "paragraph" && !c.content.size)) next = c;
        }
        if (next && INDENTABLE.includes(next.type.name) && (next.attrs.indent ?? 0) > (node.attrs.indent ?? 0)) {
          const at = pos + node.nodeSize - 1 - last.nodeSize;
          out.push(Decoration.node(at, at + last.nodeSize, { class: "list", title: "List flashcard: the lines indented under it are the answer" }));
        }
      }
      if (INDENTABLE.includes(name)) {
        const emptyPara = name === "paragraph" && !node.content.size;
        if (!emptyPara) {
          const lvl = node.attrs.indent ?? 0;
          counters.length = lvl + 1;
          if (name === "ordered") {
            const n = counters[lvl] !== undefined ? counters[lvl]! + 1 : Number(node.attrs.num ?? 1) || 1;
            counters[lvl] = n;
            out.push(Decoration.node(pos, pos + node.nodeSize, { "data-n": `${n}.` }));
          } else counters[lvl] = undefined;
        }
      } else counters.length = 0;
      if (name === "blockquote" || name === "callout") walk(node, pos + 1);
      if (name === "table" && node.attrs.cards) out.push(Decoration.node(pos, pos + node.nodeSize, { class: "cards" }));
      if (node.isTextblock && !node.type.spec.code) {
        node.forEach((child, off) => {
          if (!child.isText || child.marks.some((m) => m.type.name === "code" || m.type.name === "link")) return;
          for (const m of child.text!.matchAll(/(^|\s)(#[A-Za-z][\w/-]*)/g)) {
            const from = pos + 1 + off + m.index! + m[1].length;
            out.push(Decoration.inline(from, from + m[2].length, { class: "b-tag" }));
          }
        });
      }
      pos += node.nodeSize;
    });
  };
  walk(doc, 0);
  return DecorationSet.create(doc, out);
}

function behaviour(opts: EditorOpts) {
  return Extension.create({
    name: "mosaicBehaviour",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: numKey,
          state: {
            init: (_c, s) => decorations(s.doc),
            apply: (tr: Transaction, old: DecorationSet) => (tr.docChanged ? decorations(tr.doc) : old),
          },
          props: {
            decorations(state) {
              return numKey.getState(state);
            },
            handleDOMEvents: {
              mousedown: (view, e) => {
                const t = e.target as HTMLElement;
                if (e.button !== 0) return false;
                const tick = t.closest(".b-todo .tick");
                if (tick) {
                  e.preventDefault();
                  const pos = view.posAtDOM(tick.parentElement!, 0);
                  const $p = view.state.doc.resolve(pos);
                  const node = $p.parent.type.name === "todo" ? $p.parent : view.state.doc.nodeAt(pos);
                  const at = $p.parent.type.name === "todo" ? $p.before() : pos;
                  if (node?.type.name === "todo") view.dispatch(view.state.tr.setNodeMarkup(at, undefined, { ...node.attrs, checked: !node.attrs.checked }));
                  return true;
                }
                const link = t.closest<HTMLElement>(".b-link");
                if (link && !e.shiftKey) {
                  e.preventDefault();
                  opts.onOpenLink(link.dataset.target ?? "");
                  return true;
                }
                const arrow = t.closest<HTMLElement>(".b-arrow");
                if (arrow) {
                  e.preventDefault();
                  const pos = view.posAtDOM(arrow, 0);
                  const node = view.state.doc.nodeAt(pos);
                  if (node?.type.name === "arrow") view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { two: !node.attrs.two }));
                  return true;
                }
                const a = t.closest<HTMLAnchorElement>("a.b-a");
                if (a && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  opts.onOpenUrl(a.getAttribute("href") ?? "");
                  return true;
                }
                return false;
              },
            },
          },
        }),
      ];
    },
  });
}

export function mosaicExtensions(opts: EditorOpts) {
  return [
    Doc, Text, Paragraph, Bullet, Ordered, Todo, Heading, Blockquote, Callout, CodeBlock, Raw, Hr,
    Image.configure({ imageUrl: opts.imageUrl }), MTable, TableRow, MHeader, MCell,
    Wikilink, Arrow, InlineImage.configure({ imageUrl: opts.imageUrl }), HardBreak,
    Bold, Italic, Strike, Code, Highlight, Link, Cloze,
    Hidden, Shortcuts, behaviour(opts),
    UndoRedo, Dropcursor.configure({ color: "var(--lavender, #c9b8f0)", width: 3 }), Gapcursor,
    Placeholder.configure({
      showOnlyCurrent: true,
      includeChildren: true,
      placeholder: ({ node }) =>
        node.type.name === "heading" ? "Heading" : node.type.name === "paragraph" ? "Type / for blocks, [[ to link a note, :: for a flashcard" : node.type.name === "todo" ? "To-do" : "List",
    }),
  ];
}
