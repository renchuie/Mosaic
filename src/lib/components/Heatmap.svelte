<script lang="ts">
  // Activity heatmap: study minutes, labs opened and tasks finished per day.
  import { fromKey } from "../calendar";
  import { fmtDuration } from "../plan";
  import { heatmap } from "../stores/activity.svelte";
  import { streakInfo } from "../stores/labs.svelte";

  // As many weeks as fit at about 20px a square (12 to 53).
  let width = $state(600);
  const weeks = $derived(Math.max(12, Math.min(53, Math.floor((width - 34) / 23))));
  const h = $derived(heatmap(weeks));
  const streak = $derived(streakInfo());
  const months = $derived(
    h.cols.map((c, i) => {
      const m = c[0].date.slice(5, 7);
      return i === 0 || h.cols[i - 1][0].date.slice(5, 7) !== m ? fromKey(c[0].date).toLocaleDateString("en-US", { month: "short" }) : "";
    }),
  );
  const tip = (c: (typeof h.cols)[0][0]) => {
    const parts = [
      c.a.minutes ? `${fmtDuration(c.a.minutes)} studied` : "",
      c.a.labs ? `${c.a.labs} lab${c.a.labs === 1 ? "" : "s"} opened` : "",
      c.a.blocks ? `${c.a.blocks} block${c.a.blocks === 1 ? "" : "s"} done` : "",
      c.a.tasks ? `${c.a.tasks} task${c.a.tasks === 1 ? "" : "s"} done` : "",
    ].filter(Boolean);
    return `${fromKey(c.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}: ${parts.join(", ") || "no activity"}`;
  };
</script>

<div class="hm" bind:clientWidth={width}>
  <div class="grid" style="--weeks: {weeks}" role="img" aria-label="Study activity, last {weeks} weeks: {h.activeDays} active days">
    <span></span>
    {#each months as m}<span class="mon">{m}</span>{/each}
    {#each ["Mon", "", "Wed", "", "Fri", "", "Sun"] as d, row}
      <span class="dow">{d}</span>
      {#each h.cols as col}
        {@const c = col[row]}
        <span class="cell l{c.level}" class:future={c.future} title={c.future ? "" : tip(c)}></span>
      {/each}
    {/each}
  </div>
  <div class="foot">
    <span><b>{h.activeDays}</b> active days in {weeks} weeks</span>
    <span>Streak <b>{streak.days}</b> · best <b>{Math.max(h.best, streak.days)}</b></span>
    <span>This week <b>{fmtDuration(h.thisWeekMinutes)}</b></span>
    {#if h.topDay}<span>Most often <b>{h.topDay}</b></span>{/if}
    <span class="legend" aria-hidden="true">Less {#each [0, 1, 2, 3, 4] as l}<i class="cell l{l}"></i>{/each} More</span>
  </div>
</div>

<style>
  .hm {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: 30px repeat(var(--weeks), minmax(0, 1fr));
    gap: 4px;
    align-items: center;
  }
  .mon {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: visible;
  }
  .dow {
    font-size: 10.5px;
    color: var(--text-muted);
  }
  .cell {
    display: block;
    aspect-ratio: 1;
    border-radius: 5px;
    background: var(--track);
  }
  .cell.future {
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--hairline);
  }
  .l1 {
    background: color-mix(in srgb, var(--sage) 35%, var(--white));
  }
  .l2 {
    background: color-mix(in srgb, var(--sage) 65%, var(--white));
  }
  .l3 {
    background: var(--sage);
  }
  .l4 {
    background: var(--sage-deep);
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 18px;
    font-size: 13.5px;
    color: var(--text-muted);
  }
  .foot b {
    color: var(--text);
    font-weight: 600;
  }
  .legend {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    font-size: 12px;
  }
  .legend i {
    width: 12px;
    height: 12px;
  }
</style>
