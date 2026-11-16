<script lang="ts">
  import { addDays, fmtTime, fromKey, minutes, pad, todayKey, type Occurrence } from "../../lib/calendar";
  import { editEvent, newEvent, occ } from "../../lib/stores/calendar.svelte";

  let { weekStart }: { weekStart: string } = $props();
  const HOUR = 52;

  const days = $derived(Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)));
  const all = $derived(occ(weekStart, addDays(weekStart, 6)));
  const timed = $derived(all.filter((o) => !o.ev.allDay && o.ev.start && o.ev.end));
  const allDay = $derived(all.filter((o) => o.ev.allDay));
  const startHour = $derived(Math.min(7, ...timed.map((o) => Math.floor(minutes(o.ev.start) / 60))));
  const endHour = $derived(Math.max(22, ...timed.map((o) => Math.ceil(minutes(o.ev.end) / 60))));
  const hours = $derived(Array.from({ length: endHour - startHour }, (_, i) => startHour + i));

  let now = $state(new Date());
  $effect(() => {
    const t = setInterval(() => (now = new Date()), 60_000);
    return () => clearInterval(t);
  });
  const today = $derived(todayKey());
  const nowTop = $derived(((now.getHours() * 60 + now.getMinutes() - startHour * 60) / 60) * HOUR);

  /** Side-by-side lanes for events that overlap. */
  function layout(list: Occurrence[]) {
    const out: { o: Occurrence; lane: number; lanes: number }[] = [];
    let cluster: typeof out = [];
    let clusterEnd = -1;
    const flush = () => {
      const n = Math.max(1, ...cluster.map((c) => c.lane + 1));
      cluster.forEach((c) => (c.lanes = n));
      cluster = [];
    };
    for (const o of list) {
      const s = minutes(o.ev.start);
      const e = minutes(o.ev.end);
      if (s >= clusterEnd) {
        flush();
        clusterEnd = -1;
      }
      const busy = new Set(cluster.filter((c) => minutes(c.o.ev.end) > s).map((c) => c.lane));
      let lane = 0;
      while (busy.has(lane)) lane++;
      const item = { o, lane, lanes: 1 };
      cluster.push(item);
      out.push(item);
      clusterEnd = Math.max(clusterEnd, e);
    }
    flush();
    return out;
  }

  function addAt(day: string, e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const m = Math.floor(((e.clientY - rect.top) / HOUR) * 2) * 30 + startHour * 60;
    const start = Math.min(m, 23 * 60);
    const hhmm = (x: number) => `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
    newEvent({ date: day, start: hhmm(start), end: hhmm(Math.min(start + 60, 23 * 60 + 55)) });
  }
</script>

<div class="scroller">
  <div class="grid" style="--hour: {HOUR}px; --rows: {hours.length}">
    <div class="corner"></div>
    {#each days as d}
      {@const dt = fromKey(d)}
      <div class="dayhead" class:today={d === today}>
        <span class="dow">{dt.toLocaleDateString("en-US", { weekday: "short" })}</span>
        <span class="num">{dt.getDate()}</span>
      </div>
    {/each}

    {#if allDay.length}
      <div class="gutter small label">All day</div>
      {#each days as d}
        <div class="allday">
          {#each allDay.filter((o) => o.date === d) as o}
            <button type="button" class="chip k-{o.ev.kind}" onclick={() => editEvent(o.id, o.date)}>{o.ev.title}</button>
          {/each}
        </div>
      {/each}
    {/if}

    <div class="gutter">
      {#each hours as h}
        <span class="hour" style="top: {(h - startHour) * HOUR}px">{h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}</span>
      {/each}
    </div>
    {#each days as d}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="col" class:today={d === today} onclick={(e) => addAt(d, e)} title="Click to add an event">
        {#each layout(timed.filter((o) => o.date === d)) as { o, lane, lanes } (o.id + o.date)}
          {@const top = ((minutes(o.ev.start) - startHour * 60) / 60) * HOUR}
          {@const height = Math.max(((minutes(o.ev.end) - minutes(o.ev.start)) / 60) * HOUR, 26)}
          <button
            type="button"
            class="ev k-{o.ev.kind}"
            class:short={height < 46}
            style="top: {top}px; height: {height - 3}px; left: calc({(lane / lanes) * 100}% + 3px); width: calc({100 / lanes}% - 6px)"
            onclick={(e) => {
              e.stopPropagation();
              editEvent(o.id, o.date);
            }}
          >
            <b>{o.ev.title}</b>
            <span>{fmtTime(o.ev.start)} – {fmtTime(o.ev.end)}{o.ev.location ? ` · ${o.ev.location}` : ""}</span>
          </button>
        {/each}
        {#if d === today && nowTop >= 0 && nowTop <= hours.length * HOUR}
          <div class="now" style="top: {nowTop}px" aria-hidden="true"></div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .scroller {
    overflow-x: auto;
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 12px 12px 16px 0;
  }
  .grid {
    display: grid;
    grid-template-columns: 58px repeat(7, minmax(104px, 1fr));
    min-width: 790px;
  }
  .dayhead {
    display: grid;
    justify-items: center;
    gap: 2px;
    padding: 4px 0 10px;
  }
  .dow {
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .num {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    font-weight: 600;
    font-size: 16px;
  }
  .dayhead.today .num {
    background: var(--primary);
    color: var(--on-primary);
  }
  .gutter.small {
    padding: 6px 8px 6px 0;
    text-align: right;
  }
  .allday {
    display: grid;
    gap: 4px;
    padding: 4px 3px;
    border-left: 1px solid var(--hairline);
  }
  .chip {
    border: 0;
    border-radius: 10px;
    padding: 4px 8px;
    font-size: 12.5px;
    font-weight: 600;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gutter:not(.small) {
    position: relative;
    height: calc(var(--hour) * var(--rows));
  }
  .hour {
    position: absolute;
    right: 8px;
    transform: translateY(-50%);
    font-size: 11.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .hour:first-child {
    transform: none;
  }
  .col {
    position: relative;
    height: calc(var(--hour) * var(--rows));
    border-left: 1px solid var(--hairline);
    background-image: repeating-linear-gradient(to bottom, var(--hairline) 0 1px, transparent 1px var(--hour));
    cursor: copy;
  }
  .col.today {
    background-color: rgba(246, 207, 168, 0.12);
  }
  .ev {
    position: absolute;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding: 5px 8px;
    border: 0;
    border-radius: 12px;
    text-align: left;
    overflow: hidden;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(108, 78, 72, 0.12);
    transition: box-shadow 0.15s ease;
  }
  .ev:hover {
    box-shadow: var(--shadow-lift);
    z-index: 2;
  }
  .ev b {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    flex-shrink: 0;
    overflow-wrap: anywhere;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.2;
  }
  .ev span {
    display: block;
    margin-top: 1px;
    font-size: 11.5px;
    line-height: 1.25;
  }
  .ev.short {
    padding-top: 3px;
  }
  .ev.short b {
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }
  .ev.short span {
    display: none;
  }
  .now {
    position: absolute;
    left: 0;
    right: 0;
    border-top: 2px solid var(--rose-deep);
    pointer-events: none;
    z-index: 3;
  }
  .now::before {
    content: "";
    position: absolute;
    left: -5px;
    top: -6px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--rose-deep);
  }
</style>
