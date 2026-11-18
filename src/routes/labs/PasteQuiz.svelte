<script lang="ts">
  // Paste a quiz straight from Claude / NotebookLM. It is checked as she types; Continue turns
  // it into a .md file and hands it to the upload dialog (course, folder, duplicates).
  import Icon from "../../lib/components/Icon.svelte";
  import { safeName } from "../../lib/materials";
  import { parseQuiz, QUIZ_GUIDE, TYPE_LABEL } from "../../lib/quiz";

  let { open = $bindable(false), onfile }: { open: boolean; onfile: (f: File) => void } = $props();
  let dialog = $state<HTMLDialogElement>();
  let text = $state("");
  let copied = $state(false);

  $effect(() => {
    if (open && dialog && !dialog.open) {
      text = "";
      copied = false;
      dialog.showModal();
    }
  });

  /** Claude often wraps files in ``` fences; take what is inside */
  const cleaned = $derived(text.replace(/^\s*```[a-z]*\n([\s\S]*?)\n```\s*$/i, "$1").trim());
  const parsed = $derived(cleaned ? parseQuiz(cleaned, "Pasted quiz") : null);
  const types = $derived(parsed ? [...new Set(parsed.questions.map((q) => TYPE_LABEL[q.type]))] : []);

  async function copyGuide() {
    try {
      await navigator.clipboard.writeText(QUIZ_GUIDE);
      copied = true;
      setTimeout(() => (copied = false), 2500);
    } catch {
      copied = false;
    }
  }
  function next() {
    if (!parsed || !parsed.questions.length) return;
    const body = parsed.meta.mosaic ? cleaned : `---\nmosaic: quiz\ntitle: ${parsed.meta.title}\n---\n\n${cleaned}`;
    onfile(new File([body + "\n"], `${safeName(parsed.meta.title)}.md`, { type: "text/markdown" }));
    dialog?.close();
  }
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="pq-title">
  <div class="wrap">
    <header>
      <h2 id="pq-title" class="h2">Paste a quiz</h2>
      <button type="button" class="x" aria-label="Close" onclick={() => dialog?.close()}>×</button>
    </header>
    <div class="howto">
      <p class="sm">Paste a quiz in the Mosaic format.</p>
      <button type="button" class="btn quiet sm" onclick={copyGuide}><Icon name={copied ? "check" : "note"} size={15} /> {copied ? "Copied! Paste it into Claude" : "Copy format for Claude"}</button>
    </div>
    <label class="field">
      <span class="label">Quiz</span>
      <textarea class="input" rows="12" bind:value={text} spellcheck="false" placeholder={"---\nmosaic: quiz\ntitle: Anticoagulation practice\ncourse: Therapeutics IV\n---\n\n## Q1 · single · DOAC dosing\n…"}></textarea>
    </label>
    {#if parsed}
      <div class="check" class:good={parsed.questions.length > 0}>
        {#if parsed.questions.length}
          <b><Icon name="check" size={16} /> {parsed.meta.title}: {parsed.questions.length} {parsed.questions.length === 1 ? "question" : "questions"}</b>
          <span class="muted sm">{types.join(" · ")}{parsed.meta.course ? ` · ${parsed.meta.course}` : ""}{parsed.meta.exam ? ` · ${parsed.meta.exam}` : ""}</span>
        {:else}
          <b>No questions found yet.</b>
        {/if}
        {#if parsed.problems.length}
          <ul>{#each parsed.problems.slice(0, 6) as p}<li><span class="ln">line {p.line}</span> {p.msg}</li>{/each}</ul>
          {#if parsed.problems.length > 6}<span class="muted sm">and {parsed.problems.length - 6} more</span>{/if}
        {/if}
      </div>
    {/if}
    <footer>
      <span class="sp"></span>
      <button type="button" class="btn quiet" onclick={() => dialog?.close()}>Cancel</button>
      <button type="button" class="btn primary" onclick={next} disabled={!parsed?.questions.length}>Continue</button>
    </footer>
  </div>
</dialog>

<style>
  dialog {
    width: min(720px, calc(100vw - 24px));
    max-height: calc(100vh - 24px);
    border: 0;
    border-radius: var(--radius);
    background: var(--surface-float);
    color: var(--text);
    box-shadow: var(--shadow-lift);
    padding: 0;
  }
  dialog::backdrop {
    background: var(--scrim);
  }
  .wrap {
    display: grid;
    gap: 14px;
    padding: 20px 22px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .x {
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 50%;
    background: var(--chip);
    font-size: 20px;
  }
  .howto {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 12px 14px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--lavender) 25%, transparent);
  }
  .sm {
    font-size: 13px;
  }
  .btn.sm {
    min-height: 38px;
    padding: 0 14px;
    font-size: 14px;
  }
  textarea {
    font-family: ui-monospace, "JetBrains Mono", monospace;
    font-size: 13px;
    resize: vertical;
  }
  .check {
    display: grid;
    gap: 6px;
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--butter-soft);
    animation: rise-in 0.3s var(--spring);
  }
  .check.good {
    background: var(--sage-soft);
  }
  .check b {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
  .check ul {
    margin: 4px 0 0;
    padding-left: 18px;
    font-size: 13.5px;
  }
  .ln {
    font-size: 12px;
    color: var(--text-muted);
  }
  footer {
    display: flex;
    gap: 8px;
  }
  .sp {
    flex: 1;
  }
</style>
