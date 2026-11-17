<script lang="ts">
  // The floating rail (chosen Nov 16, option A): logo, quick add, one icon per page with a
  // dark marker that slides to the active one, overdue dot on Tasks, and at the bottom only her
  // avatar (Nov 18, her ask: keep the rail minimal): hovering it opens a small menu with Settings
  // and Appearance. Page names show on hover / keyboard focus.
  import Icon from "./Icon.svelte";
  import { NAV, route } from "../router.svelte";
  import { overdue } from "../stores/tasks.svelte";
  import { newEvent, newTask } from "../stores/calendar.svelte";
  import { settings } from "../stores/settings.svelte";
  import NewNoteDialog from "../../routes/study/NewNoteDialog.svelte";

  const late = $derived(overdue().length);
  const labels: Record<string, string> = {
    dashboard: "Dashboard",
    study: "Study",
    calendar: "Calendar",
    tasks: "Tasks",
    courses: "Courses",
    settings: "Settings",
  };
  const pages = NAV.filter((p) => p !== "settings");
  const activePage = $derived(route.page === "labs" ? "study" : route.page);

  // the sliding marker follows the active icon
  let items: Record<string, HTMLAnchorElement> = {};
  let markerY = $state<number | null>(null);
  $effect(() => {
    const el = items[activePage];
    markerY = el ? el.offsetTop : null;
  });

  let addOpen = $state(false);
  let noteOpen = $state(false);
  function add(kind: "task" | "event" | "note" | "card" | "pdf") {
    addOpen = false;
    if (kind === "task") newTask({});
    else if (kind === "event") newEvent({});
    else if (kind === "note") noteOpen = true;
    else if (kind === "card") location.hash = "#/study/cards/library";
    else location.hash = "#/study/pdfs";
  }
  const initial = $derived((settings.name || "?").trim().charAt(0).toUpperCase());
  // the avatar menu: opens on hover (CSS) or click / keyboard (state)
  let meOpen = $state(false);
  function goSettings(section?: string) {
    meOpen = false;
    (document.activeElement as HTMLElement | null)?.blur?.();
    location.hash = "#/settings";
    if (section) setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && ((addOpen = false), (meOpen = false))} />

