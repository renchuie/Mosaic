<script lang="ts">
  import Icon from "../../lib/components/Icon.svelte";
  import NoteEditor from "../../lib/components/NoteEditor.svelte";
  import { fromKey } from "../../lib/calendar";
  import { joinNote, splitNote, type Meta } from "../../lib/notes";
  import { assignIds, cardId } from "../../lib/cards";
  import { courseByName, courseNames } from "../../lib/stores/courses.svelte";
  import {
    allNotes, allTags, backlinks, createNote, dirOf, getNote, imageUrl, linkName, moveNote, noteHref, notes, recentNotes,
    reloadNote, renameNote, resolveLink, saveNote, savePastedImage, trashNote,
  } from "../../lib/stores/notes.svelte";
  import NewNoteDialog from "./NewNoteDialog.svelte";
  import NoteTree from "./NoteTree.svelte";
  import { pdfHref, pdfName, resolvePdfLink } from "../../lib/stores/pdfs.svelte";

  let { rel }: { rel: string | null } = $props();

  const note = $derived(rel ? getNote(rel) : undefined);
  let meta = $state<Meta>({});
  let body = $state("");
  let loadedMtime = $state(0);
  let loadedRel = $state<string | null>(null);
  let version = $state(0); // bump to rebuild the editor with new text
  let status = $state<"saved" | "saving" | "conflict" | "error">("saved");
  let errorText = $state("");
  let editor = $state<NoteEditor>();
  let title = $state("");

  // load the note when the route changes (or after a reload)
  $effect(() => {
    if (rel && note && loadedRel !== rel) {
      const s = splitNote(note.text);
      meta = s.meta;
      body = s.body;
      loadedMtime = note.mtime;
      loadedRel = rel;
      notes.editing = rel;
      title = linkName(note);
      status = "saved";
      version++;
      try {
        const r = JSON.parse(localStorage.getItem("studydesk.recentNotes") ?? "[]").filter((x: string) => x !== rel);
        localStorage.setItem("studydesk.recentNotes", JSON.stringify([rel, ...r].slice(0, 12)));
      } catch {}
    }
  });

  let timer = 0;
  function changed(text: string) {
    body = text;
    status = "saving";
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void flush(), 700);
  }
  async function flush(force = false) {
    if (!loadedRel) return;
    const r = loadedRel;
    // give new card lines their hidden id; the editor change triggers another save
    const ids = assignIds(body, cardId);
    if (ids.inserted.length && editor) {
      editor.appendToLines(ids.inserted);
      return;
    }
    try {
      await saveNote(r, joinNote($state.snapshot(meta) as Meta, body), force ? undefined : loadedMtime);
      if (loadedRel === r) {
        loadedMtime = getNote(r)?.mtime ?? loadedMtime;
        status = "saved";
      }
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      status = msg === "conflict" ? "conflict" : "error";
      errorText = msg;
    }
  }
  function setMeta(patch: Meta) {
    meta = { ...meta, ...patch };
    for (const k of Object.keys(patch)) if (patch[k] === undefined || patch[k] === "") delete meta[k];
    status = "saving";
    void flush();
  }
  async function takeTheirs() {
    if (!loadedRel) return;
    await reloadNote(loadedRel);
    loadedRel = null; // reload into the editor
  }

  async function openLink(name: string) {
    const p = resolvePdfLink(name);
    if (p) {
      location.hash = pdfHref(p.rel, p.page);
      return;
    }
    const target = resolveLink(name);
    if (target) location.hash = noteHref(target.rel);
    else {
      const r = await createNote(rel ? dirOf(rel) : "", name, "blank", meta.course ? { course: meta.course } : {});
      location.hash = noteHref(r);
    }
  }

  async function doRename() {
    if (!rel || !note || title.trim() === linkName(note) || !title.trim()) return;
    window.clearTimeout(timer);
    await flush();
    try {
      const to = await renameNote(rel, title.trim());
      loadedRel = to;
      location.hash = noteHref(to);
    } catch (e) {
      errorText = String(e instanceof Error ? e.message : e);
      status = "error";
      title = linkName(note);
    }
  }
  async function doMove(folder: string) {
    if (!rel) return;
    await flush();
    const to = await moveNote(rel, folder);
    loadedRel = to;
    location.hash = noteHref(to);
  }
  let confirmDel = $state(false);
  async function doDelete() {
    if (!rel) return;
    window.clearTimeout(timer);
    await trashNote(rel);
    confirmDel = false;
    location.hash = "#/study/notes";
  }

  let newOpen = $state(false);
  let newMode = $state<"note" | "folder">("note");
  let newFolder = $state("");

  $effect(() => () => {
    if (notes.editing === loadedRel) notes.editing = null;
  });
  // "Edit in note" from a flashcard: jump to the card's line once the editor is ready
  $effect(() => {
    const j = notes.jump;
    if (j && editor && j.rel === loadedRel) {
      const line = j.line;
      notes.jump = null;
      setTimeout(() => editor?.gotoLine(line), 50);
    }
  });

  const back = $derived(rel ? backlinks(rel) : []);
  const outline = $derived(note ? note.p.headings : []);
  const outLinks = $derived(note ? note.p.links.map((l) => ({ name: l, to: resolveLink(l) })) : []);
  const course = $derived(meta.course ? courseByName(String(meta.course)) : undefined);
  const dirs = $derived(["", ...notes.dirs.filter((d) => !d.startsWith("attachments"))]);
  const tagsText = $derived(((meta.tags as string[]) ?? []).join(", "));
