<script lang="ts">
  // Ring showing a grade (or any 0–100 value) with a label in the middle.
  let { pct, color = "var(--sage)", size = 96, label, sub, track = "var(--track)", width = 9 }:
    { pct: number | null; color?: string; size?: number; label?: string; sub?: string; track?: string; width?: number } = $props();
  const R = $derived(50 - width / 2 - 1);
  const C = $derived(2 * Math.PI * R);
  const v = $derived(pct === null ? 0 : Math.max(0, Math.min(100, pct)));
</script>

<span class="ring" style="width: {size}px; height: {size}px">
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <circle cx="50" cy="50" r={R} style="stroke: {track}; stroke-width: {width}" />
    {#if pct !== null}
      <circle cx="50" cy="50" r={R} class="fg" style="stroke: {color}; stroke-width: {width}" stroke-dasharray={C} stroke-dashoffset={C * (1 - v / 100)} />
    {/if}
  </svg>
  <span class="mid" style="font-size: {size * 0.22}px">
    <b>{label ?? (pct === null ? "–" : `${Math.round(pct)}%`)}</b>
    {#if sub}<small style="font-size: {Math.max(10, size * 0.12)}px">{sub}</small>{/if}
  </span>
</span>

<style>
  .ring {
    position: relative;
    display: inline-block;
    flex: none;
  }
  svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  circle {
    fill: none;
  }
  .fg {
    stroke-linecap: round;
    transition: stroke-dashoffset 0.5s ease;
  }
  .mid {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    align-content: center;
    line-height: 1.05;
    text-align: center;
  }
  b {
    font-family: var(--font-display);
    font-weight: 600;
  }
  small {
    opacity: 0.75;
    font-weight: 500;
  }
</style>
