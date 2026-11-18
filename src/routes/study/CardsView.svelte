<script lang="ts">
  // Study → Flashcards home (her Nov 18 canvas pick "Flashcards tab: A + C", board 1): hero with
  // what's due today and Study everything; the deck list (My decks, From your notes, Filtered) with
  // Add card / Create deck / Import under it; Exams, Next 7 days and Today beside it.
  import { onDestroy, onMount } from "svelte";
  import Icon from "../../lib/components/Icon.svelte";
  import { fromKey } from "../../lib/calendar";
  import { exams } from "../../lib/stores/calendar.svelte";
  import { courseByName } from "../../lib/stores/courses.svelte";
  import { deckGroups, shortExam } from "../../lib/stores/deckTree.svelte";
  import { notes } from "../../lib/stores/notes.svelte";
  import { allCards, counts, dayRev, ensureIds, forecast, pace, readiness } from "../../lib/stores/srs.svelte";
  import DeckEditor from "./DeckEditor.svelte";
  import DeckRows from "./DeckRows.svelte";
  import ImportDialog from "./library/ImportDialog.svelte";

  $effect(() => {
    if (notes.loaded) void ensureIds();
  });

  const all = $derived(counts());
  const reviews = $derived(Math.max(0, all.due - all.learning));
  const today = $derived(all.due + all.newToday);
  const minutes = $derived(Math.max(1, Math.round((today * pace()) / 60)));
  const groups = $derived(deckGroups());

  // the next exam with cards, and how many of its course's cards are ready
  const exam = $derived.by(() => {
    for (const e of exams().filter((x) => x.days >= 0 && x.course)) {
      const list = allCards().filter((r) => r.card.lineId && r.course === e.course);
      if (list.length) return { e, ...readiness(list, e.date) };
    }
    return null;
  });
  const ring = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

  const week = $derived(forecast(7));
  const wmax = $derived(Math.max(1, ...week.map((d) => d.n)));
  const done = $derived(dayRev());
  const remembered = $derived(done.reviews ? Math.round(((done.reviews - done.again) / done.reviews) * 100) : null);
  const dayName = (k: string, i: number) => (i === 0 ? "Today" : fromKey(k).toLocaleDateString("en-US", { weekday: "short" }));

  let editOpen = $state(false);
  let editId = $state<string | null>(null);
  let importOpen = $state(false);
  const options = (id: string | null) => {
    editId = id;
    editOpen = true;
  };

  // Space = study everything, A = add a card (not while typing or in a dialog)
  function onKey(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable], dialog")) return;
    if (e.key === " " && today) {
      e.preventDefault();
      location.hash = "#/study/cards/review/all";
    } else if (e.key === "a") {
      e.preventDefault();
      location.hash = "#/study/cards/add";
    }
  }
  onMount(() => window.addEventListener("keydown", onKey));
  onDestroy(() => window.removeEventListener("keydown", onKey));
  const examCourse = $derived(exam ? courseByName(exam.e.course)?.[1] : undefined);
</script>

<DeckEditor bind:open={editOpen} id={editId} />
<ImportDialog bind:open={importOpen} />

