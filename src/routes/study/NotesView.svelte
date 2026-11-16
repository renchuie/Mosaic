<script lang="ts">
  // The note page (N1b). Panels are tucked into slim icon strips on both edges; an icon slides
  // its panel OVER the note as a sheet, 📌 pins it beside the note, and focus mode hides the strips
  // too (glowing edges, icons float out on hover). Pins and focus are remembered per machine.
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
  type Saved = { pinL: boolean; pinR: Panel | null; focus: boolean };
  const loadPanels = (): Saved => {
    try {
      return { pinL: false, pinR: null, focus: false, ...JSON.parse(localStorage.getItem("mosaic.notePanels") ?? "{}") };
    } catch {
      return { pinL: false, pinR: null, focus: false };
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
  let floatL = $state(false);
  let floatR = $state(false);
  let width = $state(1200);
  const roomL = $derived(width > 1000);
  const roomR = $derived(width > (panels.pinL ? 1240 : 960));
  const pinL = $derived(panels.pinL && roomL && !panels.focus);
  const pinR = $derived(panels.pinR && roomR && !panels.focus ? panels.pinR : null);
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
    panels.focus = false;
    sheetL = false;
  }
  function pinRight(p: Panel) {
    panels.pinR = p;
    panels.focus = false;
    sheetR = null;
  }
  function toggleFocus() {
    panels.focus = !panels.focus;
    sheetL = false;
    sheetR = null;
  }
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

  // ---- floating toolbar: shown at the bottom while she types and the header has scrolled away ----
  let scrollEl = $state<HTMLElement>();
  let headHidden = $state(false);
  let typing = $state(false);
  let typingTimer = 0;
  function checkHead() {
    const tb = scrollEl?.querySelector(".nh .toolbar");
    headHidden = !!(tb && scrollEl && tb.getBoundingClientRect().bottom < scrollEl.getBoundingClientRect().top + 4);
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
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "\\" && rel && note) {
      e.preventDefault();
      toggleFocus();
    }
  }}
/>

