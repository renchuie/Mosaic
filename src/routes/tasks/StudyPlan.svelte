<script lang="ts">
  // Daily study plan: ordered blocks with durations, a start/pause timer for
  // the current block, check-off, and suggestions from tasks, labs and the calendar.
  import Icon from "../../lib/components/Icon.svelte";
  import { addDays, fmtTime, fromKey, minutes as toMin, todayKey } from "../../lib/calendar";
  import { currentBlock, fmtClock, fmtDuration, hhmm, move, planMinutes, schedule, studiedMinutes, type Block } from "../../lib/plan";
  import { occ, tagOf, editTask } from "../../lib/stores/calendar.svelte";
  import { labHref, labsIn, labs } from "../../lib/stores/labs.svelte";
  import {
    addBlock, bringOver, clock, completeBlock, getPlan, isRunning, pauseBlock, removeBlock, reopenBlock, setBlocks, setStart, spent, startBlock, updateBlock,
  } from "../../lib/stores/plan.svelte";
  import { overdue, tasksOn } from "../../lib/stores/tasks.svelte";

  let date = $state(todayKey());
  const today = todayKey();
  const plan = $derived(getPlan(date));
  const blocks = $derived(plan.blocks);
  const cur = $derived(currentBlock(blocks, clock.timer, date));
  const nowStart = $derived.by(() => {
    const d = new Date(clock.now);
    return hhmm(Math.ceil((d.getHours() * 60 + d.getMinutes()) / 5) * 5);
  });
  const start = $derived(plan.start ?? (date === today ? (blocks.find((b) => b.done || b.spentMs) ? "08:00" : nowStart) : "09:00"));
  const times = $derived(new Map(schedule(blocks, start).map((s) => [s.id, s])));
  const planned = $derived(planMinutes(blocks, "study"));
  const studied = $derived(studiedMinutes(plan) + (clock.timer?.startedAt && clock.timer.date === date ? (clock.now - clock.timer.startedAt) / 60000 : 0));
  const doneCount = $derived(blocks.filter((b) => b.done).length);
  const endsAt = $derived(hhmm(toMin(start) + planMinutes(blocks)));
  const leftover = $derived(date === today ? getPlan(addDays(today, -1)).blocks.filter((b) => !b.done && b.kind === "study") : []);

  // ---- current block ring ----
  const curSpent = $derived(cur ? spent(date, cur) : 0);
  const curTotal = $derived((cur?.minutes ?? 1) * 60000);
  const frac = $derived(Math.min(1, curSpent / curTotal));
  const over = $derived(curSpent > curTotal);
  const R = 70;
  const C = 2 * Math.PI * R;

  // ---- adding ----
  let title = $state("");
  let mins = $state(45);
  function add(e: SubmitEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addBlock(date, { title: title.trim(), minutes: mins });
    title = "";
  }
  const MINS = [15, 25, 30, 45, 60, 90];

  // ---- suggestions ----
  const inPlan = (pred: (b: Block) => boolean) => blocks.some(pred);
  const taskIdeas = $derived(
    [...overdue(), ...tasksOn(date, addDays(date, 2))]
      .filter((o, i, all) => !o.done && all.findIndex((x) => x.id === o.id) === i)
      .filter((o) => !inPlan((b) => b.taskId === o.id))
      .slice(0, 6),
  );
  const labIdeas = $derived(
    labsIn(labs.tree)
      .sort((a, b) => b.lastOpened - a.lastOpened || b.progress.missed - a.progress.missed)
      .slice(0, 3)
      .flatMap((l) => [
        ...(l.progress.missed ? [{ key: `m-${l.item.rel}`, title: `Review missed questions · ${l.lab.title}`, minutes: 30, rel: l.item.rel, note: `${l.progress.missed} to revisit` }] : []),
        { key: `s-${l.item.rel}`, title: `Sim run · ${l.lab.title}`, minutes: 60, rel: l.item.rel, note: l.progress.lastSim !== null ? `last sim ${l.progress.lastSim}%` : "no sims yet" },
      ])
      .filter((x) => !inPlan((b) => b.title === x.title)),
  );
  const calIdeas = $derived(
    occ(date, date)
      .filter((o) => o.ev.kind === "study" && !o.ev.allDay && o.ev.start && o.ev.end)
      .filter((o) => !inPlan((b) => b.title === o.ev.title))
      .map((o) => ({ key: o.id, title: o.ev.title, minutes: Math.max(5, toMin(o.ev.end) - toMin(o.ev.start)), at: o.ev.start!, course: o.ev.course })),
  );

  const dayLabel = $derived(date === today ? "Today" : date === addDays(today, 1) ? "Tomorrow" : date === addDays(today, -1) ? "Yesterday" : fromKey(date).toLocaleDateString("en-US", { weekday: "long" }));
  const range = (id: string) => {
    const t = times.get(id);
    return t ? `${fmtTime(t.from)} – ${fmtTime(t.to)}` : "";
  };
