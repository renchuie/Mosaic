<script lang="ts">
  // Day and Week views: a time grid with card-style events (tag header,
  // title, description, footer), a "now" line with a time pill.
  import Icon from "../../lib/components/Icon.svelte";
  import { fmtTime, fromKey, minutes, pad, todayKey, type Occurrence } from "../../lib/calendar";
  import { editEvent, newEvent, tagOf, tagStyle, visible } from "../../lib/stores/calendar.svelte";

  let { days }: { days: string[] } = $props();
  const HOUR = 68;

  const all = $derived(visible(days[0], days[days.length - 1]));
  const timed = $derived(all.filter((o) => !o.ev.allDay && o.ev.start && o.ev.end));
  const allDay = $derived(all.filter((o) => o.ev.allDay));
  const startHour = $derived(Math.min(8, ...timed.map((o) => Math.floor(minutes(o.ev.start) / 60))));
  const endHour = $derived(Math.max(21, ...timed.map((o) => Math.ceil(minutes(o.ev.end) / 60))));
  const hours = $derived(Array.from({ length: endHour - startHour }, (_, i) => startHour + i));

  let now = $state(new Date());
  $effect(() => {
    const t = setInterval(() => (now = new Date()), 30_000);
    return () => clearInterval(t);
  });
  const today = $derived(todayKey());
  const nowMin = $derived(now.getHours() * 60 + now.getMinutes());
  const nowTop = $derived(((nowMin - startHour * 60) / 60) * HOUR);
  const showNow = $derived(days.includes(today) && nowTop >= 0 && nowTop <= hours.length * HOUR);

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
      clusterEnd = Math.max(clusterEnd, minutes(o.ev.end));
    }
    flush();
    return out;
  }

  const hhmm = (x: number) => `${pad(Math.floor(x / 60))}:${pad(x % 60)}`;
  function addAt(day: string, e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const m = Math.min(Math.floor(((e.clientY - rect.top) / HOUR) * 2) * 30 + startHour * 60, 23 * 60);
    newEvent({ date: day, start: hhmm(m), end: hhmm(Math.min(m + 60, 23 * 60 + 55)) }, e);
  }
  const footOf = (o: Occurrence) => [o.ev.course !== o.ev.title ? o.ev.course : "", o.ev.location].filter(Boolean).join(" · ");
  const hourLabel = (h: number) => (h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`);
</script>

<div class="scroller">
  <div class="grid" class:single={days.length === 1} style="--hour: {HOUR}px; --rows: {hours.length}; --cols: {days.length}">
    <div class="corner muted">{Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace("_", " ")}</div>
    {#each days as d}
      {@const dt = fromKey(d)}
      <div class="dayhead" class:today={d === today}>
        <span>{dt.toLocaleDateString("en-US", { weekday: days.length === 1 ? "long" : "long" })}</span>
        <span class="num">{dt.getDate()}</span>
      </div>
    {/each}

    {#if allDay.length}
      <div class="gutter-label muted">All day</div>
      {#each days as d}
        <div class="allday">
          {#each allDay.filter((o) => o.date === d) as o (o.id + o.date)}
            <button type="button" class="chip" style={tagStyle(o.ev.kind)} onclick={(e) => editEvent(o.id, o.date, e)}><span class="tag-dot"></span>{o.ev.title}</button>
          {/each}
        </div>
      {/each}
    {/if}

    <div class="timearea">
    <div class="gutter">
      {#each hours as h}
        <span class="hour" style="top: {(h - startHour) * HOUR}px">{hourLabel(h)}</span>
      {/each}
      {#if showNow}
        <span class="nowpill" style="top: {nowTop}px">{fmtTime(hhmm(nowMin))}</span>
      {/if}
    </div>
    {#each days as d}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="col" class:today={d === today} onclick={(e) => addAt(d, e)} title="Click to add">
        {#each layout(timed.filter((o) => o.date === d)) as { o, lane, lanes } (o.id + o.date)}
          {@const top = ((minutes(o.ev.start) - startHour * 60) / 60) * HOUR}
          {@const height = Math.max(((minutes(o.ev.end) - minutes(o.ev.start)) / 60) * HOUR, 30)}
          <button
            type="button"
            class="ev"
            class:mid={height < 150}
            class:short={height < 140}
            class:tiny={height < 62 || (lanes > 1 && height < 118)}
            class:lane={lanes > 1}
            style="{tagStyle(o.ev.kind)} top: {top + 2}px; height: {height - 5}px; left: calc({(lane / lanes) * 100}% + 4px); width: calc({100 / lanes}% - 8px)"
            onclick={(e) => {
              e.stopPropagation();
              editEvent(o.id, o.date, e);
            }}
          >
            <span class="head">
              <span class="pill"><span class="tag-dot"></span>{tagOf(o.ev.kind).name}</span>
              {#if o.ev.repeat}<Icon name="repeat" size={13} />{/if}
            </span>
            <span class="body">
              <b>{o.ev.title}</b>
              {#if o.ev.notes}<span class="notes">{o.ev.notes}</span>{/if}
              <span class="time">{fmtTime(o.ev.start)} – {fmtTime(o.ev.end)}</span>
            </span>
            {#if footOf(o)}<span class="foot">{footOf(o)}</span>{/if}
          </button>
        {/each}
      </div>
    {/each}
    {#if showNow}
      <div class="nowline" style="top: {nowTop}px" aria-hidden="true"></div>
    {/if}
    </div>
  </div>
</div>

<style>
  .scroller {
    overflow-x: auto;
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .grid {
    position: relative;
    display: grid;
    grid-template-columns: 64px repeat(var(--cols), minmax(116px, 1fr));
    min-width: calc(64px + var(--cols) * 116px);
    padding-bottom: 14px;
  }
  .grid.single {
    grid-template-columns: 64px minmax(0, 1fr);
    min-width: 0;
  }
  .corner {
    display: grid;
    place-items: center;
    font-size: 11.5px;
    border-bottom: 1px solid var(--hairline);
  }
  .dayhead {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 6px;
    border-bottom: 1px solid var(--hairline);
    border-left: 1px solid var(--hairline);
    font-weight: 600;
    font-size: 14.5px;
  }
  .num {
    display: grid;
    place-items: center;
    min-width: 28px;
    height: 28px;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: var(--panel);
    font-size: 13px;
  }
  .dayhead.today {
    background: var(--panel);
  }
  .dayhead.today .num {
    background: var(--primary);
    color: var(--on-primary);
  }
  .gutter-label {
    display: grid;
    place-items: center;
    font-size: 12px;
    border-bottom: 1px solid var(--hairline);
  }
  .allday {
    display: grid;
    gap: 4px;
    align-content: start;
    padding: 6px;
    border-left: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 10px;
    border: 0;
    border-radius: 10px;
    background: color-mix(in srgb, var(--tag) 40%, var(--white));
    font-size: 13px;
    font-weight: 600;
    text-align: left;
    overflow: hidden;
    white-space: nowrap;
  }
  .gutter {
    position: relative;
    height: calc(var(--hour) * var(--rows));
  }
  .hour {
    position: absolute;
    right: 12px;
    transform: translateY(-50%);
    font-size: 12.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .hour:first-child {
    transform: translateY(4px);
  }
  .nowpill {
    position: absolute;
    margin-top: 0;
    right: 4px;
    transform: translateY(-50%);
    padding: 3px 8px;
    border-radius: var(--radius-pill);
    background: var(--primary);
    color: var(--on-primary);
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
    z-index: 4;
  }
  .col {
    position: relative;
    height: calc(var(--hour) * var(--rows));
    border-left: 1px solid var(--hairline);
    background-image: repeating-linear-gradient(to bottom, var(--hairline) 0 1px, transparent 1px var(--hour));
    cursor: copy;
  }
  .col.today {
    background-color: var(--panel);
  }
  .timearea {
    position: relative;
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    padding-top: 10px;
  }
  .nowline {
    position: absolute;
    left: 64px;
    right: 0;
    margin-top: 10px;
    border-top: 1.5px solid var(--charcoal);
    pointer-events: none;
    z-index: 3;
  }

  .ev {
    position: absolute;
    display: flex;
    flex-direction: column;
    padding: 0;
    border: 0;
    border-radius: 16px;
    background: color-mix(in srgb, var(--tag) 22%, var(--white));
    text-align: left;
    overflow: hidden;
    cursor: pointer;
    box-shadow: 0 1px 2px rgba(108, 78, 72, 0.1), 0 0 0 1px color-mix(in srgb, var(--tag) 45%, transparent);
    transition: box-shadow 0.15s ease, transform 0.15s ease;
  }
  .ev:hover {
    box-shadow: var(--shadow-lift);
    transform: translateY(-1px);
    z-index: 2;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    flex-shrink: 0;
    padding: 7px 8px;
    background: color-mix(in srgb, var(--tag) 60%, var(--white));
    color: var(--text-muted);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 3px 9px;
    border-radius: 8px;
    background: var(--white);
    color: var(--text);
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .body {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    gap: 3px;
    padding: 8px 10px 6px;
    min-height: 0;
    overflow: hidden;
  }
  .body b {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
    flex-shrink: 0;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.25;
  }
  .notes {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    flex-shrink: 0;
    font-size: 12.5px;
    color: var(--text-muted);
    line-height: 1.35;
  }
  .time {
    font-size: 12px;
    color: var(--text-muted);
    flex-shrink: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .foot {
    margin-top: auto;
    flex-shrink: 0;
    padding: 6px 10px 8px;
    border-top: 1px solid color-mix(in srgb, var(--tag) 45%, transparent);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  /* shorter and narrower events show less: notes go first, then the footer, then the tag row */
  .ev.mid .notes,
  .ev.short .foot,
  .ev.lane .foot,
  .ev.lane .notes {
    display: none;
  }
  .ev.lane .head {
    padding: 5px 6px;
  }
  .ev.lane .pill {
    padding: 2px 6px;
  }
  .ev.mid .body {
    padding-top: 6px;
  }
  .ev.tiny .head {
    display: none;
  }
  .ev.tiny {
    background: color-mix(in srgb, var(--tag) 50%, var(--white));
  }
  .ev.tiny .body {
    padding: 5px 9px;
    gap: 0;
  }
  .ev.tiny .body b {
    -webkit-line-clamp: 1;
    line-clamp: 1;
    font-size: 13px;
  }
</style>
