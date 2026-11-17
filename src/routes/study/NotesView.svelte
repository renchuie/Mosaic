<script lang="ts">
  // The note page (N1b; roomier layout Nov 17). The note fills the main panel as one sheet under a
  // slim top bar (Study tabs, notes list / search, page width, toolbar pin, side panel icons,
  // writing mode). A panel icon slides its panel OVER the note as a sheet; 📌 pins it beside the
  // note as a column. Writing mode (Ctrl+\) hides the rail and the top bar until the mouse touches
  // the left or top edge. Pins and the toolbar pin are remembered per machine; page width per note.
  import Icon from "../../lib/components/Icon.svelte";
  import BlockEditor from "../../lib/components/BlockEditor.svelte";
  import NoteEditor from "../../lib/components/NoteEditor.svelte";
  import { joinNote, linkKey, plainText, splitNote, type Meta } from "../../lib/notes";
  import { assignIds, cardId, extractCards, ID_RE } from "../../lib/cards";
  import { statusOf, type SrsRec } from "../../lib/stores/srs.svelte";
  import { get } from "../../lib/stores/synced.svelte";
  import {
    allNotes, allTags, backlinks, createNote, dirOf, getNote, imageUrl, linkName, moveNote, noteHref, notes,
    reloadNote, renameNote, resolveLink, saveNote, savePastedImage, trashNote,
  } from "../../lib/stores/notes.svelte";
  import { pdfHref, resolvePdfLink } from "../../lib/stores/pdfs.svelte";
  import NewNoteDialog from "./NewNoteDialog.svelte";
  import NoteTree from "./NoteTree.svelte";
  import NotesHome from "./NotesHome.svelte";
  import NoteHead from "./NoteHead.svelte";
  import NoteToolbar from "./NoteToolbar.svelte";
  import NoteSide, { PANELS, type Panel } from "./NoteSide.svelte";
  import StudyNav from "./StudyNav.svelte";
  import { ui } from "../../lib/stores/ui.svelte";

  let { rel }: { rel: string | null } = $props();

  const note = $derived(rel ? getNote(rel) : undefined);
  let meta = $state<Meta>({});
  let body = $state(""); // the editor's text (title line taken off), or the whole body in source mode
  let titleText = $state<string | null>(null); // the "# Title" line, when the note has one
  let titleLines = $state(0); // lines the title took at the top of the body
  let loadedMtime = $state(0);
  let loadedRel = $state<string | null>(null);
  let version = $state(0);
  let status = $state<"saved" | "saving" | "conflict" | "error">("saved");
  let errorText = $state("");
  let title = $state("");
  let source = $state(false);
  let blocks = $state<BlockEditor>();
  let cm = $state<NoteEditor>();

  /** Take a leading "# Title" (matching the file name) off the body: the page shows the title once. */
  function stripTitle(text: string, name: string) {
    const lines = text.split("\n");
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    const m = /^#\s+(.+?)\s*$/.exec((lines[i] ?? "").replace(ID_RE, ""));
    if (!m || linkKey(m[1]) !== linkKey(name)) return { rest: text, title: null as string | null, n: 0 };
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    return { rest: lines.slice(j).join("\n"), title: m[1], n: j };
  }

  $effect(() => {
    if (rel && note && loadedRel !== rel) {
      window.clearTimeout(timer); // a save still waiting belongs to the note being left (saved on leave)
      if (source && status === "saving" && loadedRel) saveSourceNow(loadedRel, body);
      const s = splitNote(note.text);
      meta = s.meta;
      const t = stripTitle(s.body, linkName(note));
      body = source ? s.body : t.rest;
      titleText = t.title;
      titleLines = t.n;
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
  let quiet = false;
  function changed() {
    if (quiet) return;
    status = "saving";
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void flush(), 700);
  }
  function cmChanged(text: string) {
    body = text;
    changed();
  }
  /** The whole note body as it goes into the file. */
  function fullBody(): string {
    if (source) return body;
    let md = blocks?.markdown() ?? body;
    const ids = assignIds(md, cardId);
    if (ids.inserted.length && blocks) {
      quiet = true;
      blocks.setIds(ids.inserted);
      quiet = false;
      md = ids.body;
    }
    body = md;
    return titleText !== null ? `# ${titleText}\n\n${md}` : md;
  }
  /** Markdown view: save the text of a note being left before its autosave ran. */
  function saveSourceNow(r: string, text: string) {
    const e = getNote(r);
    if (!e) return;
    const out = joinNote(splitNote(e.text).meta, assignIds(text, cardId).body);
    // after this tick: the page is being torn down right now, and state can't change mid-teardown
    if (out !== e.text) setTimeout(() => void saveNote(r, out, e.mtime).catch((err) => console.error("save on leave", err)), 0);
  }

  /** Save a note's text that the editor handed over as it closed (left within the autosave delay). */
  function leaveFor(r: string) {
    return (md: string) => {
      const e = getNote(r);
      if (!e) return;
      const s = splitNote(e.text);
      const t = stripTitle(s.body, linkName(e));
      const ids = assignIds(md, cardId);
      const text = joinNote(s.meta, (t.title !== null ? `# ${t.title}\n\n` : "") + ids.body);
      if (text === e.text) return;
      setTimeout(() => void saveNote(r, text, e.mtime).catch((err) => console.error("save on leave", err)), 0);
    };
  }

  async function flush(force = false) {
    if (!loadedRel) return;
    const r = loadedRel;
    window.clearTimeout(timer);
    let text = fullBody();
    if (source) {
      const ids = assignIds(text, cardId);
      if (ids.inserted.length && cm) {
        cm.appendToLines(ids.inserted);
        return;
      }
    }
    try {
      await saveNote(r, joinNote($state.snapshot(meta) as Meta, text), force ? undefined : loadedMtime);
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
    loadedRel = null;
  }
  async function toggleSource() {
    if (!note) return;
    await flush();
    if (!source) {
      body = titleText !== null ? `# ${titleText}\n\n${body}` : body;
      source = true;
    } else {
      const t = stripTitle(body, linkName(note));
      body = t.rest;
      titleText = t.title;
      titleLines = t.n;
      source = false;
    }
    version++;
  }

  async function openLink(name: string) {
    const p = resolvePdfLink(name);
    if (p) {
      location.hash = pdfHref(p.rel, p.page);
      return;
    }
    const target = resolveLink(name.split("#")[0]);
    if (target) location.hash = noteHref(target.rel);
    else {
      await flush();
      const r = await createNote(rel ? dirOf(rel) : "", name.split("#")[0], "blank", meta.course ? { course: meta.course } : {});
      location.hash = noteHref(r);
    }
  }

  async function doRename() {
    if (!rel || !note || title.trim() === linkName(note) || !title.trim()) return;
    await flush();
    try {
      const to = await renameNote(rel, title.trim());
      if (titleText !== null) titleText = title.trim();
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
  async function doDelete() {
    if (!rel) return;
    window.clearTimeout(timer);
    await trashNote(rel);
    location.hash = "#/study/notes";
  }
  function coverFile(f: File) {
    if (!rel) return;
    const r = new FileReader();
    r.onload = async () => {
      const path = await savePastedImage(rel!, String(r.result), f.type.split("/")[1]?.replace("jpeg", "jpg") || "png");
      setMeta({ cover: path });
    };
    r.readAsDataURL(f);
  }

  let newOpen = $state(false);
  let newMode = $state<"note" | "folder">("note");
  let newFolder = $state("");

  $effect(() => () => {
    if (notes.editing === loadedRel) notes.editing = null;
    window.clearTimeout(timer);
    if (source && status === "saving" && loadedRel) saveSourceNow(loadedRel, body);
  });
  // "Edit in note" from a flashcard: jump to the card's line once the editor is ready
  $effect(() => {
    const j = notes.jump;
    if (j && j.rel === loadedRel && (blocks || cm)) {
      const line = j.line;
      notes.jump = null;
      setTimeout(() => (source ? cm?.gotoLine(line) : blocks?.gotoLine(line - titleLines)), 80);
    }
  });
  function gotoLine(line: number) {
    sheetR = null;
    if (source) cm?.gotoLine(line);
    else blocks?.gotoLine(line - titleLines);
  }
  function gotoHeading(text: string, nth: number) {
    sheetR = null;
    if (source) {
      const h = note?.p.headings.filter((x) => x.text === text)[nth];
      if (h) cm?.gotoLine(h.line);
    } else blocks?.gotoHeading(text, nth);
  }

  // ---- panels ----------------------------------------------------------------------------------
  type Saved = { pinL: boolean; pinR: Panel | null; tools: boolean };
  const loadPanels = (): Saved => {
    const base: Saved = { pinL: false, pinR: null, tools: false };
    try {
      const v = JSON.parse(localStorage.getItem("mosaic.notePanels") ?? "{}");
      return { pinL: !!v.pinL, pinR: v.pinR ?? null, tools: !!v.tools };
    } catch {
      return base;
    }
  };
  let panels = $state<Saved>(loadPanels());
  $effect(() => {
    const v = JSON.stringify(panels);
    try {
      localStorage.setItem("mosaic.notePanels", v);
    } catch {}
  });
  let sheetL = $state(false);
  let sheetR = $state<Panel | null>(null);
  let width = $state(1200);
  const roomL = $derived(width > 1000);
  const roomR = $derived(width > (panels.pinL ? 1240 : 960));
  const pinL = $derived(panels.pinL && roomL && !ui.writing);
  const pinR = $derived(panels.pinR && roomR && !ui.writing ? panels.pinR : null);
  let treeHost = $state<HTMLElement>();

  function openLeft(search = false) {
    if (pinL) {
      if (!search) panels.pinL = false;
    } else sheetL = !sheetL || search;
    sheetR = null;
    if (search) setTimeout(() => treeHost?.querySelector<HTMLInputElement>("input.search")?.focus(), 60);
  }
  function openRight(p: Panel) {
    sheetL = false;
    if (pinR) {
      if (pinR === p) panels.pinR = null;
      else panels.pinR = p;
      return;
    }
    sheetR = sheetR === p ? null : p;
  }
  function pinLeft() {
    panels.pinL = true;
    sheetL = false;
  }
  function pinRight(p: Panel) {
    panels.pinR = p;
    sheetR = null;
  }
  function toggleWriting() {
    ui.writing = !ui.writing;
    sheetL = false;
    sheetR = null;
  }
  // leaving the note page ends writing mode (after this tick: no state changes mid-teardown)
  $effect(() => () => queueMicrotask(() => (ui.writing = false)));

  // ---- page width (front matter `width: wide | full`; Readable is the default and writes nothing) ----
  const WIDTH_NAMES = ["readable", "wide", "full"] as const;
  type Width = (typeof WIDTH_NAMES)[number];
  const WIDTHS: Record<Width, string> = { readable: "860px", wide: "1120px", full: "100%" };
  const WIDTH_TIPS: Record<Width, string> = {
    readable: "Readable: a comfortable line length for writing",
    wide: "Wide: more room for tables and long card lists",
    full: "Full: the whole page, for big comparison tables",
  };
  const noteWidth = $derived<Width>(meta.width === "wide" || meta.width === "full" ? meta.width : "readable");
  const setWidth = (w: Width) => w !== noteWidth && setMeta({ width: w === "readable" ? undefined : w });
  const back = $derived(rel ? backlinks(rel) : []);
  // badge on the cards icon: cards in this note due now
  const dueHere = $derived.by(() => {
    if (!note) return 0;
    const now = Date.now();
    return extractCards(splitNote(note.text).body).filter((c) => {
      if (!c.lineId) return false;
      const st = statusOf(get<SrsRec>("srs", c.key), now);
      return st === "review" || st === "learning";
    }).length;
  });

  // ---- floating toolbar (at the bottom while she types, or always when pinned with ✎) and the
  // title that moves into the top bar once the header has scrolled away ----
  let scrollEl = $state<HTMLElement>();
  let headHidden = $state(false);
  let typing = $state(false);
  let typingTimer = 0;
  function checkHead() {
    const t = scrollEl?.querySelector(".nh .title");
    headHidden = !!(t && scrollEl && t.getBoundingClientRect().bottom < scrollEl.getBoundingClientRect().top + 4);
  }
  function setTyping(on: boolean) {
    window.clearTimeout(typingTimer);
    if (on) typing = true;
    else typingTimer = window.setTimeout(() => (typing = false), 150);
  }

  // ---- linked references -------------------------------------------------------------------------
  let showMentions = $state(false);
  const mentions = $derived.by(() => {
    if (!showMentions || !note) return [];
    const name = linkName(note);
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^\\p{L}\\p{N}\\[])${esc}(?![\\p{L}\\p{N}\\]])`, "iu");
    return Object.values(notes.files)
      .filter((e) => e.rel !== note.rel && !e.p.links.some((l) => linkKey(l) === linkKey(name)) && re.test(splitNote(e.text).body))
      .slice(0, 20)
      .map((e) => {
        const b = plainText(splitNote(e.text).body);
        const m = re.exec(b)!;
        const i = m.index;
        return { e, snip: (i > 40 ? "…" : "") + b.slice(Math.max(0, i - 40), i + name.length + 60).replace(/\s+/g, " ") + "…" };
      });
  });

  const dirs = $derived(["", ...notes.dirs.filter((d) => !d.startsWith("attachments"))]);
  const label = (p: Panel) => PANELS.find((x) => x.id === p)!.label;
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape" && (sheetL || sheetR)) {
      sheetL = false;
      sheetR = null;
    } else if (e.key === "Escape" && ui.writing && !e.defaultPrevented && !document.querySelector(".nh .pop")) {
      // Esc the editor didn't use (a menu, cloze retyping) leaves writing mode
      ui.writing = false;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "\\" && rel && note) {
      e.preventDefault();
      toggleWriting();
    }
  }}
/>

<div class="nwrap" class:full={!!(rel && note)} class:pad={!!rel && !note} bind:clientWidth={width}>
  {#if rel && note}
    <div class="npage" class:writing={ui.writing} class:typing style="--note-box: {WIDTHS[noteWidth]}">
      <div class="topbar">
        <button type="button" class="ico" class:on={sheetL || pinL} title="Notes" aria-label="Notes" onclick={() => openLeft()}><Icon name="note" size={18} /></button>
        <button type="button" class="ico" title="Search notes" aria-label="Search notes" onclick={() => openLeft(true)}><Icon name="search" size={18} /></button>
        <button type="button" class="ico plus" title="New note" aria-label="New note" onclick={() => { newMode = "note"; newFolder = dirOf(rel!); newOpen = true; }}>+</button>
        <StudyNav compact />
        <div class="where" class:show={headHidden} aria-hidden={!headHidden}>
          {#if meta.icon}<span class="wi">{meta.icon}</span>{/if}<b>{title}</b>{#if meta.course}<span class="wc">· {meta.course}</span>{/if}
        </div>
        <span class="grow"></span>
        <span class="st" class:bad={status === "conflict" || status === "error"} class:busy={status === "saving"}>
          {status === "saved" ? "Saved" : status === "saving" ? "Saving…" : status === "conflict" ? "Changed elsewhere" : "Couldn't save"}
        </span>
        <div class="seg" role="group" aria-label="Page width">
          {#each WIDTH_NAMES as w}
            <button type="button" class:on={noteWidth === w} aria-pressed={noteWidth === w} title={WIDTH_TIPS[w]} onclick={() => setWidth(w)}>{w[0].toUpperCase() + w.slice(1)}</button>
          {/each}
        </div>
        {#if !source}
          <button type="button" class="ico" class:on={panels.tools} title={panels.tools ? "Toolbar: always showing" : "Toolbar: only while typing (click to keep it showing)"} aria-label="Formatting toolbar" aria-pressed={panels.tools} onclick={() => (panels.tools = !panels.tools)}><Icon name="pen" size={17} /></button>
        {/if}
        <span class="sep"></span>
        {#each PANELS as p}
          <button type="button" class="ico" class:on={sheetR === p.id || pinR === p.id} title={p.label} aria-label={p.label} onclick={() => openRight(p.id)}>
            <Icon name={p.icon} size={18} />
            {#if p.id === "cards" && dueHere}<i class="badge">{dueHere}</i>{/if}
            {#if p.id === "backlinks" && back.length}<i class="badge soft">{back.length}</i>{/if}
          </button>
        {/each}
        <button type="button" class="ico" class:on={ui.writing} title={ui.writing ? "Leave writing mode (Ctrl+\\)" : "Writing mode: hide everything but the note (Ctrl+\\)"} aria-label="Writing mode" aria-pressed={ui.writing} onclick={toggleWriting}><Icon name="focus" size={18} /></button>
      </div>

      {#if ui.writing}
        <div class="wpill l" class:quiet={typing}>
          <button type="button" onclick={toggleWriting}>‹ {dirOf(rel) || "Notes"}{#if meta.course && meta.course !== dirOf(rel)} · {meta.course}{/if}</button>
          <span class="st">{status === "saved" ? "Saved" : status === "saving" ? "Saving…" : "Not saved"}</span>
        </div>
        <button type="button" class="wpill r" class:quiet={typing} onclick={toggleWriting}>Ctrl+\ or Esc to leave writing mode</button>
      {/if}

      <div class="body">
        {#if pinL}
          <aside class="pinned left" bind:this={treeHost}>
            <div class="ph"><b>Notes</b><button type="button" class="x" title="Unpin" aria-label="Unpin notes" onclick={() => (panels.pinL = false)}>📌</button></div>
            <NoteTree current={rel} onnew={(f) => { newMode = "note"; newFolder = f; newOpen = true; }} onnewfolder={() => { newMode = "folder"; newFolder = dirOf(rel!); newOpen = true; }} />
          </aside>
        {/if}

        <section class="center">
          {#if (typing || panels.tools) && !source}
            <div class="floatbar"><NoteToolbar floating onrun={(c, a) => blocks?.run(c, a)} /></div>
          {/if}
          <div class="scroll" bind:this={scrollEl} onscroll={checkHead}>
            <NoteHead {rel} {meta} bind:title {status} {errorText} {source} {dirs}
              coverUrl={(s) => imageUrl(rel!, s)}
              onmeta={setMeta} onrename={doRename} onmove={doMove} ondelete={doDelete} ontoggleSource={toggleSource}
              oncoverfile={coverFile} ontheirs={takeTheirs} onmine={() => flush(true)} />
            <div class="edwrap" class:src={source}>
              {#key `${loadedRel}#${version}`}
                {#if source}
                  <NoteEditor bind:this={cm} value={body} onchange={cmChanged} onopenlink={openLink}
                    linkNames={() => allNotes().map(linkName)} tagNames={allTags}
                    imageUrl={(src) => imageUrl(rel!, src)} onpasteimage={(d, ext) => savePastedImage(rel!, d, ext)} />
                {:else}
                  <BlockEditor bind:this={blocks} value={body} onchange={changed} onopenlink={openLink} onfocuschange={setTyping} onleave={leaveFor(loadedRel!)}
                    linkNames={() => allNotes().map(linkName)} tagNames={allTags}
                    imageUrl={(src) => imageUrl(rel!, src)} onpasteimage={(d, ext) => savePastedImage(rel!, d, ext)} />
                {/if}
              {/key}
            </div>
            {#if !source}
              <footer class="refs">
                <h3>Linked references <span class="n">{back.length}</span></h3>
                {#if back.length}
                  <div class="rgrid">
                    {#each back as b (b.e.rel)}<a href={noteHref(b.e.rel)}><b>{b.e.p.title}</b>{#if b.context}<span>{plainText(b.context)}</span>{/if}</a>{/each}
                  </div>
                {:else}
                  <p class="muted">No notes link here yet. Type <kbd>[[</kbd> in another note and pick “{title}”.</p>
                {/if}
                <button type="button" class="more" onclick={() => (showMentions = !showMentions)}>{showMentions ? "▾" : "▸"} Unlinked mentions</button>
                {#if showMentions}
                  {#if mentions.length}
                    <div class="rgrid">
                      {#each mentions as m (m.e.rel)}<a href={noteHref(m.e.rel)}><b>{m.e.p.title}</b><span>{m.snip}</span></a>{/each}
                    </div>
                  {:else}
                    <p class="muted">No other note mentions “{title}” without linking it.</p>
                  {/if}
                {/if}
              </footer>
            {/if}
          </div>
        </section>

        {#if pinR}
          <aside class="pinned right">
            <div class="ph"><b>{label(pinR)}</b><button type="button" class="x" title="Unpin" aria-label="Unpin panel" onclick={() => (panels.pinR = null)}>📌</button></div>
            <div class="pbody"><NoteSide which={pinR} {note} {meta} {titleLines} ongotoline={gotoLine} ongotoheading={gotoHeading} onopenlink={openLink} /></div>
          </aside>
        {/if}
      </div>

      {#if sheetL || sheetR}
        <button type="button" class="scrim" aria-label="Close panel" onclick={() => { sheetL = false; sheetR = null; }}></button>
      {/if}
      {#if sheetL}
        <aside class="sheet left" bind:this={treeHost}>
          <div class="ph">
            <b>Notes</b>
            {#if roomL && !ui.writing}<button type="button" class="x" title="Pin beside the note" aria-label="Pin" onclick={pinLeft}>📌</button>{/if}
            <button type="button" class="x" aria-label="Close" onclick={() => (sheetL = false)}>×</button>
          </div>
          <NoteTree current={rel} onnew={(f) => { newMode = "note"; newFolder = f; newOpen = true; sheetL = false; }} onnewfolder={() => { newMode = "folder"; newFolder = dirOf(rel!); newOpen = true; sheetL = false; }} />
        </aside>
      {/if}
      {#if sheetR}
        <aside class="sheet right">
          <div class="ph">
            <b>{label(sheetR)}</b>
            {#if roomR && !ui.writing}<button type="button" class="x" title="Pin beside the note" aria-label="Pin" onclick={() => pinRight(sheetR!)}>📌</button>{/if}
            <button type="button" class="x" aria-label="Close" onclick={() => (sheetR = null)}>×</button>
          </div>
          <div class="pbody"><NoteSide which={sheetR} {note} {meta} {titleLines} ongotoline={gotoLine} ongotoheading={gotoHeading} onopenlink={openLink} /></div>
        </aside>
      {/if}
    </div>
  {:else}
    {#if rel}<StudyNav />{/if}
    <div class="notes homeview">
      <aside class="left">
        <NoteTree current={rel} onnew={(f) => { newMode = "note"; newFolder = f; newOpen = true; }} onnewfolder={() => { newMode = "folder"; newFolder = ""; newOpen = true; }} />
      </aside>
      <section class="center bare">
        {#if rel && notes.loaded}
          <div class="empty card"><p>This note isn't in the notes folder any more.</p><a class="btn quiet" href="#/study/notes">Back to notes</a></div>
        {:else}
          <NotesHome onnew={(f) => { newMode = "note"; newFolder = f; newOpen = true; }} />
        {/if}
      </section>
    </div>
  {/if}
</div>

<NewNoteDialog bind:open={newOpen} folder={newFolder} mode={newMode} />

<style>
  .nwrap {
    container-type: inline-size;
    min-width: 0;
  }
  .nwrap.full {
    height: 100%;
  }
  .nwrap.pad {
    padding: var(--main-pad);
  }
  /* the note page: one sheet filling the main panel (App makes main flush for note routes) */
  .npage {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--surface);
  }
  .topbar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 56px;
    padding: 8px 14px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--hairline);
    overflow-x: auto;
    scrollbar-width: none;
    transition: transform 0.3s var(--spring, ease), opacity 0.2s;
  }
  .topbar :global(.snav) {
    margin-left: 8px;
  }
  .topbar .grow {
    flex: 1;
    min-width: 8px;
  }
  .topbar .sep {
    flex: none;
    width: 1px;
    height: 20px;
    margin: 0 4px;
    background: var(--hairline);
  }
  .ico.plus {
    font-size: 20px;
  }
  .where {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin-left: 12px;
    font-size: 14px;
    white-space: nowrap;
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 0.2s, transform 0.25s var(--spring, ease);
    pointer-events: none;
  }
  .where.show {
    opacity: 1;
    transform: none;
  }
  .where b {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .where .wc {
    color: var(--text-muted);
  }
  .st {
    flex: none;
    margin-right: 6px;
    font-size: 12.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .st.busy {
    opacity: 0.7;
  }
  .st.bad {
    color: var(--alert-ink);
    font-weight: 600;
  }
  .seg {
    flex: none;
    display: inline-flex;
    gap: 2px;
    margin-right: 4px;
    padding: 3px;
    border-radius: 999px;
    background: var(--chip);
  }
  .seg button {
    min-height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: 999px;
    background: none;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
  }
  .seg button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  /* writing mode: the top bar hides above the page and drops back in when the mouse touches the top */
  .writing .topbar {
    position: absolute;
    z-index: 10;
    top: 0;
    left: 0;
    right: 0;
    background: var(--surface-float, var(--surface));
    box-shadow: var(--shadow-lift);
    transform: translateY(-100%);
    opacity: 0;
  }
  :global(.shell:has(.tedge:hover)) .writing .topbar,
  .writing .topbar:hover,
  .writing .topbar:has(:focus-visible) {
    transform: none;
    opacity: 1;
  }
  .writing .center {
    padding-top: 40px;
  }
  .wpill {
    position: absolute;
    z-index: 6;
    top: 12px;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    min-height: 32px;
    border: var(--edge, 0);
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface-float, var(--surface)) 85%, transparent);
    box-shadow: var(--shadow);
    font: inherit;
    font-size: 12.5px;
    color: var(--text-muted);
    opacity: 0.85;
    transition: opacity 0.3s;
  }
  .wpill.l {
    left: 16px;
  }
  .wpill.r {
    right: 16px;
    cursor: pointer;
  }
  .wpill button {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--text);
    cursor: pointer;
  }
  .wpill .st {
    margin: 0;
    opacity: 0.7;
  }
  .wpill.quiet {
    opacity: 0;
  }
  .wpill:hover {
    opacity: 1;
  }
  .ico {
    position: relative;
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border: 0;
    border-radius: 12px;
    background: none;
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, transform 0.25s var(--spring, ease);
  }
  .ico:hover {
    background: var(--panel);
    color: var(--text);
    transform: scale(1.06);
  }
  .ico.on {
    background: var(--primary, var(--text));
    color: var(--on-primary);
  }
  .badge {
    position: absolute;
    top: -3px;
    right: -3px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--rose-deep);
    color: #fff;
    font-size: 10px;
    font-style: normal;
    font-weight: 700;
    display: grid;
    place-items: center;
    box-sizing: border-box;
  }
  .badge.soft {
    background: var(--lavender);
    color: var(--text);
  }
  .center {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .floatbar {
    position: absolute;
    left: 50%;
    bottom: 16px;
    z-index: 7;
    max-width: calc(100% - 32px);
    transform: translateX(-50%);
    animation: barin 0.3s var(--spring, ease) backwards;
  }
  @keyframes barin {
    from {
      opacity: 0;
      transform: translate(-50%, 16px);
    }
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    container-type: inline-size;
  }
  .edwrap {
    min-height: 50%;
  }
  .edwrap.src {
    height: calc(100% - 200px);
    min-height: 420px;
  }
  /* a pinned panel is a column of the sheet, beside the note */
  .pinned {
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 14px;
    box-sizing: border-box;
    background: color-mix(in srgb, var(--panel) 40%, transparent);
    animation: pinin 0.3s var(--spring, ease) backwards;
  }
  .pinned.left {
    width: 260px;
    border-right: 1px solid var(--hairline);
  }
  .pinned.right {
    width: 290px;
    border-left: 1px solid var(--hairline);
  }
  @keyframes pinin {
    from {
      opacity: 0;
    }
  }
  .pinned :global(.tree),
  .sheet :global(.tree) {
    flex: 1;
    min-height: 0;
  }
  .ph {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 10px;
  }
  .ph b {
    flex: 1;
    font-size: 15px;
  }
  .x {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 50%;
    background: var(--panel);
    color: var(--text-muted);
    font-size: 13px;
    cursor: pointer;
  }
  .x:hover {
    color: var(--text);
  }
  .pbody {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .scrim {
    position: absolute;
    inset: 56px 0 0;
    z-index: 8;
    border: 0;
    background: none;
    cursor: default;
  }
  .sheet {
    position: absolute;
    z-index: 9;
    top: 64px;
    bottom: 8px;
    display: flex;
    flex-direction: column;
    padding: 14px;
    border-radius: 22px;
    background: var(--surface-float, var(--surface));
    border: var(--edge, 0);
    box-shadow: 0 24px 50px -20px rgba(40, 44, 80, 0.45);
    -webkit-backdrop-filter: var(--blur, none);
    backdrop-filter: var(--blur, none);
    box-sizing: border-box;
  }
  .sheet.left {
    left: 8px;
    width: 270px;
    animation: slideL 0.32s var(--spring, ease) backwards;
  }
  .sheet.right {
    right: 8px;
    width: 310px;
    animation: slideR 0.32s var(--spring, ease) backwards;
  }
  .writing .sheet {
    top: 8px;
  }
  .writing .scrim {
    inset: 0;
  }
  @keyframes slideL {
    from {
      opacity: 0;
      transform: translateX(-24px);
    }
  }
  @keyframes slideR {
    from {
      opacity: 0;
      transform: translateX(24px);
    }
  }
  .refs {
    max-width: var(--note-box, 780px);
    box-sizing: border-box;
    margin: 0 auto;
    padding: 18px 40px 60px;
    border-top: 1px solid var(--hairline);
  }
  .refs h3 {
    margin: 0 0 10px;
    font-size: 15px;
    font-weight: 700;
  }
  .refs .n {
    display: inline-grid;
    place-items: center;
    min-width: 22px;
    height: 22px;
    margin-left: 4px;
    border-radius: 11px;
    background: var(--panel);
    font-size: 12px;
  }
  .rgrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }
  .rgrid a {
    display: grid;
    gap: 3px;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--panel);
    text-decoration: none;
    color: var(--text);
    transition: transform 0.2s var(--spring, ease);
  }
  .rgrid a:hover {
    transform: translateY(-2px);
  }
  .rgrid b {
    font-size: 13.5px;
  }
  .rgrid span {
    font-size: 12.5px;
    color: var(--text-muted);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .refs .muted {
    margin: 0 0 8px;
    font-size: 13px;
  }
  .refs kbd {
    font: inherit;
    font-weight: 700;
    padding: 0 5px;
    border-radius: 5px;
    background: var(--chip);
  }
  .more {
    border: 0;
    background: none;
    padding: 4px 0;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
  }
  .more:hover {
    color: var(--text);
  }

  /* notes home (no note open) */
  .notes {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 14px;
    height: calc(100vh - 190px);
    min-height: 480px;
  }
  .left {
    min-height: 0;
  }
  .center.bare {
    background: none;
    box-shadow: none;
    overflow: auto;
    padding: 2px 4px 24px;
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
  @container (max-width: 1100px) {
    .seg {
      display: none;
    }
  }
  @container (max-width: 680px) {
    .notes {
      grid-template-columns: minmax(0, 1fr);
      height: auto;
    }
    .notes .left {
      max-height: 260px;
    }
    .sheet.left,
    .sheet.right {
      left: 8px;
      right: 8px;
      width: auto;
    }
  }
</style>
