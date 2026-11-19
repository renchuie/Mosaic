<script lang="ts">
  import { TEMPLATES } from "../../lib/notes";
  import { courseNames } from "../../lib/stores/courses.svelte";
  import { settings } from "../../lib/stores/settings.svelte";
  /** drug / disease / case templates only with drug tools on */
  const HEALTH = new Set(["drug", "disease", "case"]);
  const templates = $derived(Object.entries(TEMPLATES).filter(([k]) => settings.drugTools || !HEALTH.has(k)));
  import { createNote, makeFolder, noteHref, notes, noteDirs } from "../../lib/stores/notes.svelte";

  let { open = $bindable(false), folder = "", mode = "note" }: { open: boolean; folder?: string; mode?: "note" | "folder" } = $props();
  let dialog = $state<HTMLDialogElement>();
  let title = $state("");
  let template = $state("blank");
  let dir = $state("");
  let course = $state("");
  let error = $state<string | null>(null);

  $effect(() => {
    if (open && dialog && !dialog.open) {
      title = "";
      template = "blank";
      dir = folder;
      course = "";
      error = null;
      dialog.showModal();
    }
  });
  const dirs = $derived(["", ...noteDirs()]);

  async function go(e: SubmitEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return (error = mode === "folder" ? "Name the folder." : "Give the note a title.");
    try {
      if (mode === "folder") {
        await makeFolder(`${dir ? dir + "/" : ""}${t.replace(/[\\/:*?"<>|]+/g, " ").trim()}`);
      } else {
        const rel = await createNote(dir, t, template, course ? { course } : {});
        location.hash = noteHref(rel);
      }
      open = false;
      dialog?.close();
    } catch (err) {
      error = String(err instanceof Error ? err.message : err);
    }
  }
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="nn-title">
  <form onsubmit={go}>
    <h2 id="nn-title" class="h2">{mode === "folder" ? "New folder" : "New note"}</h2>
    <label class="field"><span class="label">{mode === "folder" ? "Folder name" : "Title"}</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input class="input" bind:value={title} autofocus placeholder={mode === "folder" ? "Folder name" : "Title"} /></label>
    <label class="field"><span class="label">Inside</span>
      <select class="input" bind:value={dir}>{#each dirs as d}<option value={d}>{d || "Notes (top level)"}</option>{/each}</select></label>
    {#if mode === "note"}
      <div class="field">
        <span class="label">Template</span>
        <div class="tpl" role="radiogroup" aria-label="Template">
          {#each templates as [k, v]}
            <button type="button" role="radio" aria-checked={template === k} class:on={template === k} onclick={() => (template = k)}>{v.label}</button>
          {/each}
        </div>
      </div>
      <label class="field"><span class="label">Course</span>
        <select class="input" bind:value={course}><option value="">None</option>{#each courseNames() as c}<option value={c}>{c}</option>{/each}</select></label>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <footer>
      <button type="button" class="btn quiet" onclick={() => dialog?.close()}>Cancel</button>
      <button type="submit" class="btn primary">Create</button>
    </footer>
  </form>
</dialog>

<style>
  dialog {
    width: min(480px, calc(100vw - 24px));
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
    gap: 14px;
    padding: 22px;
  }
  .tpl {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tpl button {
    min-height: 38px;
    padding: 0 14px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--panel);
    font-size: 13.5px;
    font-weight: 500;
  }
  .tpl button.on {
    background: var(--charcoal);
    color: var(--on-primary);
  }
  .error {
    background: var(--rose-soft);
    color: var(--alert-ink);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
