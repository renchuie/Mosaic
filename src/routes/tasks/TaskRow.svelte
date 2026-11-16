<script lang="ts">
  // A task as a routine-style row: tick on the timeline, icon tile, title, streak or
  // checklist, and due/estimate on the right.
  import Icon from "../../lib/components/Icon.svelte";
  import { PRIORITY_LABEL, dueLabel, fmtTime, taskStreak, todayKey, type Task } from "../../lib/calendar";
  import { editTask, tagIcon, tagOf, tagStyle } from "../../lib/stores/calendar.svelte";
  import { toggleSubtask, toggleTask } from "../../lib/stores/tasks.svelte";

  let { o }: { o: { id: string; task: Task; date: string | null; done: boolean } } = $props();
  const t = $derived(o.task);
  const today = todayKey();
  const late = $derived(!o.done && !!o.date && o.date < today);
  const streak = $derived(t.repeat ? taskStreak(o.id, t, today) : 0);
  const unit = $derived(t.repeat?.freq === "daily" ? "day" : t.repeat?.freq === "weekly" ? "week" : t.repeat?.freq === "monthly" ? "month" : "time");
  const subs = $derived(t.subtasks ?? []);
  const sub = $derived(
    [
      t.course,
      t.repeat ? (streak ? `Streak ${streak} ${unit}${streak === 1 ? "" : "s"}` : "Repeats") : "",
      subs.length ? `${subs.filter((s) => s.done).length}/${subs.length} steps` : "",
      !t.course && !t.repeat && !subs.length ? tagOf(t.tag ?? "task").name : "",
    ]
      .filter(Boolean)
      .join(" · "),
  );
  const est = (m: number) => (m < 60 ? `${m} min` : `${Math.round((m / 60) * 10) / 10} h`);
</script>

<li class="trow" class:done={o.done} style={tagStyle(t.tag ?? "task")}>
  <button type="button" class="tick" aria-pressed={o.done} aria-label="{o.done ? 'Mark not done' : 'Mark done'}: {t.title}" onclick={() => toggleTask(o.id, o.date)}>
    <Icon name="check" size={13} />
  </button>
  <button type="button" class="tcard" onclick={(e) => editTask(o.id, o.date, e)}>
    <span class="tile"><Icon name={tagIcon(t.tag ?? "task")} size={20} /></span>
    <span class="txt">
      <b>{#if t.priority === "high" && !o.done}<i class="hi" title="{PRIORITY_LABEL.high} priority"></i>{/if}{t.title}</b>
      <span>{#if streak}<Icon name="flame" size={12} />{/if}{sub}</span>
    </span>
    <span class="right">
      <span class="ri"><Icon name={t.estimate ? "clock" : "calendar"} size={15} /></span>
      <span class="rt" class:late>
        {#if t.estimate}{est(t.estimate)}{:else if o.date}{dueLabel(o.date, today).replace("Due ", "")}{:else}Anytime{/if}
      </span>
      {#if t.estimate && o.date}<span class="rs" class:late>{dueLabel(o.date, today).replace("Due ", "")}{t.dueTime ? ` · ${fmtTime(t.dueTime)}` : ""}</span>{/if}
    </span>
  </button>
  {#if subs.length}
    <details class="steps">
      <summary>{subs.filter((s) => s.done).length}/{subs.length} steps</summary>
      <ul>
        {#each subs as s (s.id)}
          <li><label><input type="checkbox" checked={s.done} onchange={() => toggleSubtask(o.id, s.id)} /> <span class:sdone={s.done}>{s.title}</span></label></li>
        {/each}
      </ul>
    </details>
  {/if}
</li>

<style>
  .trow {
    position: relative;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
  }
  .tick {
    position: relative;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 2px solid color-mix(in srgb, var(--charcoal) 30%, transparent);
    border-radius: 50%;
    background: var(--panel);
    color: transparent;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .tick:hover {
    border-color: var(--sage-deep);
    color: var(--sage-deep);
  }
  .done .tick {
    background: var(--sage-deep);
    border-color: var(--sage-deep);
    color: var(--white);
  }
  .tcard {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    min-height: 72px;
    padding: 12px 14px;
    border: 0;
    border-radius: 22px;
    background: var(--surface);
    box-shadow: 0 1px 2px rgba(108, 78, 72, 0.05), 0 10px 22px -16px rgba(108, 78, 72, 0.35);
    text-align: left;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .tcard:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-lift);
  }
  .tile {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    border-radius: 15px;
    background: color-mix(in srgb, var(--tag) 45%, var(--white));
  }
  .txt {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .txt b {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 16px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .done .txt b {
    text-decoration: line-through;
    color: var(--text-muted);
  }
  .hi {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    background: var(--rose-deep);
  }
  .txt > span {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--text-muted);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .right {
    display: grid;
    justify-items: center;
    gap: 1px;
    min-width: 84px;
    padding-left: 14px;
    border-left: 1px solid var(--hairline);
    text-align: center;
  }
  .ri {
    color: var(--text-muted);
  }
  .rt {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }
  .rs {
    font-size: 11.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .late {
    color: #a8434f;
  }
  .steps {
    grid-column: 2;
    margin: -6px 0 0 18px;
    font-size: 13.5px;
  }
  .steps summary {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    padding: 0 12px;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--tag) 30%, var(--white));
    font-weight: 600;
    font-size: 12.5px;
    cursor: pointer;
    list-style: none;
  }
  .steps summary::-webkit-details-marker {
    display: none;
  }
  .steps summary::after {
    content: "▾";
    margin-left: 6px;
    font-size: 10px;
  }
  .steps[open] summary::after {
    content: "▴";
  }
  .steps ul {
    list-style: none;
    margin: 6px 0 0;
    padding: 8px 12px;
    border-radius: 16px;
    background: var(--surface);
    display: grid;
  }
  .steps label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    cursor: pointer;
  }
  .steps input {
    width: 17px;
    height: 17px;
    accent-color: var(--sage-deep);
  }
  .sdone {
    text-decoration: line-through;
    color: var(--text-muted);
  }
  @media (max-width: 560px) {
    .right {
      min-width: 64px;
      padding-left: 8px;
    }
    .tile {
      width: 38px;
      height: 38px;
    }
  }
</style>
