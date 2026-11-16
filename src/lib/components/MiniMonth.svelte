<script lang="ts">
  let { marked = [] }: { marked?: string[] } = $props(); // ISO dates (YYYY-MM-DD) to flag as exam days

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const iso = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const lead = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
  const count = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(lead).fill(0), ...Array.from({ length: count }, (_, i) => i + 1)];
  const title = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
</script>

<div class="month">
  <div class="top">
    <span class="h2">{title}</span>
    <span class="tag alert">Exam day</span>
  </div>
  <div class="grid" role="grid" aria-label={title}>
    {#each ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as d}
      <span class="dow">{d}</span>
    {/each}
    {#each cells as d}
      {#if d === 0}
        <span></span>
      {:else}
        <span class="day" class:today={d === now.getDate()} class:exam={marked.includes(iso(d))}>{d}</span>
      {/if}
    {/each}
  </div>
</div>

<style>
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 3px;
    text-align: center;
  }
  .dow {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--text-muted);
    padding-bottom: 4px;
  }
  .day {
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border-radius: 50%;
    font-size: 13.5px;
    font-variant-numeric: tabular-nums;
  }
  .day.exam {
    background: var(--rose);
    font-weight: 700;
  }
  .day.today {
    background: var(--primary);
    color: var(--on-primary);
    font-weight: 700;
  }
  .day.today.exam {
    box-shadow: 0 0 0 3px var(--rose);
  }
</style>
