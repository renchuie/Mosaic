<script lang="ts">
  import Icon from "../lib/components/Icon.svelte";
  import LabCard from "../lib/components/LabCard.svelte";
  import Wave from "../lib/components/Wave.svelte";
  import MiniMonth from "../lib/components/MiniMonth.svelte";
  import { TONES, focusBlock, today } from "../lib/sample/data";
  import { fmtTime, fromKey, todayKey } from "../lib/calendar";
  import { editEvent, exams, newEvent, occ } from "../lib/stores/calendar.svelte";
  import { settings } from "../lib/stores/settings.svelte";
  import { inherited, labHref, labs, labsIn, streakInfo } from "../lib/stores/labs.svelte";

  const now = new Date();
  const when = (n: number) => (n === 0 ? "Today" : n === 1 ? "Tomorrow" : `${n} days`);

  const allExams = $derived(exams());
  const upcoming = $derived(allExams.filter((e) => e.days >= 0));
  const next = $derived(upcoming[0]);
  const todayK = todayKey();
  const todays = $derived(occ(todayK, todayK));

  let tasks = $state(today.tasks.map((t) => ({ ...t })));
  const dueLeft = $derived(tasks.filter((t) => !t.done).length);
  const overdue = $derived(tasks.filter((t) => t.overdue && !t.done).length);
  const allLabs = $derived(labsIn(labs.tree).sort((a, b) => b.lastOpened - a.lastOpened || a.lab.title.localeCompare(b.lab.title)));
  const revisit = $derived(allLabs.reduce((n, l) => n + l.progress.missed, 0));
  const cont = $derived(allLabs[0]);
  const streak = $derived(streakInfo());
  const opened = (t: number) => {
    if (!t) return "Not opened yet";
    const d = new Date(t);
    const isToday = d.toDateString() === new Date().toDateString();
    return `${isToday ? "Today" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  };
  const toneFor = (rel: string, i: number) => inherited(rel, "tone") ?? TONES[i % TONES.length];

  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const nowIndex = $derived(todays.findIndex((o) => !o.ev.allDay && (o.ev.end ?? "") > hhmm));
  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
  };
  const dateLine = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
</script>

<div class="page">
  <div class="main">
    <header class="hello">
      <p class="label">{dateLine}</p>
      <h1 class="display">Hi, {settings.name}.</h1>
      <p class="summary">
        {#if next}<b>{next.title}</b> {next.days <= 1 ? `is ${when(next.days).toLowerCase()}` : `in ${next.days} days`} ·{/if}
        {dueLeft} due today · {revisit} to revisit
      </p>
    </header>

    <section class="stats" aria-label="At a glance">
      <div class="stat card t-rose">
        <span class="label">Next exam</span>
        <span class="num display">{next ? when(next.days) : "—"}</span>
        <span class="sub">{next?.title ?? "Nothing scheduled"}</span>
      </div>
      <div class="stat card">
        <span class="label">Due today</span>
        <span class="num display">{dueLeft}</span>
        <span class="sub">{overdue > 0 ? `${overdue} overdue` : "On track"}</span>
      </div>
      <div class="stat card">
        <span class="label">To revisit</span>
        <span class="num display">{revisit}</span>
        <span class="sub">across {allLabs.length} {allLabs.length === 1 ? "lab" : "labs"}</span>
      </div>
      <div class="stat card">
        <span class="label">Streak</span>
        <span class="num display">{streak.days}</span>
        <span class="sub">days in a row</span>
      </div>
    </section>

    {#if cont}
      <section class="continue">
        <Wave />
        <div class="c-body">
          <span class="label">Continue · {opened(cont.lastOpened)}</span>
          <h2 class="display">{cont.lab.title}</h2>
          <div class="chips">
            <span class="tag glass">{cont.progress.sectionsTried} sections tried</span>
            {#if cont.progress.avgBest !== null}<span class="tag glass">Avg best {cont.progress.avgBest}%</span>{/if}
            {#if cont.progress.lastSim !== null}<span class="tag glass">Last sim {cont.progress.lastSim}%</span>{/if}
            {#if cont.progress.bestSim !== null}<span class="tag glass">Best sim {cont.progress.bestSim}%</span>{/if}
            {#if cont.progress.missed}<span class="tag glass">{cont.progress.missed} to revisit</span>{/if}
          </div>
        </div>
        <a class="btn primary" href={labHref(cont.item.rel)}><Icon name="play" size={16} /> Open lab</a>
      </section>

      <section>
        <div class="sec-head">
          <h2 class="h2">Recall labs</h2>
          <a class="link" href="#/labs">All folders <Icon name="arrow" size={14} /></a>
        </div>
        <div class="lectures">
          {#each allLabs.slice(0, 4) as l, i}
            <LabCard
              title={l.lab.title}
              kicker={l.folder.name || "Recall Labs"}
              progress={l.progress.avgBest ?? 0}
              revisit={l.progress.missed}
              tone={toneFor(l.folder.rel, i)}
              href={labHref(l.item.rel)}
            />
          {/each}
        </div>
      </section>
    {:else}
      <section class="continue">
        <Wave />
        <div class="c-body">
          <span class="label">Recall Labs</span>
          <h2 class="display">{labs.error ? "Can’t reach your labs folder" : labs.scanning ? "Looking for your labs…" : "No labs found yet"}</h2>
          <p>{labs.error ?? "Labs are .html files with a recall-lab-version meta tag, anywhere in your labs folder."}</p>
        </div>
        <a class="btn primary" href="#/settings">Check Settings</a>
      </section>
    {/if}

    <section class="card">
      <div class="sec-head">
        <h2 class="h2">Tasks due</h2>
        <span class="tag">{tasks.length - dueLeft} of {tasks.length} done</span>
      </div>
      <ul class="tasks">
        {#each tasks as t}
          <li class:done={t.done}>
            <label>
              <input type="checkbox" bind:checked={t.done} />
              <span class="box"><Icon name="check" size={14} /></span>
              <span class="t-text">
                <span class="t-title">{t.title}</span>
                <span class="t-course muted">{t.course}</span>
              </span>
            </label>
            <span class="tag" class:alert={t.overdue && !t.done}>{t.overdue && !t.done ? "Overdue" : t.due}</span>
          </li>
        {/each}
      </ul>
    </section>
  </div>

  <aside class="side">
    <section class="card">
      <div class="sec-head">
        <h2 class="h2">Countdown</h2>
      </div>
      <ul class="countdowns">
        {#each upcoming.slice(0, 4) as e, i (e.key)}
          <li class:first={i === 0}>
            <span class="c-days display">{e.days}<small>{e.days === 1 ? "day" : "days"}</small></span>
            <span class="c-info">
              <b>{e.title}</b>
              <span class="muted">{fromKey(e.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
            </span>
          </li>
        {/each}
      </ul>
    </section>

    <section class="card focus t-sage">
      <span class="label">Current block</span>
      <h2 class="h2">{focusBlock.title}</h2>
      <div class="timer display">{focusBlock.elapsed}<small>of {focusBlock.minutes}:00</small></div>
      <div class="focus-row">
        <button class="btn primary" type="button"><Icon name="pause" size={16} /> Pause</button>
        <span class="next">Next: {focusBlock.next}</span>
      </div>
    </section>

    <section class="card">
      <MiniMonth marked={allExams.map((e) => e.date)} />
    </section>

    <section class="card">
      <div class="sec-head">
        <h2 class="h2">Today</h2>
        <a class="link" href="#/calendar">Calendar <Icon name="arrow" size={14} /></a>
      </div>
      {#if todays.length}
        <ol class="timeline">
          {#each todays as o, i (o.id)}
            {#if i === nowIndex}
              <li class="now" aria-label="Now"><span>{fmt(hhmm)}</span></li>
            {/if}
            <li class="ev" class:past={!o.ev.allDay && (nowIndex === -1 || i < nowIndex)}>
              <span class="time">{o.ev.allDay ? "All day" : fmt(o.ev.start ?? "00:00")}</span>
              <button type="button" class="ev-card k-{o.ev.kind}" onclick={() => editEvent(o.id, o.date)}>
                <b>{o.ev.title}</b>
                <span class="muted">{o.ev.allDay ? o.ev.course ?? "" : `${fmtTime(o.ev.start)} – ${fmtTime(o.ev.end)}`}</span>
              </button>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="muted">Nothing on your calendar today.</p>
      {/if}
      <button type="button" class="btn quiet add" onclick={() => newEvent()}>+ Add event</button>
    </section>

    <section class="card">
      <div class="sec-head">
        <h2 class="h2">Quick play</h2>
      </div>
      <div class="quick">
        {#each allLabs.slice(0, 5) as l}
          <a class="btn quiet" href={labHref(l.item.rel)}><Icon name="play" size={14} /> {l.lab.title}</a>
        {:else}
          <p class="muted">Your labs will show up here.</p>
        {/each}
      </div>
    </section>
  </aside>
</div>

<style>
  .page {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: var(--gap);
    align-items: start;
  }
  .main,
  .side {
    display: grid;
    gap: var(--gap);
    min-width: 0;
  }
  .main {
    container-type: inline-size;
  }
  @media (max-width: 1180px) {
    .page {
      grid-template-columns: minmax(0, 1fr);
    }
    .side {
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      align-items: start;
    }
  }

  .hello {
    padding: 2px 4px 0;
  }
  .hello h1 {
    font-size: clamp(36px, 4.6vw, 54px);
    line-height: 1.05;
    margin: 4px 0 8px;
  }
  .summary {
    font-size: 16px;
    color: var(--text-muted);
  }
  .summary b {
    color: var(--text);
    font-weight: 500;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  @container (max-width: 720px) {
    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .stat {
    display: grid;
    gap: 2px;
    padding: 16px 18px;
  }
  .num {
    font-size: 28px;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
  }
  .sub {
    font-size: 13.5px;
    color: var(--text-muted);
  }
  .stat.t-rose .label,
  .stat.t-rose .sub {
    color: var(--text);
  }

  .continue {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 24px;
    border-radius: var(--radius);
    background: var(--g-sunset);
    box-shadow: var(--shadow);
  }
  .continue > :global(:not(.wave)) {
    position: relative;
  }
  .continue .label {
    color: var(--text);
  }
  .continue h2 {
    font-size: 28px;
    margin: 2px 0 14px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .sec-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: var(--hit);
    font-weight: 500;
    font-size: 14px;
    text-decoration: none;
    color: var(--text-muted);
  }
  .link:hover {
    color: var(--text);
  }
  section > .sec-head:has(.link) {
    margin-bottom: 2px;
    padding: 0 4px;
  }
  .lectures {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 14px;
  }

  .tasks {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
  }
  .tasks li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border-top: 1px solid var(--hairline);
  }
  .tasks li:first-child {
    border-top: 0;
  }
  .tasks label {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 54px;
    flex: 1;
    min-width: 0;
    cursor: pointer;
  }
  .tasks input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .box {
    flex: none;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--track);
    color: transparent;
    transition: background 0.15s ease;
  }
  input:checked + .box {
    background: var(--sage);
    color: var(--text);
  }
  input:focus-visible + .box {
    outline: 2.5px solid var(--charcoal);
    outline-offset: 2px;
  }
  .t-text {
    display: grid;
    min-width: 0;
  }
  .t-title {
    font-weight: 500;
  }
  .t-course {
    font-size: 13.5px;
  }
  li.done .t-title {
    text-decoration: line-through;
    color: var(--text-muted);
  }

  .countdowns {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .countdowns li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    background: var(--peach-soft);
  }
  .countdowns li.first {
    background: var(--g-rose);
  }
  .c-days {
    display: grid;
    justify-items: center;
    min-width: 50px;
    font-size: 26px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .c-days small {
    font-family: var(--font-body);
    font-size: 11.5px;
    letter-spacing: 0;
    margin-top: 2px;
  }
  .c-info {
    display: grid;
    font-size: 14.5px;
    min-width: 0;
  }
  .c-info b {
    font-weight: 500;
  }
  .first .muted {
    color: var(--text);
  }

  .focus .label {
    color: var(--text);
  }
  .focus h2 {
    margin-top: 2px;
  }
  .timer {
    font-size: 40px;
    margin: 4px 0 12px;
    font-variant-numeric: tabular-nums;
  }
  .timer small {
    font-family: var(--font-body);
    font-size: 13.5px;
    letter-spacing: 0;
    margin-left: 8px;
  }
  .focus-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .next {
    font-size: 13.5px;
  }

  .timeline {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .ev {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
  }
  .time {
    font-size: 12.5px;
    padding-top: 10px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .ev-card {
    display: grid;
    width: 100%;
    border: 0;
    text-align: left;
    cursor: pointer;
    padding: 9px 14px;
    border-radius: var(--radius-sm);
    font-size: 14.5px;
  }
  .add {
    margin-top: 12px;
    width: 100%;
  }
  .ev-card b {
    font-weight: 500;
  }
  .ev-card .muted {
    font-size: 13px;
  }
  .ev.past {
    opacity: 0.5;
  }
  .now {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .now span {
    font-size: 11.5px;
    font-weight: 500;
    background: var(--rose-deep);
    color: #fff;
    border-radius: var(--radius-pill);
    padding: 2px 9px;
  }
  .now::after {
    content: "";
    flex: 1;
    border-top: 1.5px solid var(--rose);
  }

  .quick {
    display: grid;
    gap: 8px;
  }
  .quick .btn {
    justify-content: flex-start;
  }
</style>
