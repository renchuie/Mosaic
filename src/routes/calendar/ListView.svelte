<script lang="ts">
  import { addDays, daysBetween, todayKey, weekday } from "../../lib/calendar";
  import { editEvent, eventIsExam, view, visible } from "../../lib/stores/calendar.svelte";
  import { overdue, visibleTasks } from "../../lib/stores/tasks.svelte";
  import DayRows from "./DayRows.svelte";
  import EventCard from "./EventCard.svelte";
  import TaskCard from "./TaskCard.svelte";

  const today = todayKey();
  const days = $derived(Array.from({ length: 14 }, (_, i) => addDays(view.cursor, i)));
  const all = $derived(visible(days[0], days[13]));
  const dueTasks = $derived(visibleTasks(days[0], days[13]));
  /** Overdue tasks are shown above today when the list starts at or before today. */
  const late = $derived(view.cursor <= today ? overdue().filter((o) => !view.hidden.includes(o.task.tag ?? "task")) : []);
</script>

{#if late.length}
  <section class="late">
    <h2 class="h2">Overdue <span class="tag alert">{late.length}</span></h2>
    <div class="cards">
      {#each late as o (o.id + o.date)}<TaskCard {o} />{/each}
    </div>
  </section>
{/if}

<DayRows {days} empty={(d) => (weekday(d) >= 5 ? "Weekend · nothing planned" : "Nothing planned")}>
  {#snippet children(d)}
    {#each dueTasks.filter((o) => o.date === d) as o (o.id + o.date)}
      <TaskCard {o} />
    {/each}
    {#each all.filter((o) => o.date === d) as o (o.id + o.date)}
      <EventCard
        title={o.ev.title}
        kind={o.ev.kind}
        start={o.ev.start}
        end={o.ev.end}
        allDay={o.ev.allDay}
        course={o.ev.course}
        location={o.ev.location}
        notes={o.ev.notes}
        repeats={!!o.ev.repeat}
        countdown={eventIsExam(o.ev) ? daysBetween(todayKey(), o.date) : undefined}
        onclick={(e) => editEvent(o.id, o.date, e)}
      />
    {/each}
  {/snippet}
</DayRows>

<style>
  .late {
    display: grid;
    gap: 12px;
    padding: 16px;
    margin-bottom: var(--gap);
    border-radius: var(--radius);
    background: var(--rose-soft);
  }
  .late .h2 {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
    align-items: start;
  }
</style>
