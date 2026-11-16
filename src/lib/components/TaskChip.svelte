<script lang="ts">
  // A task as a small tickable pill: used in the week grid, month grid and dashboard.
  import Icon from "./Icon.svelte";
  import { fmtTime, type TaskOcc } from "../calendar";
  import { editTask, tagStyle } from "../stores/calendar.svelte";
  import { toggleTask } from "../stores/tasks.svelte";

  let { o, showTime = true }: { o: TaskOcc; showTime?: boolean } = $props();
  const subs = $derived(o.task.subtasks ?? []);
</script>

<div class="tc" class:done={o.done} style={tagStyle(o.task.tag ?? "task")}>
  <button type="button" class="tick" aria-pressed={o.done} aria-label="{o.done ? 'Mark not done' : 'Mark done'}: {o.task.title}" onclick={(e) => { e.stopPropagation(); toggleTask(o.id, o.date); }}>
    {#if o.done}<Icon name="check" size={13} />{/if}
  </button>
  <button type="button" class="open" onclick={(e) => { e.stopPropagation(); editTask(o.id, o.date, e); }}>
    {#if o.task.priority === "high" && !o.done}<span class="flag" title="High priority"><Icon name="flag" size={12} /></span>{/if}
    {#if showTime && o.task.dueTime}<span class="t">{fmtTime(o.task.dueTime).replace(":00", "").replace(" ", "").toLowerCase()}</span>{/if}
    <span class="n">{o.task.title}</span>
    {#if subs.length}<span class="s">{subs.filter((s) => s.done).length}/{subs.length}</span>{/if}
  </button>
</div>

<style>
  .tc {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    min-height: 30px;
    padding: 0 4px 0 4px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--tag) 34%, var(--white));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tag) 70%, transparent);
  }
  .tick {
    display: grid;
    place-items: center;
    flex: none;
    width: 22px;
    height: 22px;
    margin: 0 2px;
    border: 1.5px solid color-mix(in srgb, var(--charcoal) 55%, transparent);
    border-radius: 50%;
    background: var(--white);
    color: var(--text);
    padding: 0;
  }
  .tick:hover {
    border-color: var(--charcoal);
  }
  .done .tick {
    background: var(--sage);
    border-color: var(--sage-deep);
  }
  .open {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1;
    min-width: 0;
    min-height: 30px;
    padding: 0 4px;
    border: 0;
    background: none;
    font-size: 12.5px;
    text-align: left;
  }
  .n {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .done .n {
    text-decoration: line-through;
    color: var(--text-muted);
    font-weight: 500;
  }
  .t,
  .s {
    flex: none;
    color: var(--text-muted);
  }
  .s {
    margin-left: auto;
    font-size: 11.5px;
  }
  .flag {
    display: grid;
    place-items: center;
    color: #b0505c;
    flex: none;
  }
</style>
