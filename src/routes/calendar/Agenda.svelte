<script lang="ts">
  import { KIND_LABEL, addDays, fmtTime, fromKey, todayKey } from "../../lib/calendar";
  import { editEvent, newEvent, occ } from "../../lib/stores/calendar.svelte";

  const today = todayKey();
  const list = $derived(occ(today, addDays(today, 13)));
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const label = (d: string, i: number) =>
    i === 0 ? "Today" : i === 1 ? "Tomorrow" : fromKey(d).toLocaleDateString("en-US", { weekday: "long" });
</script>

<div class="agenda">
  {#each days as d, i}
    {@const items = list.filter((o) => o.date === d)}
    <section class="day" class:empty={!items.length}>
      <header>
        <b>{label(d, i)}</b>
        <span class="muted">{fromKey(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
      </header>
      {#if items.length}
        <ul>
          {#each items as o (o.id + o.date)}
            {@const sub = [o.ev.course !== o.ev.title ? o.ev.course : "", o.ev.location].filter(Boolean).join(" · ")}
            <li>
              <button type="button" onclick={() => editEvent(o.id, o.date)}>
                <span class="time">{o.ev.allDay ? "All day" : `${fmtTime(o.ev.start)} – ${fmtTime(o.ev.end)}`}</span>
                <span class="what">
                  <b>{o.ev.title}</b>
                  {#if sub}<span class="muted">{sub}</span>{/if}
                </span>
                <span class="tag k-{o.ev.kind}">{KIND_LABEL[o.ev.kind]}</span>
              </button>
            </li>
          {/each}
        </ul>
      {:else}
        <button type="button" class="free muted" onclick={() => newEvent({ date: d })}>Nothing planned · add something</button>
      {/if}
    </section>
  {/each}
</div>

<style>
  .agenda {
    display: grid;
    gap: 10px;
  }
  .day {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    background: var(--surface);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
    padding: 12px 16px;
  }
  .day.empty {
    background: transparent;
    box-shadow: none;
    padding-top: 4px;
    padding-bottom: 4px;
  }
  header {
    display: grid;
    padding-top: 8px;
  }
  .empty header {
    padding-top: 10px;
  }
  header .muted {
    font-size: 13.5px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  li button {
    width: 100%;
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    min-height: var(--hit);
    padding: 6px 10px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    text-align: left;
  }
  li button:hover {
    background: var(--panel);
  }
  .time {
    font-size: 14px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .what {
    display: grid;
    min-width: 0;
  }
  .what b {
    font-weight: 600;
  }
  .what .muted {
    font-size: 13.5px;
  }
  .free {
    min-height: var(--hit);
    border: 0;
    background: none;
    text-align: left;
    padding: 0 10px;
    font-size: 14px;
    border-radius: 12px;
  }
  .free:hover {
    background: var(--surface);
    color: var(--text);
  }
  @media (max-width: 760px) {
    .day {
      grid-template-columns: 1fr;
      gap: 4px;
    }
    li button {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .time {
      grid-column: 1 / -1;
    }
  }
</style>
