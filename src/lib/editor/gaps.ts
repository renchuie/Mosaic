// Guided notes (Nov 18, her picks 1, 2, 7, 8): every spot in a note that is meant to be filled in,
// filled or not. One walk over the document serves
//   - the counter in the top bar ("12 left"),
//   - jumping to the next / previous gap (Tab inside a gap, Alt+↓ / Alt+↑),
//   - faint hints in empty spots ("2 of 7" on a list item, the column name in a table cell),
//   - a small badge after each section heading (gaps left, or ✓) with "Review" for its cards.
// A slot: a cloze (blank = only underscores / dots / dashes / ?), the answer after a card arrow
// (`Q ::`, `Concept ;;`, `Property ;;;`), an item of a list card, a card cell of a `:: table`.
import type { Node as PMNode, Mark as PMMark } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

export const BLANK_GAP = /^[\s_.…?\-–—]*$/;
const FLOW = ["paragraph", "bullet", "ordered", "todo"];
const LIST = ["bullet", "ordered", "todo"];
/** blocks whose children are blocks that can hold gaps (callouts hold plain text in guided notes) */
const HOLDERS = ["doc", "columns", "column", "pages", "pagecol", "toggle"];

export type Slot = {
  /** where the cursor goes (or the range a blank selects) */
  from: number;
  to: number;
  filled: boolean;
  kind: "cloze" | "answer" | "item" | "cell";
  /** faint hint shown in it while empty: "2 of 7" for a list item, the column name for a cell */
  hint?: string;
};
export type Section = { pos: number; level: number; path: string[]; total: number; left: number };
export type GapInfo = { slots: Slot[]; sections: Section[]; total: number; left: number };

