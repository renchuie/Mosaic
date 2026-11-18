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
  // the Notes pages fill the main panel edge to edge (own top bar, notes list as a column)
  const notesPages = $derived(route.page === "study" && /^notes(\/|$)/.test(route.rest));
  const notePage = $derived(route.page === "study" && route.rest.startsWith("notes/"));
  const writing = $derived(ui.writing && notePage);
  // the review screen fills the panel: progress on top, card centred, rating buttons at the bottom
  const fit = $derived(route.page === "study" && /^cards\/(review|cram)/.test(route.rest));
</script>

<div class="shell" class:writing>
  {#if writing}<div class="redge" aria-hidden="true"></div><div class="tedge" aria-hidden="true"></div>{/if}
  <Sidebar />
  <main class:flush={viewer || notesPages} class:fit>
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
    /* no backdrop blur here (Nov 19, her "scrolling isn't smooth"): WebKitGTK re-blurs the whole
       panel on every scroll frame, and the colour blooms behind it are soft already */
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
  main.fit .view {
    height: 100%;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr);
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
  /* Window "Curve" (default) and "Glass rail": no border around the app, like a native app. The page
     is one sheet touching the window's top, right and bottom edges; Curve gives it a big rounded
     left side beside the rail (the bloom peeks through there), Glass rail a straight hairline. */
  :global(:root:not([data-frame="float"])) .shell {
    grid-template-columns: 80px minmax(0, 1fr);
    gap: 0;
    padding: 0;
  }
  :global(:root:not([data-frame="float"])) main {
    background: var(--sheet, var(--panel));
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
  :global(:root[data-frame="curve"]) main {
    border-radius: 38px 0 0 38px;
    box-shadow: -14px 0 40px -26px rgba(40, 44, 80, 0.45), inset 1px 0 0 color-mix(in srgb, var(--white, #fff) 70%, transparent);
  }
  :global(:root:not([data-frame="float"])) .shell.writing {
    grid-template-columns: 0 minmax(0, 1fr);
  }
  /* in writing mode the rail always comes back as the floating pill */
  :global(:root) .shell.writing :global(.rail) {
    width: 76px;
    height: auto;
    padding: 16px 0 14px;
    border: var(--edge);
    border-radius: 28px;
    background: var(--surface-float, var(--surface));
    -webkit-backdrop-filter: var(--blur);
    backdrop-filter: var(--blur);
    top: 12px;
    bottom: 12px;
    left: 12px;
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
    :global(:root[data-frame="float"]) .shell {
      gap: 10px;
      padding: 10px;
    }
    main {
      padding: 20px 18px 28px;
    }
    :global(:root[data-frame="float"]) main {
      border-radius: 28px;
    }
  }
</style>
