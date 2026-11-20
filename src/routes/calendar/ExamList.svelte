<script lang="ts">
  import { addMonths, daysInMonth, fromKey, monthStart } from "../../lib/calendar";
  import { editEvent, exams, view } from "../../lib/stores/calendar.svelte";
  import { folderHref } from "../../lib/stores/labs.svelte";
  import { settings } from "../../lib/stores/settings.svelte";
  import DayRows from "./DayRows.svelte";
  import EventCard from "./EventCard.svelte";

  const list = $derived(exams());
  const year = $derived(Number(view.cursor.slice(0, 4)));
  const month = $derived(view.cursor.slice(0, 7));
  const days = $derived(Array.from({ length: daysInMonth(view.cursor) }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`));
  const inMonth = $derived(list.filter((e) => e.date.startsWith(month)));
  const counts = $derived(Object.fromEntries(Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, "0")}`;
    return [m, list.filter((e) => e.date.startsWith(m)).length];
  })));
  const next = $derived(list.find((e) => e.days >= 0));
  /** Days with exams stay rows; runs of days without exams fold into one short row. */
  const rows = $derived.by(() => {
    const out: (string | [string, string])[] = [];
    let run: [string, string] | null = null;
    for (const d of days) {
      if (inMonth.some((e) => e.date === d)) {
        if (run) out.push(run);
        run = null;
        out.push(d);
      } else if (run) run[1] = d;
      else run = [d, d];
    }
    if (run) out.push(run);
    return out;
  });
  const pick = (m: string) => (view.cursor = `${m}-01`);
  const name = (m: string) => fromKey(`${m}-01`).toLocaleDateString("en-US", { month: "short" });
</script>

<div class="exams">
  <div class="head card">
    <div>
      <h2 class="h2">Exam calendar</h2>
      <p class="muted">
        {#if next}Next: <b>{next.title}</b> in {next.days === 0 ? "0 days (today)" : next.days === 1 ? "1 day" : `${next.days} days`}{:else}No upcoming exams{/if}
      </p>
    </div>
    <div class="pills" role="tablist" aria-label="Month">
      <button type="button" class="arrow" aria-label="Previous year" onclick={() => (view.cursor = addMonths(monthStart(view.cursor), -12))}>‹</button>
      {#each Object.entries(counts) as [m, n] (m)}
        <button type="button" role="tab" aria-selected={m === month} class:on={m === month} onclick={() => pick(m)}>
          {name(m)}{#if n}<i>{n}</i>{/if}
        </button>
      {/each}
      <button type="button" class="arrow" aria-label="Next year" onclick={() => (view.cursor = addMonths(monthStart(view.cursor), 12))}>›</button>
    </div>
  </div>

  {#if inMonth.length}
    <DayRows days={rows} empty={() => "No exams"}>
      {#snippet children(d)}
        {#each inMonth.filter((e) => e.date === d) as e (e.key)}
          <EventCard
            title={e.title}
            kind={e.kind}
            start={e.start}
            end={e.end}
            allDay={!e.start}
            course={e.course}
            location={e.location}
            countdown={e.days}
            onclick={(ev) => (e.id ? editEvent(e.id, e.date, ev) : (location.hash = folderHref(e.rel ?? "")))}
          />
        {/each}
      {/snippet}
    </DayRows>
  {:else}
    <section class="card empty">
      <p>No exams in {fromKey(`${month}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}.</p>
    </section>
  {/if}

  <p class="muted hint">
    Exams are events with a tag marked “Exam” (change this under Edit tags), events tagged Other whose title contains
    “{settings.examKeywords}”, and Materials folders with an exam date.
  </p>
</div>

<style>
  .exams {
    display: grid;
    gap: var(--gap);
  }
  .head {
    display: grid;
    gap: 14px;
  }
  .head p {
    font-size: 14.5px;
  }
  .pills {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 2px;
  }
  .pills button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: none;
    min-height: 40px;
    padding: 0 16px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--panel);
    font-weight: 500;
    font-size: 14px;
  }
  .pills button.on {
    background: var(--primary);
    color: var(--on-primary);
  }
  .pills i {
    font-style: normal;
    display: grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    border-radius: 10px;
    background: var(--rose);
    color: var(--text);
    font-size: 11.5px;
    font-weight: 700;
  }
  .pills .arrow {
    width: 40px;
    padding: 0;
    justify-content: center;
    font-size: 20px;
  }
  .empty p {
    color: var(--text-muted);
  }
  .hint {
    font-size: 13.5px;
    padding: 0 4px;
  }
</style>
