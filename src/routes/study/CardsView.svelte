<script lang="ts">
  // Study → Cards home (her Nov 18 pick "A + C combined"): the deck list is the home. Your own
  // decks, then each course (opens to its notes), notes without a course, and the card library;
  // each row opens the deck's own page (DeckPage.svelte). Due · New · Total per row like Anki.
  import BarChart from "../../lib/components/BarChart.svelte";
  import Icon from "../../lib/components/Icon.svelte";
  import { fromKey } from "../../lib/calendar";
  import { courses } from "../../lib/stores/courses.svelte";
  import { decks } from "../../lib/stores/decks.svelte";
  import { notes } from "../../lib/stores/notes.svelte";
  import { allCards, counts, dayRev, ensureIds, examReadiness, fitBeforeExam, forecast, scopeKey, type Scope } from "../../lib/stores/srs.svelte";
  import DeckEditor from "./DeckEditor.svelte";
  import ImportDialog from "./library/ImportDialog.svelte";

  const enc = (s: string) => encodeURIComponent(s);
  $effect(() => {
    if (notes.loaded) void ensureIds();
  });

  const all = $derived(counts());
  const today = $derived(dayRev());
  const ready = $derived(examReadiness());
  let fitted = $state<Record<string, number>>({});
  const ahead = $derived(forecast(14));
  const aheadBars = $derived(
    ahead.map((d, i) => ({
      x: fromKey(d.date).toLocaleDateString("en-US", { weekday: "narrow" }),
      parts: [{ v: d.n, colour: "var(--sage-deep)" }],
      tip: `${i === 0 ? "Today" : fromKey(d.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}\n${d.n} due`,
    })),
  );

  type Row = { scope: Scope; name: string; icon?: string; colour: string; k: ReturnType<typeof counts>; kids?: Row[] };
  const row = (scope: Scope, name: string, colour: string, icon?: string, kids?: Row[]): Row => ({ scope, name, colour, icon, k: counts(scope), kids });

  const noteRows = $derived.by(() => {
    const byCourse = new Map<string, Row[]>();
    const rels = new Set(allCards().filter((r) => r.note && r.card.lineId).map((r) => r.note!.rel));
    for (const rel of rels) {
      const e = notes.files[rel];
      if (!e) continue;
      const c = e.p.meta.course ? String(e.p.meta.course) : "";
      byCourse.set(c, [...(byCourse.get(c) ?? []), row({ kind: "note", rel }, e.p.title, "var(--hairline)", e.p.meta.icon ? String(e.p.meta.icon) : undefined)]);
    }
    for (const list of byCourse.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return byCourse;
  });
  const own = $derived(decks().map(([id, d]) => row({ kind: "deck", id }, d.name, "var(--lavender)", d.icon || "i:layers")));
  const courseRows = $derived(
    courses()
      .filter(([, c]) => !c.archived)
      .map(([, c]) => row({ kind: "course", name: c.name }, c.name, c.color, c.icon, noteRows.get(c.name)))
      .filter((r) => r.k.total),
  );
  const loose = $derived(noteRows.get("") ?? []);
  const lib = $derived(row({ kind: "library" }, "Card library", "var(--lavender)", "book"));

  // which course rows are open (per machine)
  let open = $state<string[]>(read());
  function read(): string[] {
    try {
      return JSON.parse(localStorage.getItem("mosaic.deckOpen") || "[]");
    } catch {
      return [];
    }
  }
  function toggle(k: string) {
    open = open.includes(k) ? open.filter((x) => x !== k) : [...open, k];
    try {
      localStorage.setItem("mosaic.deckOpen", JSON.stringify(open));
    } catch {}
  }
  let looseOpen = $state(false);

  let deckOpen = $state(false);
  let importOpen = $state(false);
</script>

<DeckEditor bind:open={deckOpen} id={null} />
<ImportDialog bind:open={importOpen} />

{#snippet deckRow(r: Row, child = false)}
  {@const key = scopeKey(r.scope)}
  {@const kids = r.kids?.length ? r.kids : null}
  <li class="drow" class:child style="--c: {r.colour}">
    {#if kids}
      <button type="button" class="tw" class:on={open.includes(key)} aria-label={open.includes(key) ? "Close" : "Open"} aria-expanded={open.includes(key)} onclick={() => toggle(key)}>
        <Icon name="i:chevron-right" size={15} />
      </button>
    {:else}<span class="tw"></span>{/if}
    <a class="dname" href="#/study/cards/deck/{enc(key)}">
      {#if r.icon}<span class="di"><Icon name={r.icon} size={17} /></span>{:else}<span class="dot"></span>{/if}
      <span class="nm">{r.name}</span>
    </a>
    <span class="n due" class:z={!r.k.due}>{r.k.due}</span>
    <span class="n new" class:z={!r.k.newToday}>{r.k.newToday}</span>
    <span class="n tot">{r.k.total}</span>
    <a class="btn quiet sm rv" class:off={!r.k.due && !r.k.newToday} href="#/study/cards/review/{enc(key)}">Review</a>
  </li>
  {#if kids && open.includes(key)}
    {#each kids as k (scopeKey(k.scope))}{@render deckRow(k, true)}{/each}
  {/if}
{/snippet}

<div class="cards">
  <section class="hero">
    <div class="big">
      <span class="label">Due now</span>
      <b class="display">{all.due}</b>
      <span>{all.newToday} new today · {all.learning} learning</span>
    </div>
    <div class="go">
      {#if all.due + all.newToday > 0}
        <a class="btn primary lg" href="#/study/cards/review/all"><Icon name="play" size={18} /> Review {all.due + all.newToday} cards</a>
      {:else if all.total}
        <p class="done">All caught up 🎉</p>
      {/if}
      <span class="links">
        <a href="#/study/cards/library"><Icon name="i:plus" size={15} /> Add card</a>
        <a href="#/study/cards/browse"><Icon name="search" size={15} /> Browse</a>
        <a href="#/study/cards/stats"><Icon name="i:chart-column" size={15} /> Stats</a>
        <button type="button" onclick={() => (importOpen = true)}><Icon name="external" size={15} /> Import</button>
      </span>
    </div>
  </section>

  {#if ready.length}
    <section class="exams">
      {#each ready as x (x.exam.key)}
        <div class="ex">
          <span class="exd"><b class="display">{x.exam.days}</b><small>{x.exam.days === 1 ? "day" : "days"}</small></span>
          <span class="ext">
            <b>{x.exam.title}</b>
            <span>{x.total} cards{x.late ? ` · ${x.late} due after the exam` : ""}{x.unseen ? ` · ${x.unseen} new` : ""}</span>
            {#if fitted[x.exam.key] !== undefined}<span class="okm">Moved {fitted[x.exam.key]} cards before the exam.</span>{/if}
          </span>
          <span class="exb">
            {#if x.late}<button type="button" class="btn quiet sm" onclick={() => (fitted = { ...fitted, [x.exam.key]: fitBeforeExam(x.exam.course, x.exam.date) })}>Fit before exam</button>{/if}
            <a class="btn sm" href="#/study/cards/cram/course:{enc(x.exam.course)}">Cram</a>
          </span>
        </div>
      {/each}
    </section>
  {/if}

  <div class="cols">
    <section class="card decks">
      <div class="dh">
        <h2 class="h2">Decks</h2>
        <button type="button" class="btn quiet sm" onclick={() => (deckOpen = true)}><Icon name="i:plus" size={15} /> New deck</button>
      </div>
      {#if !all.total && !own.length}
        <div class="empty">
          <p>No cards yet.</p>
          <ul class="how">
            <li><code>Question :: answer</code><span>card</span></li>
            <li><code>Term ::: meaning</code><span>both ways</span></li>
            <li><code>Start {"{{SGLT2i}}"} first</code><span>cloze</span></li>
          </ul>
          <div class="row2">
            <a class="btn quiet" href="#/study/notes">Open notes</a>
            <a class="btn quiet" href="#/study/cards/library">Add card</a>
            <button type="button" class="btn quiet" onclick={() => (importOpen = true)}>Import</button>
          </div>
        </div>
      {:else}
        <ul class="tree">
          <li class="drow head" aria-hidden="true"><span></span><span></span><span class="n">Due</span><span class="n">New</span><span class="n tot">Total</span><span></span></li>
          {#if own.length}
            {#each own as r (scopeKey(r.scope))}{@render deckRow(r)}{/each}
            <li class="sep" aria-hidden="true"></li>
          {/if}
          {#each courseRows as r (scopeKey(r.scope))}{@render deckRow(r)}{/each}
          {#if loose.length}
            <li class="drow" style="--c: var(--hairline)">
              <button type="button" class="tw" class:on={looseOpen} aria-label={looseOpen ? "Close" : "Open"} aria-expanded={looseOpen} onclick={() => (looseOpen = !looseOpen)}><Icon name="i:chevron-right" size={15} /></button>
              <button type="button" class="dname plain" onclick={() => (looseOpen = !looseOpen)}><span class="dot"></span><span class="nm">Other notes</span></button>
              <span class="n due" class:z={!loose.reduce((n, r) => n + r.k.due, 0)}>{loose.reduce((n, r) => n + r.k.due, 0)}</span>
              <span class="n new" class:z={!loose.reduce((n, r) => n + r.k.newToday, 0)}>{loose.reduce((n, r) => n + r.k.newToday, 0)}</span>
              <span class="n tot">{loose.reduce((n, r) => n + r.k.total, 0)}</span>
              <span></span>
            </li>
            {#if looseOpen}{#each loose as r (scopeKey(r.scope))}{@render deckRow(r, true)}{/each}{/if}
          {/if}
          {#if lib.k.total}{@render deckRow(lib)}{/if}
        </ul>
      {/if}
    </section>

    <aside class="side">
      <section class="card">
        <h2 class="h2">Today</h2>
        <div class="today">
          <span><b>{today.reviews}</b> reviews</span>
          <span><b>{Math.round(today.ms / 60000)}</b> min</span>
          <span><b>{today.new}</b> new</span>
        </div>
      </section>
      <section class="card">
        <h2 class="h2">Next 2 weeks</h2>
        <BarChart data={aheadBars} height={110} xEvery={1} label="Cards due per day for the next 14 days" />
      </section>
    </aside>
  </div>
</div>

<style>
  .cards {
    display: grid;
    gap: var(--gap);
    container-type: inline-size;
  }
  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
    padding: 24px 28px;
    border-radius: 30px;
    background: var(--hero);
    color: var(--on-hero);
    box-shadow: var(--shadow-lift);
  }
  .big {
    display: grid;
    line-height: 1.1;
  }
  .big .label {
    color: var(--on-hero);
    opacity: 0.7;
  }
  .big b {
    font-size: 64px;
    font-weight: 600;
  }
  .big span:last-child {
    color: color-mix(in srgb, var(--peach) 50%, var(--on-hero));
  }
  .go {
    display: grid;
    gap: 12px;
    justify-items: end;
  }
  .lg {
    min-height: 54px;
    padding: 0 26px;
    font-size: 17px;
    background: var(--sage);
    color: var(--ink-on-color);
  }
  .done {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .links a,
  .links button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    padding: 0 14px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--on-hero) 10%, transparent);
    color: var(--on-hero);
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
  }
  .links a:hover,
  .links button:hover {
    background: color-mix(in srgb, var(--on-hero) 18%, transparent);
  }
  .exams {
    display: grid;
    gap: 10px;
  }
  .ex {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    padding: 12px 16px;
    border-radius: 20px;
    background: var(--g-rose);
    box-shadow: var(--shadow);
  }
  .exd {
    display: grid;
    justify-items: center;
    min-width: 50px;
    line-height: 1;
  }
  .exd b {
    font-size: 30px;
    font-weight: 600;
  }
  .exd small {
    font-size: 12px;
  }
  .ext {
    display: grid;
    gap: 2px;
    font-size: 13.5px;
  }
  .ext b {
    font-size: 15.5px;
    font-weight: 600;
  }
  .okm {
    font-weight: 600;
    color: var(--go-ink);
  }
  .exb {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .exb .btn:not(.quiet) {
    background: var(--surface);
  }
  .sm {
    min-height: 34px;
    padding: 0 14px;
    font-size: 13px;
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: var(--gap);
    align-items: start;
  }
  @container (max-width: 900px) {
    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .side {
    display: grid;
    gap: var(--gap);
    min-width: 0;
  }
  .side .card {
    display: grid;
    gap: 12px;
  }
  .h2 {
    margin: 0;
  }
  /* the deck list: name · due · new · total · Review */
  .decks {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  .dh,
  .drow {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) 48px 48px 56px 92px;
    gap: 6px;
    align-items: center;
  }
  .dh {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
  }
  .drow.head {
    min-height: 22px;
  }
  .drow.head:hover {
    background: none;
  }
  .drow.head .n {
    font-size: 11.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }
  .tree {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 2px;
  }
  .drow {
    min-height: 46px;
    padding: 0 6px;
    border-radius: 14px;
  }
  .drow:hover {
    background: color-mix(in srgb, var(--c) 14%, var(--chip));
  }
  .drow.child .dname {
    padding-left: 22px;
  }
  .tw {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }
  .tw :global(svg) {
    transition: transform 0.18s var(--ease-out, ease);
  }
  .tw.on :global(svg) {
    transform: rotate(90deg);
  }
  .dname {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    color: var(--text);
    text-decoration: none;
    font-weight: 600;
    font-size: 15px;
  }
  .dname.plain {
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
    font-weight: 600;
    font-size: 15px;
    text-align: left;
    cursor: pointer;
  }
  .drow.child .dname {
    font-weight: 500;
    font-size: 14px;
  }
  .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dname:hover .nm {
    text-decoration: underline;
  }
  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    margin: 0 4px;
    border-radius: 50%;
    background: var(--c);
  }
  .di {
    flex: none;
    display: grid;
    place-items: center;
    width: 18px;
  }
  .n {
    text-align: right;
    font-size: 14.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .n.due {
    color: var(--go-ink);
  }
  .n.new {
    color: var(--link-ink);
  }
  .n.tot {
    font-weight: 500;
    color: var(--text-muted);
  }
  .n.z {
    color: var(--text-muted);
    opacity: 0.5;
  }
  .rv {
    justify-self: end;
  }
  .off {
    opacity: 0.4;
  }
  .sep {
    height: 1px;
    margin: 6px 0;
    background: var(--hairline);
  }
  @container (max-width: 560px) {
    .drow {
      grid-template-columns: 26px minmax(0, 1fr) 40px 40px 0 84px;
    }
    .n.tot {
      display: none;
    }
  }
  .empty {
    display: grid;
    gap: 12px;
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
  .row2 {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .today {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .today span {
    display: grid;
  }
  .today b {
    font-size: 24px;
    font-weight: 600;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
</style>
