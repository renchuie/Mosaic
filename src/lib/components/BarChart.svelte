<script lang="ts">
  // Simple bar chart (stats page): one column per entry, optionally stacked from the bottom.
  // Thin bars with rounded tops, a 2px gap between stacked parts, a recessive top gridline with the
  // max value, a few x labels, and a hover tooltip per column (the hit area is the whole column).
  type Part = { v: number; colour: string };
  let {
    data,
    height = 150,
    label,
    xEvery = 0,
  }: {
    /** `mark`: a day to point out (an exam), drawn as a soft rose column */
    data: { x: string; parts: Part[]; tip: string; mark?: boolean }[];
    height?: number;
    /** what the chart shows, for screen readers */
    label: string;
    /** show every n-th x label (0 = work it out) */
    xEvery?: number;
  } = $props();

  const total = (p: Part[]) => p.reduce((n, x) => n + x.v, 0);
  const max = $derived(Math.max(1, ...data.map((d) => total(d.parts))));
  // a round number at or above the max for the gridline
  const top = $derived.by(() => {
    const m = max;
    const step = 10 ** Math.floor(Math.log10(m));
    for (const k of [1, 2, 2.5, 5, 10]) if (k * step >= m) return k * step;
    return m;
  });
  const every = $derived(xEvery || Math.max(1, Math.ceil(data.length / 8)));
  let hover = $state<number | null>(null);
</script>

<div class="chart" style="--h: {height}px" role="img" aria-label={label}>
  <div class="grid"><span>{top % 1 ? top.toFixed(1) : top}</span></div>
  <div class="cols" style="grid-template-columns: repeat({data.length}, minmax(0, 1fr))" onmouseleave={() => (hover = null)} role="presentation">
    {#each data as d, i (i)}
      <div class="col" class:on={hover === i} class:mark={d.mark} onmouseenter={() => (hover = i)} role="presentation">
        <div class="stack" style="height: {(total(d.parts) / top) * 100}%">
          {#each d.parts.filter((p) => p.v > 0) as p, k (k)}
            <span style="flex: {p.v} 1 0; background: {p.colour}"></span>
          {/each}
        </div>
        {#if hover === i}<div class="tip" class:left={i > data.length * 0.6}>{d.tip}</div>{/if}
      </div>
    {/each}
  </div>
  <div class="xs" style="grid-template-columns: repeat({data.length}, minmax(0, 1fr))">
    {#each data as d, i (i)}<span>{i % every === 0 ? d.x : ""}</span>{/each}
  </div>
</div>

<style>
  .chart {
    position: relative;
    display: grid;
    gap: 6px;
  }
  .grid {
    position: absolute;
    inset: 0 0 auto 0;
    border-top: 1px dashed var(--hairline);
    pointer-events: none;
  }
  .grid span {
    position: absolute;
    top: -9px;
    right: 0;
    padding-left: 6px;
    background: var(--surface);
    font-size: 11px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }
  .cols {
    display: grid;
    gap: 2px;
    height: var(--h);
    align-items: end;
    border-bottom: 1px solid var(--hairline);
  }
  .col {
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    height: 100%;
    border-radius: 6px 6px 0 0;
  }
  .col.mark {
    background: color-mix(in srgb, var(--rose) 28%, transparent);
  }
  .col.on {
    background: color-mix(in srgb, var(--text) 6%, transparent);
  }
  .stack {
    display: flex;
    flex-direction: column-reverse;
    gap: 2px;
    width: min(100%, 22px);
    min-height: 0;
  }
  .stack span {
    min-height: 2px;
  }
  .stack span:last-child {
    border-radius: 4px 4px 0 0;
  }
  .tip {
    position: absolute;
    z-index: 3;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    padding: 7px 10px;
    border-radius: 10px;
    background: var(--surface-float, var(--surface));
    box-shadow: var(--shadow-lift);
    color: var(--text);
    font-size: 12px;
    line-height: 1.45;
    white-space: pre;
    pointer-events: none;
  }
  .tip.left {
    left: auto;
    right: 0;
    transform: none;
  }
  .xs {
    display: grid;
    gap: 2px;
    font-size: 11px;
    color: var(--text-muted);
  }
  .xs span {
    white-space: nowrap;
    overflow: visible;
  }
</style>
