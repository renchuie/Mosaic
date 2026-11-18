<script lang="ts">
  import Icon from "../../lib/components/Icon.svelte";
  import { cardHtml } from "../../lib/cards";
  import { fromKey } from "../../lib/calendar";
  import { courseByName, courses } from "../../lib/stores/courses.svelte";
  import { noteHref, notes } from "../../lib/stores/notes.svelte";
  import { saveSettings, settings } from "../../lib/stores/settings.svelte";
  import { allCards, counts, dayRev, ensureIds, examReadiness, fitBeforeExam, fmtInterval, forecast, retention, setSuspended, statusOf } from "../../lib/stores/srs.svelte";
  import { items } from "../../lib/stores/library.svelte";

  const enc = (s: string) => encodeURIComponent(s);
  let backfilled = $state(0);
  $effect(() => {
    if (notes.loaded) void ensureIds().then((n) => (backfilled += n));
  });

  const all = $derived(counts());
  const fc = $derived(forecast(14));
  const fmax = $derived(Math.max(1, ...fc.map((x) => x.n)));
  const ret = $derived(retention(30));
  const today = $derived(dayRev());
  const refs = $derived(allCards());
  const byCourse = $derived(
    courses()
      .map(([id, c]) => ({ id, c, k: counts({ kind: "course", name: c.name }) }))
      .filter((x) => x.k.total),
  );
  const lib = $derived(counts({ kind: "library" }));
  const ready = $derived(examReadiness());
  let fitted = $state<Record<string, number>>({});
  const byNote = $derived(
    [...new Set(refs.filter((r) => r.note).map((r) => r.note!.rel))]
      .map((rel) => ({ rel, e: notes.files[rel], k: counts({ kind: "note", rel }) }))
      .filter((x) => x.e && x.k.total)
      .sort((a, b) => b.k.due + b.k.newToday - (a.k.due + a.k.newToday) || b.k.total - a.k.total),
  );

