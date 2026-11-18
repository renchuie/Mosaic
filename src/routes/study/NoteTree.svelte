<script lang="ts">
  import type { Snippet } from "svelte";
  import Icon from "../../lib/components/Icon.svelte";
  import { courseByName } from "../../lib/stores/courses.svelte";
  import { dirOf, noteHref, notes, searchNotes, type NoteEntry, noteDirs } from "../../lib/stores/notes.svelte";
  import { dragStart, folderLook, noteDrag, openMenu } from "../../lib/stores/noteOps.svelte";

  // actions: small buttons beside the search box (📌 / × when the list is a panel inside a note)
  let { current, onnew, onnewfolder, actions }: { current: string | null; onnew: (folder: string) => void; onnewfolder: () => void; actions?: Snippet } = $props();
  let q = $state("");

  const load = () => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem("studydesk.noteFolders") ?? "[]"));
    } catch {
      return new Set<string>();
    }
  };
  let closed = $state(load());
  function toggle(d: string) {
    const n = new Set(closed);
    n.has(d) ? n.delete(d) : n.add(d);
    closed = n;
    try {
      localStorage.setItem("studydesk.noteFolders", JSON.stringify([...n]));
    } catch {}
  }

  // a closed folder opens when a dragged note or folder rests on it
  let openTimer = 0;
  $effect(() => {
    const d = noteDrag.over;
    window.clearTimeout(openTimer);
    if (d && closed.has(d)) openTimer = window.setTimeout(() => toggle(d), 650);
  });

  type Node = { dir: string; name: string; depth: number; folders: Node[]; notes: NoteEntry[] };
  const tree = $derived.by(() => {
    const dirs = new Set(noteDirs());
    for (const e of Object.values(notes.files)) {
      let d = dirOf(e.rel);
      while (d) {
        dirs.add(d);
        d = dirOf(d);
      }
    }
    const make = (dir: string, depth: number): Node => ({
      dir,
      name: dir.split("/").pop() || "Notes",
      depth,
      folders: [...dirs].filter((d) => dirOf(d) === dir).sort((a, b) => a.localeCompare(b)).map((d) => make(d, depth + 1)),
      notes: Object.values(notes.files).filter((e) => dirOf(e.rel) === dir).sort((a, b) => a.p.title.localeCompare(b.p.title)),
    });
    return make("", 0);
  });
  const results = $derived(q.trim() ? searchNotes(q).slice(0, 40) : []);
  const dot = (e: NoteEntry) => (e.p.meta.course ? courseByName(String(e.p.meta.course))?.[1].color : undefined);
</script>