const indentOf = (n: PMNode) => (n.attrs.indent as number | undefined) ?? 0;
const isEmptyPara = (n: PMNode) => n.type.name === "paragraph" && !n.content.size;
const plain = (s: string) => s.replace(/[*_`=~]+/g, "").replace(/\s+/g, " ").trim();

export function findGaps(doc: PMNode): GapInfo {
  const slots: Slot[] = [];
  const sections: Section[] = [];
  const add = (s: Slot, stack: Section[]) => {
    slots.push(s);
    for (const h of stack) {
      h.total++;
      if (!s.filled) h.left++;
    }
  };

  const walk = (parent: PMNode, start: number, outer: Section[]) => {
    const stack = [...outer];
    const kids: { node: PMNode; pos: number }[] = [];
    parent.forEach((node, off) => kids.push({ node, pos: start + off }));
    kids.forEach(({ node, pos }, index) => {
      const name = node.type.name;
      if (name === "heading") {
        const level = node.attrs.level as number;
        while (stack.length && stack[stack.length - 1].level >= level && !outer.includes(stack[stack.length - 1])) stack.pop();
        const sec: Section = { pos, level, path: [...stack.map((s) => s.path[s.path.length - 1]), plain(node.textContent)], total: 0, left: 0 };
        sections.push(sec);
        stack.push(sec);
        return;
      }
      if (HOLDERS.includes(name)) {
        // each half / column starts from the sections around the split, not the half before it
        walk(node, pos + 1, stack);
        return;
      }
      if (name === "table") {
        if (!node.attrs.cards) return;
        const opts = (node.attrs.copts ?? {}) as { key?: number; skip?: number[] };
        const key = opts.key ?? 0;
        const skip = new Set(opts.skip ?? []);
        let rowPos = pos + 1;
        node.forEach((row, _o, ri) => {
          let cellPos = rowPos + 1;
          row.forEach((cell, _c, ci) => {
            if (ri > 0 && ci !== key && !skip.has(ci)) {
              const at = cellPos + 2; // inside the cell's first line
              const head = node.firstChild?.maybeChild(ci);
              add({ from: at, to: at, filled: !!cell.textContent.trim(), kind: "cell", hint: head ? plain(head.textContent) : undefined }, stack);
            }
            cellPos += cell.nodeSize;
          });
          rowPos += row.nodeSize;
        });
        return;
      }
      if (!node.isTextblock || !FLOW.includes(name)) return;
      // clozes: one slot per run of text with the same cloze mark
      let run: { mark: PMMark; from: number; to: number; text: string } | null = null;
      const flush = () => {
        if (run) add({ from: run.from, to: run.to, filled: !BLANK_GAP.test(run.text), kind: "cloze" }, stack);
        run = null;
      };
      node.forEach((child, off) => {
        const at = pos + 1 + off;
        const m = child.isText ? child.marks.find((x) => x.type.name === "cloze") : undefined;
        if (m && run && m.eq(run.mark) && run.to === at) {
          run.to = at + child.nodeSize;
          run.text += child.text ?? "";
        } else {
          flush();
          if (m) run = { mark: m, from: at, to: at + child.nodeSize, text: child.text ?? "" };
        }
      });
      flush();
      // an arrow: the answer after it, or (a list card) the items indented under it
      let arrowIdx = -1;
      node.forEach((child, _o, i) => {
        if (child.type.name === "arrow") arrowIdx = i;
      });
      if (arrowIdx < 0) return;
      const arrow = node.child(arrowIdx);
      let after = "";
      for (let i = arrowIdx + 1; i < node.childCount; i++) after += node.child(i).textContent;
      const end = pos + node.nodeSize - 1;
      if (after.trim()) {
        add({ from: end, to: end, filled: true, kind: "answer" }, stack);
        return;
      }
      // what comes under it, deeper indented
      const myIndent = indentOf(node);
      const under: { node: PMNode; pos: number }[] = [];
      for (let k = index + 1; k < kids.length; k++) {
        const n = kids[k].node;
        if (isEmptyPara(n)) continue;
        if (!FLOW.includes(n.type.name) || indentOf(n) <= myIndent) break;
        under.push(kids[k]);
      }
      const concept = !!arrow.attrs.concept;
      if (under.length && !concept) {
        // a list card (or a list descriptor): each item directly under it is a slot
        const items = under.filter((u) => indentOf(u.node) === myIndent + 1 && LIST.includes(u.node.type.name));
        items.forEach((it, i) => {
          const at = it.pos + 1;
          let hasArrow = false;
          it.node.forEach((c) => (hasArrow ||= c.type.name === "arrow"));
          // an item that is a card line of its own counts as its own slot when walked
          if (!hasArrow) add({ from: at, to: at + it.node.content.size, filled: !!it.node.textContent.trim(), kind: "item", hint: `${i + 1} of ${items.length}` }, stack);
        });
        return;
      }
      add({ from: end, to: end, filled: false, kind: "answer" }, stack);
    });
  };
  walk(doc, 0, []);
  const total = slots.length;
  const left = slots.filter((s) => !s.filled).length;
  return { slots, sections, total, left };
}

// ---- moving between gaps ----------------------------------------------------------------------

/** The empty gap after (dir 1) or before (dir -1) the selection, wrapping round; null if none. */
export function nextGap(state: EditorState, dir: 1 | -1, info = findGaps(state.doc)): Slot | null {
  const empty = info.slots.filter((s) => !s.filled);
  if (!empty.length) return null;
  const { from, to } = state.selection;
  if (dir === 1) return empty.find((s) => s.from > to) ?? empty.find((s) => s.from >= to && s.to > to) ?? empty[0];
  const before = empty.filter((s) => s.to < from);
  return before[before.length - 1] ?? empty[empty.length - 1];
}

export function goToGap(view: EditorView, dir: 1 | -1): boolean {
  const g = nextGap(view.state, dir);
  if (!g) return false;
  const sel = g.kind === "cloze" ? TextSelection.create(view.state.doc, g.from, g.to) : TextSelection.create(view.state.doc, g.to);
  view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
  view.focus();
  return true;
}

/** Is the cursor in a gap right now (inside a cloze, or typing after a card arrow)? Then Tab moves on. */
export function inGap(state: EditorState): boolean {
  const { $from, $to } = state.selection;
  if ($from.parent !== $to.parent || !$from.parent.isTextblock) return false;
  const cz = state.schema.marks.cloze;
  // inside a cloze, or right at either end of one (after typing into a blank the cursor sits
  // just past it: the cloze mark doesn't stretch over the cursor)
  if ($from.marks().some((m) => m.type === cz) || state.doc.rangeHasMark($from.pos, $to.pos, cz)) return true;
  if ($from.nodeBefore && cz.isInSet($from.nodeBefore.marks)) return true;
  if ($to.nodeAfter && cz.isInSet($to.nodeAfter.marks) && $to.nodeBefore && cz.isInSet($to.nodeBefore.marks)) return true;
  // after an arrow on this line
  let arrowEnd = -1;
  $from.parent.forEach((c, off) => {
    if (c.type.name === "arrow") arrowEnd = off + c.nodeSize;
  });
  return arrowEnd >= 0 && $from.parentOffset >= arrowEnd;
}

// ---- hints and section badges -----------------------------------------------------------------

export const gapsKey = new PluginKey<{ info: GapInfo; deco: DecorationSet }>("mosaicGaps");

export type GapHooks = {
  /** the section heading badge's Review button */
  onReview?: (path: string[]) => void;
};

function badge(sec: Section, hooks: GapHooks) {
  return () => {
    const el = document.createElement("span");
    el.className = "b-secgap";
    el.contentEditable = "false";
    {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "b-secreview";
      b.textContent = "Review";
      b.title = "Review this section's flashcards";
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        hooks.onReview?.(sec.path);
      });
      el.append(b);
    }
    return el;
  };
}

function decorate(doc: PMNode, info: GapInfo, hooks: GapHooks): DecorationSet {
  const out: Decoration[] = [];
  // Nov 19 (her ask, "too much"): no "N left" pills and no hints in empty items / cells; a heading
  // only gets a Review button (shown on hover) once something under it is filled in
  for (const sec of info.sections) {
    if (sec.level > 3 || !sec.total || sec.total === sec.left) continue;
    const h = doc.nodeAt(sec.pos);
    if (!h) continue;
    out.push(Decoration.widget(sec.pos + h.nodeSize - 1, badge(sec, hooks), { side: 1, key: `sg${sec.pos}-${sec.path.join("|")}`, ignoreSelection: true }));
  }
  return DecorationSet.create(doc, out);
}

export function gapsPlugin(hooks: GapHooks) {
  return new Plugin<{ info: GapInfo; deco: DecorationSet }>({
    key: gapsKey,
    state: {
      init: (_c, state) => {
        const info = findGaps(state.doc);
        return { info, deco: decorate(state.doc, info, hooks) };
      },
      apply: (tr, old, _o, state) => {
        if (!tr.docChanged) return old;
        const info = findGaps(state.doc);
        return { info, deco: decorate(state.doc, info, hooks) };
      },
    },
    props: {
      decorations: (state) => gapsKey.getState(state)?.deco,
      handleKeyDown(view, e) {
        const alt = e.altKey && !e.ctrlKey && !e.metaKey;
        if (alt && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
          e.preventDefault();
          return goToGap(view, e.key === "ArrowDown" ? 1 : -1) || true;
        }
        if (e.key === "Tab" && !e.ctrlKey && !e.altKey && !e.metaKey && inGap(view.state)) {
          e.preventDefault();
          return goToGap(view, e.shiftKey ? -1 : 1) || true;
        }
        return false;
      },
    },
  });
}
