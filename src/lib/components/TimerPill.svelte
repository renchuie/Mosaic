<script lang="ts">
  // Floating timer while a study block runs, on every page except the plan itself.
  import Icon from "./Icon.svelte";
  import { fmtClock } from "../plan";
  import { route } from "../router.svelte";
  import { clock, completeBlock, getPlan, pauseBlock, spent, startBlock } from "../stores/plan.svelte";

  const t = $derived(clock.timer);
  const b = $derived(t ? getPlan(t.date).blocks.find((x) => x.id === t.blockId && !x.done) : undefined);
  const ms = $derived(t && b ? spent(t.date, b) : 0);
  const over = $derived(!!b && ms > b.minutes * 60000);
  const hidden = $derived(route.page === "tasks" && route.rest === "plan");
</script>

{#if t && b && !hidden}
  <div class="pill" class:over class:paused={!t.startedAt} role="status" aria-label="Study timer">
    <span class="dot" aria-hidden="true"></span>
    <a class="what" href="#/tasks/plan">
      <b>{b.title}</b>
      <span>{fmtClock(ms)} / {fmtClock(b.minutes * 60000)}{t.startedAt ? "" : " · paused"}</span>
    </a>
    {#if t.startedAt}
      <button type="button" aria-label="Pause" onclick={pauseBlock}><Icon name="pause" size={16} /></button>
    {:else}
      <button type="button" aria-label="Resume" onclick={() => startBlock(t.date, b.id)}><Icon name="play" size={16} /></button>
    {/if}
    <button type="button" class="ok" aria-label="Done" onclick={() => completeBlock(t.date, b.id)}><Icon name="check" size={16} /></button>
  </div>
{/if}

<style>
  .pill {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 40;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: min(420px, calc(100vw - 48px));
    padding: 8px 8px 8px 16px;
    border-radius: var(--radius-pill);
    background: var(--charcoal);
    color: var(--on-primary);
    box-shadow: var(--shadow-lift);
  }
  .pill.over {
    background: var(--alert-ink);
  }
  .dot {
    width: 10px;
    height: 10px;
    flex: none;
    border-radius: 50%;
    background: var(--sage);
    animation: pulse 1.6s ease-in-out infinite;
  }
  .paused .dot {
    background: var(--butter);
    animation: none;
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
  .what {
    display: grid;
    min-width: 0;
    text-decoration: none;
    line-height: 1.2;
  }
  .what b {
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .what span {
    font-size: 12.5px;
    opacity: 0.8;
    font-variant-numeric: tabular-nums;
  }
  button {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 50%;
    background: color-mix(in srgb, var(--white) 15%, transparent);
    color: inherit;
  }
  button:hover {
    background: color-mix(in srgb, var(--white) 28%, transparent);
  }
  .ok {
    background: var(--sage);
    color: var(--ink-on-color);
  }
  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
    }
  }
</style>
