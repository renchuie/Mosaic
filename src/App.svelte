<script lang="ts">
  import Sidebar from "./lib/components/Sidebar.svelte";
  import { route } from "./lib/router.svelte";
  import Dashboard from "./routes/Dashboard.svelte";
  import Labs from "./routes/Labs.svelte";
  import Settings from "./routes/Settings.svelte";
  import Calendar from "./routes/Calendar.svelte";
  import Tasks from "./routes/Tasks.svelte";
  import EventEditor from "./lib/components/EventEditor.svelte";
  import TagManager from "./lib/components/TagManager.svelte";
  import ComingSoon from "./routes/ComingSoon.svelte";

  const soon = {
    courses: { title: "Courses", phase: 5, text: "Assessments, current grade, what you need on what's left, and Top 200/300 quizzes." },
  } as const;

  const viewer = $derived(route.page === "labs" && /\.html?$/i.test(route.rest));
</script>

<div class="shell">
  <Sidebar />
  <main class:flush={viewer}>
    {#if route.page === "dashboard"}
      <Dashboard />
    {:else if route.page === "labs"}
      <Labs />
    {:else if route.page === "tasks"}
      <Tasks />
    {:else if route.page === "calendar"}
      <Calendar />
    {:else if route.page === "settings"}
      <Settings />
    {:else}
      <ComingSoon {...soon[route.page]} />
    {/if}
  </main>
</div>
<EventEditor />
<TagManager />

<style>
  .shell {
    display: grid;
    grid-template-columns: 212px minmax(0, 1fr);
    height: 100%;
    padding: 14px;
  }
  main {
    min-width: 0;
    overflow-y: auto;
    background: var(--panel);
    border-radius: 34px;
    box-shadow: var(--shadow);
    padding: 26px 26px 32px;
  }
  main.flush {
    padding: 0;
    overflow: hidden;
  }
  @media (max-width: 860px) {
    .shell {
      grid-template-columns: 62px minmax(0, 1fr);
      padding: 10px;
    }
    main {
      padding: 20px 18px 28px;
      border-radius: 28px;
    }
  }
</style>
