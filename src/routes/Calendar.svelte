<script lang="ts">
  import Icon from "../lib/components/Icon.svelte";
  import { addDays, fromKey, mondayOf, todayKey } from "../lib/calendar";
  import { route } from "../lib/router.svelte";
  import { newEvent } from "../lib/stores/calendar.svelte";
  import Agenda from "./calendar/Agenda.svelte";
  import ExamList from "./calendar/ExamList.svelte";
  import WeekGrid from "./calendar/WeekGrid.svelte";

  const tabs = [
    { id: "", label: "Week" },
    { id: "agenda", label: "Next 14 days" },
    { id: "exams", label: "Exams" },
  ];
  const tab = $derived(tabs.some((t) => t.id === route.rest) ? route.rest : "");
  let weekStart = $state(mondayOf(todayKey()));
  const title = $derived.by(() => {
    const a = fromKey(weekStart);
    const b = fromKey(addDays(weekStart, 6));
    const m = (d: Date) => d.toLocaleDateString("en-US", { month: "long" });
    return a.getMonth() === b.getMonth() ? `${m(a)} ${a.getFullYear()}` : `${m(a)} – ${m(b)} ${b.getFullYear()}`;
  });
</script>

<div class="cal">
  <header class="top">
    <h1 class="display">{tab === "" ? title : tab === "agenda" ? "Next 14 days" : "Exams"}</h1>
    <div class="actions">
      {#if tab === ""}
        <button class="btn quiet icon" type="button" aria-label="Previous week" onclick={() => (weekStart = addDays(weekStart, -7))}><Icon name="back" size={18} /></button>
        <button class="btn quiet" type="button" onclick={() => (weekStart = mondayOf(todayKey()))}>Today</button>
        <button class="btn quiet icon flip" type="button" aria-label="Next week" onclick={() => (weekStart = addDays(weekStart, 7))}><Icon name="back" size={18} /></button>
      {/if}
      <button class="btn primary" type="button" onclick={() => newEvent(tab === "exams" ? { kind: "exam", start: "09:00", end: "11:00" } : {})}>
        + {tab === "exams" ? "Add exam" : "New event"}
      </button>
    </div>
  </header>

  <nav class="tabs" aria-label="Calendar views">
    {#each tabs as t}
      <a href={t.id ? `#/calendar/${t.id}` : "#/calendar"} class:on={tab === t.id} aria-current={tab === t.id ? "page" : undefined}>{t.label}</a>
    {/each}
  </nav>

  {#if tab === ""}
    <WeekGrid {weekStart} />
  {:else if tab === "agenda"}
    <Agenda />
  {:else}
    <ExamList />
  {/if}
</div>

<style>
  .cal {
    display: grid;
    gap: var(--gap);
    min-width: 0;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 0 4px;
  }
  h1 {
    font-size: clamp(26px, 3vw, 34px);
    font-weight: 600;
  }
  .actions {
    display: flex;
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
  .tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    padding: 4px;
    background: var(--chip);
    border-radius: var(--radius-pill);
    justify-self: start;
  }
  .tabs a {
    display: inline-flex;
    align-items: center;
    min-height: 40px;
    padding: 0 18px;
    border-radius: var(--radius-pill);
    text-decoration: none;
    font-weight: 500;
    color: var(--text-muted);
  }
  .tabs a.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
</style>
