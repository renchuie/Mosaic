<script lang="ts">
  // Markdown note editor (CodeMirror 6): styled Markdown, round bullets, Tab to indent,
  // [[links]] that open on click with autocomplete, #tags, highlighted card syntax
  // (Q :: A, {{cloze}}), pasted images saved to the notes folder and shown inline.
  import { onDestroy, onMount } from "svelte";
  import { EditorState, StateField, type Range } from "@codemirror/state";
  import { Decoration, EditorView, MatchDecorator, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
  import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
  import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
  import { tags as t } from "@lezer/highlight";
  import { livePreview, livePreviewTheme, slashMenu } from "../editor/livePreview";
  import { htmlToMd, richHtml } from "../editor/htmlToMd";

  let {
    value,
    onchange,
    onopenlink,
    linkNames,
    tagNames,
    imageUrl,
    onpasteimage,
  }: {
    value: string;
    onchange: (text: string) => void;
    onopenlink: (name: string) => void;
    linkNames: () => string[];
    tagNames: () => string[];
    imageUrl: (src: string) => string;
    onpasteimage: (dataUrl: string, ext: string) => Promise<string>;
  } = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;

  const style = HighlightStyle.define([
    { tag: t.heading1, fontSize: "1.75em", fontWeight: "700", lineHeight: "1.3" },
    { tag: t.heading2, fontSize: "1.38em", fontWeight: "700" },
    { tag: t.heading3, fontSize: "1.15em", fontWeight: "700" },
    { tag: [t.heading4, t.heading5, t.heading6], fontWeight: "700" },
    { tag: t.strong, fontWeight: "700" },
    { tag: t.emphasis, fontStyle: "italic" },
    { tag: t.strikethrough, textDecoration: "line-through", color: "var(--text-muted)" },
    { tag: [t.link, t.url], color: "var(--link-ink)" },
    { tag: t.monospace, fontFamily: "ui-monospace, monospace", fontSize: "0.92em", backgroundColor: "var(--chip)", borderRadius: "4px" },
    { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: "color-mix(in srgb, var(--text-muted) 70%, transparent)" },
  ]);

  class Img extends WidgetType {
    src: string;
    constructor(src: string) {
      super();
      this.src = src;
    }
    eq(o: Img) {
      return o.src === this.src;
    }
    toDOM() {
      const d = document.createElement("div");
      d.className = "cm-img";
      const i = document.createElement("img");
      i.src = imageUrl(this.src);
      i.alt = "";
      d.appendChild(i);
      return d;
    }
  }

  const marks = new MatchDecorator({
    regexp: /==[^=\n]+==|\[\[([^\]\n]+)\]\]|(?:^|(?<=\s))#[A-Za-z][\w/-]*|\{\{[^}\n]+\}\}|(?<=\S )(<::|:{2,3}|;{2,3})(?= )/gm,
    decorate: (add, from, to, m) => {
      if (m[0].startsWith("==")) add(from, to, Decoration.mark({ class: "cm-hl" }));
      else if (m[1] !== undefined) add(from, to, Decoration.mark({ class: "cm-wikilink", attributes: { "data-link": /\.pdf\s*(#|$)/i.test(m[1].split("|")[0]) ? m[1].split("|")[0].trim() : m[1].split("|")[0].split("#")[0].trim(), title: "Open" } }));
      else if (m[0].startsWith("#")) add(from, to, Decoration.mark({ class: "cm-tagmark" }));
      else if (m[0].startsWith("{{")) add(from, to, Decoration.mark({ class: "cm-cloze" }));
      else if (m[2] !== undefined) add(from, to, Decoration.mark({ class: "cm-cardsep" }));
    },
  });
  const markPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(v: EditorView) {
        this.decorations = marks.createDeco(v);
      }
      update(u: ViewUpdate) {
        this.decorations = marks.updateDeco(u, this.decorations);
      }
    },
    { decorations: (v) => v.decorations },
  );

  function images(state: EditorState): DecorationSet {
    const out: Range<Decoration>[] = [];
    for (let i = 1; i <= state.doc.lines; i++) {
      const line = state.doc.line(i);
      for (const m of line.text.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) out.push(Decoration.widget({ widget: new Img(m[1]), block: true, side: 1 }).range(line.to));
    }
    return Decoration.set(out, true);
  }
  // hidden card ids (<!--sd:xxxxxx-->): invisible, and the cursor steps over them
  const ids = new MatchDecorator({ regexp: /\s*<!--sd:[a-z0-9]+-->/g, decoration: () => Decoration.replace({}) });
  const idPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(v: EditorView) {
        this.decorations = ids.createDeco(v);
      }
      update(u: ViewUpdate) {
        this.decorations = ids.updateDeco(u, this.decorations);
      }
    },
    { decorations: (v) => v.decorations, provide: (p) => EditorView.atomicRanges.of((v) => v.plugin(p)?.decorations ?? Decoration.none) },
  );

  const imageField = StateField.define<DecorationSet>({
    create: images,
    update: (d, tr) => (tr.docChanged ? images(tr.state) : d),
    provide: (f) => EditorView.decorations.from(f),
  });

  function complete(ctx: CompletionContext) {
    const slash = slashMenu(ctx);
    if (slash) return slash;
    const link = ctx.matchBefore(/\[\[[^\]\n]*/);
    if (link) {
      return {
        from: link.from + 2,
        options: linkNames().map((n) => ({ label: n, apply: `${n}]]`, type: "text" })),
        validFor: /^[^\]\n]*$/,
      };
    }
    const tag = ctx.matchBefore(/(?:^|\s)#[\w/-]*/);
    if (tag && (tag.text.trim().length > 1 || ctx.explicit)) {
      const start = tag.from + tag.text.indexOf("#") + 1;
      return { from: start, options: tagNames().map((n) => ({ label: n, type: "keyword" })), validFor: /^[\w/-]*$/ };
    }
    return null;
  }

  const theme = EditorView.theme({
    "&": { fontSize: "16.5px", backgroundColor: "transparent", height: "100%" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "var(--font-body)", lineHeight: "1.75", overflow: "auto" },
    ".cm-content": { maxWidth: "780px", margin: "0 auto", padding: "8px 28px 40vh", caretColor: "var(--charcoal)" },
    ".cm-line": { padding: "0 2px" },
    ".cm-cursor": { borderLeftColor: "var(--charcoal)", borderLeftWidth: "2px" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection": { backgroundColor: "color-mix(in srgb, var(--peach) 55%, transparent) !important" },
    ".cm-wikilink": { color: "var(--link-ink)", backgroundColor: "color-mix(in srgb, var(--lavender) 28%, transparent)", borderRadius: "6px", padding: "1px 3px", cursor: "pointer", fontWeight: "500" },
    ".cm-tagmark": { color: "var(--go-ink)", backgroundColor: "var(--sage-soft)", borderRadius: "999px", padding: "1px 8px", fontSize: "0.9em", fontWeight: "600" },
    ".cm-cloze": { backgroundColor: "color-mix(in srgb, var(--butter) 70%, transparent)", borderRadius: "5px", padding: "1px 2px", fontWeight: "600" },
    ".cm-cardsep": { color: "var(--alert-ink)", fontWeight: "700", backgroundColor: "var(--rose-soft)", borderRadius: "5px", padding: "0 4px" },
    ".cm-hl": { backgroundColor: "color-mix(in srgb, var(--butter) 80%, transparent)", borderRadius: "4px", padding: "0 2px" },
    ".cm-bullet": { display: "inline-block", width: "0.9em", color: "var(--text-muted)", fontWeight: "700", textAlign: "center" },
    ".cm-img img": { maxWidth: "100%", maxHeight: "420px", borderRadius: "14px", margin: "6px 0", boxShadow: "var(--shadow)" },
    ".cm-tooltip": { border: "0", borderRadius: "12px", boxShadow: "var(--shadow-lift)", backgroundColor: "var(--surface)", overflow: "hidden" },
    ".cm-tooltip-autocomplete > ul > li": { padding: "6px 12px !important", fontFamily: "var(--font-body)" },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--sage-soft) !important", color: "var(--text) !important" },
  });

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([
            { key: "Mod-b", run: () => (wrap("**"), true) },
            { key: "Mod-i", run: () => (wrap("*"), true) },
            { key: "Mod-Shift-x", run: () => (wrap("~~"), true) },
            { key: "Mod-Shift-h", run: () => (wrap("=="), true) },
            { key: "Mod-k", run: () => (wrap("[[", "]]", "Note name"), true) },
            indentWithTab,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          livePreview(),
          livePreviewTheme,
          markdown({ base: markdownLanguage }),
          syntaxHighlighting(style),
          EditorView.lineWrapping,
          markPlugin,
          idPlugin,
          imageField,
          autocompletion({ override: [complete], icons: false }),
          theme,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onchange(u.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            mousedown(e) {
              const el = (e.target as HTMLElement).closest<HTMLElement>(".cm-wikilink");
              if (el && !e.shiftKey && e.button === 0) {
                e.preventDefault();
                onopenlink(el.dataset.link ?? "");
                return true;
              }
              return false;
            },
            paste(e, v) {
              const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
              const html = e.clipboardData?.getData("text/html") ?? "";
              if (!file && html && richHtml(html)) {
                // Google Docs and web pages: keep headings, bold, lists, tables, links
                const md = htmlToMd(html);
                if (md) {
                  e.preventDefault();
                  v.dispatch(v.state.replaceSelection(md));
                  return true;
                }
              }
              if (!file) return false;
              e.preventDefault();
              const r = new FileReader();
              r.onload = async () => {
                const path = await onpasteimage(String(r.result), file.type.split("/")[1]?.replace("jpeg", "jpg") || "png");
                v.dispatch(v.state.replaceSelection(`![](${path})\n`));
              };
              r.readAsDataURL(file);
              return true;
            },
          }),
        ],
      }),
    });
  });
  onDestroy(() => view?.destroy());

  /** Toolbar actions. */
  export function wrap(before: string, after = before, placeholder = "") {
    if (!view) return;
    const s = view.state.selection.main;
    const text = view.state.sliceDoc(s.from, s.to) || placeholder;
    view.dispatch({ changes: { from: s.from, to: s.to, insert: before + text + after }, selection: { anchor: s.from + before.length, head: s.from + before.length + text.length } });
    view.focus();
  }
  /** Coloured highlight: <mark class="rose">…</mark> (yellow uses ==…==). */
  export function colour(name: string) {
    if (name === "yellow") wrap("==");
    else wrap(`<mark class="${name}">`, "</mark>");
  }
  export function linePrefix(prefix: string) {
    if (!view) return;
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const cur = /^(#{1,6} |- \[[ xX]\] |- |\d+\. |> )/.exec(line.text)?.[0] ?? "";
    view.dispatch({ changes: { from: line.from, to: line.from + cur.length, insert: cur === prefix ? "" : prefix } });
    view.focus();
  }
  /** Insert a block (callout, divider, table) on its own line. */
  export function block(text: string) {
    if (!view) return;
    const s = view.state.selection.main;
    const line = view.state.doc.lineAt(s.head);
    const lead = line.text.trim() ? "\n" : "";
    const at = line.text.trim() ? line.to : line.from;
    view.dispatch({ changes: { from: at, to: line.text.trim() ? at : line.to, insert: lead + text }, selection: { anchor: at + lead.length + text.length } });
    view.focus();
  }
  export function insert(text: string) {
    if (!view) return;
    view.dispatch(view.state.replaceSelection(text));
    view.focus();
  }
  export function gotoLine(n: number) {
    if (!view) return;
    const line = view.state.doc.line(Math.min(Math.max(1, n + 1), view.state.doc.lines));
    view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 40 }) });
    view.focus();
  }
  /** Add text at the end of lines (card ids) without moving the cursor. */
  export function appendToLines(list: { line: number; text: string }[]) {
    if (!view || !list.length) return;
    const doc = view.state.doc;
    view.dispatch({
      changes: list.filter((x) => x.line < doc.lines).map((x) => {
        const l = doc.line(x.line + 1);
        const trimmed = l.text.replace(/\s+$/, "");
        return { from: l.from + trimmed.length, to: l.to, insert: x.text };
      }),
      annotations: [],
    });
  }
  export function focus() {
    view?.focus();
  }
</script>

<div class="ed" bind:this={host}></div>

<style>
  .ed {
    height: 100%;
    min-height: 0;
  }
  .ed :global(.cm-editor) {
    height: 100%;
  }
</style>
