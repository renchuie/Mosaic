<script lang="ts">
  // Flashcard stats (F1, #/study/cards/stats): reviews and time per day, retention, card states,
  // intervals, the next 30 days, recall by course, and the most-forgotten cards.
  // Day counts come from "reviewDays" (all cards together); everything about cards comes from
  // their FSRS records, so it can be split by course.
  import BarChart from "../../lib/components/BarChart.svelte";
  import Icon from "../../lib/components/Icon.svelte";
  import { cardHtml } from "../../lib/cards";
  import { addDays, fromKey, todayKey } from "../../lib/calendar";
  import { courseByName } from "../../lib/stores/courses.svelte";
  import { notes } from "../../lib/stores/notes.svelte";
  import { allCards, dayRev, ensureIds, forecast, recallOf, type CardRef } from "../../lib/stores/srs.svelte";

  $effect(() => {
    if (notes.loaded) void ensureIds();
  });

  let range = $state<30 | 90 | 365>(30);
  const C = { review: "var(--sage-deep)", fresh: "var(--periwinkle)", again: "var(--rose-deep)", time: "color-mix(in srgb, var(--peach) 60%, var(--rose-deep))", ahead: "var(--lavender)" };

  const fmtDay = (k: string) => fromKey(k).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const fmtMin = (ms: number) => {
    const m = Math.round(ms / 60000);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  };

  // ---- days -----------------------------------------------------------------------------
  const days = $derived(Array.from({ length: range }, (_, i) => addDays(todayKey(), i - range + 1)).map((k) => ({ k, r: dayRev(k) })));
  const sum = $derived.by(() => {
    let reviews = 0, again = 0, fresh = 0, ms = 0, studied = 0;
    for (const { r } of days) {
      reviews += r.reviews;
      again += r.again;
      fresh += r.new;
      ms += r.ms;
      if (r.reviews) studied++;
    }
    return { reviews, again, fresh, ms, studied, retention: reviews ? (reviews - again) / reviews : null };
  });
  const streak = $derived.by(() => {
    let n = 0;
    let k = todayKey();
    if (!dayRev(k).reviews) k = addDays(k, -1); // today not done yet doesn't break it
    while (dayRev(k).reviews) {
      n++;
      k = addDays(k, -1);
    }
    return n;
  });
  // a year is shown by week (52 bars), shorter ranges by day
  const buckets = $derived.by(() => {
    const size = range === 365 ? 7 : 1;
    const out: { k: string; reviews: number; again: number; fresh: number; ms: number }[] = [];
    for (let i = days.length % size; i < days.length; i += size) {
      const part = days.slice(i, i + size);
      out.push({
        k: part[0].k,
        reviews: part.reduce((n, d) => n + d.r.reviews, 0),
        again: part.reduce((n, d) => n + d.r.again, 0),
        fresh: part.reduce((n, d) => n + d.r.new, 0),
        ms: part.reduce((n, d) => n + d.r.ms, 0),
      });
    }
    return { size, out };
  });
  const when = (k: string) => (buckets.size === 7 ? `Week of ${fmtDay(k)}` : fromKey(k).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
  const reviewBars = $derived(
    buckets.out.map((b) => {
      const ok = Math.max(0, b.reviews - b.again - b.fresh);
      return {
        x: fmtDay(b.k),
        parts: [
          { v: b.again, colour: C.again },
          { v: Math.min(b.fresh, b.reviews - b.again), colour: C.fresh },
          { v: ok, colour: C.review },
        ],
        tip: `${when(b.k)}\n${b.reviews} reviews · ${b.fresh} new · ${b.again} again`,
      };
    }),
  );
  const timeBars = $derived(buckets.out.map((b) => ({ x: fmtDay(b.k), parts: [{ v: Math.round(b.ms / 60000), colour: C.time }], tip: `${when(b.k)}\n${fmtMin(b.ms)}` })));
  const ahead = $derived(forecast(30));
  const aheadBars = $derived(ahead.map((d, i) => ({ x: i === 0 ? "Today" : fmtDay(d.date), parts: [{ v: d.n, colour: C.ahead }], tip: `${i === 0 ? "Today (and overdue)" : when(d.date)}\n${d.n} due` })));

  // ---- cards ----------------------------------------------------------------------------
  const refs = $derived(allCards().filter((r) => r.card.lineId));
  const now = Date.now();
  const kind = (r: CardRef) =>
    !r.rec ? "new" : r.rec.suspended ? "suspended" : r.rec.state === 1 || r.rec.state === 3 ? "learning" : r.rec.scheduled_days >= 21 ? "mature" : "young";
  const STATES = [
    { id: "new", name: "New", colour: "var(--periwinkle)" },
    { id: "learning", name: "Learning", colour: "var(--peach)" },
    { id: "young", name: "Young", colour: "var(--sage)" },
    { id: "mature", name: "Mature", colour: "var(--sage-deep)" },
    { id: "suspended", name: "Suspended", colour: "var(--hairline)" },
  ] as const;
  const states = $derived.by(() => {
    const n: Record<string, number> = { new: 0, learning: 0, young: 0, mature: 0, suspended: 0 };
    for (const r of refs) n[kind(r)]++;
    return n;
  });
  const recall = $derived.by(() => {
    const seen = refs.filter((r) => r.rec && !r.rec.suspended && r.rec.state !== 0);
    return seen.length ? seen.reduce((n, r) => n + recallOf(r.rec!, now), 0) / seen.length : null;
  });

  const IV = [
    { name: "1 d", max: 1 },
    { name: "2–3 d", max: 3 },
    { name: "4–7 d", max: 7 },
    { name: "1–2 wk", max: 14 },
    { name: "2–3 wk", max: 21 },
    { name: "3 wk–1 mo", max: 31 },
    { name: "1–3 mo", max: 92 },
    { name: "3–6 mo", max: 183 },
    { name: "6 mo+", max: Infinity },
  ];
  const intervals = $derived.by(() => {
    const n = IV.map(() => 0);
    for (const r of refs) {
      if (!r.rec || r.rec.suspended || r.rec.state !== 2) continue;
      n[IV.findIndex((b) => r.rec!.scheduled_days <= b.max)]++;
    }
    return IV.map((b, i) => ({ x: b.name, parts: [{ v: n[i], colour: C.review }], tip: `${b.name}\n${n[i]} cards` }));
  });

  const byCourse = $derived.by(() => {
    const g = new Map<string, CardRef[]>();
    for (const r of refs) {
      const k = r.course ?? "";
      g.set(k, [...(g.get(k) ?? []), r]);
    }
    return [...g]
      .map(([name, list]) => {
        const seen = list.filter((r) => r.rec && !r.rec.suspended && r.rec.state !== 0);
        const c = name ? courseByName(name) : undefined;
        return {
          name: name ? (c?.[1].code || name) : "No course",
          colour: c?.[1].color ?? "var(--hairline)",
          total: list.length,
          mature: list.filter((r) => kind(r) === "mature").length,
          fresh: list.filter((r) => !r.rec).length,
          recall: seen.length ? seen.reduce((n, r) => n + recallOf(r.rec!, now), 0) / seen.length : null,
        };
      })
      .sort((a, b) => b.total - a.total);
  });

  const plain = (md: string) => cardHtml(md).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  const hardest = $derived(
    refs
      .filter((r) => r.rec && r.rec.lapses > 0)
      .sort((a, b) => b.rec!.lapses - a.rec!.lapses || a.rec!.stability - b.rec!.stability)
      .slice(0, 8),
  );
  const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
</script>

<div class="stats">
  <header class="top">
    <a class="back" href="#/study/cards" aria-label="Back to Cards"><Icon name="back" size={18} /></a>
    <h1 class="h1">Stats</h1>
    <div class="seg" role="radiogroup" aria-label="Range">
      {#each [[30, "Month"], [90, "3 months"], [365, "Year"]] as [v, n]}
        <button type="button" role="radio" aria-checked={range === v} class:on={range === v} onclick={() => (range = v as 30 | 90 | 365)}>{n}</button>
      {/each}
    </div>
  </header>

  <div class="tiles">
    <div class="tile"><span class="label">Reviews</span><b>{sum.reviews.toLocaleString()}</b><span class="sub">{sum.fresh} new cards</span></div>
    <div class="tile"><span class="label">Time</span><b>{fmtMin(sum.ms)}</b><span class="sub">{sum.studied ? `${fmtMin(sum.ms / sum.studied)} a study day` : "–"}</span></div>
    <div class="tile"><span class="label">Days studied</span><b>{sum.studied}<small>&nbsp;/ {range}</small></b><span class="sub">Streak {streak} {streak === 1 ? "day" : "days"}</span></div>
    <div class="tile"><span class="label">Retention</span><b>{pct(sum.retention)}</b><span class="sub">Hard, Good or Easy</span></div>
    <div class="tile"><span class="label">Recall now</span><b>{pct(recall)}</b><span class="sub">Average of seen cards</span></div>
  </div>

  <div class="grid2">
    <section class="card wide">
      <div class="ch"><h2 class="h2">Reviews</h2>
        <span class="legend"><i style="background: {C.review}"></i>Remembered <i style="background: {C.fresh}"></i>New <i style="background: {C.again}"></i>Again</span>
      </div>
      <BarChart data={reviewBars} label="Reviews per {buckets.size === 7 ? 'week' : 'day'}" />
    </section>

    <section class="card">
      <h2 class="h2">Time</h2>
      <BarChart data={timeBars} height={120} label="Minutes of review per {buckets.size === 7 ? 'week' : 'day'}" />
    </section>

    <section class="card">
      <h2 class="h2">Next 30 days</h2>
      <BarChart data={aheadBars} height={120} label="Cards due per day for the next 30 days" />
    </section>

    <section class="card">
      <h2 class="h2">Cards</h2>
      <div class="sbar" role="img" aria-label="Cards by state">
        {#each STATES as s (s.id)}{#if states[s.id]}<span style="flex: {states[s.id]} 1 0; background: {s.colour}" title="{s.name}: {states[s.id]}"></span>{/if}{/each}
      </div>
      <ul class="slist">
        {#each STATES as s (s.id)}
          <li><i style="background: {s.colour}"></i>{s.name}<b>{states[s.id]}</b></li>
        {/each}
      </ul>
    </section>

    <section class="card">
      <h2 class="h2">Intervals</h2>
      <BarChart data={intervals} height={120} xEvery={2} label="Review cards by interval" />
    </section>

    <section class="card">
      <h2 class="h2">By course</h2>
      {#if byCourse.length}
        <table class="tbl">
          <thead><tr><th>Course</th><th class="n">Cards</th><th class="n">Mature</th><th>Recall now</th></tr></thead>
          <tbody>
            {#each byCourse as c (c.name)}
              <tr>
                <td><span class="dot" style="background: {c.colour}"></span>{c.name}</td>
                <td class="n">{c.total}</td>
                <td class="n">{c.mature}</td>
                <td>
                  {#if c.recall === null}<span class="muted">Not started</span>
                  {:else}<span class="meter"><span style="width: {c.recall * 100}%"></span></span><span class="pc">{pct(c.recall)}</span>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}<p class="muted">No cards yet.</p>{/if}
    </section>

    <section class="card">
      <h2 class="h2">Most forgotten</h2>
      {#if hardest.length}
        <ol class="hard">
          {#each hardest as r (r.card.key)}
            <li><a href={r.href}>{plain(r.card.front) || r.title}</a><span class="lap">{r.rec!.lapses}×</span></li>
          {/each}
        </ol>
      {:else}<p class="muted">Nothing forgotten yet.</p>{/if}
    </section>
  </div>
</div>

<style>
  .stats {
    display: grid;
    gap: var(--gap);
    container-type: inline-size;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .back {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--chip);
    color: var(--text);
  }
  .h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 600;
  }
  .seg {
    margin-left: auto;
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--chip);
  }
  .seg button {
    padding: 7px 14px;
    border: 0;
    border-radius: 999px;
    background: none;
    color: var(--text-muted);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .seg button.on {
    background: var(--surface, var(--white));
    color: var(--text);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--gap);
  }
  .tile {
    display: grid;
    gap: 2px;
    padding: 16px 20px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .tile b {
    font-size: 30px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .tile small {
    font-size: 15px;
    font-weight: 500;
    color: var(--text-muted);
  }
  .sub {
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--gap);
  }
  @container (max-width: 820px) {
    .grid2 {
      grid-template-columns: 1fr;
    }
  }
  .card {
    display: grid;
    align-content: start;
    gap: 16px;
    min-width: 0;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .h2 {
    margin: 0;
  }
  .ch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .legend i,
  .slist i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    margin-left: 6px;
  }
  .sbar {
    display: flex;
    gap: 2px;
    height: 18px;
    border-radius: 6px;
    overflow: hidden;
  }
  .slist {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
    font-size: 14px;
  }
  .slist li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .slist i {
    margin: 0;
  }
  .slist b {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
  .tbl {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  .tbl th {
    text-align: left;
    font-size: 11.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    padding: 0 8px 8px 0;
  }
  .tbl td {
    padding: 8px 8px 8px 0;
    border-top: 1px solid var(--hairline);
    white-space: nowrap;
  }
  .tbl .n {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    margin-right: 8px;
  }
  .meter {
    display: inline-block;
    width: 90px;
    height: 8px;
    border-radius: 4px;
    background: var(--track, var(--chip));
    vertical-align: middle;
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    border-radius: 4px;
    background: var(--sage-deep);
  }
  .pc {
    margin-left: 8px;
    font-variant-numeric: tabular-nums;
  }
  .hard {
    margin: 0;
    padding: 0 0 0 20px;
    display: grid;
    gap: 8px;
    font-size: 14px;
  }
  .hard li {
    display: flex;
    gap: 10px;
  }
  .hard a {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
  }
  .lap {
    color: var(--alert-ink);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--text-muted);
  }
</style>
