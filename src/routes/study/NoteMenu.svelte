<script lang="ts">
  // The right-click menu for notes and folders (notes list, Notes home), the ghost that follows a
  // dragged note or folder, and short messages ("there's already a note called …"). Mounted once
  // on the notes page and moved to <body>, so `position: fixed` means the window (the glass panel
  // around the page would otherwise be the frame).
  import Icon from "../../lib/components/Icon.svelte";
  import { PALETTE } from "../../lib/calendar";
  import { linkName, noteDirs, noteHref, notes, dirOf, getNote } from "../../lib/stores/notes.svelte";
  import {
    doMoveFolder, doMoveNote, doRenameFolder, doRenameNote, doTrashFolder, doTrashNote, folderLook, IMPORT_ACCEPT, importFiles, noteDrag, noteMenu, setFolderLook,
  } from "../../lib/stores/noteOps.svelte";
  import IconPicker from "../../lib/components/IconPicker.svelte";

  let { onnew, onnewfolder }: { onnew: (folder: string) => void; onnewfolder: (folder: string) => void } = $props();

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  const m = $derived(noteMenu.open);
  const name = $derived(m ? (m.kind === "note" ? (getNote(m.rel) ? linkName(getNote(m.rel)!) : m.rel) : m.rel.split("/").pop()!) : "");
  const count = $derived(m?.kind === "folder" ? Object.keys(notes.files).filter((r) => r.startsWith(m.rel + "/")).length : 0);
  const look = $derived(m?.kind === "folder" ? folderLook(m.rel) : {});
  let text = $state("");
  let picker = $state<HTMLInputElement>();
  let importTo = "";
  let box = $state<HTMLDivElement>();
  let pos = $state({ x: 0, y: 0 });

  const close = () => (noteMenu.open = null);
  function view(v: "menu" | "rename" | "look" | "delete" | "move") {
    if (!noteMenu.open) return;
    noteMenu.open.view = v;
    if (v === "rename") text = name;
  }

  // keep the menu inside the window (measured after each view change)
  $effect(() => {
    if (!m || !box) return;
    void m.view;
    const r = box.getBoundingClientRect();
    pos = { x: Math.max(8, Math.min(m.x, innerWidth - r.width - 8)), y: Math.max(8, Math.min(m.y, innerHeight - r.height - 8)) };
  });

  async function rename(e: SubmitEvent) {
    e.preventDefault();
    if (!m || !text.trim() || text.trim() === name) return close();
    const ok = m.kind === "note" ? await doRenameNote(m.rel, text) : await doRenameFolder(m.rel, text);
    if (ok) close();
  }
  async function remove() {
    if (!m) return;
    const t = m;
    close();
    if (t.kind === "note") await doTrashNote(t.rel);
    else await doTrashFolder(t.rel);
  }
  async function moveTo(d: string) {
    if (!m) return;
    const t = m;
    close();
    if (t.kind === "note") await doMoveNote(t.rel, d);
    else await doMoveFolder(t.rel, `${d ? d + "/" : ""}${t.rel.split("/").pop()}`);
  }
  /** folders a note or folder can move to (not where it is, not inside itself) */
  const targets = $derived.by(() => {
    if (!m) return [];
    const here = dirOf(m.rel);
    return ["", ...noteDirs()].filter((d) => d !== here && (m.kind === "note" || (d !== m.rel && !d.startsWith(m.rel + "/"))));
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape" && noteMenu.open) { e.preventDefault(); close(); } }} />

<input bind:this={picker} type="file" accept={IMPORT_ACCEPT} multiple hidden onchange={(e) => { const i = e.currentTarget as HTMLInputElement; void importFiles(i.files, importTo).then(() => (i.value = "")); }} />

<div use:portal class="nm-root">
  {#if m}
    <button type="button" class="nm-scrim" aria-label="Close menu" onclick={close} oncontextmenu={(e) => { e.preventDefault(); close(); }}></button>
    <div class="menu nm" bind:this={box} style="left: {pos.x}px; top: {pos.y}px" role="menu" aria-label="{m.kind === 'note' ? 'Note' : 'Folder'} options">
      {#if m.view === "menu"}
        <p class="nm-h">{#if m.kind === "folder" && look.icon}<span class="nm-ic"><Icon name={look.icon} size={16} /></span>{/if}<b>{name}</b></p>
        {#if m.kind === "note"}
          <a class="mi" role="menuitem" href={noteHref(m.rel)} onclick={close}><Icon name="note" size={15} />Open</a>
          <button type="button" class="mi" role="menuitem" onclick={() => view("rename")}><Icon name="pen" size={15} />Rename</button>
          <button type="button" class="mi" role="menuitem" onclick={() => view("move")}><Icon name="folder" size={15} />Move to…</button>
          <span class="nm-sep"></span>
          <button type="button" class="mi del" role="menuitem" onclick={() => view("delete")}><Icon name="trash" size={15} />Delete</button>
        {:else}
          <button type="button" class="mi" role="menuitem" onclick={() => { const d = m.rel; close(); onnew(d); }}><Icon name="plus" size={15} />New note here</button>
          <button type="button" class="mi" role="menuitem" onclick={() => { const d = m.rel; close(); onnewfolder(d); }}><Icon name="folder" size={15} />New folder inside</button>
          <button type="button" class="mi" role="menuitem" onclick={() => { importTo = m.rel; close(); picker?.click(); }}><Icon name="file" size={15} />Import notes here…</button>
          <span class="nm-sep"></span>
          <button type="button" class="mi" role="menuitem" onclick={() => view("rename")}><Icon name="pen" size={15} />Rename</button>
          <button type="button" class="mi" role="menuitem" onclick={() => view("look")}><span class="nm-ic"><Icon name={look.icon ?? "palette"} size={15} /></span>Icon and colour</button>
          <button type="button" class="mi" role="menuitem" onclick={() => view("move")}><Icon name="folder" size={15} />Move to…</button>
          <span class="nm-sep"></span>
          <button type="button" class="mi del" role="menuitem" onclick={() => view("delete")}><Icon name="trash" size={15} />Delete folder</button>
        {/if}
      {:else if m.view === "rename"}
        <form class="nm-form" onsubmit={rename}>
          <label class="label" for="nm-name">{m.kind === "note" ? "Rename note" : "Rename folder"}</label>
          <!-- svelte-ignore a11y_autofocus -->
          <input id="nm-name" class="input" bind:value={text} autofocus onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
          {#if m.kind === "note"}<p class="nm-hint">Links to it in other notes are renamed too.</p>{/if}
          <div class="nm-row">
            <button type="button" class="btn quiet sm" onclick={close}>Cancel</button>
            <button type="submit" class="btn primary sm">Rename</button>
          </div>
        </form>
      {:else if m.view === "look"}
        <div class="nm-look">
          <p class="label">Icon</p>
          <IconPicker value={look.icon} onpick={(v) => setFolderLook(m!.rel, { icon: v })} />
          <p class="label">Folder colour</p>
          <div class="nm-sw">
            <button type="button" class="auto" class:on={!look.color} title="Automatic (the course's colour)" onclick={() => setFolderLook(m.rel, { color: undefined })}>Auto</button>
            {#each PALETTE as c}<button type="button" class:on={look.color === c} style="--c: {c}" aria-label="Colour {c}" onclick={() => setFolderLook(m.rel, { color: c })}></button>{/each}
            <label class="pick" title="Any colour" style="--c: {look.color ?? 'var(--white)'}"><input type="color" value={look.color ?? "#C9B5F5"} onchange={(e) => setFolderLook(m.rel, { color: (e.currentTarget as HTMLInputElement).value })} />+</label>
          </div>
          <div class="nm-row end"><button type="button" class="btn primary sm" onclick={close}>Done</button></div>
        </div>
      {:else if m.view === "move"}
        <p class="nm-h"><b>Move “{name}” to</b></p>
        <div class="nm-list">
          {#each targets as d}
            {@const lk = d ? folderLook(d) : {}}
            <button type="button" class="mi" onclick={() => moveTo(d)} style="padding-left: {12 + (d ? d.split('/').length - 1 : 0) * 14}px">
              <span class="nm-ic" style={lk.color ? `color: ${lk.color}` : ""}><Icon name={lk.icon ?? "folder"} size={15} /></span>{d ? d.split("/").pop() : "Notes (top level)"}
            </button>
          {:else}
            <p class="nm-hint">No other folders yet.</p>
          {/each}
        </div>
      {:else if m.view === "delete"}
        <div class="nm-form">
          <p class="nm-q">Delete {m.kind === "note" ? "the note" : "the folder"} <b>“{name}”</b>{#if m.kind === "folder"} and {count === 1 ? "the 1 note" : `all ${count} notes`} in it{/if}?</p>
          <p class="nm-hint">It goes to Trash.</p>
          <div class="nm-row">
            <button type="button" class="btn quiet sm" onclick={close}>Cancel</button>
            <button type="button" class="btn sm danger" onclick={remove}>Delete</button>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  {#if noteDrag.item}
    <div class="nm-ghost" class:ok={noteDrag.over !== undefined} style="transform: translate({noteDrag.x + 14}px, {noteDrag.y + 10}px)">
      {#if noteDrag.item.icon}<span class="nm-ic"><Icon name={noteDrag.item.icon} size={16} /></span>{/if}<b>{noteDrag.item.label}</b>
      {#if noteDrag.over !== undefined}<em>→ {noteDrag.over ? noteDrag.over.split("/").pop() : "Notes"}</em>{/if}
    </div>
  {/if}

  {#if noteMenu.msg}
    <div class="nm-msg" role="status">{noteMenu.msg}<button type="button" aria-label="Dismiss" onclick={() => (noteMenu.msg = "")}>×</button></div>
  {/if}
</div>

<style>
  .nm-scrim {
    position: fixed;
    inset: 0;
    z-index: 90;
    border: 0;
    background: none;
    cursor: default;
  }
  .nm {
    position: fixed;
    z-index: 91;
    width: 250px;
    padding: 6px;
    border-radius: 16px;
    box-shadow: var(--shadow-lift);
    display: grid;
    gap: 1px;
    transform-origin: top left;
  }
  .nm-h {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 6px 10px 6px;
    font-size: 12.5px;
    color: var(--text-muted);
    overflow: hidden;
  }
  .nm-h b {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mi {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    min-height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: 10px;
    background: none;
    font: inherit;
    font-size: 14px;
    color: var(--text);
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  .mi:hover,
  .mi:focus-visible {
    background: var(--panel);
  }
  .mi.del {
    color: var(--alert-ink);
  }
  .mi.del:hover {
    background: var(--rose-soft);
  }
  .nm-ic {
    display: inline-grid;
    place-items: center;
    width: 15px;
    font-size: 14px;
  }
  .nm-sep {
    height: 1px;
    margin: 4px 8px;
    background: var(--hairline);
  }
  .nm-form,
  .nm-look {
    display: grid;
    gap: 8px;
    padding: 8px;
  }
  .nm-look {
    width: 340px;
  }
  .nm:has(.nm-look) {
    width: 356px;
  }
  .nm-row {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }
  .nm-row.end {
    margin-top: 2px;
  }
  .sm {
    min-height: 36px;
    padding: 0 14px;
    font-size: 13.5px;
  }
  .danger {
    background: var(--rose-deep);
    color: var(--ink-on-color);
  }
  .nm-hint {
    margin: 0;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .nm-q {
    margin: 0;
    font-size: 14px;
  }
  .label {
    margin: 0;
  }
  .nm-sw {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .nm-sw button,
  .nm-sw .pick {
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 50%;
    background: var(--c);
    cursor: pointer;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 10%, transparent);
  }
  .nm-sw .auto {
    width: auto;
    padding: 0 10px;
    border-radius: 13px;
    background: var(--panel);
    font: inherit;
    font-size: 12px;
    color: var(--text);
  }
  .nm-sw .on {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .nm-sw .pick {
    position: relative;
    display: grid;
    place-items: center;
    font-size: 15px;
    color: var(--text-muted);
    overflow: hidden;
  }
  .nm-sw .pick input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .nm-list {
    max-height: 300px;
    overflow-y: auto;
  }
  .nm-ghost {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 95;
    display: flex;
    align-items: center;
    gap: 7px;
    max-width: 300px;
    padding: 7px 14px;
    border-radius: 999px;
    background: var(--surface-float);
    box-shadow: var(--shadow-lift);
    font-size: 13.5px;
    color: var(--text);
    pointer-events: none;
    opacity: 0.94;
  }
  .nm-ghost b {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nm-ghost em {
    font-style: normal;
    color: var(--go-ink);
    white-space: nowrap;
  }
  .nm-msg {
    position: fixed;
    left: 50%;
    bottom: 26px;
    z-index: 96;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 10px 10px 18px;
    border-radius: 999px;
    background: var(--hero);
    color: var(--on-hero);
    box-shadow: var(--shadow-lift);
    font-size: 14px;
    transform: translateX(-50%);
    animation: dialog-pop 0.3s var(--spring) backwards;
  }
  .nm-msg button {
    border: 0;
    border-radius: 50%;
    width: 28px;
    height: 28px;
    background: none;
    color: inherit;
    font-size: 18px;
    cursor: pointer;
  }
  :global(html.note-dragging),
  :global(html.note-dragging *) {
    cursor: grabbing !important;
    user-select: none !important;
  }
</style>
