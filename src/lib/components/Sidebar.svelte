<script lang="ts">
  import Icon from "./Icon.svelte";
  import { PAGES, route } from "../router.svelte";
  import { streak } from "../sample/data";

  const labels: Record<string, string> = {
    dashboard: "Dashboard",
    labs: "Labs",
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
    <span class="display name">Study Desk</span>
  </div>

  <nav aria-label="Main">
    {#each PAGES as p}
      <a href="#/{p}" class="item" class:active={route.page === p} aria-current={route.page === p ? "page" : undefined}>
        <Icon name={p} />
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
    gap: 18px;
    padding: 18px 14px;
    background: var(--sidebar-bg);
    border: var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    min-height: 0;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 6px 8px;
  }
  .mark {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--ink);
    color: var(--yellow);
    flex: none;
  }
  .name {
    font-size: 15px;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: var(--hit);
    padding: 0 14px;
    border: 1.5px solid transparent;
    border-radius: var(--radius-pill);
    text-decoration: none;
    font-weight: 500;
  }
  .item:hover {
    background: rgba(255, 255, 255, 0.45);
  }
  .item.active {
    background: var(--ink);
    color: #fff;
  }
  .streak {
    background: var(--surface);
    border: var(--border);
    border-radius: var(--radius-sm);
    padding: 12px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .count {
    font-size: 30px;
    line-height: 1.1;
    margin: 4px 0 10px;
  }
  .count small {
    font-family: var(--font-label);
    font-size: 11px;
    font-weight: 700;
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
    border: 1.5px solid var(--hairline);
    border-radius: 50%;
    font-family: var(--font-label);
    font-size: 9.5px;
    font-weight: 700;
    color: var(--text-muted);
  }
  .dot.on {
    background: var(--lime);
    border-color: var(--ink);
    color: var(--ink);
  }

  /* narrow (tiled) windows: icon rail */
  @media (max-width: 860px) {
    .sidebar {
      padding: 14px 8px;
      align-items: center;
    }
    .name,
    .text,
    .streak .week,
    .streak .row :global(svg) {
      display: none;
    }
    .item {
      padding: 0;
      width: var(--hit);
      justify-content: center;
    }
    .streak {
      padding: 8px 6px;
      text-align: center;
    }
    .streak .label {
      font-size: 9px;
    }
    .count {
      font-size: 20px;
      margin: 2px 0 0;
    }
    .count small {
      display: none;
    }
  }
</style>
