<script lang="ts">
  import { addMonths, daysInMonth, fromKey, monthStart, todayKey, weekday } from "../../lib/calendar";
  import { visible } from "../../lib/stores/calendar.svelte";

  let { value, onpick }: { value: string; onpick: (day: string) => void } = $props();
  let shown = $state(monthStart(todayKey()));
  $effect(() => {
    shown = monthStart(value);
  });

  const cells = $derived.by(() => {
    const lead = weekday(shown);
    const n = daysInMonth(shown);
    return [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => `${shown.slice(0, 8)}${String(i + 1).padStart(2, "0")}`)];
  });
  const busy = $derived(new Set(visible(shown, `${shown.slice(0, 8)}${daysInMonth(shown)}`).map((o) => o.date)));
  const today = todayKey();
  const title = $derived(fromKey(shown).toLocaleDateString("en-US", { month: "long", year: "numeric" }));
</script>

<div class="picker">
  <div class="nav">
    <button type="button" aria-label="Previous month" onclick={() => (shown = addMonths(shown, -1))}>‹</button>
    <b>{title}</b>
    <button type="button" aria-label="Next month" onclick={() => (shown = addMonths(shown, 1))}>›</button>
  </div>
  <div class="grid">
    {#each ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as d}<span class="dow">{d}</span>{/each}
    {#each cells as c}
      {#if c}
        <button type="button" class="day" class:sel={c === value} class:today={c === today} onclick={() => onpick(c)} aria-label={fromKey(c).toDateString()} aria-pressed={c === value}>
          {Number(c.slice(8))}
          {#if busy.has(c)}<i></i>{/if}
        </button>
      {:else}<span></span>{/if}
    {/each}
  </div>
</div>

<style>
  .nav {
    display: grid;
    grid-template-columns: 36px 1fr 36px;
    align-items: center;
    text-align: center;
    margin-bottom: 8px;
    padding: 4px;
    border-radius: var(--radius-pill);
    background: var(--panel);
  }
  .nav b {
    font-weight: 600;
    font-size: 14.5px;
  }
  .nav button {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    background: var(--surface);
    font-size: 20px;
    line-height: 1;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    text-align: center;
  }
  .dow {
    font-size: 11px;
    color: var(--text-muted);
    padding: 4px 0;
  }
  .day {
    position: relative;
    aspect-ratio: 1;
    border: 0;
    border-radius: 50%;
    background: transparent;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .day:hover {
    background: var(--panel);
  }
  .day.today {
    font-weight: 700;
    color: var(--rose-deep);
  }
  .day.sel {
    background: var(--primary);
    color: var(--on-primary);
    font-weight: 700;
  }
  .day i {
    position: absolute;
    left: 50%;
    bottom: 3px;
    width: 4px;
    height: 4px;
    margin-left: -2px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.55;
  }
</style>
