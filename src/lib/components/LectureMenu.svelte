<script lang="ts">
  // "Which lecture is this in?" from the item itself (H1b): a chip or button that opens a small menu
  // of the course's lectures, grouped by exam, each ticked when this item is linked to it; a click
  // links or unlinks. "New lecture" makes one under the next exam and links it. Used in the note
  // header, the PDF viewer, Materials and deck pages. The menu lives on <body> (position: fixed).
  import Icon from "./Icon.svelte";
  import { exams } from "../stores/calendar.svelte";
  import { addLecture, addLinks, lectures, lecturesWith, removeLink, type Link } from "../stores/outline.svelte";
  import { courseNames } from "../stores/courses.svelte";
  import { shortExam } from "../stores/deckTree.svelte";

  let { link, course = "", chip = false }: { link: Link; course?: string; chip?: boolean } = $props();
  let open = $state(false);
  let btn = $state<HTMLButtonElement>();
  let pos = $state({ x: 0, y: 0 });
  let pick = $state("");
  let naming = $state(false);
  let title = $state("");

  const inThese = $derived(lecturesWith(link));
  const theCourse = $derived(course || pick || inThese[0]?.[1].course || "");
  const list = $derived(theCourse ? lectures(theCourse) : []);
  const groups = $derived.by(() => {
    const ex = exams().filter((e) => e.course === theCourse);
    const known = new Set(ex.map((e) => e.key));
    const out = [...ex.filter((e) => e.days >= 0), ...ex.filter((e) => e.days < 0).reverse()]
      .map((e) => ({ name: shortExam(e), items: list.filter(([, l]) => l.exam === e.key) }))
      .filter((g) => g.items.length);
    const other = list.filter(([, l]) => !l.exam || !known.has(l.exam));
    if (other.length) out.push({ name: ex.length ? "Other" : "", items: other });
    return out;
  });
  const linked = (id: string) => inThese.some(([x]) => x === id);
  const label = $derived(inThese.length ? inThese.map(([, l]) => l.title).join(", ") : "Lecture");

  function toggle(id: string) {
    if (linked(id)) removeLink(id, link);
    else addLinks(id, [link]);
  }
  function make() {
    if (!title.trim() || !theCourse) return;
    const next = exams().find((e) => e.course === theCourse && e.days >= 0);
    const id = addLecture(theCourse, next?.key ?? "", title);
    addLinks(id, [link]);
    title = "";
    naming = false;
  }
  function show() {
    if (open) return void (open = false);
    const r = btn!.getBoundingClientRect();
    pos = { x: Math.min(r.left, window.innerWidth - 300), y: r.bottom + 6 };
    if (pos.y > window.innerHeight - 320) pos.y = Math.max(8, r.top - 326);
    naming = false;
    open = true;
  }
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy: () => node.remove() };
  }
  function away(e: MouseEvent) {
    const t = e.target as Node;
    if (open && !btn?.contains(t) && !(t as HTMLElement).closest?.(".lecmenu")) open = false;
  }
</script>

<svelte:window onmousedown={away} onkeydown={(e) => open && e.key === "Escape" && (open = false)} />

<button type="button" bind:this={btn} class="trig" class:chip class:on={inThese.length > 0} aria-expanded={open} aria-haspopup="menu" title="Lecture" onclick={show}>
  <Icon name="folder" size={chip ? 13 : 15} />
  <span class="lb">{label}</span>
</button>

{#if open}
  <div class="lecmenu" use:portal role="menu" style="left: {pos.x}px; top: {pos.y}px">
    {#if !theCourse}
      <span class="hd">Course</span>
      {#each courseNames() as c}
        <button type="button" class="it" role="menuitem" onclick={() => (pick = c)}>{c}</button>
      {:else}
        <span class="none">No courses yet.</span>
      {/each}
    {:else}
      {#each groups as g (g.name)}
        {#if g.name}<span class="hd">{g.name}</span>{/if}
        {#each g.items as [id, l] (id)}
          <button type="button" class="it" role="menuitemcheckbox" aria-checked={linked(id)} onclick={() => toggle(id)}>
            <span class="ck" class:on={linked(id)}>{#if linked(id)}<Icon name="check" size={12} />{/if}</span>
            <span class="t">{l.title}</span>
          </button>
        {/each}
      {:else}
        <span class="none">No lectures yet.</span>
      {/each}
      {#if naming}
        <form class="new" onsubmit={(e) => { e.preventDefault(); make(); }}>
          <!-- svelte-ignore a11y_autofocus -->
          <input class="input" bind:value={title} placeholder="Lecture or topic" aria-label="New lecture" autofocus />
          <button type="submit" class="btn primary sm">Add</button>
        </form>
      {:else}
        <button type="button" class="it add" role="menuitem" onclick={() => (naming = true)}><Icon name="plus" size={14} /> New lecture</button>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .trig {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 260px;
    min-height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--chip);
    color: var(--text-muted);
    font: inherit;
    font-size: 13.5px;
    cursor: pointer;
  }
  .trig.chip {
    min-height: 28px;
    padding: 0 10px;
    font-size: 12.5px;
  }
  .trig.on {
    color: var(--text);
    background: color-mix(in srgb, var(--lavender) 30%, var(--white));
  }
  .lb {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lecmenu {
    position: fixed;
    z-index: 200;
    width: 280px;
    max-height: 320px;
    overflow-y: auto;
    padding: 6px;
    border-radius: 18px;
    background: var(--surface-float);
    box-shadow: var(--shadow-lg, var(--shadow));
    backdrop-filter: var(--blur);
    display: flex;
    flex-direction: column;
    gap: 2px;
    animation: pop-in 0.22s var(--spring) backwards;
    color: var(--text);
    font-size: 14px;
  }
  .hd {
    font-size: 11.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    padding: 8px 10px 2px;
  }
  .it {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 38px;
    padding: 0 10px;
    border: 0;
    border-radius: 12px;
    background: none;
    font: inherit;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .it:hover {
    background: var(--field);
  }
  .it.add {
    color: var(--text-muted);
  }
  .ck {
    width: 18px;
    height: 18px;
    flex: none;
    border-radius: 6px;
    display: grid;
    place-items: center;
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--text) 25%, transparent);
    color: var(--on-primary);
  }
  .ck.on {
    background: var(--accent);
    box-shadow: none;
  }
  .t {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .none {
    color: var(--text-muted);
    padding: 8px 10px;
  }
  .new {
    display: flex;
    gap: 6px;
    padding: 4px;
  }
  .new .input {
    flex: 1;
    min-height: 38px;
    min-width: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .lecmenu { animation: none; }
  }
</style>
