<script lang="ts">
  import Icon from "./Icon.svelte";
  import { NAV, route } from "../router.svelte";
  import { streakInfo } from "../stores/labs.svelte";
  const streak = $derived(streakInfo());

  const labels: Record<string, string> = {
    dashboard: "Dashboard",
    study: "Study",
    calendar: "Calendar",
    tasks: "Tasks",
    courses: "Courses",
    settings: "Settings",
  };
  const days = ["M", "T", "W", "T", "F", "S", "S"];
</script>

<aside class="sidebar">
  <div class="brand">
    <span class="mark" aria-hidden="true">✦</span>
    <span class="display name">Mosaic</span>
  </div>

  <nav aria-label="Main">
    {#each NAV as p}
      {@const on = route.page === p || (p === "study" && route.page === "labs")}
      <a href="#/{p}" class="item" class:active={on} aria-current={on ? "page" : undefined}>
        <Icon name={p === "study" ? "book" : p} />
        <span class="text">{labels[p]}</span>
      </a>
    {/each}
  </nav>

  <div class="streak">
    <div class="row">
      <span class="label">Streak</span>
      <Icon name="flame" size={18} />
    </div>
    <div class="count display">{streak.days}<small>days</small></div>
    <div class="week">
      {#each streak.week as on, i}
        <span class="dot" class:on title={days[i]}>{days[i]}</span>
      {/each}
    </div>
  </div>
</aside>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding: 20px 0 6px 6px;
    min-height: 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 10px 6px;
  }
  .mark {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 14px;
    background: var(--primary);
    color: var(--peach);
    flex: none;
  }
  .name {
    font-size: 19px;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
  }
  .item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 46px;
    padding: 0 16px;
    margin-right: 12px;
    border-radius: var(--radius-pill);
    text-decoration: none;
    font-weight: 500;
    color: var(--text-muted);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .item:hover {
    background: rgba(255, 253, 251, 0.45);
    color: var(--text);
  }
  /* the active tab flows into the main panel */
  .item.active {
    margin-right: 0;
    border-radius: var(--radius-pill) 0 0 var(--radius-pill);
    background: var(--panel);
    color: var(--text);
  }
  .item.active::before,
  .item.active::after {
    content: "";
    position: absolute;
    right: 0;
    width: 22px;
    height: 22px;
    pointer-events: none;
  }
  .item.active::before {
    top: -22px;
    background: radial-gradient(circle at 0 0, transparent 21.5px, var(--panel) 22px);
  }
  .item.active::after {
    bottom: -22px;
    background: radial-gradient(circle at 0 100%, transparent 21.5px, var(--panel) 22px);
  }
  .streak {
    margin-right: 14px;
    background: rgba(255, 253, 251, 0.62);
    border-radius: var(--radius-sm);
    padding: 14px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: var(--text-muted);
  }
  .count {
    font-size: 32px;
    line-height: 1.1;
    margin: 2px 0 10px;
  }
  .count small {
    font-family: var(--font-body);
    font-size: 13px;
    margin-left: 6px;
    color: var(--text-muted);
    letter-spacing: 0;
  }
  .week {
    display: flex;
    gap: 4px;
  }
  .dot {
    flex: 1;
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--track);
    font-size: 10.5px;
    font-weight: 500;
    color: var(--text-muted);
  }
  .dot.on {
    background: var(--sage);
    color: var(--text);
  }

  /* narrow (tiled) windows: icon rail */
  @media (max-width: 860px) {
    .sidebar {
      padding: 16px 0 6px 4px;
    }
    .brand {
      padding: 4px 0 6px;
      justify-content: center;
      margin-right: 6px;
    }
    .name,
    .text,
    .streak .week,
    .streak .row :global(svg) {
      display: none;
    }
    .item {
      padding: 0;
      margin-right: 6px;
      justify-content: center;
    }
    .item.active {
      margin-right: 0;
      padding-right: 6px;
    }
    .streak {
      margin-right: 6px;
      padding: 8px 4px;
      text-align: center;
    }
    .streak .row {
      justify-content: center;
    }
    .streak .label {
      font-size: 10px;
    }
    .count {
      font-size: 20px;
      margin: 0;
    }
    .count small {
      display: none;
    }
  }
</style>
