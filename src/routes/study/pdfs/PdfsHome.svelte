<script lang="ts">
  import Icon from "../../../lib/components/Icon.svelte";
  import FolderTile from "../../../lib/components/FolderTile.svelte";
  import { courseByName } from "../../../lib/stores/courses.svelte";
  import { courseOfPdf, pdfDir, pdfHref, pdfInfo, pdfName, pdfs, recentPdfs, refreshPdfs } from "../../../lib/stores/pdfs.svelte";
  import { settings } from "../../../lib/stores/settings.svelte";

  let q = $state("");
  let course = $state("");

  const withCourse = $derived(pdfs.files.map((f) => ({ ...f, course: courseOfPdf(f.rel) })));
  const coursesWithPdfs = $derived([...new Set(withCourse.map((f) => f.course).filter(Boolean))] as string[]);
  const shown = $derived.by(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return withCourse.filter((f) => (!course || f.course === course) && words.every((w) => f.rel.toLowerCase().includes(w)));
  });
  const groups = $derived.by(() => {
    const m = new Map<string, typeof shown>();
    for (const f of shown) {
      const d = pdfDir(f.rel);
      m.set(d, [...(m.get(d) ?? []), f]);
    }
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  });
  const recent = $derived(recentPdfs(6));

  // folder view (no search or course filter): tiles for the folders inside `dir`
  let dir = $state("");
  const under = (d: string, rel: string) => (d ? rel.startsWith(d + "/") : true);
  const lastRead = $derived(recentPdfs(1)[0]?.[0]);
  const tiles = $derived.by(() => {
    const kids = new Map<string, typeof withCourse>();
    for (const f of withCourse) {
      if (!under(dir, f.rel)) continue;
      const rest = dir ? f.rel.slice(dir.length + 1) : f.rel;
      if (!rest.includes("/")) continue;
      const d = (dir ? dir + "/" : "") + rest.split("/")[0];
      kids.set(d, [...(kids.get(d) ?? []), f]);
    }
    return [...kids]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, files]) => {
        const marked = files.filter((f) => pdfInfo(f.rel)?.annots).length;
        const byRead = [...files].sort((a, b) => (pdfInfo(b.rel)?.opened ?? 0) - (pdfInfo(a.rel)?.opened ?? b.mtime) || b.mtime - a.mtime);
        const c = files.find((f) => f.course)?.course;
        return {
          d,
          name: d.split("/").pop()!,
          color: courseByName(c)?.[1].color ?? "#C9B5F5",
          lines: [`${files.length} ${files.length === 1 ? "PDF" : "PDFs"}${marked ? ` · ${marked} with marks` : ""}`, size(files.reduce((n, f) => n + f.size, 0))],
          sheets: byRead.slice(0, 2).map(() => ({ head: `color-mix(in srgb, ${courseByName(c)?.[1].color ?? "#C9B5F5"} 45%, var(--white))` })),
          open: !!lastRead && under(d, lastRead),
        };
      });
  });
  const loose = $derived(withCourse.filter((f) => pdfDir(f.rel) === dir));
  const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
  const tint = (c?: string) => courseByName(c)?.[1].color ?? "var(--peach)";
</script>

