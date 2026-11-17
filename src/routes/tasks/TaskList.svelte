<script lang="ts">
  // Tasks page, List tab: quick add, filters, and tasks grouped by when they're due.
  import Icon from "../../lib/components/Icon.svelte";
  import { addDays, fromKey, todayKey, type TaskOcc } from "../../lib/calendar";
  import { courseNames } from "../../lib/stores/courses.svelte";
  import { tagStyle, tags } from "../../lib/stores/calendar.svelte";
  import { overdue, saveTask, blankTask, taskView, tasks, tasksOn } from "../../lib/stores/tasks.svelte";
  import TaskRow from "./TaskRow.svelte";

  const today = todayKey();
  let course = $state("");
  let tag = $state("");
  let showDone = $state(false);
  let quick = $state("");
  let quickDue = $state<"" | "today" | "tomorrow">("");

  const keep = (o: { task: TaskOcc["task"] }) => (!course || o.task.course === course) && (!tag || (o.task.tag ?? "task") === tag);
  const horizon = addDays(today, 60);

  const groups = $derived.by(() => {
    if (taskView.day) {
      const d = taskView.day;
      const items = tasksOn(d, d).filter(keep);
      return [{ key: "day", title: d === today ? "Today" : `Due ${fromKey(d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}`, items, tone: "", icon: "calendar" }];
    }
    const late = overdue().filter(keep);
    const upcoming = tasksOn(today, horizon).filter(keep);
    const open = upcoming.filter((o) => !o.done);
    const weekEnd = addDays(today, 7);
    // Repeating tasks: only their next open day in "Later", so a weekly quiz doesn't fill the list.
    const seen = new Set<string>();
    const later = open.filter((o) => o.date > weekEnd && (!o.task.repeat || (!seen.has(o.id) && seen.add(o.id))));
    const undated = tasks()
      .filter(([, t]) => !t.due && t.status !== "done")
      .map(([id, t]) => ({ id, task: t, date: null as string | null, done: false }))
      .filter(keep);
    const done = [
      ...tasks().filter(([, t]) => !t.repeat && t.status === "done").map(([id, t]) => ({ id, task: t, date: t.due ?? null, done: true, at: t.doneAt ?? 0 })),
    ]
      .filter(keep)
      .sort((a, b) => b.at - a.at)
      .slice(0, 30);
    return [
      { key: "late", title: "Overdue", items: late, tone: "alert", icon: "flag" },
      { key: "today", title: "Today", items: open.filter((o) => o.date === today), tone: "", icon: "sun" },
      { key: "tomorrow", title: "Tomorrow", items: open.filter((o) => o.date === addDays(today, 1)), tone: "", icon: "moon" },
      { key: "week", title: "This week", items: open.filter((o) => o.date > addDays(today, 1) && o.date <= weekEnd), tone: "", icon: "calendar" },
      { key: "later", title: "Later", items: later, tone: "", icon: "arrow" },
      { key: "undated", title: "No due date", items: undated, tone: "", icon: "bulb" },
      ...(showDone ? [{ key: "done", title: "Done", items: done, tone: "", icon: "check" }] : []),
    ];
  });

  function add(e: SubmitEvent) {
    e.preventDefault();
    const title = quick.trim();
    if (!title) return;
    const due = quickDue === "today" ? today : quickDue === "tomorrow" ? addDays(today, 1) : undefined;
    saveTask(null, blankTask({ title, due, course: course || undefined, tag: tag || "task" }));
    quick = "";
  }
</script>

<div class="page">
  <form class="quick card" onsubmit={add}>
    <span class="plus" aria-hidden="true">+</span>
    <input class="input" bind:value={quick} placeholder="Add a task and press Enter" aria-label="Quick add task" />
    <div class="seg" role="radiogroup" aria-label="Due">
      {#each [["", "No date"], ["today", "Today"], ["tomorrow", "Tomorrow"]] as [v, l]}
        <button type="button" role="radio" aria-checked={quickDue === v} class:on={quickDue === v} onclick={() => (quickDue = v as typeof quickDue)}>{l}</button>
      {/each}
    </div>
  </form>

  <div class="filters">
    <select class="input" bind:value={course} aria-label="Course">
      <option value="">All courses</option>
      {#each courseNames() as c}<option value={c}>{c}</option>{/each}
    </select>
    <div class="tagf" role="group" aria-label="Tag">
      <button type="button" class:on={!tag} onclick={() => (tag = "")}>All tags</button>
      {#each tags() as [id, t] (id)}
        <button type="button" class:on={tag === id} style={tagStyle(id)} onclick={() => (tag = tag === id ? "" : id)}><span class="tag-dot"></span>{t.name}</button>
      {/each}
    </div>
    <label class="check"><input type="checkbox" bind:checked={showDone} /> Show done</label>
  </div>

  {#each groups.filter((g) => g.items.length) as g (g.key)}
    <section class="group" class:late={g.tone === "alert"}>
      <h2 class="h2"><span class="gi"><Icon name={g.icon} size={17} /></span>{g.title} <span class="tag" class:alert={g.tone === "alert"}>{g.items.length}</span></h2>
      <ol class="timeline">
        {#each g.items as o (o.id + (o.date ?? ""))}
          <TaskRow {o} />
        {/each}
      </ol>
    </section>
  {:else}
    <section class="card empty">
      <Icon name="tasks" size={28} />
      <p>No open tasks{course || tag ? " for this filter" : ""}. Add one above, or from the calendar.</p>
    </section>
  {/each}

</div>

<style>
  .page {
    display: grid;
    gap: var(--gap);
    container-type: inline-size;
  }
  .quick {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
  }
  .plus {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--panel);
    font-size: 20px;
    color: var(--text-muted);
  }
  .quick .input {
    background: transparent;
    font-size: 16px;
  }
  .seg {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-pill);
    background: var(--panel);
  }
  .seg button {
    min-height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    font-size: 13.5px;
    font-weight: 500;
    color: var(--text-muted);
  }
  .seg button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  @container (max-width: 640px) {
    .quick {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .quick .seg {
      grid-column: 1 / -1;
    }
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .filters .input {
    width: auto;
    background: var(--surface);
  }
  .tagf {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tagf button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--surface);
    font-size: 13.5px;
    font-weight: 500;
    color: var(--text-muted);
  }
  .tagf button.on {
    background: var(--charcoal);
    color: var(--on-primary);
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: var(--hit);
    font-size: 14px;
    cursor: pointer;
    margin-left: auto;
  }
  .check input {
    width: 18px;
    height: 18px;
    accent-color: var(--sage-deep);
  }
  .group {
    display: grid;
    gap: 12px;
  }
  .group.late {
    padding: 16px;
    border-radius: 28px;
    background: linear-gradient(140deg, var(--rose-soft), color-mix(in srgb, var(--rose-soft) 40%, var(--panel)));
  }
  .group.late :global(.tick) {
    background: var(--white);
  }
  .group .h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 4px;
  }
  .gi {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .late .gi {
    color: var(--alert-ink);
  }
  .timeline {
    position: relative;
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
  }
  /* the dotted line that joins the tick circles */
  .timeline::before {
    content: "";
    position: absolute;
    left: 14px;
    top: 30px;
    bottom: 30px;
    border-left: 2px dotted color-mix(in srgb, var(--charcoal) 25%, transparent);
  }
  .empty {
    display: grid;
    justify-items: center;
    gap: 10px;
    padding: 32px;
    color: var(--text-muted);
    text-align: center;
  }
</style>
