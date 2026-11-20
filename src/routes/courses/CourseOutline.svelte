<script lang="ts">
  // The course hub's main column (H1, board "One Mosaic folder, with the course as the hub",
  // frame 1): one section per exam of the course (from the calendar), lectures inside it, and each
  // lecture's linked notes, PDFs, quizzes, interactive pages and decks as chips with progress.
  import Icon from "../../lib/components/Icon.svelte";
  import { exams } from "../../lib/stores/calendar.svelte";
  import { newEvent } from "../../lib/stores/calendar.svelte";
  import { addLecture, lectureHref, lectures, saveLecture } from "../../lib/stores/outline.svelte";
  import { describe, KIND_ICONS, materialItems, noteCardStats } from "../../lib/stores/linkInfo.svelte";
  import { shortExam } from "../../lib/stores/deckTree.svelte";
  import { fromKey } from "../../lib/calendar";
  import { SvelteSet } from "svelte/reactivity";

  let { id, course, color }: { id: string; course: string; color: string } = $props();

  const list = $derived(lectures(course));
  const courseExams = $derived(exams().filter((e) => e.course === course));
  const stats = $derived(noteCardStats());
  const mats = $derived(materialItems());
  // upcoming exams first (soonest on top), then "Other", then past exams (folded)
  const sections = $derived.by(() => {
    const up = courseExams.filter((e) => e.days >= 0);
    const past = courseExams.filter((e) => e.days < 0).reverse();
    const known = new Set(courseExams.map((e) => e.key));
    const other = list.filter(([, l]) => !l.exam || !known.has(l.exam));
    return [
      ...up.map((e) => ({ key: e.key, exam: e, past: false, items: list.filter(([, l]) => l.exam === e.key) })),
      ...(other.length || !courseExams.length ? [{ key: "", exam: null, past: false, items: other }] : []),
      ...past.map((e) => ({ key: e.key, exam: e, past: true, items: list.filter(([, l]) => l.exam === e.key) })),
    ];
  });
  const open = new SvelteSet<string>();
  const isOpen = (s: { key: string; past: boolean }) => (s.past ? open.has(s.key) : !open.has(s.key));
  const toggle = (k: string) => (open.has(k) ? open.delete(k) : open.add(k));

  let adding = $state<string | null>(null);
  let title = $state("");
  function add(exam: string) {
    if (!title.trim()) return void (adding = null);
    addLecture(course, exam, title);
    title = "";
  }
  const shortDate = (d: string) => fromKey(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const when = (days: number) => (days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`);

  // drag a lecture onto another exam's section
  let dragId = $state<string | null>(null);
  let over = $state<string | null>(null);
</script>

<section class="outline" style="--c: {color}">
  {#each sections as s (s.key || "other")}
    <div class="sec" class:past={s.past} class:over={dragId && over === s.key} role="group" aria-label={s.exam ? s.exam.title : "Other"}
      onpointerenter={() => dragId && (over = s.key)}
      onpointerup={() => { if (dragId && over === s.key) saveLecture(dragId, { exam: s.key }); dragId = over = null; }}>
      <div class="sh">
        <button type="button" class="fold" aria-expanded={isOpen(s)} onclick={() => toggle(s.key)}>
          <Icon name={isOpen(s) ? "i:chevron-down" : "i:chevron-right"} size={16} />
          <b>{s.exam ? shortExam(s.exam) : courseExams.length ? "Other" : "Lectures"}</b>
        </button>
        {#if s.exam}
          <span class="pill" class:soon={!s.past && s.exam.days <= 14} class:done={s.past}>{shortDate(s.exam.date)}{s.past ? "" : ` · ${when(s.exam.days)}`}</span>
        {/if}
        <span class="n">{s.items.length} {s.items.length === 1 ? "lecture" : "lectures"}</span>
        <span class="grow"></span>
        {#if !s.past}
          <button type="button" class="mini" onclick={() => { adding = s.key; title = ""; if (!isOpen(s)) toggle(s.key); }}><Icon name="plus" size={13} /> Lecture</button>
        {/if}
      </div>
      {#if isOpen(s)}
        <div class="lecs">
          {#each s.items as [lid, l] (lid)}
            {@const shown = l.links.map((x) => describe(x, stats, mats))}
            <a class="lec" href={lectureHref(id, lid)} draggable="false" onpointerdown={(e) => { if (e.button === 0) { const sx = e.clientX, sy = e.clientY; const mv = (m: PointerEvent) => { if (Math.hypot(m.clientX - sx, m.clientY - sy) > 6) { dragId = lid; window.removeEventListener("pointermove", mv); } }; window.addEventListener("pointermove", mv); window.addEventListener("pointerup", () => { window.removeEventListener("pointermove", mv); setTimeout(() => (dragId = over = null)); }, { once: true }); } }}
              onclick={(e) => dragId && e.preventDefault()} class:dragging={dragId === lid}>
              <div class="lh">
                <span class="lt"><Icon name="folder" size={16} /></span>
                <b>{l.title}</b>
                {#if l.date}<span class="d">{shortDate(l.date)}</span>{/if}
                <span class="grow"></span>
                <Icon name="i:chevron-right" size={15} />
              </div>
              {#if shown.length}
                <div class="chips">
                  {#each shown as x (x.link.kind + x.link.ref)}
                    <span class="chip k-{x.kind}" class:gone={x.gone}><Icon name={x.icon ?? KIND_ICONS[x.kind]} size={13} /><span class="cn">{x.name}</span>{#if x.sub && !x.gone}<span class="cs" class:rose={x.tone === "rose"} class:sage={x.tone === "sage"} class:peach={x.tone === "peach"}>{x.sub}</span>{/if}</span>
                  {/each}
                </div>
              {:else}
                <span class="empty">Nothing linked yet.</span>
              {/if}
            </a>
          {/each}
          {#if adding === s.key}
            <form class="adder" onsubmit={(e) => { e.preventDefault(); add(s.key); }}>
              <Icon name="folder" size={16} />
              <!-- svelte-ignore a11y_autofocus -->
              <input class="input" bind:value={title} placeholder="Lecture or topic" aria-label="Lecture name" autofocus onblur={() => { if (!title.trim()) adding = null; }} onkeydown={(e) => e.key === "Escape" && (adding = null)} />
              <button type="submit" class="btn primary sm">Add</button>
            </form>
          {:else if !s.items.length && !s.past}
            <button type="button" class="emptyadd" onclick={() => { adding = s.key; title = ""; }}>No lectures yet.</button>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
  <button type="button" class="mini addexam" onclick={(e) => newEvent({ kind: "exam", course, allDay: true, title: "Exam" }, e)}><Icon name="plus" size={13} /> Exam</button>
</section>

<style>
  .outline {
    display: grid;
    gap: 14px;
  }
  .sec {
    display: grid;
    gap: 10px;
    border-radius: 24px;
    transition: background 0.2s;
  }
  .sec.over {
    background: color-mix(in srgb, var(--lavender) 22%, transparent);
    outline: 2px dashed color-mix(in srgb, var(--lavender) 80%, var(--text));
    outline-offset: 4px;
  }
  .sec.past .sh b {
    color: var(--text-muted);
  }
  .sh {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    min-height: 40px;
  }
  .fold {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: none;
    font: inherit;
    color: var(--text);
    cursor: pointer;
    padding: 6px 6px 6px 0;
    border-radius: 10px;
  }
  .fold b {
    font-size: 18px;
    font-weight: 600;
  }
  .pill {
    font-size: 12.5px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--peach) 40%, var(--white));
    color: var(--text);
  }
  .pill.soon {
    background: color-mix(in srgb, var(--rose) 40%, var(--white));
    color: var(--alert-ink);
  }
  .pill.done {
    background: color-mix(in srgb, var(--sage) 35%, var(--white));
    color: var(--go-ink);
  }
  .n {
    font-size: 13px;
    color: var(--text-muted);
  }
  .grow {
    flex: 1;
  }
  .mini {
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
    font-weight: 500;
    cursor: pointer;
  }
  .addexam {
    justify-self: start;
  }
  .lecs {
    display: grid;
    gap: 10px;
  }
  .lec {
    display: grid;
    gap: 10px;
    padding: 14px 16px;
    border-radius: 22px;
    background: var(--surface);
    box-shadow: var(--shadow-sm, var(--shadow));
    color: var(--text);
    text-decoration: none;
    transition: transform 0.2s var(--spring), box-shadow 0.2s;
    animation: pop-in 0.35s var(--spring) backwards;
    touch-action: none;
    user-select: none;
  }
  .lec:hover {
    transform: translateY(-2px);
  }
  .lec.dragging {
    opacity: 0.55;
    transform: scale(0.98);
  }
  .lh {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-muted);
  }
  .lh b {
    color: var(--text);
    font-weight: 600;
    font-size: 16px;
  }
  .lt {
    width: 32px;
    height: 32px;
    border-radius: 11px;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--c) 40%, var(--white));
    color: var(--text);
  }
  .d {
    font-size: 13px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 5px 11px;
    border-radius: var(--radius-pill);
    background: var(--field);
    font-size: 13px;
    min-width: 0;
  }
  .chip :global(svg) {
    flex: none;
  }
  .k-note :global(svg) { color: color-mix(in srgb, var(--lavender) 70%, var(--text)); }
  .k-pdf :global(svg) { color: color-mix(in srgb, var(--rose) 70%, var(--text)); }
  .k-quiz :global(svg) { color: color-mix(in srgb, var(--peach) 70%, var(--text)); }
  .k-page :global(svg) { color: color-mix(in srgb, var(--sage) 70%, var(--text)); }
  .k-deck :global(svg) { color: color-mix(in srgb, var(--butter) 70%, var(--text)); }
  .cn {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 220px;
  }
  .cs {
    color: var(--text-muted);
    white-space: nowrap;
  }
  .cs::before {
    content: "· ";
  }
  .cs.rose { color: var(--alert-ink); font-weight: 600; }
  .cs.sage { color: var(--go-ink); font-weight: 600; }
  .cs.peach { font-weight: 600; }
  .chip.gone {
    opacity: 0.5;
    text-decoration: line-through;
  }
  .empty {
    font-size: 13px;
    color: var(--text-muted);
  }
  .adder {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 8px 8px 16px;
    border-radius: 22px;
    background: var(--surface);
    color: var(--text-muted);
  }
  .adder .input {
    flex: 1;
    min-height: 40px;
  }
  .emptyadd {
    justify-self: start;
    border: 0;
    background: none;
    font: inherit;
    font-size: 14px;
    color: var(--text-muted);
    padding: 4px 2px;
    cursor: pointer;
  }
  @media (prefers-reduced-motion: reduce) {
    .lec { animation: none; transition: none; }
  }
</style>
