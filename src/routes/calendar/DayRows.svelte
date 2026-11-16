<script lang="ts">
  // Rows of days with cards beside them (the exam-calendar look), used by List and Exams.
  // A [from, to] pair is a run of empty days shown as one short row.
  import type { Snippet } from "svelte";
  import { fromKey, todayKey, weekday } from "../../lib/calendar";

  let { days, empty, children }: { days: (string | [string, string])[]; empty: (day: string) => string; children: Snippet<[string]> } = $props();
  const short = (d: string) => fromKey(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const today = todayKey();
</script>

<div class="rows">
  {#each days as d (typeof d === "string" ? d : d.join())}
    {#if typeof d !== "string"}
      <div class="row gap">
        <div class="day range"><span>{short(d[0])}{d[1] !== d[0] ? ` – ${Number(d[1].slice(8))}` : ""}</span></div>
        <span class="muted">{empty(d[0])}</span>
      </div>
    {:else}
    <div class="row">
      <div class="day" class:today={d === today}>
        <b>{Number(d.slice(8))}</b>
        <span>{fromKey(d).toLocaleDateString("en-US", { weekday: "short" })}</span>
      </div>
      <div class="cards">
        {@render children(d)}
        <span class="empty muted" class:weekend={weekday(d) >= 5}>{empty(d)}</span>
      </div>
    </div>
    {/if}
  {/each}
</div>

<style>
  .rows {
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .row {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    padding: 12px 16px 12px 8px;
    border-top: 1px solid var(--hairline);
  }
  .row:first-child {
    border-top: 0;
  }
  .row.gap {
    padding-top: 8px;
    padding-bottom: 8px;
    background: var(--panel);
    font-size: 14px;
  }
  .day.range span {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .day {
    display: grid;
    justify-items: center;
    line-height: 1.15;
  }
  .day b {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    font-size: 17px;
    font-weight: 600;
  }
  .day span {
    font-size: 12px;
    color: var(--text-muted);
  }
  .day.today b {
    background: var(--primary);
    color: var(--on-primary);
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 12px;
    align-items: start;
  }
  /* the "No exam." / "Weekend" note shows only when a row has no cards */
  .empty {
    display: none;
    font-size: 14px;
  }
  .empty:first-child {
    display: block;
  }
</style>
