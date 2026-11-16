<script lang="ts">
  // Card used in the List and Exams views: time badge, title, a white inner
  // box with course / place, and a footer of chips — like the exam-calendar reference.
  import Icon from "../../lib/components/Icon.svelte";
  import { fmtTime } from "../../lib/calendar";
  import { tagOf, tagStyle } from "../../lib/stores/calendar.svelte";

  let {
    title, kind, start, end, allDay = false, course, location, notes, repeats = false, countdown, onclick,
  }: {
    title: string; kind: string; start?: string; end?: string; allDay?: boolean; course?: string; location?: string; notes?: string;
    repeats?: boolean; countdown?: number; onclick: (e: MouseEvent) => void;
  } = $props();

  const t = $derived(tagOf(kind));
  const [hm, ap] = $derived(start && !allDay ? fmtTime(start).split(" ") : ["All", "day"]);
</script>

<button type="button" class="card" style={tagStyle(kind)} {onclick}>
  <div class="top">
    <span class="when"><b>{hm}</b><small>{ap}</small></span>
    <span class="head">
      <b>{title}</b>
      <span>{allDay ? "All day" : `${fmtTime(start)} – ${fmtTime(end)}`}</span>
    </span>
  </div>
  {#if course || location || notes}
    <div class="inner">
      <span class="ic"><Icon name={location && !course ? "pin" : "book"} size={16} /></span>
      <span class="txt">
        <b>{course || location || notes}</b>
        {#if course && location}<span>{location}</span>{:else if (course || location) && notes}<span>{notes}</span>{/if}
      </span>
    </div>
  {/if}
  <div class="foot">
    <span class="chip"><span class="tag-dot"></span>{t.name}</span>
    {#if countdown !== undefined && countdown >= 0}
      <span class="chip">{countdown === 0 ? "Today" : countdown === 1 ? "Tomorrow" : `${countdown} days`}</span>
    {/if}
    {#if repeats}<span class="chip" title="Repeats"><Icon name="repeat" size={13} /></span>{/if}
    <span class="more" aria-hidden="true"><Icon name="dots" size={18} /></span>
  </div>
</button>

<style>
  .card {
    display: grid;
    gap: 10px;
    width: 100%;
    min-width: 0;
    padding: 10px 10px 0;
    border: 0;
    border-radius: 18px;
    background: color-mix(in srgb, var(--tag) 42%, var(--white));
    text-align: left;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(108, 78, 72, 0.08);
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lift);
  }
  .top {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: center;
  }
  .when {
    display: grid;
    place-items: center;
    align-content: center;
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: var(--white);
    line-height: 1.05;
  }
  .when b {
    font-size: 14.5px;
    font-weight: 700;
  }
  .when small {
    font-size: 11px;
    color: var(--text-muted);
  }
  .head {
    display: grid;
    min-width: 0;
  }
  .head b {
    font-weight: 600;
    font-size: 15px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .head span {
    font-size: 13px;
    color: var(--text-muted);
  }
  .inner {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    padding: 10px;
    border-radius: 12px;
    background: var(--white);
  }
  .ic {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--tag) 30%, var(--white));
  }
  .txt {
    display: grid;
    min-width: 0;
  }
  .txt b {
    font-size: 13.5px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .txt span {
    font-size: 12.5px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 -10px;
    padding: 8px 10px;
    background: color-mix(in srgb, var(--tag) 70%, var(--white));
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: var(--radius-pill);
    background: var(--white);
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
  }
  .more {
    margin-left: auto;
    display: grid;
    place-items: center;
    color: var(--text-muted);
  }
</style>