<div class="nwrap" bind:clientWidth={width}>
  {#if rel && note}
    <div class="npage" class:focus={panels.focus}>
      {#if panels.focus}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="edge l" onmouseenter={() => (floatL = true)} onmouseleave={() => (floatL = false)}>
          {#if floatL}
            <div class="float">
              <button type="button" class="ico" title="Notes" onclick={() => openLeft()}><Icon name="note" size={18} /></button>
              <button type="button" class="ico" title="Search notes" onclick={() => openLeft(true)}><Icon name="search" size={18} /></button>
            </div>
          {/if}
        </div>
      {:else}
        <nav class="strip" aria-label="Notes panels">
          <button type="button" class="ico" class:on={sheetL || pinL} title="Notes" aria-label="Notes" onclick={() => openLeft()}><Icon name="note" size={18} /></button>
          <button type="button" class="ico" title="Search notes" aria-label="Search notes" onclick={() => openLeft(true)}><Icon name="search" size={18} /></button>
          <span class="sp"></span>
          <button type="button" class="ico" title="New note" aria-label="New note" onclick={() => { newMode = "note"; newFolder = dirOf(rel!); newOpen = true; }}>+</button>
        </nav>
      {/if}

      {#if pinL}
        <aside class="pinned left" bind:this={treeHost}>
          <div class="ph"><b>Notes</b><button type="button" class="x" title="Unpin" aria-label="Unpin notes" onclick={() => (panels.pinL = false)}>📌</button></div>
          <NoteTree current={rel} onnew={(f) => { newMode = "note"; newFolder = f; newOpen = true; }} onnewfolder={() => { newMode = "folder"; newFolder = dirOf(rel!); newOpen = true; }} />
        </aside>
      {/if}

      <section class="center">
        {#if typing && headHidden && !source}
          <div class="floatbar"><NoteToolbar floating onrun={(c, a) => blocks?.run(c, a)} /></div>
        {/if}
        <div class="scroll" bind:this={scrollEl} onscroll={checkHead}>
          <NoteHead {rel} {meta} bind:title {status} {errorText} {source} {dirs}
            coverUrl={(s) => imageUrl(rel!, s)}
            onmeta={setMeta} onrename={doRename} onmove={doMove} ondelete={doDelete} ontoggleSource={toggleSource}
            onrun={(c, a) => blocks?.run(c, a)} oncoverfile={coverFile} ontheirs={takeTheirs} onmine={() => flush(true)} />
          <div class="edwrap" class:src={source}>
            {#key `${loadedRel}#${version}`}
              {#if source}
                <NoteEditor bind:this={cm} value={body} onchange={cmChanged} onopenlink={openLink}
                  linkNames={() => allNotes().map(linkName)} tagNames={allTags}
                  imageUrl={(src) => imageUrl(rel!, src)} onpasteimage={(d, ext) => savePastedImage(rel!, d, ext)} />
              {:else}
                <BlockEditor bind:this={blocks} value={body} onchange={changed} onopenlink={openLink} onfocuschange={setTyping}
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

      {#if panels.focus}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="edge r" onmouseenter={() => (floatR = true)} onmouseleave={() => (floatR = false)}>
          {#if floatR}
            <div class="float">
              {#each PANELS as p}
                <button type="button" class="ico" title={p.label} onclick={() => openRight(p.id)}><Icon name={p.icon} size={18} />{#if p.id === "cards" && dueHere}<i class="badge">{dueHere}</i>{/if}</button>
              {/each}
              <button type="button" class="ico" title="Leave focus (Ctrl+\)" onclick={toggleFocus}><Icon name="focus" size={18} /></button>
            </div>
          {/if}
        </div>
      {:else}
        <nav class="strip" aria-label="Note panels">
          {#each PANELS as p}
            <button type="button" class="ico" class:on={sheetR === p.id || pinR === p.id} title={p.label} aria-label={p.label} onclick={() => openRight(p.id)}>
              <Icon name={p.icon} size={18} />
              {#if p.id === "cards" && dueHere}<i class="badge">{dueHere}</i>{/if}
              {#if p.id === "backlinks" && back.length}<i class="badge soft">{back.length}</i>{/if}
            </button>
          {/each}
          <span class="sp"></span>
          <button type="button" class="ico" title="Focus: hide the strips too (Ctrl+\)" aria-label="Focus" onclick={toggleFocus}><Icon name="focus" size={18} /></button>
        </nav>
      {/if}

      {#if sheetL || sheetR}
        <button type="button" class="scrim" aria-label="Close panel" onclick={() => { sheetL = false; sheetR = null; }}></button>
      {/if}
      {#if sheetL}
        <aside class="sheet left" bind:this={treeHost}>
          <div class="ph">
            <b>Notes</b>
            {#if roomL}<button type="button" class="x" title="Pin beside the note" aria-label="Pin" onclick={pinLeft}>📌</button>{/if}
            <button type="button" class="x" aria-label="Close" onclick={() => (sheetL = false)}>×</button>
          </div>
          <NoteTree current={rel} onnew={(f) => { newMode = "note"; newFolder = f; newOpen = true; sheetL = false; }} onnewfolder={() => { newMode = "folder"; newFolder = dirOf(rel!); newOpen = true; sheetL = false; }} />
        </aside>
      {/if}
      {#if sheetR}
        <aside class="sheet right">
          <div class="ph">
            <b>{label(sheetR)}</b>
            {#if roomR}<button type="button" class="x" title="Pin beside the note" aria-label="Pin" onclick={() => pinRight(sheetR!)}>📌</button>{/if}
            <button type="button" class="x" aria-label="Close" onclick={() => (sheetR = null)}>×</button>
          </div>
          <div class="pbody"><NoteSide which={sheetR} {note} {meta} {titleLines} ongotoline={gotoLine} ongotoheading={gotoHeading} onopenlink={openLink} /></div>
        </aside>
      {/if}
    </div>
  {:else}
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
  .npage {
    position: relative;
    display: flex;
    gap: 10px;
    height: calc(100vh - 190px);
    min-height: 480px;
  }
  .strip {
    flex: none;
    width: 52px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px 0;
    border-radius: 20px;
    background: var(--surface);
    border: var(--edge, 0);
    box-shadow: var(--shadow);
    animation: stripin 0.35s var(--spring, ease) backwards;
  }
  @keyframes stripin {
    from {
      opacity: 0;
      transform: scaleY(0.92);
    }
  }
  .sp {
    flex: 1;
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
    color: var(--on-primary, #fff);
  }
  .badge {
    position: absolute;
    top: -3px;
    right: -3px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--rose-deep, #e3949b);
    color: #fff;
    font-size: 10px;
    font-style: normal;
    font-weight: 700;
    display: grid;
    place-items: center;
    box-sizing: border-box;
  }
  .badge.soft {
    background: var(--lavender, #c9b8f0);
    color: var(--text);
  }
  .center {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .center {
    position: relative;
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
  .pinned {
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-radius: 22px;
    background: var(--surface);
    border: var(--edge, 0);
    box-shadow: var(--shadow);
    padding: 12px;
    animation: pinin 0.3s var(--spring, ease) backwards;
  }
  .pinned.left {
    width: 250px;
  }
  .pinned.right {
    width: 280px;
  }
  @keyframes pinin {
    from {
      opacity: 0;
      transform: translateY(8px);
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
    inset: 0;
    z-index: 8;
    border: 0;
    background: none;
    cursor: default;
  }
  .sheet {
    position: absolute;
    z-index: 9;
    top: 0;
    bottom: 0;
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
    left: 62px;
    width: 270px;
    animation: slideL 0.32s var(--spring, ease) backwards;
  }
  .sheet.right {
    right: 62px;
    width: 310px;
    animation: slideR 0.32s var(--spring, ease) backwards;
  }
  .focus .sheet.left {
    left: 22px;
  }
  .focus .sheet.right {
    right: 22px;
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
  .edge {
    position: relative;
    flex: none;
    width: 12px;
    border-radius: 999px;
    background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--lavender, #c9b8f0) 70%, transparent), transparent);
    opacity: 0.7;
    transition: opacity 0.2s;
    z-index: 7;
  }
  .edge.r {
    background: linear-gradient(180deg, transparent, color-mix(in srgb, #8b9be8 60%, transparent), transparent);
  }
  .edge:hover {
    opacity: 1;
  }
  .float {
    position: absolute;
    top: 50%;
    display: grid;
    gap: 6px;
    padding: 8px;
    border-radius: 20px;
    background: var(--surface-float, var(--surface));
    border: var(--edge, 0);
    box-shadow: 0 18px 40px -18px rgba(40, 44, 80, 0.45);
    transform: translateY(-50%);
    animation: pop 0.2s var(--spring, ease) backwards;
  }
  .edge.l .float {
    left: 0;
  }
  .edge.r .float {
    right: 0;
  }
  @keyframes pop {
    from {
      opacity: 0;
      scale: 0.9;
    }
  }
  .refs {
    max-width: 780px;
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
  @container (max-width: 680px) {
    .notes {
      grid-template-columns: minmax(0, 1fr);
      height: auto;
    }
    .notes .left {
      max-height: 260px;
    }
    .strip {
      width: 44px;
    }
    .sheet.left,
    .sheet.right {
      left: 8px;
      right: 8px;
      width: auto;
    }
  }
</style>
