<script lang="ts">
  import Sidebar from "./lib/components/Sidebar.svelte";
  import { route } from "./lib/router.svelte";
  import Dashboard from "./routes/Dashboard.svelte";
  import Labs from "./routes/Labs.svelte";
  import Settings from "./routes/Settings.svelte";
  import Calendar from "./routes/Calendar.svelte";
  import Tasks from "./routes/Tasks.svelte";
  import Courses from "./routes/Courses.svelte";
  import Study from "./routes/Study.svelte";
  import EventEditor from "./lib/components/EventEditor.svelte";
  import TagManager from "./lib/components/TagManager.svelte";
  import BlockStyleManager from "./lib/components/BlockStyleManager.svelte";
  import TimerPill from "./lib/components/TimerPill.svelte";
  import { fly } from "svelte/transition";
  import { backOut } from "svelte/easing";

  // pages arrive with a small springy rise (off when "reduce motion" is on)
  const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const arrive = { y: 18, duration: still ? 0 : 460, easing: (t: number) => backOut(t) * 0.92 + t * 0.08 };
  const pageKey = $derived(route.page === "labs" ? "study" : route.page);

  const viewer = $derived(route.page === "labs" && /\.html?$/i.test(route.rest));
</script>

<div class="shell">
  <Sidebar />
  <main class:flush={viewer}>
    {#key pageKey}
    <div class="view" in:fly={arrive}>
    {#if route.page === "dashboard"}
      <Dashboard />
    {:else if route.page === "study"}
      <Study />
    {:else if route.page === "labs"}
      <Labs />
    {:else if route.page === "courses"}
      <Courses />
    {:else if route.page === "tasks"}
      <Tasks />
    {:else if route.page === "calendar"}
      <Calendar />
    {:else if route.page === "settings"}
      <Settings />
    {/if}
    </div>
    {/key}
  </main>
</div>
<EventEditor />
<TagManager />
<BlockStyleManager />
<TimerPill />

<style>
  .shell {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    gap: var(--shell-pad);
    height: 100%;
    padding: var(--shell-pad);
  }
  main {
    min-width: 0;
    overflow-y: auto;
    background: var(--panel);
    border: var(--edge);
    -webkit-backdrop-filter: var(--blur);
    backdrop-filter: var(--blur);
    border-radius: 34px;
    box-shadow: var(--shadow);
    padding: var(--main-pad);
  }
  .view {
    min-height: 100%;
    display: grid;
    align-content: start;
  }
  main.flush {
    padding: 0;
    overflow: hidden;
  }
  main.flush .view {
    height: 100%;
  }
  @media (max-width: 860px) {
    .shell {
      gap: 10px;
      padding: 10px;
    }
    main {
      padding: 20px 18px 28px;
      border-radius: 28px;
    }
  }
</style>
