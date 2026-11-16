<script lang="ts">
  import { addDays, fmtTime, fromKey, mondayOf, monthStart, todayKey } from "../../lib/calendar";
  import { editEvent, newEvent, tagStyle, view, visible } from "../../lib/stores/calendar.svelte";
  import { visibleTasks } from "../../lib/stores/tasks.svelte";
  import TaskChip from "../../lib/components/TaskChip.svelte";

  let { ondayview }: { ondayview: (day: string) => void } = $props();
  const first = $derived(mondayOf(monthStart(view.cursor)));
  const cells = $derived(Array.from({ length: 42 }, (_, i) => addDays(first, i)));
  const all = $derived(visible(cells[0], cells[41]));
  const allTasks = $derived(visibleTasks(cells[0], cells[41]));
  const month = $derived(view.cursor.slice(0, 7));
  const today = todayKey();
  const MAX = 3;
</script>

<div class="month">
  {#each ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as d}<span class="dow">{d}</span>{/each}
  {#each cells as c (c)}
    {@const items = all.filter((o) => o.date === c)}
    {@const dayTasks = allTasks.filter((o) => o.date === c)}
    {@const room = Math.max(0, MAX - dayTasks.length)}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="cell" class:out={c.slice(0, 7) !== month} class:today={c === today} onclick={(e) => newEvent({ date: c }, e)}>
      <button type="button" class="num" onclick={(e) => { e.stopPropagation(); ondayview(c); }} aria-label="Open {fromKey(c).toDateString()}">{Number(c.slice(8))}</button>
      {#each dayTasks.slice(0, MAX) as o (o.id + o.date)}
        <TaskChip {o} showTime={false} />
      {/each}
      {#each items.slice(0, room) as o (o.id + o.date)}
        <button type="button" class="chip" style={tagStyle(o.ev.kind)} onclick={(e) => { e.stopPropagation(); editEvent(o.id, o.date, e); }}>
          <span class="tag-dot"></span>
          {#if !o.ev.allDay}<span class="t">{fmtTime(o.ev.start).replace(":00", "").replace(" ", "").toLowerCase()}</span>{/if}
          <span class="n">{o.ev.title}</span>
        </button>
      {/each}
      {#if items.length + dayTasks.length > MAX}
        <button type="button" class="more" onclick={(e) => { e.stopPropagation(); ondayview(c); }}>+{items.length + dayTasks.length - MAX} more</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .month {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
    padding: 12px;
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .dow {
    padding: 4px 8px;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .cell {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-height: 112px;
    min-width: 0;
    padding: 6px;
    border-radius: 14px;
    background: var(--panel);
    cursor: copy;
  }
  .cell.out {
    background: transparent;
    opacity: 0.55;
  }
  .num {
    align-self: flex-start;
    min-width: 30px;
    height: 30px;
    padding: 0 6px;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    font-weight: 600;
    font-size: 13.5px;
    cursor: pointer;
  }
  .num:hover {
    background: var(--surface);
  }
  .today .num {
    background: var(--primary);
    color: var(--on-primary);
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    min-height: 24px;
    padding: 2px 7px;
    border: 0;
    border-radius: 8px;
    background: color-mix(in srgb, var(--tag) 45%, var(--white));
    font-size: 12px;
    text-align: left;
  }
  .chip .t {
    color: var(--text-muted);
    flex: none;
  }
  .chip .n {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .more {
    align-self: flex-start;
    border: 0;
    background: none;
    padding: 2px 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }
  @media (max-width: 760px) {
    .cell {
      min-height: 72px;
    }
    .chip .t {
      display: none;
    }
  }
</style>
