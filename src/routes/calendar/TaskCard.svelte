<script lang="ts">
  // A task in the List view and on the Tasks page: tick, title, due, course, checklist, chips.
  import Icon from "../../lib/components/Icon.svelte";
  import { PRIORITY_LABEL, STATUS_LABEL, dueLabel, fmtTime, todayKey, type TaskOcc } from "../../lib/calendar";
  import { editTask, tagOf, tagStyle } from "../../lib/stores/calendar.svelte";
  import { toggleSubtask, toggleTask } from "../../lib/stores/tasks.svelte";

  let { o, showDue = false }: { o: TaskOcc | { id: string; task: TaskOcc["task"]; date: string | null; done: boolean }; showDue?: boolean } = $props();
  const t = $derived(o.task);
  const subs = $derived(t.subtasks ?? []);
  const today = todayKey();
  const late = $derived(!o.done && !!o.date && o.date < today);
  const est = (m: number) => (m < 60 ? `${m} min` : `${Math.round((m / 60) * 10) / 10} h`);
</script>

<div class="card" class:done={o.done} style={tagStyle(t.tag ?? "task")}>
  <div class="top">
    <button type="button" class="tick" aria-pressed={o.done} aria-label="{o.done ? 'Mark not done' : 'Mark done'}: {t.title}" onclick={() => toggleTask(o.id, o.date)}>
      {#if o.done}<Icon name="check" size={16} />{/if}
    </button>
    <button type="button" class="head" onclick={(e) => editTask(o.id, o.date, e)}>
      <b>{t.title}</b>
      <span class:late>
        {#if o.date}{showDue || late ? dueLabel(o.date, today) : "Due"}{t.dueTime ? ` ${showDue || late ? "at " : ""}${fmtTime(t.dueTime)}` : showDue || late ? "" : " today"}{:else}No due date{/if}
      </span>
    </button>
  </div>
  {#if t.course || subs.length || t.notes}
    <div class="inner">
      {#if t.course || t.notes}
        <span class="ic"><Icon name="book" size={15} /></span>
        <span class="txt"><b>{t.course || t.notes}</b>{#if t.course && t.notes}<span>{t.notes}</span>{/if}</span>
      {/if}
      {#if subs.length}
        <ul class="subs">
          {#each subs as s (s.id)}
            <li><label><input type="checkbox" checked={s.done} onchange={() => toggleSubtask(o.id, s.id)} /> <span class:sdone={s.done}>{s.title}</span></label></li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
  <div class="foot">
    <span class="chip"><span class="tag-dot"></span>{tagOf(t.tag ?? "task").name}</span>
    {#if t.priority === "high"}<span class="chip high"><Icon name="flag" size={12} /> {PRIORITY_LABEL.high}</span>{/if}
    {#if !t.repeat && t.status === "doing"}<span class="chip">{STATUS_LABEL.doing}</span>{/if}
    {#if t.estimate}<span class="chip"><Icon name="clock" size={12} /> {est(t.estimate)}</span>{/if}
    {#if subs.length}<span class="chip">{subs.filter((s) => s.done).length}/{subs.length}</span>{/if}
    {#if t.repeat}<span class="chip" title="Repeats"><Icon name="repeat" size={13} /></span>{/if}
  </div>
</div>

<style>
  .card {
    display: grid;
    gap: 10px;
    min-width: 0;
    padding: 10px 10px 0;
    border-radius: 18px;
    background: color-mix(in srgb, var(--tag) 34%, var(--white));
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(108, 78, 72, 0.08);
  }
  .top {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: center;
  }
  .tick {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 2px solid color-mix(in srgb, var(--charcoal) 45%, transparent);
    border-radius: 50%;
    background: var(--white);
    padding: 0;
  }
  .tick:hover {
    border-color: var(--charcoal);
  }
  .done .tick {
    background: var(--sage);
    border-color: var(--sage-deep);
  }
  .head {
    display: grid;
    min-width: 0;
    border: 0;
    background: none;
    padding: 0;
    text-align: left;
  }
  .head b {
    font-weight: 600;
    font-size: 15px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .done .head b {
    text-decoration: line-through;
    color: var(--text-muted);
  }
  .head span {
    font-size: 13px;
    color: var(--text-muted);
  }
  .head span.late {
    color: #8f3b45;
    font-weight: 600;
  }
  .inner {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px 10px;
    align-items: center;
    padding: 10px;
    border-radius: 12px;
    background: var(--white);
  }
  .ic {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
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
  .subs {
    grid-column: 1 / -1;
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
  }
  .subs label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    font-size: 13.5px;
    cursor: pointer;
  }
  .subs input {
    width: 17px;
    height: 17px;
    accent-color: var(--sage-deep);
  }
  .sdone {
    text-decoration: line-through;
    color: var(--text-muted);
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0 -10px;
    padding: 8px 10px;
    background: color-mix(in srgb, var(--tag) 62%, var(--white));
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: var(--radius-pill);
    background: var(--white);
    font-size: 12.5px;
    font-weight: 500;
    white-space: nowrap;
  }
  .chip.high {
    background: var(--rose-soft);
    color: #8f3b45;
  }
</style>
