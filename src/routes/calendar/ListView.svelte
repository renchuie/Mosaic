<script lang="ts">
  import { addDays, weekday } from "../../lib/calendar";
  import { editEvent, eventIsExam, view, visible } from "../../lib/stores/calendar.svelte";
  import { daysBetween, todayKey } from "../../lib/calendar";
  import DayRows from "./DayRows.svelte";
  import EventCard from "./EventCard.svelte";

  const days = $derived(Array.from({ length: 14 }, (_, i) => addDays(view.cursor, i)));
  const all = $derived(visible(days[0], days[13]));
</script>

<DayRows {days} empty={(d) => (weekday(d) >= 5 ? "Weekend · nothing planned" : "Nothing planned")}>
  {#snippet children(d)}
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
