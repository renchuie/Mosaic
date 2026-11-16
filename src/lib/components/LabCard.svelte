<script lang="ts">
  import type { Tone } from "../sample/data";
  let {
    title,
    kicker,
    progress,
    revisit,
    pair,
    href = "#/labs",
  }: { title: string; kicker: string; progress: number; revisit: number; pair: [Tone, Tone]; href?: string } = $props();
</script>

<a class="lab" {href} style="--head: var(--{pair[0]}); --body: var(--{pair[1]})">
  <div class="head">
    <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="kicker">{kicker}</span>
  </div>
  <div class="body">
    <h3 class="display">{title}</h3>
    <div class="bar" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100" aria-label="{title} progress">
      <div class="fill hatch" style="width: {progress}%"></div>
    </div>
    <div class="meta">
      <span class="pct display">{progress}<small>%</small></span>
      {#if revisit > 0}
        <span class="tag">{revisit} to revisit</span>
      {:else if progress === 0}
        <span class="tag">Not started</span>
      {:else}
        <span class="tag">All clear</span>
      {/if}
    </div>
  </div>
</a>

<style>
  .lab {
    display: flex;
    flex-direction: column;
    border: var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow: hidden;
    text-decoration: none;
    background: var(--body);
    transition: transform 0.12s ease, box-shadow 0.12s ease;
    min-width: 0;
  }
  .lab:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lift);
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    background: var(--head);
    border-bottom: var(--border);
  }
  .dots {
    display: flex;
    gap: 5px;
  }
  .dots i {
    width: 9px;
    height: 9px;
    border: 1.5px solid var(--ink);
    border-radius: 50%;
    background: var(--surface);
  }
  .kicker {
    font-family: var(--font-label);
    font-weight: 700;
    font-size: 10.5px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .body {
    padding: 14px;
    display: grid;
    gap: 12px;
  }
  h3 {
    font-size: 15px;
    line-height: 1.25;
    min-height: 2.5em;
  }
  .bar {
    height: 14px;
    border: var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-right: var(--border);
  }
  .fill[style*="width: 0%"] {
    border-right: 0;
  }
  .meta {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .pct {
    font-size: 24px;
  }
  .pct small {
    font-size: 13px;
    margin-left: 1px;
  }
</style>
