<script lang="ts">
  import type { Tone } from "../sample/data";
  let {
    title,
    kicker,
    progress,
    revisit,
    tone,
    href = "#/labs",
  }: { title: string; kicker: string; progress: number; revisit: number; tone: Tone; href?: string } = $props();
</script>

<a class="lab" {href} style="--tone: var(--{tone}); --wash: var(--g-{tone})">
  <div class="top">
    <span class="tag glass">{kicker}</span>
    <span class="pct display">{progress}<small>%</small></span>
  </div>
  <h3 class="display">{title}</h3>
  <div class="bar" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100" aria-label="{title} progress">
    <div class="fill" style="width: {progress}%"></div>
  </div>
  <span class="note">
    {#if revisit > 0}{revisit} to revisit{:else if progress === 0}Not started{:else}All clear{/if}
  </span>
</a>

<style>
  .lab {
    display: grid;
    gap: 10px;
    padding: 16px;
    border-radius: var(--radius);
    background: var(--wash);
    box-shadow: var(--shadow);
    text-decoration: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
    min-width: 0;
  }
  .lab:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lift);
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .pct {
    font-size: 26px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .pct small {
    font-size: 14px;
    margin-left: 1px;
  }
  h3 {
    font-size: 18px;
    line-height: 1.2;
    min-height: 2.4em;
    margin-top: 14px;
  }
  .bar {
    height: 8px;
    border-radius: var(--radius-pill);
    background: rgba(255, 253, 251, 0.6);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: var(--radius-pill);
    background: var(--charcoal);
  }
  .note {
    font-size: 13.5px;
  }
</style>