</script>

<div class="plan">
  <div class="daybar">
    <button class="btn quiet icon" type="button" aria-label="Previous day" onclick={() => (date = addDays(date, -1))}><Icon name="back" size={18} /></button>
    <div class="dl">
      <b class="display">{dayLabel}</b>
      <span class="muted">{fromKey(date).toLocaleDateString("en-US", { month: "long", day: "numeric" })}</span>
    </div>
    <button class="btn quiet icon flip" type="button" aria-label="Next day" onclick={() => (date = addDays(date, 1))}><Icon name="back" size={18} /></button>
    {#if date !== today}<button class="btn quiet" type="button" onclick={() => (date = today)}>Today</button>{/if}
    <div class="stats">
      <span class="tag">Planned {fmtDuration(planned)}</span>
      <span class="tag">Studied {fmtDuration(studied)}</span>
      <span class="tag">{doneCount}/{blocks.length} done</span>
      {#if blocks.length}<span class="tag">Ends about {fmtTime(endsAt)}</span>{/if}
    </div>
  </div>

  {#if leftover.length && !blocks.some((b) => leftover.some((l) => l.title === b.title))}
    <div class="carry">
      <span>{leftover.length} unfinished {leftover.length === 1 ? "block" : "blocks"} from yesterday</span>
      <button class="btn quiet" type="button" onclick={() => bringOver(addDays(today, -1), today)}>Bring over</button>
    </div>
  {/if}

  <div class="cols">
    <div class="main">
      <section class="hero" class:over class:running={cur && isRunning(date, cur.id)}>
        {#if cur}
          <svg class="ring" viewBox="0 0 160 160" aria-hidden="true">
            <circle cx="80" cy="80" r={R} class="bg" />
            <circle cx="80" cy="80" r={R} class="fg" stroke-dasharray={C} stroke-dashoffset={C * (1 - frac)} />
          </svg>
          <div class="hinfo">
            <span class="label">{isRunning(date, cur.id) ? "Running" : curSpent ? "Paused" : "Up next"}{cur.kind === "break" ? " · break" : ""}</span>
            <h2 class="display">{cur.title}</h2>
            <div class="clock display">
              {fmtClock(curSpent)}<small>of {fmtClock(curTotal)}</small>
            </div>
            {#if over}<p class="overmsg">Time’s up — check it off when you’re done, or keep going.</p>{/if}
            <div class="hbtns">
              {#if isRunning(date, cur.id)}
                <button class="btn primary" type="button" onclick={pauseBlock}><Icon name="pause" size={16} /> Pause</button>
              {:else}
                <button class="btn primary" type="button" onclick={() => startBlock(date, cur.id)}><Icon name="play" size={16} /> {curSpent ? "Resume" : "Start"}</button>
              {/if}
              <button class="btn go" type="button" onclick={() => completeBlock(date, cur.id)}><Icon name="check" size={16} /> Done</button>
              {#if cur.labRel}<a class="btn" href={labHref(cur.labRel)}><Icon name="labs" size={16} /> Open lab</a>{/if}
              {#if cur.taskId}<button class="btn" type="button" onclick={(e) => editTask(cur.taskId!, null, e)}><Icon name="tasks" size={16} /> Task</button>{/if}
            </div>
          </div>
        {:else if blocks.length}
          <div class="hinfo">
            <span class="label">All done</span>
            <h2 class="display">Every block is checked off. 🎉</h2>
            <p class="muted">You studied {fmtDuration(studied)}{date === today ? " today" : ""}.</p>
          </div>
        {:else}
          <div class="hinfo">
            <span class="label">No plan yet</span>
            <h2 class="display">Plan {dayLabel.toLowerCase() === "today" ? "your day" : dayLabel}</h2>
            <p class="muted">Add blocks on the right, or pick from the suggestions.</p>
          </div>
        {/if}
      </section>

      {#if blocks.length}
        <section class="card list">
          <div class="lh">
            <h2 class="h2">Blocks</h2>
            <label class="startat">Starts at <input class="input" type="time" value={start} onchange={(e) => setStart(date, e.currentTarget.value || undefined)} /></label>
          </div>
          <ol>
            {#each blocks as b, i (b.id)}
              <li class:done={b.done} class:brk={b.kind === "break"} class:cur={cur?.id === b.id}>
                <div class="order">
                  <button type="button" aria-label="Move {b.title} up" disabled={i === 0} onclick={() => setBlocks(date, move(blocks, i, i - 1))}>▲</button>
                  <button type="button" aria-label="Move {b.title} down" disabled={i === blocks.length - 1} onclick={() => setBlocks(date, move(blocks, i, i + 1))}>▼</button>
                </div>
                <button type="button" class="tick" aria-pressed={b.done} aria-label="{b.done ? 'Not done' : 'Done'}: {b.title}" onclick={() => (b.done ? reopenBlock(date, b.id) : completeBlock(date, b.id))}>
                  {#if b.done}<Icon name="check" size={14} />{/if}
                </button>
                <div class="bt">
                  <b>{b.title}</b>
                  <span class="muted">
                    {range(b.id)}{b.course ? ` · ${b.course}` : ""}{spent(date, b) > 0 ? ` · ${fmtClock(spent(date, b))} on the clock` : ""}
                  </span>
                </div>
                <select class="input dur" value={b.minutes} aria-label="Minutes for {b.title}" onchange={(e) => updateBlock(date, b.id, { minutes: Number(e.currentTarget.value) })}>
                  {#each [...new Set([5, 10, 15, 20, 25, 30, 45, 60, 75, 90, 120, 150, 180, b.minutes])].sort((x, y) => x - y) as m}<option value={m}>{fmtDuration(m)}</option>{/each}
                </select>
                {#if !b.done}
                  {#if isRunning(date, b.id)}
                    <button type="button" class="ib" aria-label="Pause {b.title}" onclick={pauseBlock}><Icon name="pause" size={16} /></button>
                  {:else}
                    <button type="button" class="ib" aria-label="Start {b.title}" onclick={() => startBlock(date, b.id)}><Icon name="play" size={16} /></button>
                  {/if}
                {:else}<span class="ib"></span>{/if}
                <button type="button" class="ib rm" aria-label="Remove {b.title}" onclick={() => removeBlock(date, b.id)}>×</button>
              </li>
            {/each}
          </ol>
        </section>
      {/if}
    </div>

    <aside class="side">
      <form class="card addb" onsubmit={add}>
        <h2 class="h2">Add a block</h2>
        <input class="input" bind:value={title} placeholder="e.g. Anticoagulation lecture review" aria-label="Block name" />
        <div class="mins" role="radiogroup" aria-label="Length">
          {#each MINS as m}
            <button type="button" role="radio" aria-checked={mins === m} class:on={mins === m} onclick={() => (mins = m)}>{fmtDuration(m)}</button>
          {/each}
        </div>
        <div class="row">
          <button type="submit" class="btn primary" disabled={!title.trim()}>Add block</button>
          <span class="muted">or a break:</span>
          {#each [5, 10, 15] as m}
            <button type="button" class="btn quiet sm" onclick={() => addBlock(date, { title: "Break", minutes: m, kind: "break" })}>{m} min</button>
          {/each}
        </div>
      </form>

      {#if date >= today}
        <section class="card ideas">
          <h2 class="h2">Suggestions</h2>
          {#if calIdeas.length}
            <h3 class="label">Study blocks on your calendar</h3>
            {#each calIdeas as s (s.key)}
              <button type="button" class="idea" onclick={() => addBlock(date, { title: s.title, minutes: s.minutes, course: s.course })}>
                <span class="plus">+</span><span class="it"><b>{s.title}</b><span>{fmtTime(s.at)} · {fmtDuration(s.minutes)}</span></span>
              </button>
            {/each}
          {/if}
          {#if taskIdeas.length}
            <h3 class="label">Tasks due soon</h3>
            {#each taskIdeas as o (o.id)}
              <button type="button" class="idea" onclick={() => addBlock(date, { title: o.task.title, minutes: o.task.estimate ?? 30, taskId: o.id, course: o.task.course })}>
                <span class="plus">+</span>
                <span class="it"><b>{o.task.title}</b><span>{o.task.estimate ? fmtDuration(o.task.estimate) : "30 min (no estimate)"}{o.date < today ? " · overdue" : ""}{o.task.course ? ` · ${o.task.course}` : ""}</span></span>
                <span class="tag-dot" style="--tag: {tagOf(o.task.tag ?? 'task').color}"></span>
              </button>
            {/each}
          {/if}
          {#if labIdeas.length}
            <h3 class="label">Recall Labs</h3>
            {#each labIdeas as s (s.key)}
              <button type="button" class="idea" onclick={() => addBlock(date, { title: s.title, minutes: s.minutes, labRel: s.rel })}>
                <span class="plus">+</span><span class="it"><b>{s.title}</b><span>{fmtDuration(s.minutes)} · {s.note}</span></span>
              </button>
            {/each}
          {/if}
          {#if !calIdeas.length && !taskIdeas.length && !labIdeas.length}
            <p class="muted">Nothing to suggest yet. Tasks with estimates, your Recall Labs and Study events on the calendar show up here.</p>
          {/if}
        </section>
      {/if}
    </aside>
  </div>
</div>

<style>
  .plan {
    display: grid;
    gap: var(--gap);
    container-type: inline-size;
  }
  .daybar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .icon {
    width: var(--hit);
    padding: 0;
  }
  .flip :global(svg) {
    transform: scaleX(-1);
  }
  .dl {
    display: grid;
    line-height: 1.15;
    min-width: 120px;
    padding: 0 6px;
  }
  .dl b {
    font-size: 20px;
    font-weight: 600;
  }
  .dl span {
    font-size: 13px;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-left: auto;
  }
  .stats .tag {
    background: var(--surface);
  }
  .carry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 8px 8px 16px;
    border-radius: var(--radius-sm);
    background: var(--butter-soft);
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
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

  .hero {
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
    padding: 24px;
    border-radius: var(--radius);
    background: var(--g-sage);
    box-shadow: var(--shadow);
  }
  .hero.over {
    background: var(--g-rose);
  }
  .ring {
    width: 150px;
    height: 150px;
    flex: none;
    transform: rotate(-90deg);
  }
  .ring circle {
    fill: none;
    stroke-width: 12;
  }
  .ring .bg {
    stroke: rgba(255, 253, 251, 0.6);
  }
  .ring .fg {
    stroke: var(--charcoal);
    stroke-linecap: round;
    transition: stroke-dashoffset 0.9s linear;
  }
  .running .ring .fg {
    animation: none;
  }
  .hinfo {
    display: grid;
    gap: 6px;
    flex: 1;
    min-width: 240px;
  }
  .hinfo .label {
    color: var(--text);
  }
  .hinfo h2 {
    font-size: 24px;
    font-weight: 600;
    line-height: 1.2;
  }
  .clock {
    font-size: 46px;
    font-weight: 600;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }
  .clock small {
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 500;
    margin-left: 10px;
  }
  .overmsg {
    font-size: 14px;
    font-weight: 500;
  }
  .hbtns {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
  }
  .hbtns .btn:not(.primary):not(.go) {
    background: rgba(255, 253, 251, 0.7);
  }

  .list {
    display: grid;
    gap: 10px;
  }
  .lh {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .startat {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--text-muted);
  }
  .startat .input {
    width: auto;
    min-height: 38px;
    padding: 4px 10px;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  li {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto auto auto;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 14px;
    background: var(--panel);
  }
  li.cur {
    background: color-mix(in srgb, var(--sage) 30%, var(--white));
    box-shadow: inset 0 0 0 2px var(--sage-deep);
  }
  li.brk {
    background: transparent;
    border: 1.5px dashed var(--hairline);
  }
  li.done .bt b {
    text-decoration: line-through;
    color: var(--text-muted);
  }
  .order {
    display: grid;
  }
  .order button {
    width: 28px;
    height: 20px;
    border: 0;
    border-radius: 6px;
    background: none;
    font-size: 10px;
    color: var(--text-muted);
    padding: 0;
  }
  .order button:hover:not(:disabled) {
    background: var(--surface);
    color: var(--text);
  }
  .order button:disabled {
    opacity: 0.25;
  }
  .tick {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1.5px solid color-mix(in srgb, var(--charcoal) 50%, transparent);
    border-radius: 50%;
    background: var(--white);
  }
  .done .tick {
    background: var(--sage);
    border-color: var(--sage-deep);
  }
  .bt {
    display: grid;
    min-width: 0;
  }
  .bt b {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bt span {
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dur {
    width: auto;
    min-height: 38px;
    padding: 4px 10px;
    background: var(--surface);
    font-size: 13.5px;
  }
  .ib {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border: 0;
    border-radius: 50%;
    background: var(--surface);
  }
  span.ib {
    background: none;
  }
  .ib.rm {
    background: none;
    font-size: 20px;
    color: var(--text-muted);
  }
  .ib.rm:hover {
    background: var(--rose-soft);
  }
  @container (max-width: 560px) {
    li {
      grid-template-columns: auto auto minmax(0, 1fr) auto;
    }
    .dur {
      grid-column: 3;
    }
  }

  .addb {
    display: grid;
    gap: 10px;
  }
  .mins {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .mins button {
    min-height: 38px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--panel);
    font-size: 13.5px;
    font-weight: 500;
  }
  .mins button.on {
    background: var(--charcoal);
    color: var(--on-primary);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .row .muted {
    font-size: 13px;
    margin-left: 4px;
  }
  .sm {
    min-height: 36px;
    padding: 0 12px;
    font-size: 13px;
  }
  .ideas {
    display: grid;
    gap: 6px;
  }
  .ideas h3 {
    margin-top: 8px;
  }
  .idea {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-height: var(--hit);
    padding: 6px 8px;
    border: 0;
    border-radius: 12px;
    background: var(--panel);
    text-align: left;
  }
  .idea:hover {
    background: var(--sage-soft);
  }
  .plus {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--surface);
    font-weight: 600;
  }
  .it {
    display: grid;
    min-width: 0;
  }
  .it b {
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .it span {
    font-size: 12.5px;
    color: var(--text-muted);
  }
</style>