<nav class="tree" aria-label="Notes">
  <div class="tools">
    <div class="srow">
      <input class="input search" bind:value={q} placeholder="Search notes" aria-label="Search notes" />
      {#if actions}{@render actions()}{/if}
    </div>
    <div class="btns">
      <button type="button" class="btn primary sm" onclick={() => onnew(current ? dirOf(current) : "")}>+ Note</button>
      <button type="button" class="btn quiet sm" onclick={onnewfolder} aria-label="New folder"><Icon name="folder" size={15} /> +</button>
    </div>
  </div>

  {#if q.trim()}
    <ul class="results">
      {#each results as r (r.e.rel)}
        <li><a href={noteHref(r.e.rel)} class:on={r.e.rel === current} draggable="false" oncontextmenu={(ev) => openMenu(ev, { kind: "note", rel: r.e.rel })}><b>{r.e.p.title}</b><span>{r.snip}</span></a></li>
      {:else}
        <li class="muted none">No notes match “{q}”.</li>
      {/each}
    </ul>
  {:else}
    {#snippet branch(n: Node)}
      {#each n.folders as f (f.dir)}
        {@const lk = folderLook(f.dir)}
        <li data-drop-dir={f.dir}>
          <button type="button" class="folder" class:over={noteDrag.over === f.dir} class:dragged={noteDrag.item?.rel === f.dir} style="--d: {f.depth - 1}"
            onclick={() => toggle(f.dir)} aria-expanded={!closed.has(f.dir)}
            oncontextmenu={(e) => openMenu(e, { kind: "folder", rel: f.dir })}
            onpointerdown={(e) => dragStart(e, { kind: "folder", rel: f.dir }, f.name, lk.icon)}>
            <span class="chev" class:shut={closed.has(f.dir)}>▾</span>
            {#if lk.icon}<span class="fi">{lk.icon}</span>{:else}<span class="fic" style={lk.color ? `color: ${lk.color}` : ""}><Icon name="folder" size={15} /></span>{/if}
            <span class="fn">{f.name}</span>
            {#if lk.icon && lk.color}<span class="fdot" style="background: {lk.color}"></span>{/if}
          </button>
          {#if !closed.has(f.dir)}<ul>{@render branch(f)}</ul>{/if}
        </li>
      {/each}
      {#each n.notes as e (e.rel)}
        <li>
          <a href={noteHref(e.rel)} class="note" class:on={e.rel === current} class:dragged={noteDrag.item?.rel === e.rel} style="--d: {n.depth}" draggable="false"
            oncontextmenu={(ev) => openMenu(ev, { kind: "note", rel: e.rel })}
            onpointerdown={(ev) => dragStart(ev, { kind: "note", rel: e.rel }, e.p.title, typeof e.p.meta.icon === "string" && e.p.meta.icon ? e.p.meta.icon : undefined)}>
            <span class="nd" style={dot(e) ? `background: ${dot(e)}` : ""}></span><span class="fn">{e.p.title}</span>
          </a>
        </li>
      {/each}
    {/snippet}
    <ul class="root" class:over={noteDrag.over === ""} data-drop-dir="" data-drag-scroll>{@render branch(tree)}</ul>
    {#if !Object.keys(notes.files).length && notes.loaded}
      <p class="muted none">No notes yet. Make your first one with “+ Note”.</p>
    {/if}
  {/if}
</nav>

<style>
  .tree {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    height: 100%;
  }
  .tools {
    display: grid;
    gap: 8px;
  }
  .srow {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .search {
    flex: 1;
    min-width: 0;
    min-height: 40px;
    padding: 6px 12px;
    background: var(--surface);
  }
  .btns {
    display: flex;
    gap: 6px;
  }
  .sm {
    min-height: 36px;
    padding: 0 12px;
    font-size: 13.5px;
  }
  .btns .primary {
    flex: 1;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .root,
  .results {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    padding-right: 4px;
  }
  .folder,
  .note {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    min-height: 34px;
    padding: 0 8px 0 calc(8px + var(--d) * 14px);
    border: 0;
    border-radius: 10px;
    background: none;
    font: inherit;
    font-size: 14px;
    text-align: left;
    text-decoration: none;
    color: var(--text);
  }
  .folder {
    font-weight: 600;
    color: var(--text-muted);
  }
  .folder:hover,
  .note:hover {
    background: var(--surface);
  }
  .note.on {
    background: var(--surface);
    box-shadow: var(--shadow);
    font-weight: 600;
  }
  .note {
    -webkit-user-drag: none;
  }
  .folder.over {
    background: color-mix(in srgb, var(--accent) 22%, var(--white));
    color: var(--text);
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .root.over {
    border-radius: 12px;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .dragged {
    opacity: 0.45;
  }
  .fi {
    width: 15px;
    font-size: 14px;
    line-height: 1;
    text-align: center;
  }
  .fic {
    display: inline-flex;
  }
  .fdot {
    flex: none;
    width: 7px;
    height: 7px;
    margin-left: auto;
    border-radius: 50%;
  }
  .chev {
    width: 12px;
    font-size: 11px;
    transition: transform 0.15s ease;
  }
  .chev.shut {
    transform: rotate(-90deg);
  }
  .fn {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nd {
    flex: none;
    width: 8px;
    height: 8px;
    margin-left: 18px;
    border-radius: 50%;
    background: var(--hairline);
  }
  .results a {
    display: grid;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 12px;
    text-decoration: none;
  }
  .results a:hover,
  .results a.on {
    background: var(--surface);
  }
  .results b {
    font-size: 14px;
    font-weight: 600;
  }
  .results span {
    font-size: 12.5px;
    color: var(--text-muted);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .none {
    font-size: 13.5px;
    padding: 8px;
  }
</style>
