<script lang="ts">
  // Study → Files (H1b, board "One Mosaic folder…" frame 3, links-first version): every note, PDF,
  // quiz, interactive page, deck and Materials file in one list with kind filters and search. On
  // the left, courses → exams → lectures: pick one to see what's in it ("Not in a lecture" shows
  // what's left to sort). Drag a row onto a lecture to link it, or use its Lecture menu.
  import Icon from "../../lib/components/Icon.svelte";
  import LectureMenu from "../../lib/components/LectureMenu.svelte";
  import { courses } from "../../lib/stores/courses.svelte";
  import { exams } from "../../lib/stores/calendar.svelte";
  import { addLinks, lectures, type Lecture } from "../../lib/stores/outline.svelte";
  import { candidates, describe, KIND_ICONS, KIND_NAMES, materialItems, noteCardStats, type Shown, type ShowKind } from "../../lib/stores/linkInfo.svelte";
  import { shortExam } from "../../lib/stores/deckTree.svelte";
  import { SvelteSet } from "svelte/reactivity";

  type Sel = { kind: "all" } | { kind: "course"; name: string } | { kind: "loose"; name: string } | { kind: "lecture"; id: string };
  let sel = $state<Sel>({ kind: "all" });
  let kind = $state<ShowKind | "all">("all");
  let q = $state("");
  const open = new SvelteSet<string>();

  const all = $derived(candidates());
  const lecs = $derived(lectures());
  const key = (x: Shown) => `${x.link.kind}|${x.link.ref}`;
  // which lectures each item is in
  const inLec = $derived.by(() => {
    const m = new Map<string, [string, Lecture][]>();
    for (const [id, l] of lecs) for (const x of l.links) {
      const k = `${x.kind}|${x.ref}`;
      m.set(k, [...(m.get(k) ?? []), [id, l]]);
    }
    return m;
  });
  const courseList = $derived(courses().map(([, c]) => c));
  const tree = $derived(
    courseList.map((c) => {
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

  const rows = $derived.by(() => {
    let list: Shown[];
    if (sel.kind === "lecture") {
      const l = lecs.find(([id]) => id === (sel as { id: string }).id)?.[1];
      const stats = noteCardStats();
      const mats = materialItems();
      list = (l?.links ?? []).map((x) => describe(x, stats, mats));
    } else if (sel.kind === "course" || sel.kind === "loose") {
      const name = sel.name;
      list = all.filter((x) => x.course === name || (inLec.get(key(x)) ?? []).some(([, l]) => l.course === name));
      if (sel.kind === "loose") list = list.filter((x) => !(inLec.get(key(x)) ?? []).some(([, l]) => l.course === name));
    } else list = all;
    const t = q.trim().toLowerCase();
    return list
      .filter((x) => !x.gone || sel.kind === "lecture")
      .filter((x) => kind === "all" || x.kind === kind)
      .filter((x) => !t || `${x.name} ${x.link.ref}`.toLowerCase().includes(t))
      .sort((a, b) => (b.mtime ?? 0) - (a.mtime ?? 0))
      .slice(0, 400);
  });
  const title = $derived(
    sel.kind === "all" ? "All files" : sel.kind === "lecture" ? (lecs.find(([id]) => id === (sel as { id: string }).id)?.[1].title ?? "Lecture") : sel.kind === "loose" ? `${sel.name} · not in a lecture` : sel.name,
  );
  const KINDS: ShowKind[] = ["note", "pdf", "quiz", "page", "deck", "file"];
  const plural = (k: ShowKind) => (k === "page" ? "Interactive pages" : k === "quiz" ? "Quizzes" : KIND_NAMES[k] + "s");
  const when = (ms?: number) => (ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
  const isSel = (s: Sel) => JSON.stringify(s) === JSON.stringify(sel);

  // dragging a row onto a lecture in the side list links it (pointer-based, 6px threshold)
  let drag = $state<{ x: Shown; px: number; py: number } | null>(null);
  let overLec = $state<string | null>(null);
  let toast = $state("");
  function down(e: PointerEvent, x: Shown) {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const mv = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 6) return;
      moved = true;
      drag = { x, px: m.clientX, py: m.clientY };
      const el = document.elementFromPoint(m.clientX, m.clientY) as HTMLElement | null;
      overLec = el?.closest<HTMLElement>("[data-lec]")?.dataset.lec ?? null;
    };
    const up = () => {
      window.removeEventListener("pointermove", mv);
      if (moved && drag && overLec) {
        addLinks(overLec, [drag.x.link]);
        const l = lecs.find(([id]) => id === overLec)?.[1];
        toast = `Added to ${l?.title ?? "lecture"}`;
        setTimeout(() => (toast = ""), 2500);
      }
      if (moved) window.addEventListener("click", (c) => c.preventDefault(), { capture: true, once: true });
      drag = null;
      overLec = null;
    };
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up, { once: true });
  }
</script>

<div class="fwrap">
  <div class="files" class:dragging={!!drag}>
    <nav class="side" aria-label="Courses and lectures">
      <button type="button" class="si" class:on={isSel({ kind: "all" })} onclick={() => (sel = { kind: "all" })}><Icon name="folder" size={15} /> All files</button>
      {#each tree as t (t.c.name)}
        {@const isOpen = open.has(t.c.name)}
        <div class="crow">
          <button type="button" class="tw" aria-label={isOpen ? "Close" : "Open"} aria-expanded={isOpen} onclick={() => (isOpen ? open.delete(t.c.name) : open.add(t.c.name))}><Icon name={isOpen ? "i:chevron-down" : "i:chevron-right"} size={14} /></button>
          <button type="button" class="si course" class:on={isSel({ kind: "course", name: t.c.name })} onclick={() => { sel = { kind: "course", name: t.c.name }; open.add(t.c.name); }}>
            <span class="dot" style="background: {t.c.color}"></span>{t.c.code || t.c.name}
          </button>
        </div>
        {#if isOpen}
          {#each t.groups as g (g.name)}
            {#if g.name}<span class="gh">{g.name}</span>{/if}
            {#each g.items as [id, l] (id)}
              <button type="button" class="si lec" data-lec={id} class:on={isSel({ kind: "lecture", id })} class:over={overLec === id} onclick={() => (sel = { kind: "lecture", id })}>
                <Icon name="folder" size={14} /><span class="t">{l.title}</span><span class="n">{l.links.length}</span>
              </button>
            {/each}
          {/each}
          <button type="button" class="si lec loose" class:on={isSel({ kind: "loose", name: t.c.name })} onclick={() => (sel = { kind: "loose", name: t.c.name })}>
            <Icon name="i:circle-help" size={14} /><span class="t">Not in a lecture</span>
          </button>
        {/if}
      {/each}
    </nav>

    <section class="main">
      <div class="head">
        <h1 class="h1">{title}</h1>
        <div class="search"><Icon name="search" size={15} /><input bind:value={q} placeholder="Search" aria-label="Search files" /></div>
      </div>
      <div class="chips">
        <button type="button" class="chip" class:on={kind === "all"} onclick={() => (kind = "all")}>All</button>
        {#each KINDS as k}
          <button type="button" class="chip" class:on={kind === k} onclick={() => (kind = k)}><Icon name={KIND_ICONS[k]} size={13} /> {plural(k)}</button>
        {/each}
      </div>
      <div class="table card">
        <div class="tr th"><span></span><span>Name</span><span>Kind</span><span>Lecture</span><span>Changed</span></div>
        {#each rows as x (key(x))}
          {@const ls = inLec.get(key(x)) ?? []}
          <div class="tr" class:gone={x.gone} class:held={drag && key(drag.x) === key(x)}>
            <span class="ti k-{x.kind}"><Icon name={KIND_ICONS[x.kind]} size={14} /></span>
            <a class="nm" href={x.href || undefined} draggable="false" onpointerdown={(e) => down(e, x)}>
              <b>{x.name}</b>{#if x.sub}<small>{x.sub}</small>{/if}
            </a>
            <span class="k">{KIND_NAMES[x.kind]}</span>
            <span class="lc">{#if x.course || ls.length}<LectureMenu chip link={x.link} course={x.course ?? ls[0]?.[1].course ?? ""} />{/if}</span>
            <span class="w">{when(x.mtime)}</span>
          </div>
        {:else}
          <p class="none">{sel.kind === "lecture" ? "Nothing linked yet." : "Nothing here."}</p>
        {/each}
      </div>
    </section>
  </div>
  {#if drag}<div class="ghost" style="left: {drag.px + 12}px; top: {drag.py + 8}px"><Icon name={KIND_ICONS[drag.x.kind]} size={14} /> {drag.x.name}</div>{/if}
  {#if toast}<div class="toast" role="status">{toast}</div>{/if}
</div>

<style>
  .fwrap {
    container-type: inline-size;
  }
  .files {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
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
  .si {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
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
  .si.over {
    background: color-mix(in srgb, var(--lavender) 45%, var(--white));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--lavender) 90%, var(--text));
  }
  .crow {
    display: flex;
    align-items: center;
  }
  .tw {
    width: 26px;
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
    color: var(--text);
  }
  .lec :global(svg) {
    color: var(--text-muted);
    flex: none;
  }
  .lec .t {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lec .n {
    font-size: 12px;
    color: var(--text-muted);
  }
  .loose {
    color: var(--text-muted);
  }
  .main {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .h1 {
    font-size: 26px;
    font-weight: 600;
    margin: 0;
    flex: 1;
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
    width: 180px;
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
  .table {
    padding: 6px;
    display: grid;
  }
  .tr {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 130px minmax(120px, 210px) 70px;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    padding: 4px 10px;
    border-radius: 14px;
  }
  .tr:not(.th):hover {
    background: var(--field);
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
    border-radius: 10px;
    display: grid;
    place-items: center;
  }
  .k-note { background: color-mix(in srgb, var(--lavender) 35%, var(--white)); }
  .k-pdf { background: color-mix(in srgb, var(--rose) 35%, var(--white)); }
  .k-quiz { background: color-mix(in srgb, var(--peach) 40%, var(--white)); }
  .k-page { background: color-mix(in srgb, var(--sage) 35%, var(--white)); }
  .k-deck { background: color-mix(in srgb, var(--butter) 45%, var(--white)); }
  .k-file { background: var(--chip); }
  .nm {
    display: flex;
    flex-direction: column;
    min-width: 0;
    color: var(--text);
    text-decoration: none;
    cursor: pointer;
    touch-action: none;
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
  .k,
  .w {
    font-size: 13px;
    color: var(--text-muted);
  }
  .lc {
    min-width: 0;
  }
  .none {
    color: var(--text-muted);
    padding: 16px 10px;
    margin: 0;
  }
  @container (max-width: 760px) {
    .tr { grid-template-columns: 34px minmax(0, 1fr) minmax(100px, 160px); }
    .tr .k, .tr .w { display: none; }
    .th span:nth-child(3), .th span:nth-child(5) { display: none; }
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
</style>
