<script lang="ts">
  // Notes home (no note open): folders as tiles, like the mockups. The folder of the note
  // edited last is "open" (coloured, its latest notes peeking out). Clicking a folder shows
  // its subfolders and notes; the tree on the left stays for quick jumping.
  import FolderTile from "../../lib/components/FolderTile.svelte";
  import { splitNote } from "../../lib/notes";
  import { courses } from "../../lib/stores/courses.svelte";
  import { dirOf, noteHref, notes, recentNotes, type NoteEntry } from "../../lib/stores/notes.svelte";

  let { onnew }: { onnew: (folder: string) => void } = $props();
  let dir = $state("");

  const all = $derived(Object.values(notes.files));
  const inside = (d: string, e: NoteEntry) => (d ? e.rel.startsWith(d + "/") : true);
  /** direct child folders of `d` */
  const childDirs = $derived(
    [...new Set(notes.dirs.filter((x) => (dir ? x.startsWith(dir + "/") : true)).map((x) => (dir ? x.slice(dir.length + 1) : x).split("/")[0]))]
      .filter(Boolean)
      .map((n) => (dir ? `${dir}/${n}` : n))
      .sort((a, b) => a.localeCompare(b)),
  );
  const here = $derived(all.filter((e) => dirOf(e.rel) === dir).sort((a, b) => b.mtime - a.mtime));
  const lastUsed = $derived(recentNotes(1)[0]);

  const COURSE_COLORS = ["#E3949B", "#8FB2DA", "#A98CE0", "#E3A86C", "#7FB3A6", "#D9B850"];
  function colorOf(d: string, i: number) {
    const leaf = d.split("/").pop()!.toLowerCase();
    const top = d.split("/")[0].toLowerCase();
    const c = courses(true).find(([, c]) => [c.name, c.code].filter(Boolean).some((k) => [leaf, top].includes(k!.toLowerCase())));
    return c?.[1].color ? c[1].color : COURSE_COLORS[i % COURSE_COLORS.length];
  }
  const firstLine = (e: NoteEntry) =>
    splitNote(e.text)
      .body.split("\n")
      .map((l) => l.replace(/<!--sd:\w+-->/g, "").replace(/^[#>*\-\s]+/, "").replace(/\*\*|__|==|`|\[\[|\]\]/g, "").replace(/\s*:{2,3}\s*$/, "").replace(/\s*:{2,3}\s*/g, " → ").trim())
      .find((l) => l && l !== e.p.title) ?? "";
  function tile(d: string, i: number) {
    const list = all.filter((e) => inside(d, e)).sort((a, b) => b.mtime - a.mtime);
    const last = list[0];
    return {
      d,
      name: d.split("/").pop()!,
      color: colorOf(d, i),
      lines: [`${list.length} ${list.length === 1 ? "note" : "notes"}`, last ? `Edited ${when(last.mtime)}` : "Empty"],
      sheets: list.slice(0, 2).map((e) => ({ title: e.p.title, text: firstLine(e) })),
      open: !!lastUsed && inside(d, lastUsed),
    };
  }
  const tiles = $derived(childDirs.map(tile));
  function when(ms: number) {
    const d = (Date.now() - ms) / 864e5;
    if (d < 1 && new Date(ms).getDate() === new Date().getDate()) return "today";
    if (d < 2) return "yesterday";
    return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  const crumbs = $derived(dir ? dir.split("/").map((p, i, a) => ({ name: p, d: a.slice(0, i + 1).join("/") })) : []);
</script>

<div class="home">
  <header class="top">
    <div>
      <h1 class="display">{dir ? dir.split("/").pop() : "Notes"}</h1>
      <p class="muted">
        {#if dir}
          <button type="button" class="crumb" onclick={() => (dir = "")}>Notes</button>
          {#each crumbs.slice(0, -1) as c}<span> › </span><button type="button" class="crumb" onclick={() => (dir = c.d)}>{c.name}</button>{/each}
        {:else}
          {all.length} {all.length === 1 ? "note" : "notes"} in {notes.dirs.filter((x) => !x.includes("/")).length} folders · Markdown files on your Drive
        {/if}
      </p>
    </div>
    <button type="button" class="btn primary" onclick={() => onnew(dir)}>+ Note</button>
  </header>

  {#if notes.error}<p class="err">{notes.error}</p>{/if}

  {#if tiles.length}
    <div class="grid">
      {#each tiles as t, i (t.d)}
        <div style="animation-delay: {i * 45}ms" class="cell">
          <FolderTile name={t.name} color={t.color} lines={t.lines} sheets={t.sheets} open={t.open} onclick={() => (dir = t.d)} />
        </div>
      {/each}
    </div>
  {/if}

  {#if here.length}
    <section class="card list">
      <h2 class="h2">{dir ? "In this folder" : "Loose notes"}</h2>
      <ul>
        {#each here as e (e.rel)}
          <li><a href={noteHref(e.rel)}><b>{e.p.title}</b><span class="muted snip">{firstLine(e)}</span><span class="muted when">{when(e.mtime)}</span></a></li>
        {/each}
      </ul>
    </section>
  {:else if dir && !tiles.length}
    <section class="card list"><p class="muted">Nothing in this folder yet.</p></section>
  {/if}

  {#if !dir && recentNotes(6).length}
    <section class="card list">
      <h2 class="h2">Recent</h2>
      <ul>
        {#each recentNotes(6) as e (e.rel)}
          <li><a href={noteHref(e.rel)}><b>{e.p.title}</b><span class="muted snip">{dirOf(e.rel) || "Notes"} · {firstLine(e)}</span><span class="muted when">{when(e.mtime)}</span></a></li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .home {
    display: grid;
    gap: var(--gap);
    align-content: start;
    min-width: 0;
  }
  .top {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  h1 {
    font-size: clamp(26px, 3vw, 34px);
  }
  .top p {
    margin-top: 4px;
  }
  .crumb {
    border: 0;
    background: none;
    padding: 0;
    color: var(--text-muted);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .err {
    color: var(--rose-deep);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: calc(var(--gap) + 4px) var(--gap);
  }
  .list {
    display: grid;
    gap: 6px;
  }
  .list ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .list a {
    display: grid;
    grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 12px;
    min-height: 44px;
    padding: 10px 12px;
    border-radius: 14px;
    text-decoration: none;
  }
  .list a:hover {
    background: var(--chip);
    transform: translateX(3px);
  }
  .list b {
    font-weight: 600;
  }
  .snip {
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .when {
    font-size: 13px;
  }
</style>
