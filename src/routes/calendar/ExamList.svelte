<script lang="ts">
  import { fmtTime, fromKey } from "../../lib/calendar";
  import { editEvent, exams } from "../../lib/stores/calendar.svelte";
  import { folderHref } from "../../lib/stores/labs.svelte";
  import { settings } from "../../lib/stores/settings.svelte";

  const list = $derived(exams());
  const upcoming = $derived(list.filter((e) => e.days >= 0));
  const past = $derived(list.filter((e) => e.days < 0).reverse());
  const when = (n: number) => (n === 0 ? "Today" : n === 1 ? "Tomorrow" : `${n} days`);
  const long = (d: string) => fromKey(d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
</script>

<div class="exams">
  {#if upcoming.length}
    <div class="grid">
      {#each upcoming as e, i (e.key)}
        <article class="exam" class:first={i === 0}>
          <div class="count">
            <b class="display">{e.days}</b>
            <span>{e.days === 1 ? "day" : "days"}</span>
          </div>
          <div class="info">
            <h3 class="display">{e.title}</h3>
            <span>{long(e.date)}{e.start ? ` · ${fmtTime(e.start)}` : ""}</span>
            {#if e.course}<span class="muted">{e.course}</span>{/if}
          </div>
          <div class="foot">
            {#if e.days <= 1}<span class="tag glass">{when(e.days)}</span>{:else}<span></span>{/if}
            {#if e.id}
              <button type="button" class="btn quiet" onclick={() => editEvent(e.id!, e.date)}>Edit</button>
            {:else if e.rel !== undefined}
              <a class="btn quiet" href={folderHref(e.rel)}>From folder</a>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {:else}
    <section class="card">
      <p>No upcoming exams. Add one, or give a calendar event the type “Exam”.</p>
    </section>
  {/if}

  <p class="muted hint">
    Exams are events with the type Exam, events of type Other whose title contains “{settings.examKeywords}”, and Recall Lab folders with an exam date.
  </p>

  {#if past.length}
    <section class="card">
      <h2 class="h2">Past exams</h2>
      <ul class="past">
        {#each past as e (e.key)}
          <li><b>{e.title}</b><span class="muted">{fromKey(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .exams {
    display: grid;
    gap: var(--gap);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 14px;
  }
  .exam {
    display: grid;
    gap: 14px;
    padding: 18px;
    border-radius: var(--radius);
    background: var(--g-peach);
    box-shadow: var(--shadow);
  }
  .exam.first {
    background: var(--g-rose);
  }
  .count {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .count b {
    font-size: 48px;
    line-height: 1;
    font-weight: 600;
  }
  .info {
    display: grid;
    gap: 2px;
  }
  .info h3 {
    font-size: 20px;
    font-weight: 600;
  }
  .info .muted {
    color: var(--text);
    opacity: 0.75;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .foot .btn {
    background: rgba(255, 253, 251, 0.6);
  }
  .hint {
    font-size: 14px;
    padding: 0 4px;
  }
  .past {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: grid;
  }
  .past li {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 0;
    border-top: 1px solid var(--hairline);
  }
  .past li:first-child {
    border-top: 0;
  }
  .past b {
    font-weight: 500;
  }
</style>
