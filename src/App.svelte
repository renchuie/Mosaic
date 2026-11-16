<script lang="ts">
  import Sidebar from "./lib/components/Sidebar.svelte";
  import { route } from "./lib/router.svelte";
  import Dashboard from "./routes/Dashboard.svelte";
  import ComingSoon from "./routes/ComingSoon.svelte";

  const soon = {
    labs: { title: "Recall Labs", phase: 2, text: "Finds your labs in Google Drive, opens them here, and shows your progress." },
    calendar: { title: "Calendar", phase: 3, text: "Week view, 14-day agenda, exams, and study blocks written to Google Calendar." },
    tasks: { title: "Tasks", phase: 4, text: "Boards by status or course, your own categories, and the daily study plan with a timer." },
    courses: { title: "Courses", phase: 5, text: "Assessments, current grade, what you need on what's left, and Top 200/300 quizzes." },
    settings: { title: "Settings", phase: 6, text: "Name, labs folder, calendars, exam keywords, and JSON backup." },
  } as const;
</script>

<div class="shell">
  <Sidebar />
  <main>
    {#if route.page === "dashboard"}
      <Dashboard />
    {:else}
      <ComingSoon {...soon[route.page]} />
    {/if}
  </main>
</div>

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
