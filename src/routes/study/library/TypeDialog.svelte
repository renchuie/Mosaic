<script lang="ts">
  import { cardHtml } from "../../../lib/cards";
  import { render, type CardType } from "../../../lib/cardTypes";
  import { deleteType, getType, items, saveType } from "../../../lib/stores/library.svelte";
  import { newId } from "../../../lib/stores/synced.svelte";

  let { id = $bindable(null), onsaved }: { id: string | null; onsaved?: (id: string) => void } = $props();
  let dialog = $state<HTMLDialogElement>();
  let d = $state<CardType | null>(null);
  let error = $state<string | null>(null);

  $effect(() => {
    if (id && dialog && !dialog.open) {
      const t = id === "new" ? null : getType(id);
      d = t
        ? structuredClone($state.snapshot(t) as CardType)
        : { name: "", fields: ["Front", "Back"], templates: [{ id: newId().slice(-4), name: "Card 1", front: "{{Front}}", back: "{{Back}}" }] };
      error = null;
      dialog.showModal();
    }
  });
  const sample = $derived.by(() => {
    if (!d || !id || id === "new") return null;
    return items().find(([, i]) => i.type === id)?.[1].fields ?? null;
  });
  const demo = $derived(sample ?? Object.fromEntries((d?.fields ?? []).map((f) => [f, `‹${f}›`])));

  function renameField(i: number, to: string) {
    if (!d) return;
    const from = d.fields[i];
    d.fields[i] = to;
    for (const t of d.templates) {
      t.front = t.front.split(`{{${from}}}`).join(`{{${to}}}`).split(`{{#${from}}}`).join(`{{#${to}}}`).split(`{{/${from}}}`).join(`{{/${to}}}`);
      t.back = t.back.split(`{{${from}}}`).join(`{{${to}}}`).split(`{{#${from}}}`).join(`{{#${to}}}`).split(`{{/${from}}}`).join(`{{/${to}}}`);
    }
  }
  function close() {
    id = null;
    dialog?.close();
  }
  function save(e: SubmitEvent) {
    e.preventDefault();
    if (!d) return;
    if (!d.name.trim()) return (error = "Name the card type.");
    if (!d.fields.length || d.fields.some((f) => !f.trim())) return (error = "Every field needs a name.");
    if (new Set(d.fields).size !== d.fields.length) return (error = "Field names must be different.");
    const key = saveType(id === "new" ? null : id, $state.snapshot(d) as CardType);
    onsaved?.(key);
    close();
  }
  function remove() {
    if (!id || id === "new") return;
    if (!deleteType(id)) return (error = "This type is built in, or has cards. Delete its cards first.");
    close();
  }
</script>

<dialog bind:this={dialog} onclose={() => (id = null)} aria-labelledby="ty-title">
  {#if d}
    <form onsubmit={save}>
      <header><h2 id="ty-title" class="h2">{id === "new" ? "New card type" : "Card type"}</h2><button type="button" class="x" aria-label="Close" onclick={close}>×</button></header>
      <label class="field"><span class="label">Name</span><input class="input" bind:value={d.name} /></label>
      {#if d.kind !== "occlusion"}
        <div class="field">
          <span class="label">Fields</span>
          {#each d.fields as f, i}
            <div class="frow">
              <input class="input" value={f} aria-label="Field name" onchange={(e) => renameField(i, e.currentTarget.value.trim())} />
              <button type="button" class="ib" disabled={i === 0} aria-label="Move up" onclick={() => { const a = [...d!.fields]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; d!.fields = a; }}>▲</button>
              <button type="button" class="ib" aria-label="Remove {f}" onclick={() => (d!.fields = d!.fields.filter((_, j) => j !== i))}>×</button>
            </div>
          {/each}
          <button type="button" class="btn quiet sm" onclick={() => (d!.fields = [...d!.fields, `Field ${d!.fields.length + 1}`])}>+ Field</button>
        </div>
        <div class="field">
          <span class="label">Cards (templates)</span>
          <p class="muted small"><code>{"{{Field}}"}</code> inserts a field; <code>{"{{#Field}}…{{/Field}}"}</code> shows only when it's filled.</p>
          {#each d.templates as t, i (t.id)}
            <div class="tpl">
              <div class="th"><input class="input" bind:value={t.name} aria-label="Template name" /><button type="button" class="ib" aria-label="Remove template" onclick={() => (d!.templates = d!.templates.filter((_, j) => j !== i))}>×</button></div>
              <div class="tg">
                <label><span class="label">Front</span><textarea class="input mono" rows="3" bind:value={t.front}></textarea></label>
                <label><span class="label">Back</span><textarea class="input mono" rows="3" bind:value={t.back}></textarea></label>
              </div>
              <div class="pv"><div>{@html cardHtml(render(t.front, demo)) || "<em>(no card: empty front)</em>"}</div><div class="muted">{@html cardHtml(render(t.back, demo))}</div></div>
            </div>
          {/each}
          <button type="button" class="btn quiet sm" onclick={() => (d!.templates = [...d!.templates, { id: newId().slice(-4), name: `Card ${d!.templates.length + 1}`, front: `{{${d!.fields[0]}}}`, back: `{{${d!.fields[1] ?? d!.fields[0]}}}` }])}>+ Card</button>
        </div>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <footer>
        {#if id !== "new" && !d.builtin}<button type="button" class="btn quiet" onclick={remove}>Delete type</button>{/if}
        <span class="sp"></span>
        <button type="button" class="btn quiet" onclick={close}>Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </footer>
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(760px, calc(100vw - 24px));
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
    gap: 14px;
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
  .frow,
  .th {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 6px;
    align-items: center;
  }
  .th {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .ib {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    background: var(--panel);
    color: var(--text-muted);
  }
  .ib:disabled {
    opacity: 0.3;
  }
  .sm {
    justify-self: start;
    min-height: 36px;
    font-size: 13px;
  }
  .small {
    font-size: 13px;
  }
  .small code {
    background: var(--chip);
    padding: 1px 5px;
    border-radius: 5px;
  }
  .tpl {
    display: grid;
    gap: 8px;
    padding: 12px;
    border-radius: 16px;
    background: var(--panel);
  }
  .tpl .input {
    background: var(--surface);
  }
  .tg {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .tg label {
    display: grid;
    gap: 4px;
  }
  .mono {
    font-family: ui-monospace, monospace;
    font-size: 13px;
    resize: vertical;
  }
  .pv {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 12px;
    background: var(--surface);
    font-size: 13.5px;
  }
  .pv :global(p) {
    margin: 0 0 4px;
  }
  .error {
    background: var(--rose-soft);
    color: var(--alert-ink);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
  }
  footer {
    display: flex;
    gap: 8px;
  }
  .sp {
    flex: 1;
  }
</style>
