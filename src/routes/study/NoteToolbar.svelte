<script lang="ts">
  // The note page's formatting toolbar: under the title, and (floating) at the bottom of a long
  // note while she types. Buttons keep the editor's focus and selection.
  import { activePalette, hlColor } from "../../lib/stores/blockStyles.svelte";

  let { onrun, floating = false }: { onrun: (cmd: string, arg?: string) => void; floating?: boolean } = $props();
</script>

<div class="toolbar" class:floating role="toolbar" aria-label="Formatting" tabindex="-1" onmousedown={(e) => e.preventDefault()}>
    <button type="button" onclick={() => onrun("block", "heading:1")} title="Heading 1">H1</button>
    <button type="button" onclick={() => onrun("block", "heading:2")} title="Heading 2">H2</button>
    <button type="button" onclick={() => onrun("block", "heading:3")} title="Heading 3">H3</button>
    <span class="sep"></span>
    <button type="button" onclick={() => onrun("mark", "bold")} title="Bold (Ctrl+B)"><b>B</b></button>
    <button type="button" onclick={() => onrun("mark", "italic")} title="Italic (Ctrl+I)"><i>I</i></button>
    <button type="button" onclick={() => onrun("mark", "strike")} title="Strike (Ctrl+Shift+X)"><s>S</s></button>
    <span class="hl">
      {#each activePalette() as c, i (c)}<button type="button" class="dot" data-color={c} title="{hlColor(c)?.label ?? c} (Ctrl+Shift+{i + 1})" aria-label="Highlight {hlColor(c)?.label ?? c}" onclick={() => onrun("hl", c)}></button>{/each}
      <button type="button" class="dot none" title="No highlight (Ctrl+Shift+0)" aria-label="Remove highlight" onclick={() => onrun("hl-off")}></button>
    </span>
    <span class="sep"></span>
    <button type="button" onclick={() => onrun("ul")} title="Bullet list">•</button>
    <button type="button" onclick={() => onrun("ol")} title="Numbered list">1.</button>
    <button type="button" onclick={() => onrun("todo")} title="To-do">☐</button>
    <button type="button" onclick={() => onrun("table")} title="Table">▦</button>
    <button type="button" onclick={() => onrun("c-note")} title="Callout">❝</button>
    <span class="sep"></span>
    <button type="button" class="study" onclick={() => onrun("card")} title="Flashcard: question → answer (or type ::)">→</button>
    <button type="button" class="study" onclick={() => onrun("card2")} title="Two-way flashcard (or type :::)">⇄</button>
    <button type="button" class="study" onclick={() => onrun("card3")} title="Reverse flashcard: asks for the left side (or type <-)">←</button>
    <button type="button" class="study" onclick={() => onrun("cloze")} title="Cloze: hide the selected part">{"{ }"}</button>
    <button type="button" onclick={() => onrun("link")} title="Link to a note ([[)">[[ ]]</button>
    {#if !floating}<span class="hint">Type <kbd>/</kbd> for blocks</span>{/if}
  </div>

<style>
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    align-items: center;
  }
  .toolbar button {
    min-width: 32px;
    min-height: 30px;
    padding: 0 7px;
    border: 0;
    border-radius: 9px;
    background: none;
    font: inherit;
    font-size: 13px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .toolbar button:hover {
    background: var(--panel);
    color: var(--text);
  }
  .toolbar .study {
    color: var(--alert-ink);
    font-weight: 700;
  }
  .hl {
    display: inline-flex;
    gap: 3px;
    padding: 0 4px;
  }
  .toolbar .dot {
    min-width: 0;
    width: 16px;
    height: 16px;
    min-height: 0;
    padding: 0;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--charcoal) 10%, transparent);
  }
  .toolbar .dot.none {
    background: linear-gradient(135deg, transparent 44%, var(--alert-ink) 45% 55%, transparent 56%), var(--surface) !important;
  }
  .toolbar .dot:hover {
    transform: scale(1.25);
  }
  .sep {
    width: 1px;
    height: 16px;
    margin: 0 4px;
    background: var(--hairline);
  }
  .hint {
    margin-left: auto;
    font-size: 12px;
    color: var(--text-muted);
  }
  .hint kbd {
    font: inherit;
    font-weight: 700;
    padding: 0 5px;
    border-radius: 5px;
    background: var(--chip);
  }
  .toolbar.floating {
    flex-wrap: nowrap;
    padding: 6px 8px;
    border-radius: 999px;
    background: var(--surface-float, var(--surface));
    border: var(--edge, 0);
    box-shadow: 0 18px 40px -16px rgba(40, 44, 80, 0.45);
    -webkit-backdrop-filter: var(--blur, none);
    backdrop-filter: var(--blur, none);
    overflow-x: auto;
    max-width: 100%;
    scrollbar-width: none;
  }
  @container (max-width: 700px) {
    .hint {
      display: none;
    }
  }
</style>
