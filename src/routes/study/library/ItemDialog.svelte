<script lang="ts">
  import { cardHtml } from "../../../lib/cards";
  import type { FlashItem } from "../../../lib/cardTypes";
  import { courseNames } from "../../../lib/stores/courses.svelte";
  import { cardsOfItem, deleteItem, getItem, getType, previewImages, saveItem } from "../../../lib/stores/library.svelte";
  import { imageUrl } from "../../../lib/stores/notes.svelte";
  import OcclusionView from "../../../lib/components/OcclusionView.svelte";

  let { id = $bindable(null) }: { id: string | null } = $props();
  let dialog = $state<HTMLDialogElement>();
  let d = $state<FlashItem | null>(null);
  let tags = $state("");
  let confirmDel = $state(false);

  $effect(() => {
    const it = id ? getItem(id) : undefined;
    if (id && it && dialog && !dialog.open) {
      d = structuredClone($state.snapshot(it) as FlashItem);
      tags = (it.tags ?? []).join(", ");
      confirmDel = false;
      dialog.showModal();
    }
  });
  const type = $derived(d ? getType(d.type) : undefined);
  const preview = $derived(d && id ? cardsOfItem(`${id}-preview`, { ...$state.snapshot(d) } as FlashItem) : []);
  const img = (s: string) => previewImages.get(s) ?? imageUrl("", s);

  function close() {
    id = null;
    dialog?.close();
  }
  function save() {
    if (!d || !id) return;
    saveItem(id, { ...$state.snapshot(d), tags: tags.split(",").map((x) => x.trim().replace(/^#/, "")).filter(Boolean) } as FlashItem);
    close();
  }
</script>

<dialog bind:this={dialog} onclose={() => (id = null)} aria-labelledby="it-title">
  {#if d && type}
    <form onsubmit={(e) => { e.preventDefault(); save(); }}>
      <header><h2 id="it-title" class="h2">{type.name}</h2><button type="button" class="x" aria-label="Close" onclick={close}>×</button></header>
      {#if type.kind !== "occlusion"}
        {#each type.fields as f}
          <label class="field"><span class="label">{f}</span><textarea class="input" rows={d.fields[f]?.length > 60 || f === "Text" ? 3 : 1} bind:value={d.fields[f]}></textarea></label>
        {/each}
      {:else}
        <label class="field"><span class="label">Header</span><input class="input" bind:value={d.fields.Header} /></label>
        <label class="field"><span class="label">Extra (shown on the back)</span><input class="input" bind:value={d.fields.Extra} /></label>
      {/if}
      <div class="two">
        <label class="field"><span class="label">Course</span><select class="input" bind:value={d.course}><option value={undefined}>None</option>{#each courseNames() as c}<option value={c}>{c}</option>{/each}</select></label>
        <label class="field"><span class="label">Tags</span><input class="input" bind:value={tags} placeholder="comma separated" /></label>
      </div>
      <section class="prev">
        <h3 class="label">Makes {preview.length} {preview.length === 1 ? "card" : "cards"}</h3>
        {#each preview.slice(0, 8) as c (c.key)}
          <div class="pc">
            {#if c.masks && c.image}<OcclusionView src={img(c.image)} masks={c.masks} target={c.target} />{/if}
            <div class="pf">{@html cardHtml(c.front, img)}</div>
            <div class="pb">{@html cardHtml(c.back, img)}</div>
          </div>
        {/each}
      </section>
      <footer>
        {#if confirmDel}
          <button type="button" class="btn quiet danger" onclick={() => { deleteItem(id!); close(); }}>Delete, and its review history</button>
        {:else}
          <button type="button" class="btn quiet" onclick={() => (confirmDel = true)}>Delete</button>
        {/if}
        <span class="sp"></span>
        <button type="button" class="btn quiet" onclick={close}>Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </footer>
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(620px, calc(100vw - 24px));
    max-height: calc(100vh - 32px);
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
    padding: 22px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .x {
    width: var(--hit);
    height: var(--hit);
    border: 0;
    border-radius: 50%;
    background: none;
    font-size: 24px;
    color: var(--text-muted);
  }
  textarea.input {
    resize: vertical;
    min-height: 44px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .prev {
    display: grid;
    gap: 8px;
    padding: 12px;
    border-radius: 16px;
    background: var(--panel);
  }
  .pc {
    display: grid;
    gap: 4px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--surface);
  }
  .pf {
    font-weight: 600;
  }
  .pb {
    font-size: 13.5px;
    color: var(--text-muted);
  }
  .pc :global(p) {
    margin: 0;
  }
  .pc :global(.gap),
  .pc :global(mark) {
    background: var(--butter);
    border-radius: 4px;
    padding: 0 3px;
  }
  footer {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .sp {
    flex: 1;
  }
  .danger {
    background: var(--rose-soft);
    color: var(--alert-ink);
  }
</style>