{#snippet row(f: (typeof withCourse)[number])}
  {@const info = pdfInfo(f.rel)}
  <li>
    <a href={pdfHref(f.rel)}>
      <span class="fi" style="--t: {tint(f.course)}"><Icon name="file" size={16} /></span>
      <span class="nm">{pdfName(f.rel)}</span>
      <span class="meta muted small">
        {#if info?.annots}<span class="pill">{info.annots} {info.annots === 1 ? "mark" : "marks"}</span>{/if}
        {#if info?.opened}p. {info.page}{info.pages ? `/${info.pages}` : ""} · {/if}{size(f.size)}
      </span>
    </a>
  </li>
{/snippet}

<div class="home">
  <header class="top">
    <div>
      <h1 class="display">PDFs</h1>
      <p class="muted">{pdfs.files.length} {pdfs.files.length === 1 ? "PDF" : "PDFs"} in <span title={pdfs.root || settings.pdfRoot}>{(pdfs.root || settings.pdfRoot).split("/").pop()}</span>. Highlights and notes are saved into the PDF itself.</p>
    </div>
    <button class="btn quiet" onclick={() => refreshPdfs()} disabled={pdfs.loading}><Icon name="refresh" size={16} /> {pdfs.loading ? "Looking…" : "Look again"}</button>
  </header>

  {#if pdfs.error}
    <div class="card warn">
      <b>Can't see the PDF folder.</b>
      <p class="muted">{pdfs.error}</p>
      <p class="muted small">Change the folder in Settings if your PDFs live somewhere else.</p>
    </div>
  {/if}

  {#if recent.length && !q && !course}
    <section>
      <h2 class="label">Keep reading</h2>
      <div class="recent">
        {#each recent as [rel, info]}
          {@const c = courseOfPdf(rel)}
          <a class="rc" href={pdfHref(rel)} style="--t: {tint(c)}">
            <span class="ic"><Icon name="file" size={18} /></span>
            <b>{pdfName(rel)}</b>
            <span class="muted small">{c ?? pdfDir(rel).split("/").pop() ?? ""}</span>
            {#if info.pages}<span class="bar" aria-label="Page {info.page} of {info.pages}"><i style="width: {Math.min(100, (info.page / info.pages) * 100)}%"></i></span>{/if}
            <span class="small">p. {info.page}{info.pages ? ` of ${info.pages}` : ""}{#if info.annots} · {info.annots} {info.annots === 1 ? "mark" : "marks"}{/if}</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <div class="filters">
    <input class="input search" type="search" placeholder="Search PDFs by name or folder" bind:value={q} aria-label="Search PDFs" />
    {#if coursesWithPdfs.length}
      <div class="chips" role="group" aria-label="Course">
        <button class:on={!course} onclick={() => (course = "")}>All</button>
        {#each coursesWithPdfs as c}<button class:on={course === c} onclick={() => (course = course === c ? "" : c)} style="--t: {tint(c)}"><span class="cd"></span>{c}</button>{/each}
      </div>
    {/if}
  </div>

  {#if !pdfs.loaded}
    <p class="muted">Looking for PDFs…</p>
  {:else if !shown.length}
    <div class="card"><p class="muted">{pdfs.files.length ? "Nothing matches." : "No PDFs found yet. Put lecture slides and readings anywhere in the PDF folder (Settings) and they show up here."}</p></div>
  {:else if !q && !course}
    {#if dir}
      <nav class="crumbs" aria-label="Folder">
        <button type="button" onclick={() => (dir = "")}>All folders</button>
        {#each dir.split("/") as part, i}<span aria-hidden="true">›</span><button type="button" onclick={() => (dir = dir.split("/").slice(0, i + 1).join("/"))}>{part}</button>{/each}
      </nav>
    {/if}
    {#if tiles.length}
      <div class="tiles">
        {#each tiles as t (t.d)}
          <FolderTile name={t.name} color={t.color} lines={t.lines} sheets={t.sheets} pages open={t.open} onclick={() => (dir = t.d)} />
        {/each}
      </div>
    {/if}
    {#if loose.length}
      <section class="grp">
        <h2 class="label lh">{dir ? "In this folder" : "Not in a folder"}</h2>
        <ul>
          {#each loose as f (f.rel)}
            {@render row(f)}
          {/each}
        </ul>
      </section>
    {/if}
  {:else}
    {#each groups as [d, files] (d)}
      <section class="grp">
        <h2 class="label lh"><Icon name="folder" size={14} /> {d || "Top folder"} · {files.length}</h2>
        <ul>
          {#each files as f (f.rel)}
            {@render row(f)}
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>

<style>
  .home {
    display: grid;
    gap: var(--gap);
    min-width: 0;
  }
  .top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  h1 {
    font-size: clamp(26px, 3vw, 34px);
    font-weight: 600;
  }
  .top p {
    margin: 4px 0 0;
  }
  .small {
    font-size: 13px;
  }
  .card {
    padding: 18px 20px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .card p {
    margin: 4px 0 0;
  }
  .warn {
    background: var(--rose-soft);
  }
  section {
    display: grid;
    gap: 10px;
  }
  .recent {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 12px;
  }
  .rc {
    display: grid;
    gap: 6px;
    padding: 16px;
    border-radius: var(--radius);
    background: linear-gradient(160deg, color-mix(in srgb, var(--t) 35%, var(--surface)), var(--surface) 70%);
    box-shadow: var(--shadow);
    color: var(--text);
    text-decoration: none;
    min-width: 0;
  }
  .rc:hover {
    box-shadow: var(--shadow-lift);
  }
  .rc b {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ic {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--t) 70%, var(--white));
  }
  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--track);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--sage-deep);
    border-radius: 3px;
  }
  .filters {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
  }
  .search {
    flex: 1 1 260px;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chips button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 14px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }
  .chips button.on {
    background: var(--primary);
    color: var(--on-primary);
  }
  .cd {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--t);
  }
  .grp {
    border-radius: var(--radius);
    background: var(--surface);
    border: var(--edge);
    box-shadow: var(--shadow);
    padding: 14px 12px 6px;
    animation: pop-in var(--t-slow) var(--spring) backwards;
  }
  .lh {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 8px 4px;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: calc(var(--gap) + 4px) var(--gap);
  }
  .crumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    color: var(--text-muted);
  }
  .crumbs button {
    min-height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--chip);
    font-weight: 500;
  }
  .crumbs button:last-child {
    background: var(--surface);
    color: var(--text);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0 0 6px;
  }
  li a {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 4px 8px;
    border-radius: 14px;
    color: var(--text);
    text-decoration: none;
  }
  li a:hover {
    background: var(--chip);
    transform: translateX(3px);
  }
  .fi {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--t) 55%, var(--white));
    flex: none;
  }
  .nm {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .meta {
    display: flex;
    gap: 8px;
    align-items: center;
    white-space: nowrap;
  }
  .pill {
    padding: 2px 9px;
    border-radius: var(--radius-pill);
    background: var(--butter-soft);
    color: var(--text);
  }
</style>
