<script lang="ts">
  // "Today's progress" card and the week strip that filters tasks by due day.
  import Icon from "../../lib/components/Icon.svelte";
  import { addDays, fromKey, mondayOf, todayKey } from "../../lib/calendar";
  import { tagOf } from "../../lib/stores/calendar.svelte";
  import { overdue, taskView, tasks, tasksOn } from "../../lib/stores/tasks.svelte";

  const today = todayKey();
  const dueToday = $derived(tasksOn(today, today));
  const late = $derived(overdue());
  const total = $derived(dueToday.length + late.length);
  const done = $derived(dueToday.filter((o) => o.done).length);
  const pct = $derived(total ? Math.round((done / total) * 100) : 0);

  const weekStart = mondayOf(today);
  const weekStartMs = fromKey(weekStart).getTime();
  const counts = $derived.by(() => {
    let todo = 0;
    let doing = 0;
    let doneWeek = 0;
    for (const [, t] of tasks()) {
      if (t.repeat) {
        todo++;
        doneWeek += (t.doneDates ?? []).filter((d) => d >= weekStart && d <= today).length;
      } else if (t.status === "done") {
        if ((t.doneAt ?? 0) >= weekStartMs) doneWeek++;
      } else if (t.status === "doing") doing++;
      else todo++;
    }
    return { todo, doing, doneWeek };
  });

  const shown = $derived(taskView.week ?? weekStart);
  const days = $derived(Array.from({ length: 7 }, (_, i) => addDays(shown, i)));
  const due = $derived(tasksOn(days[0], days[6]));

  const R = 42;
  const C = 2 * Math.PI * R;
  const pick = (d: string) => (taskView.day = taskView.day === d ? null : d);
</script>

<div class="wrap">
  <section class="progress">
    <div class="ringbox">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={R} class="bg" />
        <circle cx="50" cy="50" r={R} class="fg" stroke-dasharray={C} stroke-dashoffset={C * (1 - pct / 100)} />
      </svg>
      <span class="pct display">{total ? pct : "–"}<small>{total ? "%" : ""}</small></span>
    </div>
    <div class="ptext">
      <span class="kicker">Today’s progress</span>
      <b class="display">{total ? `${done} of ${total} done` : "Nothing due today"}</b>
      <span class="sub">{late.length ? `${late.length} overdue` : total ? "Nothing overdue" : "Enjoy it, or plan ahead"}</span>
    </div>
    <ul class="pstats">
      <li><span class="ic"><Icon name="tasks" size={16} /></span><b>{counts.todo}</b><span>To do</span></li>
      <li><span class="ic"><Icon name="clock" size={16} /></span><b>{counts.doing}</b><span>In progress</span></li>
      <li><span class="ic"><Icon name="check" size={16} /></span><b>{counts.doneWeek}</b><span>Done this week</span></li>
    </ul>
  </section>

  <section class="week" aria-label="Filter by due day">
    <div class="wh">
      <b>{fromKey(days[0]).toLocaleDateString("en-US", { month: "long", day: "numeric" })} – {fromKey(days[6]).toLocaleDateString("en-US", { month: days[0].slice(5, 7) === days[6].slice(5, 7) ? undefined : "short", day: "numeric" })}</b>
      <span class="nav">
        <button type="button" aria-label="Previous week" onclick={() => (taskView.week = addDays(shown, -7))}>‹</button>
        <button type="button" aria-label="Next week" onclick={() => (taskView.week = addDays(shown, 7))}>›</button>
      </span>
    </div>
    <div class="days">
      {#each days as d (d)}
        {@const list = due.filter((o) => o.date === d)}
        <button type="button" class="day" class:sel={taskView.day === d} class:today={d === today} aria-pressed={taskView.day === d} onclick={() => pick(d)} aria-label="{fromKey(d).toDateString()}: {list.length} tasks">
          <span class="dn">{fromKey(d).toLocaleDateString("en-US", { weekday: "short" })}</span>
          <span class="num">{Number(d.slice(8))}</span>
          <span class="dots">
            {#each list.slice(0, 4) as o (o.id)}<i style="background: color-mix(in srgb, {tagOf(o.task.tag ?? 'task').color} 70%, #3b3033)" class:hollow={o.done}></i>{/each}
          </span>
        </button>
      {/each}
    </div>
    {#if taskView.day}
      <p class="filter">Showing tasks due {fromKey(taskView.day).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · <button type="button" onclick={() => (taskView.day = null)}>Show all</button></p>
    {/if}
  </section>
</div>

<style>
  .wrap {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
    gap: var(--gap);
    container-type: inline-size;
  }
  @media (max-width: 1100px) {
    .wrap {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .progress {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 18px;
    padding: 18px 20px;
    border-radius: var(--radius);
    background: var(--hero);
    color: var(--on-hero);
    box-shadow: var(--shadow-lift);
  }
  .ringbox {
    position: relative;
    width: 104px;
    height: 104px;
  }
  .ringbox svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  circle {
    fill: none;
    stroke-width: 11;
  }
  .bg {
    stroke: color-mix(in srgb, var(--white) 14%, transparent);
  }
  .fg {
    stroke: var(--sage);
    stroke-linecap: round;
    transition: stroke-dashoffset 0.5s ease;
  }
  .pct {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    font-weight: 600;
  }
  .pct small {
    font-size: 13px;
  }
  .ptext {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .kicker {
    font-size: 13px;
    opacity: 0.7;
  }
  .ptext b {
    font-size: 21px;
    font-weight: 600;
  }
  .sub {
    font-size: 13.5px;
    color: var(--peach);
  }
  .pstats {
    list-style: none;
    margin: 0;
    padding: 0 0 0 18px;
    border-left: 1px solid color-mix(in srgb, var(--white) 15%, transparent);
    display: grid;
    gap: 6px;
  }
  .pstats li {
    display: grid;
    grid-template-columns: auto 28px auto;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .pstats .ic {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--white) 10%, transparent);
  }
  .pstats b {
    font-size: 17px;
    font-weight: 600;
    text-align: right;
  }
  .pstats span:last-child {
    opacity: 0.75;
  }
  @container (max-width: 560px) {
    .progress {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .pstats {
      grid-column: 1 / -1;
      grid-auto-flow: column;
      border-left: 0;
      border-top: 1px solid color-mix(in srgb, var(--white) 15%, transparent);
      padding: 12px 0 0;
    }
  }

  .week {
    display: grid;
    gap: 10px;
    padding: 16px 18px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    align-content: start;
  }
  .wh {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .wh b {
    font-weight: 600;
  }
  .nav {
    display: flex;
    gap: 4px;
  }
  .nav button {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    background: var(--panel);
    font-size: 18px;
  }
  .days {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
  }
  .day {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 8px 0 9px;
    border: 0;
    border-radius: 18px;
    background: var(--panel);
    transition: background 0.15s ease, transform 0.15s ease;
  }
  .day:hover {
    transform: translateY(-1px);
  }
  .dn {
    font-size: 12px;
    color: var(--text-muted);
  }
  .num {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--surface);
    font-weight: 600;
    font-size: 14.5px;
  }
  .day.today .num {
    box-shadow: inset 0 0 0 2px var(--rose-deep);
  }
  .day.sel {
    background: var(--charcoal);
  }
  .day.sel .dn {
    color: var(--ivory);
    opacity: 0.8;
  }
  .dots {
    display: flex;
    gap: 3px;
    min-height: 7px;
  }
  .dots i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .dots i.hollow {
    opacity: 0.4;
  }
  .filter {
    font-size: 13.5px;
    color: var(--text-muted);
  }
  .filter button {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--text);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
