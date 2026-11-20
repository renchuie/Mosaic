<script lang="ts">
  // Study → Files (Nov 20): every note, PDF, quiz, interactive page, deck and Materials file in one
  // place, with kind chips, search and sorting. The side list has two views: Courses (course → exam
  // → lectures, links only) and Folders (the real Notes / Materials / PDFs folders). Like Obsidian's
  // and RemNote's file panes: right-click or ⋯ for Open, Rename (F2), Move to…, Duplicate, Star,
  // Copy link, Show in file manager, Delete; new folders and notes; drag rows onto a folder (moves)
  // or a lecture (links); Ctrl / Shift click to pick several. Starred items sit on top of the side.
  import Icon from "../../lib/components/Icon.svelte";
  import LectureMenu from "../../lib/components/LectureMenu.svelte";
  import { courses, courseByName } from "../../lib/stores/courses.svelte";
  import { exams } from "../../lib/stores/calendar.svelte";
  import { addLinks, isStarred, lectures, starred, toggleStar, type Lecture, type Link } from "../../lib/stores/outline.svelte";
  import { candidates, describe, KIND_ICONS, KIND_NAMES, materialItems, noteCardStats, type Shown, type ShowKind } from "../../lib/stores/linkInfo.svelte";
  import { shortExam } from "../../lib/stores/deckTree.svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { dragHasFiles } from "../../lib/stores/noteOps.svelte";
  import { adoptMaterials, labs } from "../../lib/stores/labs.svelte";
  import { createNote, dirOf, noteHref } from "../../lib/stores/notes.svelte";
  import { pdfLink } from "../../lib/stores/pdfs.svelte";
  import {
    AREA_NAMES, areaDirs, areaOf, baseName, childDirs, duplicateItem, files as fileMsg, folderCount, moveFolderTo, moveItem, newFolder,
    renameFolder, renameItem, reveal, tell, trashFolder, trashItem, type Area,
  } from "../../lib/stores/fileOps.svelte";
  import AddFilesDialog from "./AddFilesDialog.svelte";
  import PasteQuiz from "../labs/PasteQuiz.svelte";
  import { route } from "../../lib/router.svelte";

  type Sel =
    | { kind: "all" }
    | { kind: "starred" }
    | { kind: "course"; name: string }
    | { kind: "loose"; name: string }
    | { kind: "lecture"; id: string }
    | { kind: "folder"; area: Area; rel: string };
  let sel = $state<Sel>({ kind: "all" });
  let view = $state<"courses" | "folders">(load("mosaic.filesView", "courses") as "courses" | "folders");
  let sort = $state<"changed" | "name" | "kind">(load("mosaic.filesSort", "changed") as "changed" | "name" | "kind");
  function load(k: string, d: string) {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  }
  function keep(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* per machine only */
    }
  }
  $effect(() => keep("mosaic.filesView", view));
  $effect(() => keep("mosaic.filesSort", sort));

  // #/study/files?kind=pdf|page|quiz|note|deck|file opens on one kind (the old PDFs and Materials tabs)
  const KINDS: ShowKind[] = ["note", "pdf", "quiz", "page", "deck", "file"];
  let kind = $state<ShowKind | "all">("all");
  $effect(() => {
    const k = /[?&]kind=(\w+)/.exec(route.rest)?.[1] as ShowKind | undefined;
    if (k && KINDS.includes(k)) kind = k;
  });
  let q = $state("");
  const openCourse = new SvelteSet<string>();
  const openDir = new SvelteSet<string>();

  const all = $derived(candidates());
  const lecs = $derived(lectures());
  const key = (x: { link: Link } | Link) => ("link" in x ? `${x.link.kind}|${x.link.ref}` : `${x.kind}|${x.ref}`);
  const inLec = $derived.by(() => {
    const m = new Map<string, [string, Lecture][]>();
    for (const [id, l] of lecs) for (const x of l.links) m.set(key(x), [...(m.get(key(x)) ?? []), [id, l]]);
    return m;
  });
  const courseTree = $derived(
    courses().map(([, c]) => {
      const ex = exams().filter((e) => e.course === c.name);
      const mine = lecs.filter(([, l]) => l.course === c.name);
      const known = new Set(ex.map((e) => e.key));
      const groups = [...ex.filter((e) => e.days >= 0), ...ex.filter((e) => e.days < 0).reverse()]
        .map((e) => ({ name: shortExam(e), items: mine.filter(([, l]) => l.exam === e.key) }))
        .filter((g) => g.items.length);
      const other = mine.filter(([, l]) => !l.exam || !known.has(l.exam));
      if (other.length) groups.push({ name: groups.length ? "Other" : "", items: other });
      return { c, groups };
    }),
  );
  const stars = $derived(starred());
  const starredShown = $derived.by(() => {
    const stats = noteCardStats();
    const mats = materialItems();
    return stars.map((x) => describe(x, stats, mats)).filter((x) => !x.gone);
  });

  // what the list shows
  const inFolder = (x: Shown, a: Area, rel: string) => areaOf(x.link) === a && dirOf(x.link.ref) === rel;
  const rows = $derived.by(() => {
    let list: Shown[];
    const s = sel;
    if (s.kind === "lecture") {
      const l = lecs.find(([id]) => id === s.id)?.[1];
      const stats = noteCardStats();
      const mats = materialItems();
      list = (l?.links ?? []).map((x) => describe(x, stats, mats));
    } else if (s.kind === "starred") list = starredShown;
    else if (s.kind === "course" || s.kind === "loose") {
      list = all.filter((x) => x.course === s.name || (inLec.get(key(x)) ?? []).some(([, l]) => l.course === s.name));
      if (s.kind === "loose") list = list.filter((x) => !(inLec.get(key(x)) ?? []).some(([, l]) => l.course === s.name));
    } else if (s.kind === "folder") list = all.filter((x) => (q.trim() ? areaOf(x.link) === s.area && (s.rel === "" || x.link.ref.startsWith(s.rel + "/")) : inFolder(x, s.area, s.rel)));
    else list = all;
    const t = q.trim().toLowerCase();
    const out = list
      .filter((x) => !x.gone || s.kind === "lecture")
      .filter((x) => kind === "all" || x.kind === kind)
      .filter((x) => !t || `${x.name} ${x.link.ref}`.toLowerCase().includes(t));
    const by = sort === "name" ? (a: Shown, b: Shown) => a.name.localeCompare(b.name, undefined, { numeric: true }) : sort === "kind" ? (a: Shown, b: Shown) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.name.localeCompare(b.name) : (a: Shown, b: Shown) => (b.mtime ?? 0) - (a.mtime ?? 0);
    return out.sort(by).slice(0, 500);
  });
  // subfolders shown above the files when a folder is open (not while searching)
  const folderRows = $derived(sel.kind === "folder" && !q.trim() && kind === "all" ? childDirs(sel.area, sel.rel) : []);
  const title = $derived.by(() => {
    const s = sel;
    if (s.kind === "all") return "All files";
    if (s.kind === "starred") return "Starred";
    if (s.kind === "lecture") return lecs.find(([id]) => id === s.id)?.[1].title ?? "Lecture";
    if (s.kind === "loose") return `${s.name} · not in a lecture`;
    if (s.kind === "folder") return s.rel ? baseName(s.rel) : AREA_NAMES[s.area];
    return s.name;
  });
  const crumbs = $derived(sel.kind === "folder" && sel.rel ? sel.rel.split("/").map((n, i, a) => ({ name: n, rel: a.slice(0, i + 1).join("/") })) : []);
  const plural = (k: ShowKind) => (k === "page" ? "Interactive pages" : k === "quiz" ? "Quizzes" : KIND_NAMES[k] + "s");
  const when = (ms?: number) => (ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
  const same = (a: Sel, b: Sel) => JSON.stringify(a) === JSON.stringify(b);
  function go(s: Sel) {
    sel = s;
    picked.clear();
    renaming = null;
  }

  // ---- picking several (Ctrl / Shift click) ----
  const picked = new SvelteSet<string>();
  let anchor = -1;
  function pickRow(e: MouseEvent, i: number, x: Shown) {
    if (e.shiftKey && anchor >= 0) {
      const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
      for (let j = a; j <= b; j++) picked.add(key(rows[j]));
    } else if (picked.has(key(x))) picked.delete(key(x));
    else picked.add(key(x));
    anchor = i;
  }
  const pickedRows = $derived(rows.filter((x) => picked.has(key(x))));

  // ---- the menu (right-click or ⋯) ----
  type Menu = { x: number; y: number } & ({ item: Shown } | { dir: { area: Area; rel: string } });
  let menu = $state<Menu | null>(null);
  function openMenu(e: MouseEvent, m: Omit<Menu, "x" | "y">) {
    e.preventDefault();
    e.stopPropagation();
    menu = { ...m, x: Math.min(e.clientX, window.innerWidth - 250), y: Math.min(e.clientY, window.innerHeight - 380) } as Menu;
  }
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }

  // ---- rename in place ----
  let renaming = $state<string | null>(null);
  let renameText = $state("");
  function startRename(x: Shown) {
    if (!areaOf(x.link)) return;
    renaming = key(x);
    renameText = x.link.kind === "note" ? x.name : baseName(x.link.ref).replace(/\.[^.]+$/, "");
    menu = null;
  }
  async function finishRename(x: Shown) {
    const a = areaOf(x.link);
    const t = renameText;
    renaming = null;
    if (a && t.trim() && t.trim() !== x.name) await renameItem(a, x.link.ref, t);
  }
  let renamingDir = $state<string | null>(null);
  async function finishRenameDir(a: Area, rel: string) {
    const t = renameText;
    renamingDir = null;
    if (await renameFolder(a, rel, t)) {
      const to = `${dirOf(rel) ? dirOf(rel) + "/" : ""}${t.trim()}`;
      if (sel.kind === "folder" && sel.area === a && (sel.rel === rel || sel.rel.startsWith(rel + "/"))) sel = { kind: "folder", area: a, rel: to + sel.rel.slice(rel.length) };
    }
  }

  // ---- delete, duplicate, copy link ----
  async function remove(list: Shown[]) {
    const ok = list.filter((x) => areaOf(x.link));
    if (!ok.length) return;
    if (!confirm(ok.length === 1 ? `Delete “${ok[0].name}”? It goes to the trash.` : `Delete ${ok.length} files? They go to the trash.`)) return;
    for (const x of ok) await trashItem(areaOf(x.link)!, x.link.ref);
    picked.clear();
    tell(ok.length === 1 ? "Moved to the trash" : `Moved ${ok.length} to the trash`);
  }
  async function removeDir(a: Area, rel: string) {
    const n = folderCount(a, rel);
    if (!confirm(`Delete the folder “${baseName(rel)}”${n ? ` and the ${n} ${n === 1 ? "file" : "files"} in it` : ""}? It goes to the trash.`)) return;
    await trashFolder(a, rel);
    if (sel.kind === "folder" && sel.area === a && (sel.rel === rel || sel.rel.startsWith(rel + "/"))) go({ kind: "folder", area: a, rel: dirOf(rel) });
  }
  async function duplicate(x: Shown) {
    const a = areaOf(x.link);
    if (!a) return;
    const to = await duplicateItem(a, x.link.ref);
    if (to) tell(`Made “${baseName(to)}”`);
  }
  async function copyLink(x: Shown) {
    const text = x.link.kind === "note" ? `[[${baseName(x.link.ref).replace(/\.md$/i, "")}]]` : x.link.kind === "pdf" ? pdfLink(x.link.ref) : x.link.ref;
    try {
      await navigator.clipboard.writeText(text);
      tell("Link copied");
    } catch {
      tell(text);
    }
  }

  // ---- move to… (a folder picker for one place) ----
  let moving = $state<{ area: Area; items: Shown[]; dir?: string } | null>(null);
  let moveQ = $state("");
  function startMove(list: Shown[]) {
    const a = areaOf(list[0]?.link ?? { kind: "deck", ref: "" });
    if (!a) return;
    moving = { area: a, items: list.filter((x) => areaOf(x.link) === a) };
    moveQ = "";
    menu = null;
  }
  async function moveTo(folder: string) {
    const m = moving;
    moving = null;
    if (!m) return;
    if (m.dir !== undefined) await moveFolderTo(m.area, m.dir, folder);
    else for (const x of m.items) await moveItem(m.area, x.link.ref, folder);
    picked.clear();
    tell(`Moved to ${folder ? baseName(folder) : AREA_NAMES[m.area]}`);
  }
  const moveDirs = $derived(moving ? ["", ...areaDirs(moving.area)].filter((d) => !moveQ.trim() || d.toLowerCase().includes(moveQ.trim().toLowerCase())).filter((d) => !moving!.dir || (d !== moving!.dir && !d.startsWith(moving!.dir + "/"))) : []);

  // ---- new folder / new note ----
  let naming = $state<{ area: Area; parent: string; what: "folder" | "note" } | null>(null);
  let nameText = $state("");
  async function finishNew() {
    const n = naming;
    const t = nameText.trim();
    naming = null;
    nameText = "";
    if (!n || !t) return;
    if (n.what === "folder") {
      const rel = await newFolder(n.area, n.parent, t);
      if (rel) {
        openDir.add(`${n.area}|${n.parent}`);
        tell(`Made “${t}”`);
      }
    } else {
      const course = n.parent.split("/")[0];
      const rel = await createNote(n.parent, t, "blank", courseByName(course) ? { course } : {});
      location.hash = noteHref(rel);
    }
  }

  // ---- adding files from outside: Upload, Paste quiz, drop ----
  const selCourse = $derived.by(() => {
    const s = sel;
    if (s.kind === "course" || s.kind === "loose") return s.name;
    if (s.kind === "lecture") return lecs.find(([id]) => id === s.id)?.[1].course ?? "";
    return "";
  });
  const selLecture = $derived(sel.kind === "lecture" ? sel.id : "");
  let upFiles = $state<File[]>([]);
  let uploading = $state(false);
  let pasting = $state(false);
  let dropping = $state(false);
  let picker = $state<HTMLInputElement>();
  function add(list: File[]) {
    if (!list.length) return;
    upFiles = list;
    uploading = true;
  }
  let movingLegacy = $state(false);
  async function moveLegacy() {
    movingLegacy = true;
    try {
      const r = await adoptMaterials();
      tell(`Moved ${r.moved} ${r.moved === 1 ? "item" : "items"}.${r.skipped.length ? ` Left: ${r.skipped.join(", ")}` : ""}`);
    } catch (e) {
      tell(String(e));
    } finally {
      movingLegacy = false;
    }
  }

  // ---- dragging rows (pointer-based): onto a lecture links, onto a folder moves ----
  let drag = $state<{ items: Shown[]; px: number; py: number } | null>(null);
  let over = $state<string | null>(null);
  function down(e: PointerEvent, x: Shown) {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const items = picked.has(key(x)) ? pickedRows : [x];
    const mv = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 6) return;
      moved = true;
      drag = { items, px: m.clientX, py: m.clientY };
      const el = (document.elementFromPoint(m.clientX, m.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-lec],[data-dir]");
      over = el?.dataset.lec ? `lec|${el.dataset.lec}` : el?.dataset.dir ? `dir|${el.dataset.dir}` : null;
    };
    const up = async () => {
      window.removeEventListener("pointermove", mv);
      const target = over;
      const list = drag?.items ?? [];
      drag = null;
      over = null;
      if (moved) window.addEventListener("click", (c) => c.preventDefault(), { capture: true, once: true });
      if (!moved || !target) return;
      if (target.startsWith("lec|")) {
        const id = target.slice(4);
        addLinks(id, list.map((y) => y.link));
        tell(`Added to ${lecs.find(([l]) => l === id)?.[1].title ?? "lecture"}`);
      } else {
        const [, area, ...rest] = target.split("|");
        const dir = rest.join("|");
        const fits = list.filter((y) => areaOf(y.link) === area);
        if (!fits.length) return tell(`Those can't go in ${AREA_NAMES[area as Area]}`);
        for (const y of fits) await moveItem(area as Area, y.link.ref, dir);
        picked.clear();
        tell(`Moved to ${dir ? baseName(dir) : AREA_NAMES[area as Area]}`);
      }
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up, { once: true });
  }

  // ---- keys: F2 rename, Delete, Esc, Ctrl+A ----
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape" && (moving || menu)) {
      moving = null;
      menu = null;
      return;
    }
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, [contenteditable], dialog")) return;
    if (e.key === "Escape") {
      menu = null;
      picked.clear();
    } else if (e.key === "F2" && pickedRows.length === 1) {
      e.preventDefault();
      startRename(pickedRows[0]);
    } else if ((e.key === "Delete" || e.key === "Backspace") && pickedRows.length) {
      e.preventDefault();
      void remove(pickedRows);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && rows.length) {
      e.preventDefault();
      rows.forEach((x) => picked.add(key(x)));
    }
  }