<aside class="rail" aria-label="Mosaic">
  <a href="#/dashboard" class="logo" aria-label="Mosaic home">
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <defs><linearGradient id="mosaic-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC9DA" /><stop offset=".55" stop-color="#C9D3FF" /><stop offset="1" stop-color="#BFEBDD" /></linearGradient></defs>
      <rect width="120" height="120" rx="28" fill="url(#mosaic-g)" />
      <rect x="20" y="30" width="46" height="46" rx="12" fill="#fff" fill-opacity=".45" stroke="#fff" stroke-width="2" transform="rotate(-8 43 53)" />
      <rect x="50" y="22" width="46" height="46" rx="12" fill="#fff" fill-opacity=".55" stroke="#fff" stroke-width="2" transform="rotate(6 73 45)" />
      <rect x="38" y="52" width="46" height="46" rx="12" fill="#fff" fill-opacity=".7" stroke="#fff" stroke-width="2" />
      <rect x="50" y="64" width="22" height="22" rx="6" fill="#7D8BE8" fill-opacity=".8" />
    </svg>
  </a>

  <div class="addwrap">
    <button type="button" class="add" class:open={addOpen} aria-label="Quick add" aria-expanded={addOpen} data-tip="Quick add" onclick={() => (addOpen = !addOpen)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
    </button>
    {#if addOpen}
      <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
      <div class="scrim" onclick={() => (addOpen = false)}></div>
      <div class="menu addmenu" role="menu" aria-label="Quick add">
        <button type="button" role="menuitem" onclick={() => add("task")}><Icon name="tasks" size={17} /> Task</button>
        <button type="button" role="menuitem" onclick={() => add("event")}><Icon name="calendar" size={17} /> Event</button>
        <button type="button" role="menuitem" onclick={() => add("note")}><Icon name="pen" size={17} /> Note</button>
        <button type="button" role="menuitem" onclick={() => add("card")}><Icon name="star" size={17} /> Flashcard</button>
        <button type="button" role="menuitem" onclick={() => add("pdf")}><Icon name="file" size={17} /> Open a PDF</button>
      </div>
    {/if}
  </div>

  <span class="sep" aria-hidden="true"></span>

  <nav aria-label="Pages">
    {#if markerY !== null}<span class="marker" style="transform: translateY({markerY}px)" aria-hidden="true"></span>{/if}
    {#each pages as p}
      {@const on = activePage === p}
      <a href="#/{p}" class="item" class:active={on} aria-current={on ? "page" : undefined} aria-label={p === "tasks" && late ? `${labels[p]}, ${late} overdue` : labels[p]} data-tip={labels[p]} bind:this={items[p]}>
        <Icon name={p === "study" ? "book" : p} size={21} />
        {#if p === "tasks" && late}<span class="late" aria-hidden="true"></span>{/if}
      </a>
    {/each}
  </nav>

  <span class="grow"></span>

  <div class="me" class:open={meOpen}>
    <button type="button" class="avatar" class:here={route.page === "settings"} aria-label="{settings.name || 'You'}: settings and more" aria-haspopup="menu" aria-expanded={meOpen} onclick={() => (meOpen = !meOpen)}>{initial}</button>
    <div class="menu memenu" role="menu" aria-label="You">
      <div class="who"><span class="avatar big" aria-hidden="true">{initial}</span><span><b>{settings.name || "You"}</b><small>Mosaic</small></span></div>
      <button type="button" role="menuitem" class:on={route.page === "settings"} onclick={() => goSettings()}><Icon name="settings" size={17} /> Settings</button>
      <button type="button" role="menuitem" onclick={() => goSettings("look-h")}><Icon name="star" size={17} /> Appearance</button>
    </div>
  </div>
  {#if meOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="scrim" onclick={() => (meOpen = false)}></div>
  {/if}
</aside>

<NewNoteDialog bind:open={noteOpen} />

<style>
  .rail {
    position: relative;
    z-index: 30;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 76px;
    padding: 16px 0 14px;
    border-radius: 28px;
    background: var(--surface);
    border: var(--edge);
    -webkit-backdrop-filter: var(--blur);
    backdrop-filter: var(--blur);
    box-shadow: var(--shadow);
    animation: rail-in 0.6s var(--spring) backwards;
  }
  @keyframes rail-in {
    from {
      opacity: 0;
      transform: translateX(-24px);
    }
  }
  .logo {
    display: block;
    width: 46px;
    height: 46px;
    margin-bottom: 8px;
    border-radius: 14px;
    box-shadow: 0 8px 18px -10px rgba(40, 44, 80, 0.45);
  }
  .logo svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .logo:hover {
    transform: rotate(-6deg) scale(1.06);
  }

  .addwrap {
    position: relative;
  }
  .add {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border: 0;
    border-radius: 50%;
    background: var(--chip);
    color: var(--text);
  }
  .add svg {
    transition: transform var(--t) var(--spring);
  }
  .add:hover {
    transform: scale(1.08);
    background: color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .add.open svg {
    transform: rotate(135deg);
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 1;
  }
  .addmenu {
    position: absolute;
    left: 60px;
    top: 0;
    z-index: 2;
    min-width: 200px;
    display: grid;
    gap: 2px;
    padding: 8px;
    border-radius: 20px;
    background: var(--surface-float);
    box-shadow: var(--shadow-lift);
    transform-origin: left top;
  }
  .addmenu button {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    padding: 0 14px;
    border: 0;
    border-radius: 14px;
    background: none;
    text-align: left;
    font-weight: 500;
  }
  .addmenu button:hover {
    background: var(--chip);
    transform: translateX(3px);
  }

  .sep {
    width: 32px;
    height: 1px;
    background: var(--hairline);
    margin: 6px 0;
  }
  nav {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .marker {
    position: absolute;
    left: 0;
    top: 0;
    width: 48px;
    height: 48px;
    border-radius: 16px;
    background: var(--primary);
    box-shadow: 0 10px 20px -10px rgba(40, 44, 80, 0.55);
    transition: transform 0.55s var(--spring);
  }
  .item {
    position: relative;
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 16px;
    color: var(--text-muted);
    text-decoration: none;
  }
  .item:hover {
    color: var(--text);
    background: var(--chip);
  }
  .item:hover :global(svg) {
    animation: wiggle 0.5s var(--spring);
  }
  nav .item.active {
    color: var(--on-primary);
    background: none;
  }
  .item :global(svg) {
    position: relative;
  }
  .late {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--rose-deep);
    border: 2px solid var(--white);
    animation: tick-pop 0.5s var(--spring) backwards;
  }
  .grow {
    flex: 1;
  }
  .avatar {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--rose);
    color: var(--ink-on-color);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s var(--spring), box-shadow 0.2s ease;
  }
  .avatar.here {
    box-shadow: 0 0 0 3px var(--surface), 0 0 0 5px var(--primary);
  }
  /* the avatar menu: slides out to the right of the avatar, bottom-aligned */
  .me {
    position: relative;
    z-index: 3;
    margin-top: 4px;
  }
  .me:hover .avatar,
  .me.open .avatar {
    transform: scale(1.08);
  }
  .memenu {
    position: absolute;
    left: calc(100% + 14px);
    bottom: -6px;
    z-index: 2;
    min-width: 220px;
    display: grid;
    gap: 2px;
    padding: 8px;
    border-radius: 20px;
    background: var(--surface-float);
    box-shadow: var(--shadow-lift);
    transform-origin: left bottom;
    opacity: 0;
    visibility: hidden;
    transform: translateX(-8px) scale(0.92);
    transition: opacity 0.18s ease, transform 0.32s var(--spring), visibility 0s linear 0.32s;
  }
  /* an invisible bridge so the mouse can travel from the avatar to the menu */
  .memenu::before {
    content: "";
    position: absolute;
    left: -18px;
    top: 0;
    bottom: 0;
    width: 18px;
  }
  .me:hover .memenu,
  .me:focus-within .memenu,
  .me.open .memenu {
    opacity: 1;
    visibility: visible;
    transform: none;
    transition: opacity 0.18s ease, transform 0.32s var(--spring), visibility 0s;
  }
  .who {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px 12px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--hairline);
  }
  .who span:last-child {
    display: grid;
  }
  .who small {
    color: var(--text-muted);
    font-size: 12px;
  }
  .avatar.big {
    width: 38px;
    height: 38px;
    cursor: default;
  }
  .memenu button {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    padding: 0 14px;
    border: 0;
    border-radius: 14px;
    background: none;
    color: var(--text);
    font: inherit;
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s, transform 0.2s var(--spring);
  }
  .memenu button:hover,
  .memenu button.on {
    background: var(--chip);
  }
  .memenu button:hover {
    transform: translateX(3px);
  }

  /* page names on hover and keyboard focus */
  [data-tip]::after {
    content: attr(data-tip);
    position: absolute;
    left: calc(100% + 14px);
    top: 50%;
    padding: 7px 12px;
    border-radius: 10px;
    background: var(--primary);
    color: var(--on-primary);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transform: translate(-6px, -50%) scale(0.9);
    transform-origin: left center;
    transition: opacity var(--t-fast) ease, transform var(--t) var(--spring);
    z-index: 3;
  }
  .add[data-tip] {
    position: relative;
  }
  [data-tip]:hover::after,
  [data-tip]:focus-visible::after {
    opacity: 1;
    transform: translate(0, -50%) scale(1);
  }
  .add.open::after {
    display: none;
  }

  /* Window "Curve" / "Glass rail": the rail is a full-height column at the window's edge instead of a
     floating pill. Curve: just its icons on the colour bloom. Glass rail: a frosted column. */
  :global(:root:not([data-frame="float"])) .rail {
    width: 80px;
    height: 100%;
    box-sizing: border-box;
    padding-top: 18px;
    border: 0;
    border-radius: 0;
    background: none;
    box-shadow: none;
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
  :global(:root[data-frame="sheet"]) .rail {
    background: var(--surface);
    border-right: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
    -webkit-backdrop-filter: var(--blur);
    backdrop-filter: var(--blur);
  }
  @media (max-height: 620px) {
    .rail {
      gap: 4px;
      padding: 10px 0;
    }
    .avatar {
      width: 36px;
      height: 36px;
    }
  }
</style>
