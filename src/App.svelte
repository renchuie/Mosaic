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
  import { ui } from "./lib/stores/ui.svelte";

  // pages arrive with a small springy rise (off when "reduce motion" is on)
  const still = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const arrive = { y: 18, duration: still ? 0 : 460, easing: (t: number) => backOut(t) * 0.92 + t * 0.08 };
  const pageKey = $derived(route.page === "labs" ? "study" : route.page);

  const viewer = $derived(route.page === "labs" && /\.html?$/i.test(route.rest));
  // an open note fills the main panel edge to edge (one sheet, its own top bar)
  const notePage = $derived(route.page === "study" && route.rest.startsWith("notes/"));
  const writing = $derived(ui.writing && notePage);
</script>

<div class="shell" class:writing>
  {#if writing}<div class="redge" aria-hidden="true"></div><div class="tedge" aria-hidden="true"></div>{/if}
  <Sidebar />
  <main class:flush={viewer || notePage}>
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
    grid-column: 2;
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
    grid-template-rows: minmax(0, 1fr);
  }
  /* writing mode: the rail slides out to a glowing edge and floats back when the mouse touches it */
  .shell {
    transition: grid-template-columns 0.35s var(--ease-out, ease), gap 0.35s var(--ease-out, ease);
  }
  .shell.writing {
    grid-template-columns: 0 minmax(0, 1fr);
    gap: 0;
  }
  .shell :global(.rail) {
    transition: transform 0.35s var(--spring, ease), opacity 0.25s;
  }
  .shell.writing :global(.rail) {
    position: fixed;
    top: var(--shell-pad);
    bottom: var(--shell-pad);
    left: var(--shell-pad);
    transform: translateX(calc(-100% - var(--shell-pad) - 8px));
    opacity: 0;
  }
  .shell.writing :global(.rail:hover),
  .shell.writing :global(.rail:focus-within),
  .shell.writing .redge:hover ~ :global(.rail) {
    transform: none;
    opacity: 1;
    box-shadow: var(--shadow-lift);
  }
  .redge {
    position: fixed;
    z-index: 29;
    left: 0;
    top: 15%;
    bottom: 15%;
    width: 14px;
  }
  /* top edge: the note page shows its top bar while the mouse is here (NotesView reads :hover) */
  .tedge {
    position: fixed;
    z-index: 28;
    top: 0;
    left: 0;
    right: 0;
    height: calc(var(--shell-pad) + 12px);
  }
  .redge::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 5px;
    border-radius: 0 6px 6px 0;
    background: linear-gradient(180deg, #ffc9da, #c9d3ff, #bfebdd);
    box-shadow: 0 0 16px 3px color-mix(in srgb, #c9d3ff 70%, transparent);
    opacity: 0.8;
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
