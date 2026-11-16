<script lang="ts">
  // Task board: columns by status (with your own columns), by course, or by tag.
  // Drag cards between columns (pointer-based, so it doesn't depend on the
  // webview's HTML drag-and-drop); dropping also sets the order within a column.
  import Icon from "../../lib/components/Icon.svelte";
  import {
    PALETTE, PRIORITY_LABEL, addDays, dueLabel, taskOccurrences, todayKey, type Task,
  } from "../../lib/calendar";
  import { COURSES } from "../../lib/courses";
  import { editTask, saveTag, tagStyle, tags } from "../../lib/stores/calendar.svelte";
  import {
    blankTask, customColumns, deleteColumn, patchTasks, saveColumn, saveTask, tasks, toggleTask,
  } from "../../lib/stores/tasks.svelte";

  type Mode = "status" | "course" | "tag";
  type Item = { id: string; task: Task; date: string | null; done: boolean };
  type Col = { id: string; name: string; tag?: string; custom?: boolean };

  const load = (k: string, d: string) => {
    try {
      return localStorage.getItem(k) ?? d;
    } catch {
      return d;
    }
  };
  let mode = $state<Mode>(load("studydesk.boardMode", "status") as Mode);
  let showDone = $state(load("studydesk.boardDone", "0") === "1");
  $effect(() => {
    try {
      localStorage.setItem("studydesk.boardMode", mode);
      localStorage.setItem("studydesk.boardDone", showDone ? "1" : "0");
    } catch {}
  });

  const today = todayKey();
  const RECENT = Date.now() - 14 * 864e5;

  const items = $derived.by((): Item[] => {
    const out: Item[] = [];
    for (const [id, t] of tasks()) {
      if (t.repeat) {
        // a repeating task appears once, as its next day that isn't ticked off
        const next = taskOccurrences([[id, t]], addDays(today, -14), addDays(today, 120)).find((o) => !o.done);
        if (next) out.push({ id, task: t, date: next.date, done: false });
      } else if (t.status !== "done") out.push({ id, task: t, date: t.due ?? null, done: false });
      else if ((mode === "status" || showDone) && (t.doneAt ?? 0) > RECENT) out.push({ id, task: t, date: t.due ?? null, done: true });
    }
    return out;
  });

  const columns = $derived.by((): Col[] => {
    if (mode === "course") return [...COURSES.map((c) => ({ id: c, name: c })), { id: "", name: "No course" }];
    if (mode === "tag") return tags().map(([id, t]) => ({ id, name: t.name, tag: id }));
    return [
      { id: "todo", name: "To do" },
      { id: "doing", name: "In progress" },
      ...customColumns().map(([id, c]) => ({ id, name: c.name, custom: true })),
      { id: "done", name: "Done" },
    ];
  });

  function colOf(it: Item): string {
    const ids = columns.map((c) => c.id);
    if (mode === "course") return it.task.course && ids.includes(it.task.course) ? it.task.course : "";
    if (mode === "tag") return ids.includes(it.task.tag ?? "task") ? (it.task.tag ?? "task") : "task";
    if (it.done) return "done";
    const s = it.task.repeat && it.task.status === "done" ? "todo" : it.task.status;
    return ids.includes(s) ? s : "todo";
  }

  const RANK = { high: 0, normal: 1, low: 2 };
  function sorted(col: string): Item[] {
    const list = items.filter((it) => colOf(it) === col);
    if (mode === "status" && col === "done") return list.sort((a, b) => (b.task.doneAt ?? 0) - (a.task.doneAt ?? 0));
    return list.sort(
      (a, b) =>
        (a.task.order ?? Infinity) - (b.task.order ?? Infinity) ||
        (a.date ?? "9999") .localeCompare(b.date ?? "9999") ||
        RANK[a.task.priority] - RANK[b.task.priority],
    );
  }

  // ---- dragging ---------------------------------------------------------------

  let scroller = $state<HTMLDivElement>();
  let pending: { id: string; x0: number; y0: number; el: HTMLElement } | null = null;
  let drag = $state<{ id: string; x: number; y: number; dx: number; dy: number; w: number; h: number; over: string | null; index: number } | null>(null);
  let suppressClick = false;

  function down(e: PointerEvent, id: string) {
    if (e.button !== 0 || (e.target as Element).closest(".tick")) return;
    pending = { id, x0: e.clientX, y0: e.clientY, el: e.currentTarget as HTMLElement };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  function onMove(e: PointerEvent) {
    if (pending && !drag) {
      if (Math.hypot(e.clientX - pending.x0, e.clientY - pending.y0) < 6) return;
      const r = pending.el.getBoundingClientRect();
      drag = { id: pending.id, x: e.clientX, y: e.clientY, dx: pending.x0 - r.left, dy: pending.y0 - r.top, w: r.width, h: r.height, over: null, index: 0 };
    }
    if (!drag) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    const colEl = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-col]");
    drag.over = colEl ? (colEl.dataset.col ?? null) : null;
    if (colEl) {
      const cards = [...colEl.querySelectorAll<HTMLElement>("[data-card]")].filter((c) => c.dataset.card !== drag!.id);
      const i = cards.findIndex((c) => {
        const r = c.getBoundingClientRect();
        return e.clientY < r.top + r.height / 2;
      });
      drag.index = i === -1 ? cards.length : i;
    }
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      if (e.clientX > r.right - 60) scroller.scrollLeft += 14;
      else if (e.clientX < r.left + 60) scroller.scrollLeft -= 14;
    }
  }

  function onUp() {
    window.removeEventListener("pointermove", onMove);
    if (drag) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
      if (drag.over !== null) drop(drag.id, drag.over, drag.index);
    }
    drag = null;
    pending = null;
  }

  function drop(id: string, col: string, index: number) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const patch: Partial<Task> = {};
    if (mode === "status") {
      if (it.task.repeat) {
        if (col === "done") {
          if (it.date) toggleTask(id, it.date); // ticks this week's quiz; the card moves on to the next one
          return;
        }
        patch.status = col;
      } else {
        patch.status = col;
        patch.doneAt = col === "done" ? (it.task.status === "done" ? it.task.doneAt : Date.now()) : undefined;
      }
    } else if (mode === "course") patch.course = col || undefined;
    else patch.tag = col;
    const target = sorted(col).filter((x) => x.id !== id);
    target.splice(Math.min(index, target.length), 0, it);
    patchTasks(target.map((x, i) => [x.id, x.id === id ? { ...patch, order: (i + 1) * 1000 } : { order: (i + 1) * 1000 }]));
  }

  // ---- adding -------------------------------------------------------------------

  let adding = $state<string | null>(null);
  let addText = $state("");
  function addTask(col: string) {
    const title = addText.trim();
    if (!title) return;
    const base = blankTask({ title });
    if (mode === "status") {
      base.status = col;
      if (col === "done") base.doneAt = Date.now();
    } else if (mode === "course") base.course = col || undefined;
    else base.tag = col;
    saveTask(null, base);
    addText = "";
  }

  let newCol = $state("");
  let addingCol = $state(false);
  function addColumn(e: SubmitEvent) {
    e.preventDefault();
    const name = newCol.trim();
    if (!name) return;
    if (mode === "tag") {
      const used = new Set(tags().map(([, t]) => t.color.toLowerCase()));
      saveTag(null, { name, color: PALETTE.find((c) => !used.has(c.toLowerCase())) ?? PALETTE[0] });
    } else saveColumn(null, { name, order: Math.max(0, ...customColumns().map(([, c]) => c.order)) + 1 });
    newCol = "";
    addingCol = false;
  }

  let editingCol = $state<string | null>(null);
  let confirmCol = $state<string | null>(null);

  function open(e: MouseEvent | KeyboardEvent, it: Item) {
    if (suppressClick) return;
    editTask(it.id, it.date, e instanceof MouseEvent ? e : null);
  }
  const est = (m: number) => (m < 60 ? `${m}m` : `${Math.round((m / 60) * 10) / 10}h`);