<div class="home">
  <section class="hero">
    <div class="big"><b>{today}</b><small>due today</small></div>
    <div class="trio">
      <span><b class="n new">{all.newToday}</b><small>new</small></span>
      <span><b class="n learn">{all.learning}</b><small>learning</small></span>
      <span><b class="n due">{reviews}</b><small>to review</small></span>
      {#if today}<span><b>~{minutes} min</b><small>at your pace</small></span>{/if}
    </div>
    {#if today}
      <a class="btn dark go" href="#/study/cards/review/all"><Icon name="play" size={15} /> Study everything <kbd>Space</kbd></a>
    {:else if all.total}
      <span class="caught">All caught up 🎉</span>
    {/if}
  </section>

  <div class="cols">
    <section class="card list">
      {#if !all.total && !groups.some((g) => g.title === "My decks")}
        <div class="empty">
          <p>No cards yet.</p>
          <ul class="how">
            <li><code>Question :: answer</code><span>card</span></li>
            <li><code>Term ::: meaning</code><span>both ways</span></li>
            <li><code>Start {"{{SGLT2i}}"} first</code><span>cloze</span></li>
          </ul>
        </div>
      {:else}
        <DeckRows {groups} onoptions={(id) => options(id)} />
      {/if}
      <div class="foot">
        <a class="btn dark" href="#/study/cards/add"><Icon name="i:plus" size={15} /> Add card <kbd>A</kbd></a>
        <button type="button" class="btn" onclick={() => options(null)}><Icon name="i:plus" size={15} /> Create deck</button>
        <button type="button" class="btn" onclick={() => (importOpen = true)}><Icon name="external" size={15} /> Import</button>
      </div>
    </section>

    <aside class="side">
      {#if exam}
        <section class="card">
          <h3>Exams</h3>
          <div class="exam">
            <span class="ring" style="--p: {ring(exam.ready, exam.total)}%"><b>{ring(exam.ready, exam.total)}%</b></span>
            <span><b>{examCourse?.code ? `${examCourse.code} ` : ""}{shortExam(exam.e)}</b><br /><span class="small muted">{exam.e.days === 0 ? "today" : `in ${exam.e.days} ${exam.e.days === 1 ? "day" : "days"}`} · {exam.ready} cards ready of {exam.total}</span></span>
          </div>
        </section>
      {/if}
      <section class="card">
        <h3>Next 7 days</h3>
        <div class="bars" role="img" aria-label="Cards due each of the next 7 days">
          {#each week as d, i (d.date)}<i class:t={i === 0} style="height: {Math.max(4, (d.n / wmax) * 100)}%" title="{d.n} due"></i>{/each}
        </div>
        <div class="days">{#each week as d, i (d.date)}<span>{dayName(d.date, i)}</span>{/each}</div>
      </section>
      <section class="card">
        <h3>Today</h3>
        <div class="stat"><span class="muted">Studied</span><b>{done.reviews} {done.reviews === 1 ? "card" : "cards"} · {Math.round(done.ms / 60000)} min</b></div>
        <div class="stat"><span class="muted">Remembered</span><b>{remembered === null ? "–" : `${remembered}%`}</b></div>
      </section>
    </aside>
  </div>
</div>

<style>
  .home {
    display: grid;
    gap: 18px;
    container-type: inline-size;
  }
  .hero {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 22px;
    align-items: center;
    padding: 20px 24px;
    border-radius: 24px;
    background:
      radial-gradient(60% 120% at 0% 0%, color-mix(in srgb, var(--rose) 45%, transparent), transparent 60%),
      radial-gradient(60% 120% at 100% 100%, color-mix(in srgb, var(--sage) 45%, transparent), transparent 60%),
      var(--surface);
    box-shadow: var(--shadow);
  }
  .big {
    display: grid;
    line-height: 1;
  }
  .big b {
    font-size: 46px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .big small {
    margin-top: 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .trio {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    font-size: 14px;
  }
  .trio span {
    display: grid;
  }
  .trio b {
    font-size: 22px;
  }
  .trio small {
    color: var(--text-muted);
    font-size: 13px;
  }
  .n {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .n.new {
    color: var(--link-ink);
  }
  .n.learn {
    color: var(--alert-ink);
  }
  .n.due {
    color: var(--go-ink);
  }
  .btn.dark {
    background: var(--primary, var(--charcoal));
    color: var(--on-primary, var(--white));
  }
  .go {
    min-height: 46px;
    padding: 0 18px;
  }
  kbd {
    padding: 1px 6px;
    border-radius: 6px;
    background: color-mix(in srgb, currentColor 18%, transparent);
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 500;
    line-height: 1.4;
  }
  .caught {
    font-weight: 600;
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 18px;
    align-items: start;
  }
  @container (max-width: 920px) {
    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
    .hero {
      grid-template-columns: auto 1fr;
    }
    .go,
    .caught {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }
  .list {
    padding: 12px 10px;
    min-width: 0;
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-top: 10px;
    padding: 14px 12px 4px;
    border-top: 1px solid var(--hairline);
  }
  .side {
    display: grid;
    gap: 14px;
    min-width: 0;
  }
  .side .card {
    display: grid;
    gap: 8px;
  }
  h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }
  .exam {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: center;
    font-size: 14.5px;
  }
  .ring {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: conic-gradient(var(--sage-deep) 0 var(--p), color-mix(in srgb, var(--text) 8%, transparent) 0);
  }
  .ring b {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--surface-float, var(--surface));
    font-size: 14px;
  }
  .bars {
    display: flex;
    align-items: flex-end;
    gap: 7px;
    height: 84px;
    padding-top: 6px;
  }
  .bars i {
    flex: 1;
    border-radius: 6px 6px 3px 3px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--lavender) 80%, var(--white)), var(--periwinkle));
  }
  .bars i.t {
    background: linear-gradient(180deg, var(--sage), var(--sage-deep));
  }
  .days {
    display: flex;
    gap: 7px;
    font-size: 11px;
    color: var(--text-muted);
  }
  .days span {
    flex: 1;
    text-align: center;
  }
  .stat {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    padding: 2px 0;
  }
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 13px;
  }
  .empty {
    display: grid;
    gap: 10px;
    padding: 6px 12px;
  }
  .empty p {
    margin: 0;
    color: var(--text-muted);
  }
  .how {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
  }
  .how li {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .how code {
    padding: 4px 10px;
    border-radius: 8px;
    background: var(--panel);
    font-size: 13.5px;
  }
  .how span {
    font-size: 13px;
    color: var(--text-muted);
  }
</style>
