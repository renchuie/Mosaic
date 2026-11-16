<script lang="ts">
  import Icon from "../../lib/components/Icon.svelte";
  import { courseByName } from "../../lib/stores/courses.svelte";
  import { dirOf, noteHref, notes, searchNotes, type NoteEntry } from "../../lib/stores/notes.svelte";

  let { current, onnew, onnewfolder }: { current: string | null; onnew: (folder: string) => void; onnewfolder: () => void } = $props();
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

  type Node = { dir: string; name: string; depth: number; folders: Node[]; notes: NoteEntry[] };
  const tree = $derived.by(() => {
    const dirs = new Set(notes.dirs.filter((d) => d !== "attachments" && !d.startsWith("attachments/")));
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
    <input class="input search" bind:value={q} placeholder="Search notes" aria-label="Search notes" />
    <div class="btns">
      <button type="button" class="btn primary sm" onclick={() => onnew(current ? dirOf(current) : "")}>+ Note</button>
      <button type="button" class="btn quiet sm" onclick={onnewfolder} aria-label="New folder"><Icon name="folder" size={15} /> +</button>
    </div>
  </div>

  {#if q.trim()}
    <ul class="results">
      {#each results as r (r.e.rel)}
        <li><a href={noteHref(r.e.rel)} class:on={r.e.rel === current}><b>{r.e.p.title}</b><span>{r.snip}</span></a></li>
      {:else}
        <li class="muted none">No notes match “{q}”.</li>
      {/each}
    </ul>
  {:else}
    {#snippet branch(n: Node)}
      {#each n.folders as f (f.dir)}
        <li>
          <button type="button" class="folder" style="--d: {f.depth - 1}" onclick={() => toggle(f.dir)} aria-expanded={!closed.has(f.dir)}>
            <span class="chev" class:shut={closed.has(f.dir)}>▾</span><Icon name="folder" size={15} /><span class="fn">{f.name}</span>
          </button>
          {#if !closed.has(f.dir)}<ul>{@render branch(f)}</ul>{/if}
        </li>
      {/each}
      {#each n.notes as e (e.rel)}
        <li>
          <a href={noteHref(e.rel)} class="note" class:on={e.rel === current} style="--d: {n.depth}">
            <span class="nd" style={dot(e) ? `background: ${dot(e)}` : ""}></span><span class="fn">{e.p.title}</span>
          </a>
        </li>
      {/each}
    {/snippet}
    <ul class="root">{@render branch(tree)}</ul>
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
  .search {
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