</script>

<div class="bar">
  <div class="seg" role="radiogroup" aria-label="Group by">
    {#each [["status", "Status"], ["course", "Course"], ["tag", "Tag"]] as [m, l]}
      <button type="button" role="radio" aria-checked={mode === m} class:on={mode === m} onclick={() => (mode = m as Mode)}>By {l.toLowerCase()}</button>
    {/each}
  </div>
  {#if mode !== "status"}
    <label class="check"><input type="checkbox" bind:checked={showDone} /> Show recently done</label>
  {/if}
  <span class="muted hint">Drag cards between columns. Click a card to edit it.</span>
</div>

<div class="scroller" bind:this={scroller} class:dragging={!!drag}>
  <div class="board">
    {#each columns as col (col.id)}
      {@const list = sorted(col.id)}
      <section class="col" data-col={col.id} class:over={drag?.over === col.id} class:donecol={mode === "status" && col.id === "done"}>
        <header>
          {#if col.tag}<span class="tag-dot" style={tagStyle(col.tag)}></span>{/if}
          {#if editingCol === col.id}
            <input
              class="input rename"
              value={col.name}
              aria-label="Column name"
              onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              onblur={(e) => {
                const v = e.currentTarget.value.trim();
                if (v) saveColumn(col.id, { name: v, order: customColumns().find(([i]) => i === col.id)?.[1].order ?? 1 });
                editingCol = null;
              }}
            />
          {:else}
            <h3>{col.name}</h3>
          {/if}
          <span class="count">{list.length}</span>
          {#if col.custom && editingCol !== col.id}
            <span class="tools">
              {#if confirmCol === col.id}
                <button type="button" class="mini danger" onclick={() => { deleteColumn(col.id); confirmCol = null; }}>Delete{list.length ? ` (${list.length} → To do)` : ""}</button>
                <button type="button" class="mini" onclick={() => (confirmCol = null)}>Keep</button>
              {:else}
                <button type="button" class="mini" aria-label="Rename {col.name}" onclick={() => (editingCol = col.id)}>Rename</button>
                <button type="button" class="mini" aria-label="Delete {col.name}" onclick={() => (confirmCol = col.id)}>×</button>
              {/if}
            </span>
          {/if}
        </header>

        <div class="cards">
          {#each list as it, i (it.id)}
            {#if drag && drag.over === col.id && drag.index === i && drag.id !== it.id}
              <div class="placeholder" style="height: {drag.h}px"></div>
            {/if}
            <div
              class="card"
              class:ghosted={drag?.id === it.id}
              class:done={it.done}
              data-card={it.id}
              style={tagStyle(it.task.tag ?? "task")}
              role="button"
              tabindex="0"
              onpointerdown={(e) => down(e, it.id)}
              onclick={(e) => open(e, it)}
              onkeydown={(e) => e.key === "Enter" && open(e, it)}
            >
              <div class="r1">
                <button type="button" class="tick" aria-pressed={it.done} aria-label="{it.done ? 'Mark not done' : 'Mark done'}: {it.task.title}" onclick={(e) => { e.stopPropagation(); toggleTask(it.id, it.date); }}>
                  {#if it.done}<Icon name="check" size={13} />{/if}
                </button>
                <b>{it.task.title}</b>
              </div>
              <div class="meta">
                {#if mode !== "tag"}<span class="chip"><span class="tag-dot"></span>{tags().find(([id]) => id === (it.task.tag ?? "task"))?.[1].name ?? "Task"}</span>{/if}
                {#if it.date}<span class="chip" class:late={!it.done && it.date < today}>{dueLabel(it.date, today).replace("Due ", "")}</span>{/if}
                {#if mode !== "course" && it.task.course}<span class="chip">{it.task.course}</span>{/if}
                {#if it.task.priority === "high" && !it.done}<span class="chip high"><Icon name="flag" size={11} /> {PRIORITY_LABEL.high}</span>{/if}
                {#if it.task.estimate}<span class="chip"><Icon name="clock" size={11} /> {est(it.task.estimate)}</span>{/if}
                {#if it.task.repeat}<span class="chip" title="Repeats"><Icon name="repeat" size={12} /></span>{/if}
              </div>
              {#if it.task.subtasks?.length}
                {@const n = it.task.subtasks.filter((s) => s.done).length}
                <div class="prog"><span class="track"><span style="width: {(n / it.task.subtasks.length) * 100}%"></span></span><span>{n}/{it.task.subtasks.length}</span></div>
              {/if}
            </div>
          {/each}
          {#if drag && drag.over === col.id && drag.index >= list.filter((x) => x.id !== drag?.id).length}
            <div class="placeholder" style="height: {drag.h}px"></div>
          {/if}
          {#if !list.length && !(drag && drag.over === col.id)}
            <p class="empty muted">Nothing here</p>
          {/if}
        </div>

        {#if adding === col.id}
          <form class="addform" onsubmit={(e) => { e.preventDefault(); addTask(col.id); }}>
            <!-- svelte-ignore a11y_autofocus -->
            <input class="input" bind:value={addText} placeholder="Task name, then Enter" autofocus aria-label="New task in {col.name}" onblur={() => !addText.trim() && (adding = null)} />
          </form>
        {:else}
          <button type="button" class="add" onclick={() => { adding = col.id; addText = ""; }}>+ Add task</button>
        {/if}
      </section>
    {/each}

    {#if mode !== "course"}
      <section class="col newcol">
        {#if addingCol}
          <form onsubmit={addColumn}>
            <!-- svelte-ignore a11y_autofocus -->
            <input class="input" bind:value={newCol} placeholder={mode === "tag" ? "New tag, e.g. Group project" : "New column, e.g. Waiting on group"} autofocus aria-label="New column name" />
            <div class="row"><button type="submit" class="btn primary">Add</button><button type="button" class="btn quiet" onclick={() => (addingCol = false)}>Cancel</button></div>
          </form>
        {:else}
          <button type="button" class="addcol" onclick={() => (addingCol = true)}>+ {mode === "tag" ? "Add tag" : "Add column"}</button>
        {/if}
      </section>
    {/if}
  </div>
</div>

{#if drag}
  {@const it = items.find((x) => x.id === drag?.id)}
  {#if it}
    <div class="ghost card" style="{tagStyle(it.task.tag ?? 'task')} left: {drag.x - drag.dx}px; top: {drag.y - drag.dy}px; width: {drag.w}px;" aria-hidden="true">
      <div class="r1"><span class="tick"></span><b>{it.task.title}</b></div>
    </div>
  {/if}
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .seg {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-pill);
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .seg button {
    min-height: 38px;
    padding: 0 14px;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    font-weight: 500;
    font-size: 14px;
    color: var(--text-muted);
  }
  .seg button.on {
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
  }
  .check input {
    width: 18px;
    height: 18px;
    accent-color: var(--sage-deep);
  }
  .hint {
    font-size: 13.5px;
    margin-left: auto;
  }

  .scroller {
    overflow-x: auto;
    padding-bottom: 8px;
  }
  .scroller.dragging,
  .scroller.dragging * {
    cursor: grabbing !important;
    user-select: none;
  }
  .board {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    min-width: min-content;
  }
  .col {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 280px;
    flex: none;
    padding: 12px;
    border-radius: var(--radius);
    background: var(--chip);
    transition: background 0.15s ease, box-shadow 0.15s ease;
  }
  .col.over {
    background: color-mix(in srgb, var(--sage) 28%, var(--panel));
    box-shadow: inset 0 0 0 2px var(--sage-deep);
  }
  .col header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 4px;
  }
  .col h3 {
    font-size: 15px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    display: grid;
    place-items: center;
    min-width: 24px;
    height: 24px;
    padding: 0 7px;
    border-radius: var(--radius-pill);
    background: var(--surface);
    font-size: 12.5px;
    font-weight: 600;
  }
  .tools {
    margin-left: auto;
    display: flex;
    gap: 4px;
  }
  .mini {
    min-height: 30px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--surface);
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .mini.danger {
    background: var(--rose-soft);
    color: #8f3b45;
  }
  .rename {
    min-height: 34px;
    padding: 4px 10px;
    background: var(--surface);
  }
  .cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 40px;
  }
  .card {
    display: grid;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--tag) 26%, var(--white));
    box-shadow: 0 1px 2px rgba(108, 78, 72, 0.1);
    cursor: grab;
    touch-action: none;
    transition: box-shadow 0.15s ease, opacity 0.15s ease;
  }
  .card:hover {
    box-shadow: var(--shadow-lift);
  }
  .card.ghosted {
    opacity: 0.3;
  }
  .card.done b {
    text-decoration: line-through;
    color: var(--text-muted);
  }
  .donecol .card {
    background: var(--surface);
  }
  .r1 {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: start;
  }
  .r1 b {
    font-weight: 600;
    font-size: 14.5px;
    line-height: 1.3;
    padding-top: 2px;
    overflow-wrap: anywhere;
  }
  .tick {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 1.5px solid color-mix(in srgb, var(--charcoal) 50%, transparent);
    border-radius: 50%;
    background: var(--white);
  }
  .done .tick {
    background: var(--sage);
    border-color: var(--sage-deep);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--white);
    font-size: 12px;
    font-weight: 500;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip.late,
  .chip.high {
    background: var(--rose-soft);
    color: #8f3b45;
  }
  .prog {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .track {
    flex: 1;
    height: 6px;
    border-radius: var(--radius-pill);
    background: rgba(255, 253, 251, 0.8);
    overflow: hidden;
  }
  .track span {
    display: block;
    height: 100%;
    background: var(--charcoal);
  }
  .placeholder {
    border: 2px dashed var(--sage-deep);
    border-radius: 16px;
    background: rgba(255, 253, 251, 0.5);
  }
  .empty {
    font-size: 13.5px;
    text-align: center;
    padding: 10px 0;
  }
  .add,
  .addcol {
    min-height: 40px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--text-muted);
    font-size: 14px;
    text-align: left;
    padding: 0 8px;
  }
  .add:hover,
  .addcol:hover {
    background: var(--surface);
    color: var(--text);
  }
  .addform .input {
    background: var(--surface);
  }
  .newcol {
    background: transparent;
    border: 2px dashed var(--hairline);
  }
  .newcol form {
    display: grid;
    gap: 8px;
  }
  .newcol .input {
    background: var(--surface);
  }
  .newcol .row {
    display: flex;
    gap: 6px;
  }
  .ghost {
    position: fixed;
    z-index: 50;
    pointer-events: none;
    transform: rotate(2deg);
    box-shadow: var(--shadow-lift);
    opacity: 0.95;
  }
</style>
