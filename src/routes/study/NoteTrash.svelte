<script lang="ts">
  // The notes folder's .trash, in the app (Nov 19): deleted notes and folders, where they were,
  // when; put back (in the same folder) or delete for good. Emptied after settings.trashDays.
  import Icon from "../../lib/components/Icon.svelte";
  import { noteHref, purgeTrash, restoreFromTrash, trashList, type TrashItem } from "../../lib/stores/notes.svelte";
  import { settings } from "../../lib/stores/settings.svelte";

  let { open = $bindable(false) }: { open: boolean } = $props();
  let dialog = $state<HTMLDialogElement>();
  let items = $state<TrashItem[]>([]);
  let loading = $state(false);
  let msg = $state("");
  let sure = $state(false);

  $effect(() => {
    if (open && dialog && !dialog.open) {
      dialog.showModal();
      msg = "";
      sure = false;
      void load();
    }
  });
  async function load() {
    loading = true;
    items = await trashList().catch(() => []);
    loading = false;
  }
  const ago = (t: number) => {
    const d = Math.floor((Date.now() - t) / 86_400_000);
    return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
  };
  const label = (t: TrashItem) => (t.dir ? t.name : t.name.replace(/\.md$/i, ""));
  const where = (t: TrashItem) => (t.from.includes("/") ? t.from.slice(0, t.from.lastIndexOf("/")) : "Notes");

  async function restore(t: TrashItem) {
    try {
      const rel = await restoreFromTrash(t);
      items = items.filter((x) => x.id !== t.id);
      msg = rel !== t.from && t.from ? `Put back as “${label({ ...t, name: rel.split("/").pop()! })}” (the name was taken).` : `Put back in ${where({ ...t, from: rel })}.`;
      if (!t.dir) msgHref = noteHref(rel);
    } catch (e) {
      msg = String(e instanceof Error ? e.message : e);
    }
  }
  let msgHref = $state("");
  async function forget(t: TrashItem) {
    await purgeTrash(t.id).catch(() => 0);
    items = items.filter((x) => x.id !== t.id);
  }
  async function empty() {
    await purgeTrash("", 0).catch(() => 0);
    items = [];
    sure = false;
  }
  function close() {
    open = false;
    dialog?.close();
  }
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="tr-title">
  <header>
    <h2 id="tr-title">Trash</h2>
    <button type="button" class="x" aria-label="Close" onclick={close}>×</button>
  </header>
  {#if msg}<p class="msg">{msg}{#if msgHref}&nbsp;<a href={msgHref} onclick={close}>Open</a>{/if}</p>{/if}
  <ul>
    {#if loading}
      <li class="empty">Loading…</li>
    {:else}
      {#each items as t (t.id)}
        <li>
          <span class="ic"><Icon name={t.dir ? "folder" : "note"} size={16} /></span>
          <span class="nm"><b>{label(t)}</b><small>{where(t)} · {ago(t.deleted)}</small></span>
          <button type="button" class="btn quiet sm" onclick={() => restore(t)}>Restore</button>
          <button type="button" class="del" title="Delete for good" aria-label="Delete {label(t)} for good" onclick={() => forget(t)}><Icon name="trash" size={15} /></button>
        </li>
      {:else}
        <li class="empty">Nothing here.</li>
      {/each}
    {/if}
  </ul>
  <footer>
    <span class="hint">Emptied after {settings.trashDays ?? 30} days.</span>
    {#if items.length}
      {#if sure}
        <button type="button" class="btn quiet sm" onclick={() => (sure = false)}>Cancel</button>
        <button type="button" class="btn sm danger" onclick={empty}>Delete {items.length} for good</button>
      {:else}
        <button type="button" class="btn quiet sm" onclick={() => (sure = true)}>Empty trash</button>
      {/if}
    {/if}
  </footer>
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 24px));
    max-height: min(640px, calc(100vh - 48px));
    border: 0;
    border-radius: var(--radius);
    background: var(--surface-float, var(--surface));
    color: var(--text);
    box-shadow: var(--shadow-lift);
    padding: 0;
  }
  dialog[open] {
    display: flex;
    flex-direction: column;
  }
  dialog::backdrop {
    background: var(--scrim);
  }
  header,
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 20px;
  }
  header {
    border-bottom: 1px solid var(--hairline);
  }
  footer {
    border-top: 1px solid var(--hairline);
    justify-content: flex-end;
  }
  h2 {
    margin: 0;
    flex: 1;
    font-size: 18px;
    font-weight: 600;
  }
  .x {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
    background: var(--chip);
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
  }
  .msg {
    margin: 12px 20px 0;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--sage-soft);
    font-size: 13.5px;
  }
  ul {
    flex: 1 1 auto;
    min-height: 0;
    margin: 0;
    padding: 8px 12px;
    list-style: none;
    overflow-y: auto;
  }
  li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border-radius: 12px;
  }
  li:hover {
    background: var(--chip);
  }
  .ic {
    display: inline-grid;
    place-items: center;
    color: var(--text-muted);
  }
  .nm {
    flex: 1;
    display: grid;
    min-width: 0;
  }
  .nm b {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 14.5px;
  }
  .nm small {
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .del {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }
  .del:hover {
    background: color-mix(in srgb, var(--rose) 35%, var(--white));
    color: var(--alert-ink);
  }
  .empty {
    color: var(--text-muted);
    font-size: 14px;
  }
  .hint {
    margin-right: auto;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .danger {
    background: var(--alert-ink);
    color: var(--white);
  }
</style>