</script>

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
        <p class="done">All caught up for now 🎉</p>
      {/if}
      <p class="muted small">{all.total} cards{backfilled ? ` · ${backfilled} new found in notes` : ""}</p>
      <span class="links">
        <a class="libbtn" href="#/study/cards/browse"><Icon name="search" size={15} /> Browse</a>
        <a class="libbtn" href="#/study/cards/library"><Icon name="book" size={15} /> Card library</a>
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
            <span>
              {x.total} cards{x.late ? ` · ${x.late} due after the exam` : ""}{x.unseen ? ` · ${x.unseen} new` : ""}
            </span>
            {#if fitted[x.exam.key] !== undefined}<span class="okm">Moved {fitted[x.exam.key]} cards to the days before the exam.</span>{/if}
          </span>
          <span class="exb">
            {#if x.late}<button type="button" class="btn quiet sm" onclick={() => (fitted = { ...fitted, [x.exam.key]: fitBeforeExam(x.exam.course, x.exam.date) })}>Fit before exam</button>{/if}
            <a class="btn sm" href="#/study/cards/cram/course:{enc(x.exam.course)}">Cram</a>
          </span>
        </div>
      {/each}
    </section>
  {/if}

  {#if !all.total}
    <section class="card how">
      <h2 class="h2">Write cards right in your notes</h2>
      <ul>
        <li><code>ACE inhibitor cough :: bradykinin build-up</code> <span>basic card</span></li>
        <li><code>Digoxin ::: narrow therapeutic index</code> <span>two cards, both ways</span></li>
        <li><code>Start {"{{SGLT2i}}"} regardless of diabetes</code> <span>cloze (hide the part in braces)</span></li>
        <li><code>Four pillars of GDMT ::</code> with bullets indented under it <span>list card</span></li>
        <li><code>:: table</code> on the line above a table <span>one card per filled cell</span></li>
      </ul>
      <div class="row2"><a class="btn quiet" href="#/study/notes">Open notes</a><a class="btn quiet" href="#/study/cards/library">Or use the card library</a></div>
    </section>
  {:else}
    <div class="stats">
      <div class="card"><span class="label">Total</span><b class="display">{all.total}</b><span class="muted">{all.new} not seen yet</span></div>
      <div class="card"><span class="label">Mature</span><b class="display">{all.mature}</b><span class="muted">interval ≥ 3 weeks</span></div>
      <div class="card"><span class="label">Retention</span><b class="display">{ret === null ? "–" : `${Math.round(ret * 100)}%`}</b><span class="muted">last 30 days</span></div>
      <div class="card"><span class="label">Today</span><b class="display">{today.reviews}</b><span class="muted">reviews · {Math.round(today.ms / 60000)} min</span></div>
    </div>

    <div class="cols">
      <div class="main">
        <section class="card">
          <h2 class="h2">Decks</h2>
          <ul class="decks">
            {#each byCourse as d (d.id)}
              <li style="--c: {d.c.color}">
                <span class="dot"></span><b>{d.c.name}</b>
                <span class="nums"><span class="n-due">{d.k.due}</span><span class="n-new">{d.k.newToday}</span><span class="muted">{d.k.total}</span></span>
                <a class="btn quiet sm" href="#/study/cards/review/course:{enc(d.c.name)}" class:off={!d.k.due && !d.k.newToday}>Review</a>
                <a class="cram" href="#/study/cards/cram/course:{enc(d.c.name)}" title="Practice without changing the schedule">Cram</a>
              </li>
            {/each}
          </ul>
          {#if lib.total}
            <h3 class="label sub">Card library</h3>
            <ul class="decks">
              <li style="--c: #cdb4f7">
                <span class="dot"></span><a class="nl" href="#/study/cards/library">All library cards</a>
                <span class="nums"><span class="n-due">{lib.due}</span><span class="n-new">{lib.newToday}</span><span class="muted">{lib.total}</span></span>
                <a class="btn quiet sm" href="#/study/cards/review/library" class:off={!lib.due && !lib.newToday}>Review</a>
              </li>
            </ul>
          {/if}
          <h3 class="label sub">By note</h3>
          <ul class="decks">
            {#each byNote as d (d.rel)}
              {@const c = d.e.p.meta.course ? courseByName(String(d.e.p.meta.course)) : undefined}
              <li style="--c: {c ? c[1].color : 'var(--hairline)'}">
                <span class="dot"></span><a class="nl" href={noteHref(d.rel)}>{d.e.p.title}</a>
                <span class="nums"><span class="n-due">{d.k.due}</span><span class="n-new">{d.k.newToday}</span><span class="muted">{d.k.total}</span></span>
                <a class="btn quiet sm" href="#/study/cards/review/note:{enc(d.rel)}" class:off={!d.k.due && !d.k.newToday}>Review</a>
              </li>
            {/each}
          </ul>
          <p class="legend muted"><span class="n-due">due</span> <span class="n-new">new today</span> total</p>
        </section>


      </div>

      <aside class="side">
        <section class="card">
          <h2 class="h2">Next 2 weeks</h2>
          <div class="fc" role="img" aria-label="Reviews due per day for the next 14 days">
            {#each fc as d, i (d.date)}
              <div class="col" title="{fromKey(d.date).toDateString()}: {d.n} reviews">
                <span class="v">{d.n || ""}</span>
                <span class="bar" style="height: {(d.n / fmax) * 100}%"></span>
                <span class="d" class:today={i === 0}>{fromKey(d.date).toLocaleDateString("en-US", { weekday: "narrow" })}</span>
              </div>
            {/each}
          </div>
        </section>
        <section class="card">
          <h2 class="h2">Settings</h2>
          <label class="field"><span class="label">New cards per day</span>
            <input class="input" type="number" min="0" max="500" value={settings.newPerDay} onchange={(e) => saveSettings({ newPerDay: Math.max(0, Number(e.currentTarget.value) || 0) })} /></label>
          <label class="field"><span class="label">Target retention</span>
            <select class="input" value={String(settings.retention)} onchange={(e) => saveSettings({ retention: Number(e.currentTarget.value) })}>
              {#each [0.8, 0.85, 0.9, 0.93, 0.95] as r}<option value={String(r)}>{Math.round(r * 100)}%{r === 0.9 ? " (recommended)" : r >= 0.93 ? " (more reviews)" : " (fewer reviews)"}</option>{/each}
            </select></label>
          <label class="chk"><input type="checkbox" checked={settings.examAware} onchange={(e) => saveSettings({ examAware: e.currentTarget.checked })} /> Due before the course's next exam</label>
          <p class="muted small">Higher retention means more reviews.</p>
        </section>
      </aside>
    </div>
  {/if}
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
    /* peach that stays readable on a dark hero AND on the frosted white one */
    color: color-mix(in srgb, var(--peach) 50%, var(--on-hero));
  }
  .go {
    display: grid;
    gap: 8px;
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
    font-size: 18px;
    font-weight: 600;
  }
  .go .muted {
    color: color-mix(in srgb, var(--on-hero) 72%, transparent);
  }
  .small {
    font-size: 13.5px;
  }
  .how ul {
    list-style: none;
    margin: 12px 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .how li {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .how code,
  .card code {
    padding: 4px 10px;
    border-radius: 8px;
    background: var(--panel);
    font-size: 13.5px;
  }
  .how li span {
    color: var(--text-muted);
    font-size: 13.5px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  @container (max-width: 700px) {
    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .stats .card {
    display: grid;
    padding: 14px 16px;
  }
  .stats b {
    font-size: 28px;
    font-weight: 600;
  }
  .stats .muted {
    font-size: 12.5px;
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: var(--gap);
    align-items: start;
  }
  @container (max-width: 900px) {
    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .main,
  .side {
    display: grid;
    gap: var(--gap);
    min-width: 0;
  }
  .side .card {
    display: grid;
    gap: 10px;
  }
  .decks {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .decks li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto auto;
    gap: 12px;
    align-items: center;
    min-height: 46px;
    padding: 0 6px 0 12px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--c) 18%, var(--white));
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c);
  }
  .decks b,
  .nl {
    font-weight: 600;
    font-size: 14.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-decoration: none;
  }
  .nums {
    display: inline-flex;
    gap: 12px;
    font-size: 14px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .n-due {
    color: var(--go-ink);
  }
  .n-new {
    color: var(--link-ink);
  }
  .nums .muted {
    font-weight: 500;
  }
  .cram {
    font-size: 12.5px;
    color: var(--text-muted);
    padding: 0 6px;
  }
  .decks li > .btn:last-child {
    grid-column: span 2;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .libbtn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--on-hero);
    font-size: 14px;
    font-weight: 600;
    opacity: 0.9;
  }
  .row2 {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .chk {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    font-size: 13.5px;
    cursor: pointer;
  }
  .chk input {
    width: 17px;
    height: 17px;
    margin-top: 2px;
    accent-color: var(--sage-deep);
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
  .off {
    opacity: 0.45;
  }
  .sub {
    display: block;
    margin-top: 16px;
  }
  .legend {
    margin-top: 8px;
    font-size: 12px;
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
  .fc {
    display: grid;
    grid-template-columns: repeat(14, minmax(0, 1fr));
    gap: 4px;
    height: 150px;
    align-items: end;
  }
  .col {
    display: grid;
    grid-template-rows: auto 1fr auto;
    justify-items: center;
    height: 100%;
    align-items: end;
  }
  .v {
    font-size: 10.5px;
    color: var(--text-muted);
  }
  .bar {
    width: 100%;
    min-height: 2px;
    border-radius: 6px 6px 2px 2px;
    background: linear-gradient(180deg, var(--sage), var(--sage-deep));
  }
  .d.today {
    font-weight: 700;
    color: var(--text);
  }
  .d {
    font-size: 10.5px;
    color: var(--text-muted);
    padding-top: 4px;
  }
</style>
