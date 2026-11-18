<script lang="ts">
  // Stats (canvas board "Study modes and stats" → Stats tab): by deck and by week / month / term /
  // year. Studied, remembered against the goal, streak, cards known well; every day studied as a
  // heatmap; where the cards are (donut); remembered by week (with the goal line); the next 30
  // days with the exam marked; intervals; the hardest cards, one click from a review.
  // Day counts (reviewDays) exist only for all cards together, so the day-based parts show every
  // deck; the card-based parts follow the deck chosen.
  import BarChart from "../../lib/components/BarChart.svelte";
  import { addDays, fromKey, todayKey, toKey } from "../../lib/calendar";
  import { exams } from "../../lib/stores/calendar.svelte";
  import { deckGroups, shortExam, typeLabel } from "../../lib/stores/deckTree.svelte";
  import { notes } from "../../lib/stores/notes.svelte";
  import { settings } from "../../lib/stores/settings.svelte";
  import { allCards, ensureIds, inScope, scopeKey, statusOf, type DayRev, type Scope } from "../../lib/stores/srs.svelte";
  import { entries } from "../../lib/stores/synced.svelte";
  import { plainOf } from "../../lib/play";

  $effect(() => {
    if (notes.loaded) void ensureIds();
  });
  const enc = (s: string) => encodeURIComponent(s);

  // ---- deck and range ----
  const chips = $derived(
    deckGroups()
      .filter((g) => g.title !== "Filtered")
      .flatMap((g) => g.rows)
      .slice(0, 6),
  );
  let scope = $state<Scope>({ kind: "all" });
  const skey = $derived(scopeKey(scope));
  type Range = "week" | "month" | "term" | "year";
  let range = $state<Range>("month");
  const fromDay = $derived.by(() => {
    const t = todayKey();
    if (range === "week") return addDays(t, -6);
    if (range === "month") return addDays(t, -29);
    if (range === "year") return addDays(t, -364);
    // term: from mid-August (fall) or mid-January (spring)
    const d = new Date();
    const start = d.getMonth() >= 7 ? new Date(d.getFullYear(), 7, 15) : d.getMonth() >= 0 && d.getMonth() < 5 ? new Date(d.getFullYear(), 0, 10) : new Date(d.getFullYear(), 4, 15);
    return toKey(start);
  });
  const RANGE_NAME: Record<Range, string> = { week: "this week", month: "this month", term: "this term", year: "this year" };

  // ---- days (all decks) ----
  const days = $derived(entries<DayRev>("reviewDays"));
  const inRange = $derived(days.filter(([d]) => d >= fromDay && d <= todayKey()));
  const studied = $derived(inRange.reduce((n, [, r]) => n + r.reviews, 0));
  const minutes = $derived(Math.round(inRange.reduce((n, [, r]) => n + r.ms, 0) / 60000));
  const again = $derived(inRange.reduce((n, [, r]) => n + r.again, 0));
  const remembered = $derived(studied ? (studied - again) / studied : null);
  const goal = $derived(settings.retention || 0.9);
  const fmtTime = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

  const streaks = $derived.by(() => {
    const on = new Set(days.filter(([, r]) => r.reviews > 0).map(([d]) => d));
    let cur = 0;
    let k = todayKey();
    if (!on.has(k)) k = addDays(k, -1);
    while (on.has(k)) {
      cur++;
      k = addDays(k, -1);
    }
    let best = 0;
    for (const d of [...on].sort()) {
      if (on.has(addDays(d, -1))) continue;
      let n = 0;
      for (let x = d; on.has(x); x = addDays(x, 1)) n++;
      best = Math.max(best, n);
    }
    return { cur, best };
  });

  // heatmap: 26 weeks, Monday on top
  const heat = $derived.by(() => {
    const t = fromKey(todayKey());
    const end = addDays(todayKey(), (7 - ((t.getDay() + 6) % 7) - 1)); // the Sunday ending this week
    const start = addDays(end, -26 * 7 + 1);
    const byDay = new Map(days.map(([d, r]) => [d, r]));
    const out: { d: string; n: number; ms: number; future: boolean }[] = [];
    for (let i = 0; i < 26 * 7; i++) {
      const d = addDays(start, i);
      const r = byDay.get(d);
      out.push({ d, n: r?.reviews ?? 0, ms: r?.ms ?? 0, future: d > todayKey() });
    }
    const max = Math.max(1, ...out.map((x) => x.n));
    return out.map((x) => ({ ...x, lv: x.n ? Math.min(4, Math.ceil((x.n / max) * 4)) : 0 }));
  });
  const fmtDay = (d: string) => fromKey(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  // remembered by week: the last 10 weeks
  const weeks = $derived.by(() => {
    const out: { from: string; v: number | null; n: number }[] = [];
    for (let w = 9; w >= 0; w--) {
      const to = addDays(todayKey(), -w * 7);
      const from = addDays(to, -6);
      const rs = days.filter(([d]) => d >= from && d <= to);
      const n = rs.reduce((x, [, r]) => x + r.reviews, 0);
      const a = rs.reduce((x, [, r]) => x + r.again, 0);
      out.push({ from, v: n ? (n - a) / n : null, n });
    }
    return out;
  });
  const LW = 300, LH = 110;
  // the scale follows her numbers (and the goal), so a steady 85–92% isn't a flat line at the top
  const lo = $derived(Math.max(0, Math.floor((Math.min(goal, ...weeks.filter((w) => w.v !== null).map((w) => w.v!)) - 0.05) * 20) / 20));
  const ly = (v: number) => LH - 10 - ((Math.max(lo, v) - lo) / Math.max(0.05, 1 - lo)) * (LH - 20);
  const lx = (i: number) => 6 + (i / 9) * (LW - 12);
  const linePts = $derived(weeks.map((w, i) => (w.v === null ? null : { x: lx(i), y: ly(w.v), w })).filter((p): p is NonNullable<typeof p> => !!p));

  // ---- cards (follow the deck chosen) ----
  const cards = $derived(allCards().filter((r) => r.card.lineId).filter(inScope(scope)));
  const kind = (r: (typeof cards)[number]) =>
    !r.rec || r.rec.state === 0 ? "new" : r.rec.suspended ? "paused" : r.rec.state === 1 || r.rec.state === 3 ? "learning" : r.rec.scheduled_days >= 21 ? "known" : "young";
  const PARTS = [
    { id: "new", name: "New", colour: "var(--link-ink)" },
    { id: "learning", name: "Learning", colour: "var(--alert-ink)" },
    { id: "young", name: "Young", colour: "var(--butter)" },
    { id: "known", name: "Known well", colour: "var(--go-ink)" },
    { id: "paused", name: "Paused", colour: "color-mix(in srgb, var(--text) 22%, transparent)" },
  ] as const;
  const parts = $derived.by(() => {
    const n: Record<string, number> = { new: 0, learning: 0, young: 0, known: 0, paused: 0 };
    for (const r of cards) n[kind(r)]++;
    return n;
  });
  const donut = $derived.by(() => {
    const total = cards.length || 1;
    let at = 0;
    return PARTS.map((p) => {
      const from = at;
      at += (parts[p.id] / total) * 100;
      return `${p.colour} ${from}% ${at}%`;
    }).join(", ");
  });

  // next 30 days, the deck's exam (or the next one) marked
  const nextExam = $derived(exams().find((e) => e.days >= 0 && e.days < 30 && (scope.kind === "all" || cards.some((r) => r.course === e.course))));
  const ahead = $derived.by(() => {
    const t = todayKey();
    const list = Array.from({ length: 30 }, (_, i) => ({ date: addDays(t, i), n: 0 }));
    for (const r of cards) {
      if (!r.rec || r.rec.suspended || r.rec.state === 0) continue;
      const d = toKey(new Date(r.rec.due));
      const i = d <= t ? 0 : list.findIndex((x) => x.date === d);
      if (i >= 0) list[i].n++;
    }
    return list.map((d, i) => ({
      x: i === 0 ? "" : fromKey(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      parts: [{ v: d.n, colour: nextExam?.date === d.date ? "var(--rose-deep)" : "color-mix(in srgb, var(--lavender) 70%, var(--periwinkle))" }],
      mark: nextExam?.date === d.date,
      tip: `${fmtDay(d.date)}\n${d.n} due${nextExam?.date === d.date ? ` · ${shortExam(nextExam)}` : ""}`,
    }));
  });

  // intervals
  const IV = [
    { name: "1 d", max: 1 },
    { name: "2–3 d", max: 3 },
    { name: "4–7 d", max: 7 },
    { name: "1–2 wk", max: 14 },
    { name: "2–3 wk", max: 21 },
    { name: "1 mo", max: 31 },
    { name: "1–3 mo", max: 92 },
    { name: "3 mo+", max: Infinity },
  ];
  const intervals = $derived.by(() => {
    const n = IV.map(() => 0);
    for (const r of cards) if (r.rec && !r.rec.suspended && r.rec.state === 2) n[IV.findIndex((b) => r.rec!.scheduled_days <= b.max)]++;
    return IV.map((b, i) => ({ x: b.name, parts: [{ v: n[i], colour: "var(--sage-deep)" }], tip: `${b.name}\n${n[i]} cards` }));
  });

  // hardest: most missed, still slipping
  const hardest = $derived(
    cards
      .filter((r) => r.rec && r.rec.lapses >= 1 && !r.rec.suspended)
      .sort((a, b) => b.rec!.lapses / Math.max(1, b.rec!.reps) - a.rec!.lapses / Math.max(1, a.rec!.reps) || b.rec!.lapses - a.rec!.lapses)
      .slice(0, 8),
  );
  const hardCount = $derived(cards.filter((r) => r.rec && !r.rec.suspended && r.rec.lapses >= 2).length);
  const STATE = { new: ["New", "n"], learning: ["Learning", "l"], review: ["Review", "r"], later: ["Review", "r"], suspended: ["Paused", "s"] } as const;
  const pct = (v: number | null) => (v === null ? "–" : `${Math.round(v * 100)}%`);
</script>

<div class="stats">
  <div class="bar">
    <div class="seg" role="radiogroup" aria-label="Deck">
      <button type="button" role="radio" aria-checked={skey === "all"} class:on={skey === "all"} onclick={() => (scope = { kind: "all" })}>All decks</button>
      {#each chips as c (c.key)}
        <button type="button" role="radio" aria-checked={skey === c.key} class:on={skey === c.key} onclick={() => (scope = c.scope)}>{c.name}</button>
      {/each}
    </div>
    <span class="grow"></span>
    <div class="seg" role="radiogroup" aria-label="Range">
      {#each [["week", "Week"], ["month", "Month"], ["term", "Term"], ["year", "Year"]] as [v, n]}
        <button type="button" role="radio" aria-checked={range === v} class:on={range === v} onclick={() => (range = v as Range)}>{n}</button>
      {/each}
    </div>
  </div>

  <div class="kpis">
    <div class="kpi"><span class="small muted">Studied {RANGE_NAME[range]}</span><b>{studied.toLocaleString()} {studied === 1 ? "card" : "cards"}</b><span class="small muted">{fmtTime(minutes)}</span></div>
    <div class="kpi"><span class="small muted">Remembered (reviews)</span><b class:good={remembered !== null && remembered >= goal}>{pct(remembered)}</b><span class="small muted">goal {Math.round(goal * 100)}%</span></div>
    <div class="kpi"><span class="small muted">Streak</span><b>{streaks.cur} {streaks.cur === 1 ? "day" : "days"}</b><span class="small muted">best {streaks.best}</span></div>
    <div class="kpi"><span class="small muted">Cards you know well</span><b>{parts.known.toLocaleString()}</b><span class="small muted">interval ≥ 21 days</span></div>
  </div>

  <div class="two">
    <section class="card">
      <h3>Every day you studied</h3>
      <div class="heat" role="img" aria-label="Cards studied per day, last 26 weeks">
        {#each heat as h (h.d)}<i class="h{h.lv}" class:fut={h.future} title={h.future ? "" : `${fmtDay(h.d)}: ${h.n} ${h.n === 1 ? "card" : "cards"} · ${Math.round(h.ms / 60000)} min`}></i>{/each}
      </div>
      <span class="small muted">Darker = more cards</span>
    </section>
    <section class="card">
      <h3>Where your cards are</h3>
      <div class="where">
        <span class="donut" style="background: conic-gradient({donut})"><b>{cards.length.toLocaleString()}<small>cards</small></b></span>
        <div class="leg">
          {#each PARTS as p (p.id)}<span><i class="dot" style="background: {p.colour}"></i>{p.name}<b>{parts[p.id]}</b></span>{/each}
        </div>
      </div>
    </section>
  </div>

  <div class="three">
    <section class="card">
      <h3>Remembered, by week</h3>
      <svg viewBox="0 0 {LW} {LH}" class="line" role="img" aria-label="Share of reviews remembered each week, last 10 weeks">
        <line x1="0" y1={ly(1)} x2={LW} y2={ly(1)} class="grid" />
        <line x1="0" y1={ly(lo)} x2={LW} y2={ly(lo)} class="grid" />
        <text x={LW} y={ly(1) - 4} class="ax">100%</text>
        <text x={LW} y={ly(lo) - 4} class="ax">{Math.round(lo * 100)}%</text>
        <line x1="0" y1={ly(goal)} x2={LW} y2={ly(goal)} class="goal" />
        {#if linePts.length > 1}<polyline points={linePts.map((p) => `${p.x},${p.y}`).join(" ")} class="ln" />{/if}
        {#each linePts as p}<circle cx={p.x} cy={p.y} r="9" class="hit"><title>Week of {fmtDay(p.w.from)}: {pct(p.w.v)} of {p.w.n}</title></circle><circle cx={p.x} cy={p.y} r="4" class="pt" />{/each}
      </svg>
      <span class="small muted">{linePts.length ? `Dashed line: your ${Math.round(goal * 100)}% goal` : "No reviews yet"}</span>
    </section>
    <section class="card">
      <h3>Next 30 days</h3>
      <BarChart data={ahead} height={100} xEvery={7} label="Cards due per day for the next 30 days" />
      {#if nextExam}<span class="small muted"><i class="dot ex"></i>{shortExam(nextExam)} ({fromKey(nextExam.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })})</span>{/if}
    </section>
    <section class="card">
      <h3>How far apart</h3>
      <BarChart data={intervals} height={100} xEvery={2} label="Review cards by interval" />
      <span class="small muted">Days until each card comes back</span>
    </section>
  </div>

  <section class="card">
    <div class="hh">
      <h3>Hardest cards</h3><span class="small muted">most missed, still slipping</span><span class="grow"></span>
      {#if hardCount}<a class="btn sm dark" href="#/study/cards/cram/{enc(scope.kind === 'all' ? 'filter:hard' : `filter:hard|${skey}`)}">Review these {hardCount} now</a>{/if}
    </div>
    {#if hardest.length}
      <table class="hard">
        <tbody>
          {#each hardest as r (r.card.key)}
            {@const st = STATE[statusOf(r.rec)]}
            <tr>
              <td class="f"><a href={r.href}>{plainOf(r.card.front) || r.title}</a></td>
              <td class="muted">{r.title}</td>
              <td class="muted">{typeLabel(r)}</td>
              <td>missed {r.rec!.lapses} of {r.rec!.reps}</td>
              <td><span class="st {st[1]}">{st[0]}</span></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}<p class="muted none">Nothing missed yet.</p>{/if}
  </section>
</div>

<style>
  .stats {
    display: grid;
    gap: 18px;
    container-type: inline-size;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .grow {
    flex: 1;
  }
  .seg {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .seg button {
    min-height: 36px;
    padding: 0 13px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    color: var(--text-muted);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
    transition: transform 0.15s var(--spring, ease);
  }
  .seg button:hover {
    transform: translateY(-1px);
  }
  .seg button.on {
    background: var(--primary, var(--charcoal));
    color: var(--on-primary, var(--white));
    font-weight: 600;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  .kpi {
    display: grid;
    gap: 2px;
    padding: 12px 14px;
    border-radius: 18px;
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .kpi b {
    font-size: 26px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .kpi b.good {
    color: var(--go-ink);
  }
  .two {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 18px;
    align-items: start;
  }
  .three {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    align-items: start;
  }
  @container (max-width: 980px) {
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .two,
    .three {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .card {
    display: grid;
    gap: 10px;
    align-content: start;
    min-width: 0;
  }
  h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }
  .heat {
    display: grid;
    grid-template-columns: repeat(26, 1fr);
    grid-template-rows: repeat(7, 12px);
    grid-auto-flow: column;
    gap: 3px;
  }
  .heat i {
    border-radius: 3px;
    background: color-mix(in srgb, var(--text) 6%, transparent);
  }
  .heat i.h1 {
    background: color-mix(in srgb, var(--sage) 45%, var(--white));
  }
  .heat i.h2 {
    background: color-mix(in srgb, var(--sage) 80%, var(--white));
  }
  .heat i.h3 {
    background: var(--sage-deep);
  }
  .heat i.h4 {
    background: color-mix(in srgb, var(--sage-deep) 70%, var(--text));
  }
  .heat i.fut {
    background: none;
  }
  .where {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
  }
  .donut {
    flex: none;
    display: grid;
    place-items: center;
    width: 120px;
    height: 120px;
    border-radius: 50%;
  }
  .donut b {
    display: grid;
    place-items: center;
    align-content: center;
    width: 78px;
    height: 78px;
    border-radius: 50%;
    background: var(--surface-float, var(--surface));
    font-size: 16px;
    line-height: 1.1;
    text-align: center;
  }
  .donut small {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--text-muted);
  }
  .leg {
    display: grid;
    gap: 6px;
    flex: 1;
    min-width: 150px;
    font-size: 13.5px;
  }
  .leg span {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .leg b {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
  .dot {
    display: inline-block;
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    vertical-align: middle;
  }
  .dot.ex {
    margin-right: 6px;
    border-radius: 3px;
    background: var(--rose-deep);
  }
  .line {
    width: 100%;
    height: 110px;
    overflow: visible;
  }
  .grid {
    stroke: var(--hairline);
    stroke-width: 1;
  }
  .ax {
    fill: var(--text-muted);
    font-size: 10px;
    text-anchor: end;
  }
  .goal {
    stroke: var(--sage-deep);
    stroke-width: 1.5;
    stroke-dasharray: 4 4;
  }
  .ln {
    fill: none;
    stroke: color-mix(in srgb, var(--lavender) 40%, var(--text));
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .pt {
    fill: color-mix(in srgb, var(--lavender) 40%, var(--text));
    stroke: var(--surface);
    stroke-width: 2;
    pointer-events: none;
  }
  .hit {
    fill: transparent;
  }
  .hh {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .btn.sm {
    min-height: 34px;
    padding: 0 14px;
    font-size: 13px;
  }
  .btn.dark {
    background: var(--primary, var(--charcoal));
    color: var(--on-primary, var(--white));
  }
  .hard {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  .hard td {
    padding: 9px 8px;
    border-top: 1px solid var(--hairline);
  }
  .hard .f a {
    color: var(--text);
    text-decoration: none;
  }
  .hard .f a:hover {
    text-decoration: underline;
  }
  .st {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }
  .st.n {
    background: color-mix(in srgb, var(--periwinkle) 25%, var(--white));
    color: var(--link-ink);
  }
  .st.l {
    background: color-mix(in srgb, var(--rose) 30%, var(--white));
    color: var(--alert-ink);
  }
  .st.r {
    background: color-mix(in srgb, var(--sage) 35%, var(--white));
    color: var(--go-ink);
  }
  .st.s {
    background: var(--chip);
    color: var(--text-muted);
  }
  .none {
    margin: 0;
  }
  .small {
    font-size: 13px;
  }
  .muted {
    color: var(--text-muted);
  }
</style>