</script>

<div class="nwrap">
<div class="notes">
  <aside class="left">
    <NoteTree current={rel} onnew={(f) => { newMode = "note"; newFolder = f; newOpen = true; }} onnewfolder={() => { newMode = "folder"; newFolder = rel ? dirOf(rel) : ""; newOpen = true; }} />
  </aside>

  <section class="center">
    {#if rel && note}
      <header class="nh">
        <div class="crumbs">
          <span class="muted">{dirOf(rel) || "Notes"}</span>
          <span class="st" class:bad={status === "conflict" || status === "error"}>
            {status === "saved" ? "Saved" : status === "saving" ? "Saving…" : status === "conflict" ? "Changed elsewhere" : "Couldn't save"}
          </span>
        </div>
        <input class="title display" bind:value={title} aria-label="Note title (file name)" onblur={doRename} onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        <div class="props">
          <label class="prop" style={course ? `--c: ${course[1].color}` : ""}>
            <Icon name="book" size={14} />
            <select value={meta.course ?? ""} aria-label="Course" onchange={(e) => setMeta({ course: e.currentTarget.value || undefined })}>
              <option value="">No course</option>{#each courseNames() as c}<option value={c}>{c}</option>{/each}
            </select>
          </label>
          <label class="prop"><Icon name="calendar" size={14} /><input type="date" class:empty={!meta.date} value={meta.date ?? ""} aria-label="Date" onchange={(e) => setMeta({ date: e.currentTarget.value || undefined })} /></label>
          <label class="prop grow"><span class="hash">#</span><input value={tagsText} placeholder="tags, comma separated" aria-label="Tags"
            onchange={(e) => setMeta({ tags: e.currentTarget.value.split(",").map((x) => x.trim().replace(/^#/, "")).filter(Boolean) })} /></label>
          <details class="menu">
            <summary aria-label="More"><Icon name="dots" size={18} /></summary>
            <div class="pop">
              <label>Move to
                <select value={dirOf(rel)} onchange={(e) => doMove(e.currentTarget.value)}>{#each dirs as d}<option value={d}>{d || "Notes (top level)"}</option>{/each}</select>
              </label>
              {#if confirmDel}
                <button type="button" class="del" onclick={doDelete}>Move to trash (.trash in the Notes folder)</button>
              {:else}
                <button type="button" class="del soft" onclick={() => (confirmDel = true)}>Delete…</button>
              {/if}
            </div>
          </details>
        </div>
        {#if status === "conflict"}
          <div class="conflict" role="alert">
            <span>This note was changed on another computer since you opened it.</span>
            <button type="button" class="btn quiet sm" onclick={takeTheirs}>Load that version</button>
            <button type="button" class="btn primary sm" onclick={() => flush(true)}>Keep mine</button>
          </div>
        {:else if status === "error"}
          <div class="conflict" role="alert"><span>{errorText}</span></div>
        {/if}
        <div class="toolbar" role="toolbar" aria-label="Formatting">
          <button type="button" onclick={() => editor?.linePrefix("# ")} title="Heading 1">H1</button>
          <button type="button" onclick={() => editor?.linePrefix("## ")} title="Heading 2">H2</button>
          <button type="button" onclick={() => editor?.wrap("**")} title="Bold (Ctrl+B)"><b>B</b></button>
          <button type="button" onclick={() => editor?.wrap("*")} title="Italic"><i>I</i></button>
          <button type="button" onclick={() => editor?.wrap("==")} title="Highlight"><span class="hl">H</span></button>
          <span class="sep"></span>
          <button type="button" onclick={() => editor?.linePrefix("- ")} title="Bullet">•</button>
          <button type="button" onclick={() => editor?.linePrefix("- [ ] ")} title="Checklist">☐</button>
          <button type="button" onclick={() => editor?.insert("\n| Drug | Class | Key point |\n| --- | --- | --- |\n|  |  |  |\n")} title="Table">▦</button>
          <span class="sep"></span>
          <button type="button" onclick={() => editor?.wrap("[[", "]]", "Note name")} title="Link to a note">[[ ]]</button>
          <button type="button" class="card" onclick={() => editor?.insert(" :: ")} title="Flashcard: Question :: Answer">Q :: A</button>
          <button type="button" class="card" onclick={() => editor?.wrap("{{", "}}", "hidden part")} title="Cloze flashcard">{"{{ }}"}</button>
        </div>
      </header>
      <div class="edwrap">
        {#key `${loadedRel}#${version}`}
          <NoteEditor
            bind:this={editor}
            value={body}
            onchange={changed}
            onopenlink={openLink}
            linkNames={() => allNotes().map(linkName)}
            tagNames={allTags}
            imageUrl={(src) => imageUrl(rel!, src)}
            onpasteimage={(d, ext) => savePastedImage(rel!, d, ext)}
          />
        {/key}
      </div>
    {:else if rel && notes.loaded}
      <div class="empty card"><p>This note isn't in the notes folder any more.</p><a class="btn quiet" href="#/study/notes">Back to notes</a></div>
    {:else}
      <div class="empty">
        <Icon name="pen" size={30} />
        <h2 class="display">Pick a note, or start one</h2>
        <p class="muted">Notes are Markdown files in <code>{notes.root || "your Notes folder"}</code>, so they're on your Drive and open in any app.</p>
        <button type="button" class="btn primary" onclick={() => { newMode = "note"; newFolder = ""; newOpen = true; }}>+ New note</button>
        {#if notes.error}<p class="err">{notes.error}</p>{/if}
        {#if recentNotes(5).length}
          <ul class="recent">
            {#each recentNotes(5) as e (e.rel)}<li><a href={noteHref(e.rel)}>{e.p.title}</a></li>{/each}
          </ul>
        {/if}
      </div>
    {/if}
  </section>

  {#if rel && note}
    <aside class="right">
      {#if course || meta.event || meta.date || meta.pdf}
        <section>
          <h3 class="label">Linked to</h3>
          {#if course}<a class="lk" href="#/courses/{course[0]}" style="--c: {course[1].color}"><span class="cd"></span>{course[1].name}</a>{/if}
          {#if meta.date}<a class="lk" href="#/calendar/day" ><Icon name="calendar" size={14} /> {fromKey(String(meta.date)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{meta.event ? " · class" : ""}</a>{/if}
          {#if typeof meta.pdf === "string"}<a class="lk" href={pdfHref(meta.pdf)}><Icon name="file" size={14} /> {pdfName(meta.pdf)}</a>{/if}
        </section>
      {/if}
      {#if outline.length > 1}
        <section>
          <h3 class="label">Outline</h3>
          <ul class="outline">
            {#each outline as h}<li style="--l: {h.level - 1}"><button type="button" onclick={() => editor?.gotoLine(h.line)}>{h.text}</button></li>{/each}
          </ul>
        </section>
      {/if}
      <section>
        <h3 class="label">Backlinks <span class="n">{back.length}</span></h3>
        {#if back.length}
          <ul class="bl">
            {#each back as b (b.e.rel)}<li><a href={noteHref(b.e.rel)}><b>{b.e.p.title}</b>{#if b.context}<span>{b.context}</span>{/if}</a></li>{/each}
          </ul>
        {:else}
          <p class="muted small">No notes link here yet. Type <code>[[{title}]]</code> in another note.</p>
        {/if}
      </section>
      {#if outLinks.length || note?.p.pdfs?.length}
        <section>
          <h3 class="label">Links</h3>
          <ul class="ol">
            {#each outLinks as l}<li><button type="button" class:missing={!l.to} onclick={() => openLink(l.name)}>{l.name}{#if !l.to}<small> · create</small>{/if}</button></li>{/each}
            {#each note?.p.pdfs ?? [] as p}<li><button type="button" onclick={() => openLink(p)}><Icon name="file" size={13} /> {pdfName(p)}</button></li>{/each}
          </ul>
        </section>
      {/if}
    </aside>
  {/if}
</div>
</div>

<NewNoteDialog bind:open={newOpen} folder={newFolder} mode={newMode} />

<style>
  .nwrap {
    container-type: inline-size;
    min-width: 0;
  }
  .notes {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr) 250px;
    gap: 14px;
    height: calc(100vh - 190px);
    min-height: 480px;
  }
  .left,
  .right {
    min-height: 0;
  }
  .right {
    display: grid;
    align-content: start;
    gap: 18px;
    overflow-y: auto;
    padding: 4px;
  }
  .center {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  @container (max-width: 1100px) {
    .notes {
      grid-template-columns: 220px minmax(0, 1fr);
    }
    .right {
      display: none;
    }
  }
  @container (max-width: 680px) {
    .notes {
      grid-template-columns: minmax(0, 1fr);
      height: auto;
    }
    .left {
      max-height: 260px;
    }
    .center {
      min-height: 70vh;
    }
  }
  .nh {
    display: grid;
    gap: 8px;
    padding: 16px 22px 10px;
    border-bottom: 1px solid var(--hairline);
  }
  .crumbs {
    display: flex;
    justify-content: space-between;
    font-size: 12.5px;
  }
  .st {
    color: var(--text-muted);
  }
  .st.bad {
    color: #a8434f;
    font-weight: 600;
  }
  .title {
    width: 100%;
    border: 0;
    background: none;
    font-size: 28px;
    font-weight: 600;
    color: var(--text);
    padding: 0;
  }
  .title:focus {
    outline: none;
    box-shadow: 0 2px 0 var(--peach);
  }
  .props {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .prop {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 4px 0 10px;
    border-radius: var(--radius-pill);
    background: var(--panel);
    color: var(--text-muted);
    font-size: 13px;
  }
  .prop[style] {
    background: color-mix(in srgb, var(--c) 35%, var(--white));
    color: var(--text);
  }
  .prop select,
  .prop input {
    border: 0;
    background-color: transparent;
    font: inherit;
    font-size: 13px;
    color: var(--text);
    min-height: 32px;
    padding: 0 30px 0 2px;
  }
  .prop input {
    padding-right: 8px;
  }
  .prop.grow {
    flex: 1;
    min-width: 180px;
  }
  .prop.grow input {
    width: 100%;
  }
  .hash {
    font-weight: 700;
  }
  .menu {
    position: relative;
  }
  .menu summary {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--panel);
    cursor: pointer;
    list-style: none;
  }
  .menu summary::-webkit-details-marker {
    display: none;
  }
  .pop {
    position: absolute;
    right: 0;
    top: 40px;
    z-index: 10;
    display: grid;
    gap: 8px;
    width: 280px;
    padding: 12px;
    border-radius: 16px;
    background: var(--surface);
    box-shadow: var(--shadow-lift);
  }
  .pop label {
    display: grid;
    gap: 4px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .pop select {
    min-height: 36px;
    background-color: var(--panel);
    padding-left: 10px;
    font: inherit;
  }
  .del {
    min-height: 36px;
    border: 0;
    border-radius: 10px;
    background: var(--rose-soft);
    color: #8f3b45;
    font-weight: 600;
  }
  .del.soft {
    background: var(--panel);
    color: var(--text-muted);
  }
  .conflict {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--rose-soft);
    font-size: 13.5px;
  }
  .conflict span {
    flex: 1;
  }
  .sm {
    min-height: 34px;
    padding: 0 12px;
    font-size: 13px;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    align-items: center;
  }
  .toolbar button {
    min-width: 34px;
    min-height: 32px;
    padding: 0 8px;
    border: 0;
    border-radius: 9px;
    background: none;
    font-size: 13.5px;
    color: var(--text-muted);
  }
  .toolbar button:hover {
    background: var(--panel);
    color: var(--text);
  }
  .toolbar .card {
    color: #a8434f;
    font-weight: 600;
  }
  .hl {
    background: var(--butter);
    padding: 0 3px;
    border-radius: 3px;
  }
  .sep {
    width: 1px;
    height: 18px;
    margin: 0 4px;
    background: var(--hairline);
  }
  .edwrap {
    flex: 1;
    min-height: 0;
  }
  .empty {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 10px;
    height: 100%;
    padding: 30px;
    text-align: center;
  }
  .empty h2 {
    font-size: 24px;
    font-weight: 600;
  }
  .empty code,
  .small code {
    font-size: 12.5px;
    background: var(--chip);
    padding: 1px 6px;
    border-radius: 6px;
  }
  .err {
    color: #a8434f;
  }
  .recent {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .right section {
    display: grid;
    gap: 8px;
  }
  .label .n {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    margin-left: 4px;
    border-radius: 10px;
    background: var(--surface);
    font-size: 11px;
  }
  .lk {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px;
    border-radius: 12px;
    background: var(--surface);
    text-decoration: none;
    font-size: 13.5px;
    font-weight: 500;
  }
  .cd {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c);
  }
  .outline,
  .bl,
  .ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .outline button,
  .ol button {
    width: 100%;
    min-height: 30px;
    padding: 0 8px 0 calc(8px + var(--l, 0) * 12px);
    border: 0;
    border-radius: 8px;
    background: none;
    font: inherit;
    font-size: 13.5px;
    text-align: left;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .outline button:hover,
  .ol button:hover {
    background: var(--surface);
  }
  .ol .missing {
    color: var(--text-muted);
    font-style: italic;
  }
  .bl a {
    display: grid;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 12px;
    background: var(--surface);
    text-decoration: none;
  }
  .bl b {
    font-size: 13.5px;
    font-weight: 600;
  }
  .bl span {
    font-size: 12.5px;
    color: var(--text-muted);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .small {
    font-size: 13px;
  }
</style>
