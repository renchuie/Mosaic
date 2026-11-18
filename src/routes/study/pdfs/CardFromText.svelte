<script lang="ts">
  // Make a library card from text selected in a PDF. Cloze: click words to hide them
  // (neighbouring words join one gap; each gap is its own card). Basic: question → the text.
  import { courseNames } from "../../../lib/stores/courses.svelte";
  import { saveItem } from "../../../lib/stores/library.svelte";

  let {
    open = $bindable(false),
    text,
    pdf,
    page,
    course,
    onsaved,
  }: { open: boolean; text: string; pdf: string; page: number; course?: string; onsaved: (itemId: string) => void } = $props();

  let dialog = $state<HTMLDialogElement>();
  let mode = $state<"cloze" | "basic">("cloze");
  let words = $state<{ w: string; on: boolean }[]>([]);
  let front = $state("");
  let back = $state("");
  let crs = $state("");
  let error = $state<string | null>(null);

  $effect(() => {
    if (open && dialog && !dialog.open) {
      const clean = text.replace(/\s+/g, " ").trim();
      words = clean.split(" ").filter(Boolean).map((w) => ({ w, on: false }));
      front = "";
      back = clean;
      crs = course ?? "";
      error = null;
      mode = "cloze";
      dialog.showModal();
    }
  });

  // drag across words to toggle a run of them
  let dragTo: boolean | null = null;
  function down(i: number, e: PointerEvent) {
    e.preventDefault();
    dragTo = !words[i].on;
    words[i].on = dragTo;
  }
  function enter(i: number) {
    if (dragTo !== null) words[i].on = dragTo;
  }

  /** "a {{b c}} d {{e}}": punctuation at a gap's edge stays outside it */
  const clozeText = $derived.by(() => {
    const out: string[] = [];
    let run: string[] = [];
    const flush = () => {
      if (!run.length) return;
      const joined = run.join(" ");
      const m = /^([("'“]*)(.*?)([)"'”.,;:!?]*)$/.exec(joined)!;
      out.push(`${m[1]}{{${m[2] || joined}}}${m[2] ? m[3] : ""}`);
      run = [];
    };
    for (const { w, on } of words) {
      if (on) run.push(w);
      else {
        flush();
        out.push(w);
      }
    }
    flush();
    return out.join(" ");
  });
  const gaps = $derived((clozeText.match(/\{\{/g) ?? []).length);

  function save() {
    error = null;
    let id: string;
    const base = { course: crs || undefined, created: Date.now(), source: { pdf, page } };
    if (mode === "cloze") {
      if (!gaps) return (error = "Click the words to hide first.");
      id = saveItem(null, { type: "cloze", fields: { Text: clozeText, Extra: "" }, ...base });
    } else {
      if (!front.trim() || !back.trim()) return (error = "Fill in both sides.");
      id = saveItem(null, { type: "basic", fields: { Front: front.trim(), Back: back.trim() }, ...base });
    }
    onsaved(id);
    dialog?.close();
  }
</script>

<svelte:window onpointerup={() => (dragTo = null)} />

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="cft-title">
  <form onsubmit={(e) => { e.preventDefault(); save(); }}>
    <header>
      <h2 id="cft-title" class="h2">Make a card</h2>
      <div class="seg" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "cloze"} class:on={mode === "cloze"} onclick={() => (mode = "cloze")}>Cloze</button>
        <button type="button" role="tab" aria-selected={mode === "basic"} class:on={mode === "basic"} onclick={() => (mode = "basic")}>Question</button>
      </div>
      <button type="button" class="x" aria-label="Close" onclick={() => dialog?.close()}>×</button>
    </header>
    {#if mode === "cloze"}
      <p class="muted small">Click or drag the words to hide. Each gap is a card.</p>
      <div class="words" aria-label="Words">
        {#each words as w, i}
          <button type="button" class="w" class:on={w.on} aria-pressed={w.on} onpointerdown={(e) => down(i, e)} onpointerenter={() => enter(i)} onkeydown={(e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), (w.on = !w.on))}>{w.w}</button>
        {/each}
      </div>
      <p class="prev"><span class="label">Makes {gaps} {gaps === 1 ? "card" : "cards"}</span> <code>{clozeText}</code></p>
    {:else}
      <label class="field"><span class="label">Question</span><textarea class="input" rows="2" bind:value={front} placeholder="Question"></textarea></label>
      <label class="field"><span class="label">Answer</span><textarea class="input" rows="3" bind:value={back}></textarea></label>
    {/if}
    <label class="field"><span class="label">Course</span><select class="input" bind:value={crs}><option value="">None</option>{#each courseNames() as c}<option value={c}>{c}</option>{/each}</select></label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <footer>
      <span class="muted small">Linked to page {page}</span>
      <span class="sp"></span>
      <button type="button" class="btn quiet" onclick={() => dialog?.close()}>Cancel</button>
      <button type="submit" class="btn primary">Make {mode === "cloze" ? gaps || "" : ""} {mode === "cloze" && gaps !== 1 ? "cards" : "card"}</button>
    </footer>
  </form>
</dialog>

<style>
  dialog {
    width: min(640px, calc(100vw - 24px));
    max-height: calc(100vh - 24px);
    border: 0;
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-lift);
    padding: 0;
  }
  dialog::backdrop {
    background: var(--scrim);
  }
  form {
    display: grid;
    gap: 12px;
    padding: 20px 22px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  header h2 {
    flex: 1;
  }
  .x {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 0;
    background: var(--chip);
    font-size: 20px;
    color: var(--text);
  }
  .seg {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: var(--radius-pill);
    background: var(--chip);
  }
  .seg button {
    min-height: 36px;
    padding: 0 14px;
    border: 0;
    border-radius: var(--radius-pill);
    background: none;
    color: var(--text-muted);
    font-weight: 500;
  }
  .seg button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  .words {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 2px;
    padding: 14px;
    border-radius: 18px;
    background: var(--panel);
    max-height: 40vh;
    overflow: auto;
    user-select: none;
    line-height: 1.5;
  }
  .w {
    border: 0;
    padding: 3px 5px;
    border-radius: 8px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 16px;
    cursor: pointer;
  }
  .w:hover {
    background: var(--chip);
  }
  .w.on {
    background: color-mix(in srgb, var(--sage) 70%, var(--white));
    font-weight: 600;
  }
  .prev {
    margin: 0;
    display: grid;
    gap: 4px;
  }
  .prev code {
    font-family: inherit;
    font-size: 14px;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }
  .field {
    display: grid;
    gap: 6px;
  }
  .small {
    font-size: 13px;
  }
  .error {
    color: var(--rose-deep);
    margin: 0;
  }
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .sp {
    flex: 1;
  }
</style>
