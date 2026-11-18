<script lang="ts">
  // The note page (N1b; roomier layout Nov 17). The note fills the main panel as one sheet under a
  // slim top bar (Study tabs, notes list / search, page width, toolbar pin, side panel icons,
  // writing mode). A panel icon slides its panel OVER the note as a sheet; 📌 pins it beside the
  // note as a column. Writing mode (Ctrl+\) hides the rail and the top bar until the mouse touches
  // the left or top edge. Pins and the toolbar pin are remembered per machine; page width per note.
  import Icon from "../../lib/components/Icon.svelte";
  import { inTauri, invoke } from "../../lib/tauri";
  import NoteHistory from "./NoteHistory.svelte";
  import BlockEditor from "../../lib/components/BlockEditor.svelte";
  import NoteEditor from "../../lib/components/NoteEditor.svelte";
  import { joinNote, linkKey, plainText, splitNote, type Meta } from "../../lib/notes";
  import { assignIds, cardId, extractCards, ID_RE } from "../../lib/cards";
  import { fmtInterval, statusOf, type SrsRec } from "../../lib/stores/srs.svelte";
  import { get } from "../../lib/stores/synced.svelte";
  import {
    allNotes, allTags, backlinks, createNote, dirOf, getNote, imageUrl, linkName, moveNote, noteHref, notes,
    reloadNote, renameNote, resolveLink, saveNote, savePastedImage, noteDirs, snapshot } from "../../lib/stores/notes.svelte";
  import { pdfHref, resolvePdfLink } from "../../lib/stores/pdfs.svelte";
  import NewNoteDialog from "./NewNoteDialog.svelte";
  import NoteMenu from "./NoteMenu.svelte";
  import { doTrashNote, noteHooks, say } from "../../lib/stores/noteOps.svelte";
  import NoteTree from "./NoteTree.svelte";
  import NotesHome from "./NotesHome.svelte";
  import NoteHead from "./NoteHead.svelte";
  import NoteToolbar from "./NoteToolbar.svelte";
  import NoteSide, { PANELS, type Panel } from "./NoteSide.svelte";
  import StudyNav from "./StudyNav.svelte";
  import { ui, setLastNote, noteScroll } from "../../lib/stores/ui.svelte";
  import { saveSettings, settings } from "../../lib/stores/settings.svelte";

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
      source = settings.noteOpen === "markdown"; // each note opens in the default view
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
  /** a note whose text was just replaced on purpose (an older version put back): its editor's
   *  leave-save must not write the old text over it */
  let replacing: string | null = null;
  function leaveFor(r: string) {
    return (md: string) => {
      if (replacing === r) return;
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
  // guided notes: the counter in the top bar, and a section heading's Review button
  async function reviewSection(path: string[]) {
    if (!loadedRel) return;
    await flush();
    location.hash = `#/study/cards/review/note:${encodeURIComponent(loadedRel)}#${encodeURIComponent(path.join(" › "))}`;
  }
  /** a whole note was pasted in: take its course, tags, date… where this note has none yet */
  function pasteMeta(m: Meta) {
    const patch: Meta = {};
    for (const [k, v] of Object.entries(m)) {
      if (k === "tags" && Array.isArray(v)) {
        const have = Array.isArray(meta.tags) ? meta.tags : [];
        const all = [...new Set([...have, ...v.map(String)])];
        if (all.length !== have.length) patch.tags = all;
      } else if (meta[k] === undefined || meta[k] === "") patch[k] = v;
    }
    if (Object.keys(patch).length) setMeta(patch);
  }
  function setMeta(patch: Meta) {
    meta = { ...meta, ...patch };
    for (const k of Object.keys(patch)) if (patch[k] === undefined || patch[k] === "") delete meta[k];
    status = "saving";
    void flush();
  }
  // ---- a note changed on the other computer while open here (Nov 19: neither choice loses anything) ----
  /** Use the other computer's version; this one's text goes into the note's version history. */
  async function takeTheirs() {
    if (!loadedRel) return;
    const r = loadedRel;
    snapshot(r, joinNote($state.snapshot(meta) as Meta, fullBody()), true);
    replacing = r;
    await reloadNote(r);
    loadedRel = null;
    say("Your version is in ⋯ → Version history.");
    setTimeout(() => (replacing = null), 500);
  }
  /** Keep this version; the other computer's is saved beside it as "<name> (other version …)". */
  async function keepMine() {
    if (!loadedRel) return;
    const r = loadedRel;
    try {
      const theirs = inTauri ? await invoke<string>("notes_read", { rel: r }) : "";
      if (theirs.trim()) {
        const stamp = new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).replace(/:/g, ".");
        const base = r.replace(/\.md$/i, "");
        let copy = `${base} (other version ${stamp}).md`;
        for (let i = 2; getNote(copy); i++) copy = `${base} (other version ${stamp} ${i}).md`;
        await saveNote(copy, theirs);
        say(`The other version is saved as “${copy.split("/").pop()!.replace(/\.md$/i, "")}”.`);
      }
    } catch (e) {
      console.error("conflict copy", e);
    }
    await flush(true);
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
    loadedRel = null; // load it again: moving can rewrite its image paths
    location.hash = noteHref(to);
  }
  // ---- version history (Nov 19): the note is saved first so "now" is up to date ----
  let histOpen = $state(false);
  let histCur = $state("");
  async function openHistory() {
    if (!loadedRel) return;
    await flush();
    histCur = getNote(loadedRel)?.text ?? "";
    histOpen = true;
  }
  async function restoreVersion(text: string) {
    if (!loadedRel) return;
    const r = loadedRel;
    window.clearTimeout(timer);
    await flush();
    const now = getNote(r)?.text;
    if (now) snapshot(r, now, true); // the current text stays in the history
    replacing = r;
    histOpen = false;
    await saveNote(r, text);
    loadedRel = null; // the editor reloads from the restored text
    setTimeout(() => (replacing = null), 500);
  }

  async function doDelete() {
    if (!rel) return;
    window.clearTimeout(timer);
    await doTrashNote(rel); // leaves the note at once; the file moves to .trash/ after
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

  // the notes list / Notes home menu and drags save the open note first, then follow it
  $effect(() => {
    noteHooks.flush = () => flush();
    noteHooks.moved = (to) => {
      window.clearTimeout(timer);
      loadedRel = null;
      location.hash = to ? noteHref(to) : "#/study/notes";
    };
    return () => {
      noteHooks.flush = null;
      noteHooks.moved = null;
    };
  });

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
  type Saved = { pinL: boolean; pinR: Panel | null; tools: boolean; fullHead: boolean; refs: boolean };
  const loadPanels = (): Saved => {
    const base: Saved = { pinL: false, pinR: null, tools: false, fullHead: false, refs: false };
    try {
      const v = JSON.parse(localStorage.getItem("mosaic.notePanels") ?? "{}");
      return { pinL: !!v.pinL, pinR: v.pinR ?? null, tools: !!v.tools, fullHead: !!v.fullHead, refs: !!v.refs };
    } catch {
      return base;
    }
  };
  let panels = $state<Saved>(loadPanels());
  // Nov 18: the header style and toolbar pin moved into Settings (header now per note + default)
  if (settings.noteHeader === undefined && panels.fullHead) void saveSettings({ noteHeader: "full" });
  if (settings.noteTools === undefined && panels.tools) void saveSettings({ noteTools: true });
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
  // a note without its own width / header follows the defaults in Settings → Notes
  const defWidth = $derived<Width>(settings.noteWidth ?? "readable");
  const noteWidth = $derived<Width>(WIDTH_NAMES.includes(meta.width as Width) ? (meta.width as Width) : defWidth);
  const setWidth = (w: Width) => w !== noteWidth && setMeta({ width: w === defWidth ? undefined : w });
  const fullHead = $derived(meta.header === "full" ? true : meta.header === "compact" ? false : settings.noteHeader === "full");
  const setHead = (f: boolean) => f !== fullHead && setMeta({ header: f === (settings.noteHeader === "full") ? undefined : f ? "full" : "compact" });
  const tools = $derived(!!settings.noteTools);
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

  // ---- card status dots in the note (Nov 18) ------------------------------------------------------
  // per card line (card id): the most pressing state of its cards (due > learning > new > later).
  // "known" = every card of the line scheduled 3+ weeks out.
  type CStat = { s: "new" | "due" | "learning" | "later" | "known" | "paused"; tip: string };
  const cardStatusMap = $derived.by(() => {
    const map = new Map<string, CStat>();
    if (!note) return map;
    const now = Date.now();
    const byLine = new Map<string, { st: string; rec?: SrsRec }[]>();
    for (const c of extractCards(splitNote(note.text).body)) {
      if (!c.lineId) continue;
      const rec = get<SrsRec>("srs", c.key);
      (byLine.get(c.lineId) ?? byLine.set(c.lineId, []).get(c.lineId)!).push({ st: statusOf(rec, now), rec });
    }
    for (const [id, cs] of byLine) {
      const n = cs.length;
      const many = n > 1 ? ` (${n} cards)` : "";
      if (cs.some((c) => c.st === "review")) map.set(id, { s: "due", tip: `Due today${many}` });
      else if (cs.some((c) => c.st === "learning")) map.set(id, { s: "learning", tip: `Learning${many}` });
      else if (cs.every((c) => c.st === "suspended")) map.set(id, { s: "paused", tip: "Paused" });
      else if (cs.some((c) => c.st === "new")) map.set(id, { s: "new", tip: `New, not studied yet${many}` });
      else {
        const next = Math.min(...cs.filter((c) => c.rec).map((c) => c.rec!.due));
        const known = cs.every((c) => !c.rec || c.st === "suspended" || (c.rec.scheduled_days ?? 0) >= 21);
        map.set(id, { s: known ? "known" : "later", tip: `${known ? "Known well · " : ""}Next review in ${fmtInterval(next - now)}${many}` });
      }
    }
    return map;
  });
  const cardStatus = $derived((sid: string) => cardStatusMap.get(sid) ?? null);

  // ---- floating toolbar (at the bottom while she types, or always when pinned with ✎) and the
  // title that moves into the top bar once the header has scrolled away ----
  let scrollEl = $state<HTMLElement>();
  /** side by side (two halves, Full width only); read from the note when it opens */
  let sideBySide = $state(false);
  let splitMenu = $state(false);
  let splitAt = $state({ top: 0, right: 0 });
  // the top bar scrolls sideways (overflow auto), which would clip the menu: it lives in <body>
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }
  const SPLIT_MODES = [
    { id: "", label: "Side by side", hint: "The page scrolls as one" },
    { id: "scroll", label: "Side by side, each half scrolls", hint: "Read one half while the other stays put" },
    { id: "stacked", label: "One above the other", hint: "Left half first, then the right" },
  ];
  $effect(() => {
    void version;
    sideBySide = /<!--\s*mosaic-pages\s*-->/.test(body);
  });
  let barH = $state(64);
  let headHidden = $state(false);
  let typing = $state(false);
  let typingTimer = 0;
  // ---- picking up where she left off: the Notes tab comes back to this note (StudyNav reads
  // ui.lastNote; the Notes home clears it) at the same scroll position ----------------------------
  $effect(() => {
    if (!rel) setLastNote(null);
    else if (note) setLastNote(rel);
  });
  $effect(() => {
    void version;
    const r = loadedRel;
    if (!r || !scrollEl) return;
    const y = noteScroll.get(r) ?? 0;
    const put = () => {
      if (scrollEl && loadedRel === r) scrollEl.scrollTop = y;
    };
    requestAnimationFrame(() => requestAnimationFrame(put));
    if (y) window.setTimeout(put, 150); // images and folds can settle a moment later
  });
  // once per frame at most: scroll events can come faster than frames, and this reads the layout
  let headFrame = 0;
  function onNoteScroll() {
    if (headFrame) return;
    headFrame = requestAnimationFrame(() => {
      headFrame = 0;
      checkHead();
    });
  }
  function checkHead() {
    if (loadedRel && scrollEl) noteScroll.set(loadedRel, scrollEl.scrollTop);
    const t = scrollEl?.querySelector(".nh .title");
    headHidden = !!(t && scrollEl && t.getBoundingClientRect().bottom < scrollEl.getBoundingClientRect().top + 4);
  }
  function setTyping(on: boolean) {
    window.clearTimeout(typingTimer);
    if (on) typing = true;
    else typingTimer = window.setTimeout(() => (typing = false), 150);
  }

  // ---- print / save as PDF: print.css keeps only this sheet; a dark theme prints as Mosaic -----
  async function printNote() {
    await flush(true);
    const root = document.documentElement;
    const prev = { theme: root.dataset.theme, family: root.dataset.family };
    if (prev.family === "dark") {
      root.dataset.theme = "mosaic";
      root.dataset.family = "glass";
    }
    const back = () => {
      if (prev.theme) root.dataset.theme = prev.theme;
      if (prev.family) root.dataset.family = prev.family;
    };
    window.addEventListener("afterprint", back, { once: true });
    window.print();
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

  const dirs = $derived(["", ...noteDirs()]);
  const label = (p: Panel) => PANELS.find((x) => x.id === p)!.label;
</script>

<svelte:window
  onpointerdown={(e) => {
    if (splitMenu && !(e.target as HTMLElement).closest?.(".splitwrap, .splitmenu")) splitMenu = false;
  }}
  onkeydown={(e) => {
    if (e.key === "Escape" && splitMenu) {
      splitMenu = false;
      e.preventDefault();
    } else if (e.key === "Escape" && (sheetL || sheetR)) {
      sheetL = false;
      sheetR = null;
    } else if (e.key === "Escape" && ui.writing && !e.defaultPrevented && !document.querySelector(".nh .pop")) {
      // Esc the editor didn't use (a menu, cloze retyping) leaves writing mode
      ui.writing = false;
    }
  }}
  onkeydowncapture={(e) => {
    // writing mode: Ctrl+\ (matched by the physical key too, for other keyboard layouts) or
    // Ctrl+Shift+F (Nov 18: on her PC Ctrl+\ never reached the app; the system emoji picker opened)
    const mod = e.ctrlKey || e.metaKey;
    const hit = mod && !e.altKey && (e.key === "\\" || e.code === "Backslash" || (e.shiftKey && e.code === "KeyF"));
    if (hit && rel && note) {
      e.preventDefault();
      e.stopPropagation();
      toggleWriting();
    }
  }}
/>

<div class="nwrap full" bind:clientWidth={width}>
  {#if rel && note}
    <div class="npage" class:writing={ui.writing} class:typing data-width={noteWidth} data-split={meta.split === "stacked" || meta.split === "scroll" ? meta.split : null} style="--bar-h: {barH}px; --note-box: {WIDTHS[noteWidth]}; --doc-pad: {noteWidth === 'full' ? '64px' : '40px'}">
      <div class="topbar" bind:clientHeight={barH}>
        <StudyNav bar={false} />
        <span class="sep"></span>
        <button type="button" class="ico" class:on={sheetL || pinL} title="Notes" aria-label="Notes" onclick={() => openLeft()}><Icon name="note" size={18} /></button>
        <button type="button" class="ico" title="Search notes" aria-label="Search notes" onclick={() => openLeft(true)}><Icon name="search" size={18} /></button>
        <button type="button" class="ico plus" title="New note" aria-label="New note" onclick={() => { newMode = "note"; newFolder = dirOf(rel!); newOpen = true; }}>+</button>
        <div class="where" class:show={headHidden} aria-hidden={!headHidden}>
          {#if typeof meta.icon === "string" && meta.icon}<span class="wi"><Icon name={meta.icon} size={16} /></span>{/if}<b>{title}</b>{#if meta.course}<span class="wc">· {meta.course}</span>{/if}
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
        {#if noteWidth === "full" && !source}
          <!-- side by side: makes the two halves the first time; after that it only switches between
               side by side and one half above the other (front matter split: stacked). Joining the
               halves is a deliberate ⠿ menu choice, so nothing written on the right gets moved. -->
          <span class="splitwrap">
            <button type="button" class="ico" class:on={sideBySide && meta.split !== "stacked"}
              title={!sideBySide ? "Side by side: two notes in one, written separately" : "How the two halves show"}
              aria-label="Side by side" aria-haspopup={sideBySide ? "menu" : undefined} aria-expanded={sideBySide ? splitMenu : undefined}
              onclick={(e) => {
                if (!sideBySide) { blocks?.togglePages(); sideBySide = !!blocks?.hasPages(); if (meta.split) setMeta({ split: undefined }); }
                else {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  splitAt = { top: r.bottom + 8, right: window.innerWidth - r.right };
                  splitMenu = !splitMenu;
                }
              }}><Icon name="columns" size={18} /></button>
            {#if splitMenu && sideBySide}
              <!-- Nov 18 (her pick 6): halves can scroll on their own, so a long left half doesn't
                   push the right one out of sight. Front matter split: scroll / stacked. -->
              <div class="menu splitmenu" role="menu" use:portal style="top: {splitAt.top}px; right: {splitAt.right}px">
                {#each SPLIT_MODES as m}
                  <button type="button" role="menuitemradio" aria-checked={(meta.split ?? "") === m.id}
                    onclick={() => { setMeta({ split: m.id || undefined }); splitMenu = false; }}>
                    <b>{m.label}</b><small>{m.hint}</small>
                  </button>
                {/each}
                <p class="mhint">To make one page again: ⠿ on a block in a half → Join halves.</p>
              </div>
            {/if}
          </span>
        {/if}
        {#if !source}
          <button type="button" class="ico" class:on={tools} title={tools ? "Toolbar: always showing" : "Toolbar: only while typing (click to keep it showing)"} aria-label="Formatting toolbar" aria-pressed={tools} onclick={() => saveSettings({ noteTools: !tools })}><Icon name="pen" size={17} /></button>
        {/if}
        <span class="sep"></span>
        {#each PANELS as p}
          <button type="button" class="ico" class:on={sheetR === p.id || pinR === p.id} title={p.label} aria-label={p.label} onclick={() => openRight(p.id)}>
            <Icon name={p.icon} size={18} />
            {#if p.id === "cards" && dueHere}<i class="badge">{dueHere}</i>{/if}
            {#if p.id === "backlinks" && back.length}<i class="badge soft">{back.length}</i>{/if}
          </button>
        {/each}
        <button type="button" class="ico" class:on={ui.writing} title={ui.writing ? "Leave writing mode (Ctrl+Shift+F)" : "Writing mode: hide everything but the note (Ctrl+Shift+F)"} aria-label="Writing mode" aria-pressed={ui.writing} onclick={toggleWriting}><Icon name="focus" size={18} /></button>
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
            <NoteTree current={rel} onnew={(f) => { newMode = "note"; newFolder = f; newOpen = true; }} onnewfolder={() => { newMode = "folder"; newFolder = dirOf(rel!); newOpen = true; }}>
              {#snippet actions()}<button type="button" class="x" title="Unpin" aria-label="Unpin notes" onclick={() => (panels.pinL = false)}><Icon name="i:pin" size={15} /></button>{/snippet}
            </NoteTree>
          </aside>
        {/if}

        <section class="center">
          {#if ((typing && (!fullHead || headHidden)) || tools) && !source}
            <div class="floatbar"><NoteToolbar floating onrun={(c, a) => blocks?.run(c, a)} /></div>
          {/if}
          <div class="scroll printroot" bind:this={scrollEl} onscroll={onNoteScroll}>
            <NoteHead {rel} {meta} bind:title {status} {errorText} {source} {dirs}
              coverUrl={(s) => imageUrl(rel!, s)}
              onmeta={setMeta} onrename={doRename} onmove={doMove} ondelete={doDelete} ontoggleSource={toggleSource}
              full={fullHead} onheadstyle={setHead} onrun={(c, a) => blocks?.run(c, a)}
              oncoverfile={coverFile} ontheirs={takeTheirs} onmine={keepMine} onprint={printNote} onhistory={openHistory} />
            <div class="edwrap" class:src={source}>
              {#key `${loadedRel}#${version}`}
                {#if source}
                  <NoteEditor bind:this={cm} value={body} onchange={cmChanged} onopenlink={openLink}
                    linkNames={() => allNotes().map(linkName)} tagNames={allTags}
                    imageUrl={(src) => imageUrl(rel!, src)} onpasteimage={(d, ext) => savePastedImage(rel!, d, ext)} />
                {:else}
                  <BlockEditor bind:this={blocks} value={body} onchange={changed} onopenlink={openLink} onfocuschange={setTyping} onleave={leaveFor(loadedRel!)} foldKey={loadedRel ?? undefined} {cardStatus} onpastemeta={pasteMeta}
                    onreviewsection={reviewSection}
                    linkNames={() => allNotes().map(linkName)} tagNames={allTags}
                    imageUrl={(src) => imageUrl(rel!, src)} onpasteimage={(d, ext) => savePastedImage(rel!, d, ext)} />
                {/if}
              {/key}
            </div>
            {#if !source}
              <!-- linked references: one quiet line until she opens it (remembered per machine) -->
              <footer class="refs" class:open={panels.refs}>
                <button type="button" class="rtog" aria-expanded={panels.refs} onclick={() => (panels.refs = !panels.refs)}>
                  <span class="chev">{panels.refs ? "▾" : "▸"}</span> Linked references <span class="n">{back.length}</span>
                </button>
                {#if panels.refs}
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
                {/if}
              </footer>
            {/if}
          </div>
        </section>

        {#if pinR}
          <aside class="pinned right">
            <div class="ph"><b>{label(pinR)}</b><button type="button" class="x" title="Unpin" aria-label="Unpin panel" onclick={() => (panels.pinR = null)}><Icon name="i:pin" size={15} /></button></div>
            <div class="pbody"><NoteSide which={pinR} {note} {meta} {titleLines} ongotoline={gotoLine} ongotoheading={gotoHeading} onopenlink={openLink} /></div>
          </aside>
        {/if}
      </div>

      {#if sheetL || sheetR}
        <button type="button" class="scrim" aria-label="Close panel" onclick={() => { sheetL = false; sheetR = null; }}></button>
      {/if}
      {#if sheetL}
        <aside class="sheet left" bind:this={treeHost}>
          <NoteTree current={rel} onnew={(f) => { newMode = "note"; newFolder = f; newOpen = true; sheetL = false; }} onnewfolder={() => { newMode = "folder"; newFolder = dirOf(rel!); newOpen = true; sheetL = false; }}>
            {#snippet actions()}
              {#if roomL && !ui.writing}<button type="button" class="x" title="Pin beside the note" aria-label="Pin" onclick={pinLeft}><Icon name="i:pin" size={15} /></button>{/if}
              <button type="button" class="x" aria-label="Close" onclick={() => (sheetL = false)}>×</button>
            {/snippet}
          </NoteTree>
        </aside>
      {/if}
      {#if sheetR}
        <aside class="sheet right">
          <div class="ph">
            <b>{label(sheetR)}</b>
            {#if roomR && !ui.writing}<button type="button" class="x" title="Pin beside the note" aria-label="Pin" onclick={() => pinRight(sheetR!)}><Icon name="i:pin" size={15} /></button>{/if}
            <button type="button" class="x" aria-label="Close" onclick={() => (sheetR = null)}>×</button>
          </div>
          <div class="pbody"><NoteSide which={sheetR} {note} {meta} {titleLines} ongotoline={gotoLine} ongotoheading={gotoHeading} onopenlink={openLink} /></div>
        </aside>
      {/if}
    </div>
  {:else}
    <!-- Notes home: the same top bar and the same clean notes column as inside a note -->
    <div class="npage home">
      <div class="topbar">
        <StudyNav bar={false} />
      </div>
      <div class="body">
        <aside class="pinned left solid">
          <NoteTree current={rel} onnew={(f) => { newMode = "note"; newFolder = f; newOpen = true; }} onnewfolder={() => { newMode = "folder"; newFolder = ""; newOpen = true; }} />
        </aside>
        <section class="center">
          <div class="scroll homescroll">
            {#if rel && notes.loaded}
              <div class="empty card"><p>This note isn't in the notes folder any more.</p><a class="btn quiet" href="#/study/notes">Back to notes</a></div>
            {:else}
              <NotesHome onnew={(f) => { newMode = "note"; newFolder = f; newOpen = true; }} />
            {/if}
          </div>
        </section>
      </div>
    </div>
  {/if}
</div>

{#if loadedRel}<NoteHistory bind:open={histOpen} rel={loadedRel} current={histCur} onrestore={restoreVersion} />{/if}
<NewNoteDialog bind:open={newOpen} folder={newFolder} mode={newMode} />
<NoteMenu onnew={(f) => { newMode = "note"; newFolder = f; newOpen = true; sheetL = false; }} onnewfolder={(f) => { newMode = "folder"; newFolder = f; newOpen = true; sheetL = false; }} />

<style>
  .nwrap {
    container-type: inline-size;
    min-width: 0;
  }
  .nwrap.full {
    height: 100%;
  }
  /* the note page: one sheet filling the main panel (App makes main flush for note routes) */
  .npage {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .topbar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
    /* same strip as the Study tab bar on every other Study page (StudyNav .sbar); on the glass */
    min-height: 56px;
    padding: 8px 14px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--hairline); /* inside the 56px, like StudyNav's .sbar */
    overflow-x: auto;
    scrollbar-width: none;
    transition: transform 0.3s var(--spring, ease), opacity 0.2s;
  }
  .topbar :global(.snav) {
    margin: 0;
    flex: none;
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
  /* the note's icon beside its title in the top bar: centred on the text (a line icon is an svg,
     which otherwise sits on the text's baseline and looks high) */
  .wi {
    display: inline-grid;
    place-items: center;
    flex: none;
    line-height: 1;
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
    background: var(--surface);
  }
  /* writing mode: the top bar hides above the page and drops back in when the mouse touches the top */
  .writing .topbar {
    position: absolute;
    z-index: 10;
    top: 0;
    left: 0;
    right: 0;
    padding: 12px 16px;
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
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    container-type: inline-size;
  }
  /* the note takes the free space, so a short note keeps the references line at the bottom */
  .edwrap {
    flex: 1 0 auto;
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
    min-height: 28px; /* same height with or without the 📌 / × buttons */
    margin-bottom: 10px;
  }
  .ph b {
    flex: 1;
    font-size: 15px;
  }
  .x {
    display: inline-grid;
    place-items: center;
    padding: 0;
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
    inset: var(--bar-h, 64px) 0 0;
    z-index: 8;
    border: 0;
    background: none;
    cursor: default;
  }
  .sheet {
    position: absolute;
    z-index: 9;
    top: calc(var(--bar-h, 64px) + 8px);
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
    width: 100%;
    max-width: var(--note-box, 780px);
    box-sizing: border-box;
    margin: 0 auto;
    padding: 6px var(--doc-pad, 40px) 40px;
  }
  .refs.open {
    padding-top: 14px;
    border-top: 1px solid var(--hairline);
  }
  .rtog {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 8px;
    padding: 4px 8px 4px 0;
    border: 0;
    background: none;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
    opacity: 0.75;
    transition: opacity 0.15s;
  }
  .rtog:hover,
  .open .rtog {
    opacity: 1;
    color: var(--text);
  }
  .rtog .chev {
    font-size: 10px;
  }
  .refs .n {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    margin-left: 2px;
    border-radius: 10px;
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

  /* notes home (no note open): the content sits on the glass, the notes column looks like the
     pinned column inside a note (white sheet under the same tint) */
  .home .body {
    background: none;
  }
  .pinned.solid {
    background: linear-gradient(color-mix(in srgb, var(--panel) 40%, transparent), color-mix(in srgb, var(--panel) 40%, transparent)), var(--surface);
    animation: none;
  }
  .homescroll {
    display: block;
    padding: calc(var(--main-pad-t) - 6px) var(--main-pad-x) 32px;
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
    .home .body {
      flex-direction: column;
    }
    .home .pinned.left {
      width: auto;
      max-height: 260px;
      border-right: 0;
      border-bottom: 1px solid var(--hairline);
    }
    .sheet.left,
    .sheet.right {
      left: 8px;
      right: 8px;
      width: auto;
    }
  }
  .splitwrap {
    position: relative;
    display: inline-flex;
  }
  :global(.splitmenu) {
    position: fixed;
    z-index: 200;
    width: 290px;
    padding: 6px;
    border-radius: 16px;
    box-shadow: var(--shadow-lg, 0 12px 32px rgb(0 0 0 / 0.16));
    display: grid;
    gap: 2px;
  }
  :global(.splitmenu button) {
    display: grid;
    gap: 1px;
    text-align: left;
    padding: 8px 12px 8px 34px;
    border: 0;
    border-radius: 11px;
    background: none;
    color: var(--text);
    font: inherit;
    cursor: pointer;
    position: relative;
  }
  :global(.splitmenu button:hover) { background: var(--chip); }
  :global(.splitmenu button b) { font-weight: 600; font-size: 0.9rem; }
  :global(.splitmenu button small) { color: var(--text-muted); font-size: 0.78rem; }
  :global(.splitmenu button[aria-checked="true"]::before) {
    content: "✓";
    position: absolute;
    left: 12px;
    top: 8px;
    font-weight: 700;
    color: var(--go-ink);
  }
  :global(.splitmenu .mhint) {
    margin: 4px 0 2px;
    padding: 6px 12px 2px;
    border-top: 1px solid color-mix(in srgb, var(--text-muted) 22%, transparent);
    font-size: 0.75rem;
    color: var(--text-muted);
  }
</style>