</script>

<svelte:window
  onkeydown={onKey}
  onmousedown={(e) => { if (menu && !(e.target as HTMLElement).closest(".fmenu")) menu = null; }}
  ondragover={(e) => { if (dragHasFiles(e)) { e.preventDefault(); dropping = true; } }}
  ondragleave={(e) => { if (!e.relatedTarget) dropping = false; }}
  ondrop={(e) => { if (!dragHasFiles(e)) return; e.preventDefault(); dropping = false; add([...(e.dataTransfer?.files ?? [])]); }}
/>

{#snippet dirTree(area: Area, parent: string, depth: number)}
  {#each childDirs(area, parent) as d (d)}
    {@const k = `${area}|${d}`}
    {@const isOpen = openDir.has(k)}
    {@const kids = childDirs(area, d).length}
    <div class="crow" style="--d: {depth}">
      {#if kids}<button type="button" class="tw" aria-label={isOpen ? "Close" : "Open"} aria-expanded={isOpen} onclick={() => (isOpen ? openDir.delete(k) : openDir.add(k))}><Icon name={isOpen ? "i:chevron-down" : "i:chevron-right"} size={13} /></button>{:else}<span class="tw"></span>{/if}
      {#if renamingDir === k}
        <!-- svelte-ignore a11y_autofocus -->
        <input class="rin" bind:value={renameText} autofocus aria-label="Folder name" onblur={() => finishRenameDir(area, d)} onkeydown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") renamingDir = null; }} />
      {:else}
        <button type="button" class="si dir" data-dir={k} class:on={same(sel, { kind: "folder", area, rel: d })} class:over={over === `dir|${k}`}
          onclick={() => { go({ kind: "folder", area, rel: d }); openDir.add(k); }} oncontextmenu={(e) => openMenu(e, { dir: { area, rel: d } })}>
          <Icon name="folder" size={14} /><span class="t">{baseName(d)}</span>
        </button>
      {/if}
    </div>
    {#if isOpen}{@render dirTree(area, d, depth + 1)}{/if}
  {/each}
{/snippet}

<div class="fwrap">
  {#if labs.legacy}
    <section class="card legacy">
      <span><b>Move Recall Labs into Materials?</b> Progress, folder links and exam dates come along.</span>
      <button type="button" class="btn primary sm" onclick={moveLegacy} disabled={movingLegacy}>{movingLegacy ? "Moving…" : "Move"}</button>
    </section>
  {/if}
  <div class="files" class:dragging={!!drag}>
    <nav class="side" aria-label="Files">
      <div class="seg" role="tablist" aria-label="Organise by">
        <button type="button" role="tab" aria-selected={view === "courses"} class:on={view === "courses"} onclick={() => (view = "courses")}>Courses</button>
        <button type="button" role="tab" aria-selected={view === "folders"} class:on={view === "folders"} onclick={() => (view = "folders")}>Folders</button>
      </div>
      <button type="button" class="si" class:on={same(sel, { kind: "all" })} onclick={() => go({ kind: "all" })}><Icon name="i:layers" size={15} /> All files</button>
      {#if stars.length}
        <button type="button" class="si" class:on={same(sel, { kind: "starred" })} onclick={() => go({ kind: "starred" })}><Icon name="star" size={15} /> Starred <span class="n">{starredShown.length}</span></button>
      {/if}

      {#if view === "courses"}
        {#each courseTree as t (t.c.name)}
          {@const isOpen = openCourse.has(t.c.name)}
          <div class="crow">
            <button type="button" class="tw" aria-label={isOpen ? "Close" : "Open"} aria-expanded={isOpen} onclick={() => (isOpen ? openCourse.delete(t.c.name) : openCourse.add(t.c.name))}><Icon name={isOpen ? "i:chevron-down" : "i:chevron-right"} size={13} /></button>
            <button type="button" class="si course" class:on={same(sel, { kind: "course", name: t.c.name })} onclick={() => { go({ kind: "course", name: t.c.name }); openCourse.add(t.c.name); }}>
              <span class="dot" style="background: {t.c.color}"></span>{t.c.code || t.c.name}
            </button>
          </div>
          {#if isOpen}
            {#each t.groups as g (g.name)}
              {#if g.name}<span class="gh">{g.name}</span>{/if}
              {#each g.items as [id, l] (id)}
                <button type="button" class="si lec" data-lec={id} class:on={same(sel, { kind: "lecture", id })} class:over={over === `lec|${id}`} onclick={() => go({ kind: "lecture", id })}>
                  <Icon name="folder" size={14} /><span class="t">{l.title}</span><span class="n">{l.links.length}</span>
                </button>
              {/each}
            {/each}
            <button type="button" class="si lec loose" class:on={same(sel, { kind: "loose", name: t.c.name })} onclick={() => go({ kind: "loose", name: t.c.name })}>
              <Icon name="i:circle-help" size={14} /><span class="t">Not in a lecture</span>
            </button>
          {/if}
        {/each}
      {:else}
        {#each ["note", "mat", "pdf"] as const as area (area)}
          {@const k = `${area}|`}
          {@const isOpen = openDir.has(k)}
          <div class="crow">
            <button type="button" class="tw" aria-label={isOpen ? "Close" : "Open"} aria-expanded={isOpen} onclick={() => (isOpen ? openDir.delete(k) : openDir.add(k))}><Icon name={isOpen ? "i:chevron-down" : "i:chevron-right"} size={13} /></button>
            <button type="button" class="si course" data-dir={k} class:on={same(sel, { kind: "folder", area, rel: "" })} class:over={over === `dir|${k}`}
              onclick={() => { go({ kind: "folder", area, rel: "" }); openDir.add(k); }} oncontextmenu={(e) => openMenu(e, { dir: { area, rel: "" } })}>
              <Icon name={area === "note" ? "note" : area === "pdf" ? "file" : "labs"} size={15} />{AREA_NAMES[area]}
            </button>
          </div>
          {#if isOpen}{@render dirTree(area, "", 1)}{/if}
        {/each}
      {/if}
    </nav>

    <section class="main">
      {#if crumbs.length && sel.kind === "folder"}
        {@const a = sel.area}
        <nav class="crumb" aria-label="Folder">
          <button type="button" data-dir="{a}|" class:over={over === `dir|${a}|`} onclick={() => go({ kind: "folder", area: a, rel: "" })}>{AREA_NAMES[a]}</button>
          {#each crumbs as c (c.rel)}<Icon name="i:chevron-right" size={12} /><button type="button" data-dir="{a}|{c.rel}" class:over={over === `dir|${a}|${c.rel}`} onclick={() => go({ kind: "folder", area: a, rel: c.rel })}>{c.name}</button>{/each}
        </nav>
      {/if}
      <div class="head">
        <h1 class="h1">{title}</h1>
        <div class="search"><Icon name="search" size={15} /><input bind:value={q} placeholder="Search" aria-label="Search files" /></div>
        <select class="sortsel" bind:value={sort} aria-label="Sort">
          <option value="changed">Changed</option>
          <option value="name">Name</option>
          <option value="kind">Kind</option>
        </select>
        {#if sel.kind === "folder"}
          {@const a = sel.area}
          {@const r = sel.rel}
          <button type="button" class="btn quiet" onclick={() => { naming = { area: a, parent: r, what: "folder" }; nameText = ""; }}><Icon name="folder" size={15} /> New folder</button>
          {#if a === "note"}<button type="button" class="btn quiet" onclick={() => { naming = { area: a, parent: r, what: "note" }; nameText = ""; }}><Icon name="pen" size={15} /> New note</button>{/if}
        {:else}
          <button type="button" class="btn quiet" onclick={() => (pasting = true)}><Icon name="note" size={15} /> Paste quiz</button>
        {/if}
        <button type="button" class="btn primary" onclick={() => picker?.click()}><Icon name="plus" size={15} /> Upload</button>
        <input bind:this={picker} type="file" multiple hidden accept=".pdf,.md,.markdown,.txt,.html,.htm" onchange={(e) => { add([...(e.currentTarget.files ?? [])]); e.currentTarget.value = ""; }} />
      </div>
      <div class="chips">
        <button type="button" class="chip" class:on={kind === "all"} onclick={() => (kind = "all")}>All</button>
        {#each KINDS as k}
          <button type="button" class="chip" class:on={kind === k} onclick={() => (kind = k)}><Icon name={KIND_ICONS[k]} size={13} /> {plural(k)}</button>
        {/each}
      </div>

      {#if naming}
        <form class="card namer" onsubmit={(e) => { e.preventDefault(); void finishNew(); }}>
          <Icon name={naming.what === "folder" ? "folder" : "pen"} size={16} />
          <!-- svelte-ignore a11y_autofocus -->
          <input class="input" bind:value={nameText} placeholder={naming.what === "folder" ? "Folder name" : "Note title"} aria-label="Name" autofocus onkeydown={(e) => e.key === "Escape" && (naming = null)} />
          <button type="button" class="btn quiet sm" onclick={() => (naming = null)}>Cancel</button>
          <button type="submit" class="btn primary sm">Make</button>
        </form>
      {/if}

      {#if pickedRows.length}
        <div class="bulk" role="toolbar" aria-label="Picked files">
          <b>{pickedRows.length} picked</b>
          <button type="button" onclick={() => startMove(pickedRows)} disabled={!pickedRows.some((x) => areaOf(x.link))}>Move to…</button>
          <button type="button" onclick={() => { pickedRows.forEach((x) => !isStarred(x.link) && toggleStar(x.link)); tell("Starred"); }}>Star</button>
          <button type="button" class="danger" onclick={() => remove(pickedRows)}>Delete</button>
          <span class="grow"></span>
          <button type="button" onclick={() => picked.clear()}>Clear</button>
        </div>
      {/if}

      <div class="table card">
        <div class="tr th"><span></span><span>Name</span><span>Kind</span><span>Lecture</span><span>Changed</span><span></span></div>
        {#each folderRows as d (d)}
          {@const a = sel.kind === "folder" ? sel.area : "note"}
          <div class="tr folderrow" data-dir="{a}|{d}" class:over={over === `dir|${a}|${d}`} oncontextmenu={(e) => openMenu(e, { dir: { area: a, rel: d } })} role="row" tabindex="-1">
            <span class="ti k-folder"><Icon name="folder" size={14} /></span>
            {#if renamingDir === `${a}|${d}`}
              <!-- svelte-ignore a11y_autofocus -->
              <input class="rin" bind:value={renameText} autofocus aria-label="Folder name" onblur={() => finishRenameDir(a, d)} onkeydown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") renamingDir = null; }} />
            {:else}
              <button type="button" class="nm" onclick={() => { go({ kind: "folder", area: a, rel: d }); openDir.add(`${a}|${dirOf(d)}`); }}><b>{baseName(d)}</b></button>
            {/if}
            <span class="k">Folder</span><span></span><span></span>
            <button type="button" class="more" aria-label="More" onclick={(e) => openMenu(e, { dir: { area: a, rel: d } })}><Icon name="dots" size={16} /></button>
          </div>
        {/each}
        {#each rows as x, i (key(x))}
          {@const ls = inLec.get(key(x)) ?? []}
          <div class="tr" class:gone={x.gone} class:picked={picked.has(key(x))} class:held={drag?.items.some((y) => key(y) === key(x))} oncontextmenu={(e) => openMenu(e, { item: x })} role="row" tabindex="-1">
            <button type="button" class="ti k-{x.kind}" aria-label={picked.has(key(x)) ? "Unpick" : "Pick"} onclick={(e) => pickRow(e, i, x)}>
              {#if picked.has(key(x))}<Icon name="check" size={14} />{:else}<Icon name={KIND_ICONS[x.kind]} size={14} />{/if}
            </button>
            {#if renaming === key(x)}
              <!-- svelte-ignore a11y_autofocus -->
              <input class="rin" bind:value={renameText} autofocus aria-label="New name" onblur={() => finishRename(x)} onkeydown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") renaming = null; }} />
            {:else}
              <a class="nm" href={x.href || undefined} draggable="false" onpointerdown={(e) => down(e, x)}
                onclick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); pickRow(e, i, x); } }}>
                <b>{#if isStarred(x.link)}<span class="star" aria-label="Starred">★</span>{/if}{x.name}</b>{#if x.sub}<small>{x.sub}</small>{/if}
              </a>
            {/if}
            <span class="k">{KIND_NAMES[x.kind]}</span>
            <span class="lc">{#if x.course || ls.length}<LectureMenu chip link={x.link} course={x.course ?? ls[0]?.[1].course ?? ""} />{/if}</span>
            <span class="w">{when(x.mtime)}</span>
            <button type="button" class="more" aria-label="More for {x.name}" onclick={(e) => openMenu(e, { item: x })}><Icon name="dots" size={16} /></button>
          </div>
        {:else}
          {#if !folderRows.length}<p class="none">{sel.kind === "lecture" ? "Nothing linked yet." : sel.kind === "folder" ? "Empty folder." : "Nothing here."}</p>{/if}
        {/each}
      </div>
    </section>
  </div>

  {#if menu}
    {@const m = menu}
    <div class="fmenu" use:portal role="menu" style="left: {m.x}px; top: {m.y}px">
      {#if "item" in m}
        {@const x = m.item}
        {@const a = areaOf(x.link)}
        {#if x.href}<a role="menuitem" href={x.href} onclick={() => (menu = null)}><Icon name="i:chevron-right" size={14} /> Open</a>{/if}
        {#if a}<button type="button" role="menuitem" onclick={() => startRename(x)}><Icon name="pen" size={14} /> Rename<kbd>F2</kbd></button>{/if}
        {#if a}<button type="button" role="menuitem" onclick={() => startMove(picked.has(key(x)) ? pickedRows : [x])}><Icon name="folder" size={14} /> Move to…</button>{/if}
        {#if a}<button type="button" role="menuitem" onclick={() => { menu = null; void duplicate(x); }}><Icon name="i:copy" size={14} /> Duplicate</button>{/if}
        <button type="button" role="menuitem" onclick={() => { toggleStar(x.link); menu = null; }}><Icon name="star" size={14} /> {isStarred(x.link) ? "Unstar" : "Star"}</button>
        {#if a}<button type="button" role="menuitem" onclick={() => { menu = null; void copyLink(x); }}><Icon name="link" size={14} /> Copy link</button>{/if}
        {#if a}<button type="button" role="menuitem" onclick={() => { menu = null; void reveal(a, x.link.ref); }}><Icon name="external" size={14} /> Show in file manager</button>{/if}
        {#if a}<hr /><button type="button" role="menuitem" class="danger" onclick={() => { menu = null; void remove(picked.has(key(x)) ? pickedRows : [x]); }}><Icon name="trash" size={14} /> Delete<kbd>Del</kbd></button>{/if}
      {:else}
        {@const d = m.dir}
        <button type="button" role="menuitem" onclick={() => { menu = null; naming = { area: d.area, parent: d.rel, what: "folder" }; nameText = ""; go({ kind: "folder", area: d.area, rel: d.rel }); }}><Icon name="folder" size={14} /> New folder inside</button>
        {#if d.area === "note"}<button type="button" role="menuitem" onclick={() => { menu = null; naming = { area: "note", parent: d.rel, what: "note" }; nameText = ""; go({ kind: "folder", area: "note", rel: d.rel }); }}><Icon name="pen" size={14} /> New note here</button>{/if}
        {#if d.rel}
          <button type="button" role="menuitem" onclick={() => { menu = null; renamingDir = `${d.area}|${d.rel}`; renameText = baseName(d.rel); if (view !== "folders" && !(sel.kind === "folder")) view = "folders"; }}><Icon name="pen" size={14} /> Rename</button>
          <button type="button" role="menuitem" onclick={() => { menu = null; moving = { area: d.area, items: [], dir: d.rel }; moveQ = ""; }}><Icon name="folder" size={14} /> Move to…</button>
        {/if}
        <button type="button" role="menuitem" onclick={() => { menu = null; void reveal(d.area, d.rel); }}><Icon name="external" size={14} /> Show in file manager</button>
        {#if d.rel}<hr /><button type="button" role="menuitem" class="danger" onclick={() => { menu = null; void removeDir(d.area, d.rel); }}><Icon name="trash" size={14} /> Delete folder</button>{/if}
      {/if}
    </div>
  {/if}

  {#if moving}
    {@const mv = moving}
    <div class="scrim" role="presentation" onclick={() => (moving = null)}></div>
    <div class="movebox" role="dialog" aria-label="Move to">
      <b>Move {mv.dir !== undefined ? `“${baseName(mv.dir)}”` : mv.items.length === 1 ? `“${mv.items[0].name}”` : `${mv.items.length} files`} to…</b>
      <div class="search"><Icon name="search" size={15} /><!-- svelte-ignore a11y_autofocus --><input bind:value={moveQ} placeholder="Folder" aria-label="Find a folder" autofocus onkeydown={(e) => e.key === "Escape" && (moving = null)} /></div>
      <div class="mlist">
        {#each moveDirs as d (d)}
          <button type="button" class="mi" style="--d: {d ? d.split('/').length : 0}" onclick={() => moveTo(d)}><Icon name="folder" size={14} /> {d ? baseName(d) : AREA_NAMES[mv.area]}{#if d && moveQ.trim()}<small>{dirOf(d)}</small>{/if}</button>
        {/each}
      </div>
    </div>
  {/if}

  {#if dropping}<div class="dropcover" aria-hidden="true"><Icon name="plus" size={26} /><b>{selLecture ? `Add to ${title}` : selCourse ? `Add to ${selCourse}` : "Add files"}</b></div>{/if}
  <AddFilesDialog bind:open={uploading} files={upFiles} course={selCourse} lecture={selLecture} />
  <PasteQuiz bind:open={pasting} onfile={(f) => { upFiles = [f]; uploading = true; }} />
  {#if drag}<div class="ghost" style="left: {drag.px + 12}px; top: {drag.py + 8}px"><Icon name={KIND_ICONS[drag.items[0].kind]} size={14} /> {drag.items.length === 1 ? drag.items[0].name : `${drag.items.length} files`}</div>{/if}
  {#if fileMsg.msg}<div class="toast" role="status">{fileMsg.msg}</div>{/if}
</div>

<style>
  .fwrap {
    container-type: inline-size;
  }
  .files {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 20px;
    align-items: start;
  }
  .files.dragging {
    cursor: grabbing;
    user-select: none;
  }
  @container (max-width: 760px) {
    .files { grid-template-columns: minmax(0, 1fr); }
    .side { position: static; max-height: none; }
  }
  .side {
    position: sticky;
    top: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: calc(100vh - 140px);
    overflow-y: auto;
  }
  .seg {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-pill);
    background: var(--chip);
    margin-bottom: 8px;
  }
  .seg button {
    flex: 1;
    min-height: 32px;
    border: 0;
    border-radius: var(--radius-pill);
    background: none;
    font: inherit;
    font-size: 13.5px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .seg button.on {
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
    box-shadow: var(--shadow-sm, none);
  }
  .si {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 10px;
    border: 0;
    border-radius: 12px;
    background: none;
    font: inherit;
    font-size: 14px;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    flex: 1;
    min-width: 0;
  }
  .si:hover {
    background: var(--field);
  }
  .si.on {
    background: color-mix(in srgb, var(--lavender) 30%, var(--white));
    font-weight: 600;
  }
  .si.over,
  .crumb button.over,
  .tr.over {
    background: color-mix(in srgb, var(--lavender) 45%, var(--white));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--lavender) 90%, var(--text));
  }
  .si .n {
    margin-left: auto;
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 400;
  }
  .crow {
    display: flex;
    align-items: center;
    padding-left: calc(var(--d, 0) * 14px);
  }
  .tw {
    width: 24px;
    height: 30px;
    border: 0;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    border-radius: 8px;
    flex: none;
  }
  .course {
    font-weight: 500;
  }
  .dir :global(svg),
  .lec :global(svg) {
    color: var(--text-muted);
    flex: none;
  }
  .t {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
  }
  .gh {
    font-size: 11.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    padding: 8px 10px 2px 36px;
  }
  .lec {
    padding-left: 34px;
  }
  .lec .n {
    font-size: 12px;
    color: var(--text-muted);
  }
  .loose {
    color: var(--text-muted);
  }
  .rin {
    flex: 1;
    min-width: 0;
    min-height: 32px;
    border: 0;
    border-radius: 10px;
    padding: 0 8px;
    background: var(--field);
    font: inherit;
    font-size: 14px;
    color: var(--text);
    outline: 2px solid color-mix(in srgb, var(--lavender) 80%, transparent);
  }
  .main {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .crumb {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    color: var(--text-muted);
    font-size: 13.5px;
  }
  .crumb button {
    border: 0;
    background: none;
    font: inherit;
    color: inherit;
    padding: 4px 8px;
    border-radius: var(--radius-pill);
    cursor: pointer;
  }
  .crumb button:hover {
    background: var(--chip);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .h1 {
    font-size: 26px;
    font-weight: 600;
    margin: 0;
    flex: 1;
    min-width: 160px;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 12px;
    border-radius: var(--radius-pill);
    background: var(--field);
    color: var(--text-muted);
  }
  .search input {
    border: 0;
    background: none;
    font: inherit;
    color: var(--text);
    outline: none;
    width: 160px;
  }
  .sortsel {
    min-height: 40px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--chip);
    font: inherit;
    font-size: 14px;
    color: var(--text);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 34px;
    padding: 0 13px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--chip);
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    cursor: pointer;
  }
  .chip.on {
    background: var(--primary);
    color: var(--on-primary);
  }
  .namer {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    color: var(--text-muted);
  }
  .namer .input {
    flex: 1;
    min-height: 40px;
  }
  .bulk {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px 8px 16px;
    border-radius: var(--radius-pill);
    background: var(--primary);
    color: var(--on-primary);
    animation: pop-in 0.25s var(--spring) backwards;
  }
  .bulk button {
    min-height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--on-primary) 14%, transparent);
    color: inherit;
    font: inherit;
    font-size: 13.5px;
    cursor: pointer;
  }
  .bulk button:disabled {
    opacity: 0.5;
  }
  .bulk .danger {
    background: color-mix(in srgb, var(--rose) 60%, transparent);
  }
  .grow {
    flex: 1;
  }
  .table {
    padding: 6px;
    display: grid;
  }
  .tr {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 120px minmax(110px, 200px) 64px 34px;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 4px 6px 4px 10px;
    border-radius: 14px;
  }
  .tr:not(.th):hover {
    background: var(--field);
  }
  .tr.picked {
    background: color-mix(in srgb, var(--lavender) 22%, var(--white));
  }
  .th {
    min-height: 34px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .tr.gone {
    opacity: 0.5;
  }
  .tr.held {
    opacity: 0.45;
  }
  .ti {
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 10px;
    display: grid;
    place-items: center;
    color: var(--text);
    cursor: pointer;
    padding: 0;
  }
  .tr.picked .ti {
    background: var(--accent);
    color: var(--on-primary);
  }
  .k-note { background: color-mix(in srgb, var(--lavender) 35%, var(--white)); }
  .k-pdf { background: color-mix(in srgb, var(--rose) 35%, var(--white)); }
  .k-quiz { background: color-mix(in srgb, var(--peach) 40%, var(--white)); }
  .k-page { background: color-mix(in srgb, var(--sage) 35%, var(--white)); }
  .k-deck { background: color-mix(in srgb, var(--butter) 45%, var(--white)); }
  .k-file,
  .k-folder { background: var(--chip); cursor: default; }
  .nm {
    display: flex;
    flex-direction: column;
    min-width: 0;
    color: var(--text);
    text-decoration: none;
    cursor: pointer;
    touch-action: none;
    border: 0;
    background: none;
    font: inherit;
    text-align: left;
    padding: 0;
  }
  .nm b {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nm small {
    font-size: 12px;
    color: var(--text-muted);
  }
  .star {
    color: color-mix(in srgb, var(--butter) 70%, var(--text));
    margin-right: 5px;
  }
  .k,
  .w {
    font-size: 13px;
    color: var(--text-muted);
  }
  .lc {
    min-width: 0;
  }
  .more {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--text-muted);
    display: grid;
    place-items: center;
    cursor: pointer;
    opacity: 0;
  }
  .tr:hover .more,
  .more:focus-visible {
    opacity: 1;
  }
  .more:hover {
    background: var(--chip);
  }
  .none {
    color: var(--text-muted);
    padding: 16px 10px;
    margin: 0;
  }
  @container (max-width: 760px) {
    .tr { grid-template-columns: 34px minmax(0, 1fr) minmax(90px, 150px) 34px; }
    .tr .k, .tr .w { display: none; }
    .th span:nth-child(3), .th span:nth-child(5) { display: none; }
  }
  .fmenu {
    position: fixed;
    z-index: 250;
    min-width: 230px;
    padding: 6px;
    border-radius: 18px;
    background: var(--surface-float);
    box-shadow: var(--shadow-lg, var(--shadow));
    backdrop-filter: var(--blur);
    display: flex;
    flex-direction: column;
    gap: 1px;
    color: var(--text);
    animation: pop-in 0.2s var(--spring) backwards;
  }
  .fmenu button,
  .fmenu a {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 36px;
    padding: 0 10px;
    border: 0;
    border-radius: 11px;
    background: none;
    font: inherit;
    font-size: 14px;
    color: var(--text);
    text-decoration: none;
    text-align: left;
    cursor: pointer;
  }
  .fmenu button:hover,
  .fmenu a:hover {
    background: var(--field);
  }
  .fmenu kbd {
    margin-left: auto;
    font: inherit;
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .fmenu .danger {
    color: var(--alert-ink);
  }
  .fmenu hr {
    border: 0;
    height: 1px;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    margin: 4px 6px;
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 240;
    background: var(--scrim);
  }
  .movebox {
    position: fixed;
    z-index: 245;
    left: 50%;
    top: 14vh;
    transform: translateX(-50%);
    width: min(440px, calc(100vw - 32px));
    max-height: 70vh;
    padding: 18px;
    border-radius: 26px;
    background: var(--surface-float);
    box-shadow: var(--shadow-lg, var(--shadow));
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: pop-in 0.25s var(--spring) backwards;
  }
  .mlist {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .mi {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 10px 0 calc(10px + var(--d) * 16px);
    border: 0;
    border-radius: 11px;
    background: none;
    font: inherit;
    font-size: 14px;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .mi:hover {
    background: var(--field);
  }
  .mi small {
    margin-left: auto;
    color: var(--text-muted);
    font-size: 12px;
  }
  .legacy {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    margin-bottom: 16px;
  }
  .dropcover {
    position: fixed;
    inset: 16px;
    z-index: 150;
    border-radius: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: color-mix(in srgb, var(--lavender) 22%, transparent);
    box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--lavender) 85%, var(--text));
    color: var(--text);
    font-size: 18px;
    pointer-events: none;
  }
  .ghost {
    position: fixed;
    z-index: 300;
    pointer-events: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: var(--radius-pill);
    background: var(--surface-float);
    box-shadow: var(--shadow-lg, var(--shadow));
    font-size: 13.5px;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
    z-index: 300;
    padding: 10px 18px;
    border-radius: var(--radius-pill);
    background: var(--primary);
    color: var(--on-primary);
    font-size: 14px;
    animation: pop-in 0.25s var(--spring) backwards;
  }
  @media (prefers-reduced-motion: reduce) {
    .fmenu, .movebox, .bulk, .toast { animation: none; }
  }
</style>
