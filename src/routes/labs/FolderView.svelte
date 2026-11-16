<script lang="ts">
  import Icon from "../../lib/components/Icon.svelte";
  import Wave from "../../lib/components/Wave.svelte";
  import { COURSES } from "../../lib/courses";
  import { TONES, type Tone } from "../../lib/sample/data";
  import { settings } from "../../lib/stores/settings.svelte";
  import {
    folderHref, folderMeta, folderStats, inherited, labHref, labs, labsIn, rescan, setFolderMeta, type Folder,
  } from "../../lib/stores/labs.svelte";
  import { invoke, inTauri } from "../../lib/tauri";

  let { folder }: { folder: Folder } = $props();

  const isRoot = $derived(folder.rel === "");
  const meta = $derived(folderMeta(folder.rel));
  const course = $derived(meta.course ?? inherited(folder.rel, "course"));
  const tone = $derived<Tone>(meta.tone ?? inherited(folder.rel, "tone") ?? "rose");
  const stats = $derived(folderStats(folder));
  const ownLabs = $derived(labsIn({ ...folder, folders: [] }).sort((a, b) => b.lastOpened - a.lastOpened || a.lab.title.localeCompare(b.lab.title)));
  const notes = $derived(folder.items.filter((i) => i.kind === "note"));
  const files = $derived(folder.items.filter((i) => i.kind === "file"));
  const crumbs = $derived(
    folder.rel ? folder.rel.split("/").map((name, i, all) => ({ name, rel: all.slice(0, i + 1).join("/") })) : [],
  );
  const examDays = $derived.by(() => {
    if (!meta.examDate) return null;
    const [y, m, d] = meta.examDate.split("-").map(Number);
    const t = new Date();
    return Math.round((new Date(y, m - 1, d).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 864e5);
  });

  let openError = $state<string | null>(null);
  async function openExternal(rel: string) {
    openError = null;
    try {
      await invoke("open_in_system", { rel });
    } catch (e) {
      openError = String(e);
    }
  }

  const pct = (n: number | null) => (n === null ? "—" : `${n}%`);
  const size = (b: number) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
  const ago = (t: number) => {
    if (!t) return "Not opened yet";
    const m = Math.round((Date.now() - t) / 6e4);
    if (m < 60) return m <= 1 ? "Opened just now" : `Opened ${m} min ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `Opened ${h} h ago`;
    const d = Math.round(h / 24);
    return d === 1 ? "Opened yesterday" : `Opened ${d} days ago`;
  };
  const subTone = (f: Folder, i: number): Tone => folderMeta(f.rel).tone ?? TONES[i % TONES.length];
</script>

<div class="folder">
  <nav class="crumbs" aria-label="Folder path">
    <a href={folderHref("")}>Recall Labs</a>
    {#each crumbs as c}
      <span aria-hidden="true">/</span>
      <a href={folderHref(c.rel)} aria-current={c.rel === folder.rel ? "page" : undefined}>{c.name}</a>
    {/each}
  </nav>

  <header class="hero t-{tone}">
    <Wave a="var(--ivory)" b="var(--white)" />
    <div class="hero-top">
      <div>
        <h1 class="display">{isRoot ? "Recall Labs" : folder.name}</h1>
        <div class="chips">
          {#if course}<span class="tag glass">{course}</span>{/if}
          {#if examDays !== null}
            <span class="tag glass">{examDays > 1 ? `Exam in ${examDays} days` : examDays === 1 ? "Exam tomorrow" : examDays === 0 ? "Exam today" : "Exam done"}</span>
          {/if}
          {#if isRoot}<span class="tag glass">{settings.labsRoot}</span>{/if}
        </div>
      </div>
      <div class="actions">
        <button class="btn" type="button" onclick={() => rescan()} disabled={labs.scanning || !inTauri}>
          <Icon name="refresh" size={16} /> {labs.scanning ? "Scanning…" : "Rescan"}
        </button>
        <button class="btn" type="button" onclick={() => openExternal(folder.rel)} disabled={!inTauri}>
          <Icon name="external" size={16} /> Open folder
        </button>
      </div>
    </div>
    <div class="hero-stats">
      <div><span class="label">Recall labs</span><b class="display">{stats.count}</b></div>
      <div><span class="label">Average best</span><b class="display">{pct(stats.progress.avgBest)}</b></div>
      <div><span class="label">To revisit</span><b class="display">{stats.progress.missed}</b></div>
      <div><span class="label">Best sim</span><b class="display">{pct(stats.progress.bestSim)}</b></div>
    </div>
  </header>

  {#if labs.storageError}
    <p class="notice">Couldn’t read lab progress: {labs.storageError}</p>
  {/if}
  {#if openError}
    <p class="notice">{openError}</p>
  {/if}

  <div class="cols">
    <div class="main">
      {#if folder.folders.length}
        <section>
          <h2 class="h2 sec">Folders</h2>
          <div class="subs">
            {#each folder.folders as f, i}
              {@const s = folderStats(f)}
              {@const n = f.items.filter((x) => x.kind !== "lab").length}
              <a class="sub t-{subTone(f, i)}" href={folderHref(f.rel)}>
                <span class="sub-top"><Icon name="folder" size={18} /> <span class="label">{s.count} {s.count === 1 ? "lab" : "labs"} · {n} {n === 1 ? "file" : "files"}</span></span>
                <b class="display">{f.name}</b>
                <span class="bar"><span style="width: {s.progress.avgBest ?? 0}%"></span></span>
                <span class="sub-foot">{s.progress.avgBest === null ? "No progress yet" : `${s.progress.avgBest}% avg best`}{s.progress.missed ? ` · ${s.progress.missed} to revisit` : ""}</span>
              </a>
            {/each}
          </div>
        </section>
      {/if}

      {#if ownLabs.length}
        <section>
          <h2 class="h2 sec">Recall labs</h2>
          <div class="labgrid">
            {#each ownLabs as l}
              <article class="card lab">
                <div class="lab-head">
                  <h3 class="display">{l.lab.title}</h3>
                  <span class="tag">v{l.lab.version}</span>
                </div>
                <span class="bar big"><span style="width: {l.progress.avgBest ?? 0}%"></span></span>
                <dl class="nums">
                  <div><dt class="label">Sections tried</dt><dd class="display">{l.progress.sectionsTried}</dd></div>
                  <div><dt class="label">Avg best</dt><dd class="display">{pct(l.progress.avgBest)}</dd></div>
                  <div><dt class="label">To revisit</dt><dd class="display">{l.progress.missed}</dd></div>
                  <div><dt class="label">Sim last / best</dt><dd class="display">{pct(l.progress.lastSim)} <small>/ {pct(l.progress.bestSim)}</small></dd></div>
                </dl>
                <div class="lab-foot">
                  <span class="muted">{ago(l.lastOpened)}{l.lab.slug_guessed ? " · progress key guessed from file name" : ""}</span>
                  <a class="btn primary" href={labHref(l.item.rel)}><Icon name="play" size={15} /> Open</a>
                </div>
              </article>
            {/each}
          </div>
        </section>
      {:else if !folder.folders.length}
        <section class="card empty">
          <h2 class="h2">No Recall Labs here yet</h2>
          <p class="muted">Labs are .html files with a <code>recall-lab-version</code> meta tag. Add one to this folder in Drive, then press Rescan.</p>
        </section>
      {/if}

      {#if folder.truncated}
        <p class="notice">Some folders are deeper than {settings.scanDepth} levels and were skipped. You can raise the scan depth in Settings.</p>
      {/if}
    </div>

    <aside class="side">
      {#if !isRoot}
        <section class="card">
          <h2 class="h2 sec">Link this folder</h2>
          <label class="field">
            <span class="label">Course</span>
            <select value={meta.course ?? ""} onchange={(e) => setFolderMeta(folder.rel, { course: e.currentTarget.value || undefined })}>
              <option value="">{course && !meta.course ? `Same as parent (${course})` : "None"}</option>
              {#each COURSES as c}<option value={c}>{c}</option>{/each}
            </select>
          </label>
          <label class="field">
            <span class="label">Exam date</span>
            <input type="date" value={meta.examDate ?? ""} onchange={(e) => setFolderMeta(folder.rel, { examDate: e.currentTarget.value || undefined })} />
          </label>
          <div class="field">
            <span class="label">Colour</span>
            <div class="swatches">
              {#each TONES as t}
                <button type="button" class="swatch t-{t}" class:on={tone === t} aria-label={t} aria-pressed={tone === t} onclick={() => setFolderMeta(folder.rel, { tone: t })}></button>
              {/each}
            </div>
          </div>
          <p class="hint muted">An exam date adds this folder to your dashboard countdown.</p>
        </section>
      {/if}

      {#if notes.length || !isRoot}
      <section class="card">
        <h2 class="h2 sec">Notes <span class="tag">{notes.length}</span></h2>
        {#if notes.length}
          <ul class="files">
            {#each notes as n}
              <li><button type="button" onclick={() => openExternal(n.rel)}><span class="ic note"><Icon name="note" size={16} /></span><span class="fname">{n.name}</span><span class="fmeta muted">{n.ext.toUpperCase()}</span></button></li>
            {/each}
          </ul>
        {:else}
          <p class="muted hint">Notes (.md, .txt, .docx …) in this folder show up here.</p>
        {/if}
      </section>
      {/if}

      {#if files.length || !isRoot}
      <section class="card">
        <h2 class="h2 sec">Files <span class="tag">{files.length}</span></h2>
        {#if files.length}
          <ul class="files">
            {#each files as f}
              <li><button type="button" onclick={() => openExternal(f.rel)}><span class="ic"><Icon name="file" size={16} /></span><span class="fname">{f.name}</span><span class="fmeta muted">{size(f.size)}</span></button></li>
            {/each}
          </ul>
        {:else}
          <p class="muted hint">Slides, PDFs and other files in this folder show up here.</p>
        {/if}
      </section>
      {/if}
    </aside>
  </div>
</div>

<style>
  .folder {
    display: grid;
    gap: var(--gap);
    container-type: inline-size;
  }
  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: var(--text-muted);
  }
  .crumbs a {
    text-decoration: none;
  }
  .crumbs a:hover,
  .crumbs a[aria-current] {
    color: var(--text);
  }
  .crumbs a[aria-current] {
    font-weight: 600;
  }

  .hero {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 24px 24px 20px;
    display: grid;
    gap: 22px;
  }
  .hero > :global(:not(.wave)) {
    position: relative;
  }
  .hero-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    flex-wrap: wrap;
  }
  .hero h1 {
    font-size: clamp(28px, 3.6vw, 40px);
    line-height: 1.1;
    margin-bottom: 10px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .actions .btn:disabled {
    opacity: 0.6;
    cursor: default;
    transform: none;
  }
  .hero-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .hero-stats div {
    display: grid;
    background: rgba(255, 253, 251, 0.72);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
  }
  .hero-stats .label {
    color: var(--text);
  }
  .hero-stats b {
    font-size: 26px;
    font-weight: 600;
  }
  @container (max-width: 620px) {
    .hero-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .notice {
    background: var(--butter-soft);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
    font-size: 14px;
  }

  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: var(--gap);
    align-items: start;
  }
  @container (max-width: 880px) {
    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .main,
  .side {
    display: grid;
    gap: var(--gap);
    min-width: 0;
  }
  .sec {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 4px 12px;
  }
  .card .sec {
    margin: 0 0 12px;
  }

  .subs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 14px;
  }
  .sub {
    display: grid;
    gap: 8px;
    padding: 16px;
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    text-decoration: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .sub:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lift);
  }
  .sub-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sub-top .label {
    color: var(--text);
  }
  .sub b {
    font-size: 20px;
    font-weight: 600;
    margin: 6px 0 4px;
  }
  .sub-foot {
    font-size: 13.5px;
  }
  .bar {
    display: block;
    height: 8px;
    border-radius: var(--radius-pill);
    background: rgba(255, 253, 251, 0.6);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--charcoal);
  }
  .bar.big {
    background: var(--track);
  }

  .labgrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 14px;
  }
  .lab {
    display: grid;
    gap: 14px;
  }
  .lab-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 10px;
  }
  .lab h3 {
    font-size: 20px;
    font-weight: 600;
    line-height: 1.2;
  }
  .nums {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin: 0;
  }
  .nums div {
    background: var(--panel);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
  }
  .nums dd {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
  }
  .nums small {
    font-size: 14px;
    color: var(--text-muted);
  }
  .lab-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 13.5px;
  }
  .empty {
    display: grid;
    gap: 8px;
  }
  code {
    font-size: 13px;
    background: var(--chip);
    border-radius: 6px;
    padding: 1px 6px;
  }

  .field {
    display: grid;
    gap: 6px;
    margin-bottom: 14px;
  }
  select,
  input[type="date"] {
    width: 100%;
    min-width: 0;
    min-height: var(--hit);
    border: 0;
    border-radius: var(--radius-sm);
    background: var(--panel);
    padding: 0 12px;
    font: inherit;
    color: inherit;
  }
  .swatches {
    display: flex;
    gap: 10px;
  }
  .swatch {
    width: var(--hit);
    height: var(--hit);
    border-radius: 50%;
    border: 0;
    box-shadow: inset 0 0 0 1px var(--hairline);
  }
  .swatch.on {
    box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px var(--charcoal);
  }
  .hint {
    font-size: 13.5px;
  }

  .files {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .files button {
    width: 100%;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-height: var(--hit);
    padding: 4px 8px;
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    text-align: left;
  }
  .files button:hover {
    background: var(--panel);
  }
  .ic {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: var(--peach-soft);
  }
  .ic.note {
    background: var(--sage-soft);
  }
  .fname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14.5px;
  }
  .fmeta {
    font-size: 12.5px;
  }
</style>
