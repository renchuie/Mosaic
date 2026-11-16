<script lang="ts">
  import Icon from "../lib/components/Icon.svelte";
  import { route } from "../lib/router.svelte";
  import { newTask } from "../lib/stores/calendar.svelte";
  import { overdue, tasks } from "../lib/stores/tasks.svelte";
  import Board from "./tasks/Board.svelte";
  import StudyPlan from "./tasks/StudyPlan.svelte";
  import TaskList from "./tasks/TaskList.svelte";

  const TABS = [
    { id: "", label: "List", icon: "tasks" },
    { id: "board", label: "Board", icon: "dashboard" },
    { id: "plan", label: "Study plan", icon: "clock" },
  ];
  const tab = $derived(TABS.some((t) => t.id === route.rest) ? route.rest : "");
  const open = $derived(tasks().filter(([, t]) => t.repeat || t.status !== "done").length);
  const late = $derived(overdue().length);
</script>

<div class="page">
  <header class="top">
    <div>
      <h1 class="display">{tab === "plan" ? "Study plan" : "Tasks"}</h1>
      <p class="muted">
        {#if tab === "plan"}Plan today in blocks, run the timer, tick them off.{:else}{open} open{late ? ` · ${late} overdue` : ""}. Tasks with a due date also show on your calendar.{/if}
      </p>
    </div>
    {#if tab !== "plan"}
      <button class="btn primary" type="button" onclick={(e) => newTask({}, e)}>+ New task</button>
    {/if}
  </header>

  <nav class="tabs" aria-label="Task views">
    {#each TABS as t}
      <a href={t.id ? `#/tasks/${t.id}` : "#/tasks"} class:on={tab === t.id} aria-current={tab === t.id ? "page" : undefined}><Icon name={t.icon} size={16} /> {t.label}</a>
    {/each}
  </nav>

  {#if tab === "board"}
    <Board />
  {:else if tab === "plan"}
    <StudyPlan />
  {:else}
    <TaskList />
  {/if}
</div>

<style>
  .page {
    display: grid;
    gap: var(--gap);
    min-width: 0;
  }
  .top {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 0 4px;
  }
  h1 {
    font-size: clamp(28px, 3.4vw, 38px);
    font-weight: 600;
  }
  .top p {
    font-size: 14.5px;
  }
  .tabs {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--chip);
    border-radius: var(--radius-pill);
    justify-self: start;
    max-width: 100%;
    overflow-x: auto;
  }
  .tabs a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 18px;
    border-radius: var(--radius-pill);
    text-decoration: none;
    font-weight: 500;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .tabs a.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
</style>
