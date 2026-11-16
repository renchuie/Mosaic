<script lang="ts">
  // One popover for both kinds of calendar entry: events (time blocks) and
  // tasks (things due). New entries can switch type; existing ones can't.
  import { tick } from "svelte";
  import Icon from "./Icon.svelte";
  import {
    PRIORITY_LABEL, STATUS_LABEL, WEEKDAYS, addDays, describeRepeat, fmtTime, fromKey, minutes, normalizeRepeat,
    nthWeekday, todayKey, weekday, type CalEvent, type Freq, type Priority, type Repeat, type Subtask, type Task,
  } from "../calendar";
  import { COURSES } from "../courses";
  import { deleteEvent, editor, saveEvent, skipDay, tagManager, tagStyle, tags } from "../stores/calendar.svelte";
  import { deleteTask, saveTask, skipTaskDay } from "../stores/tasks.svelte";
  import { newId } from "../stores/synced.svelte";

  let dialog = $state<HTMLDialogElement>();
  let type = $state<"event" | "task">("event");
  /** fields both kinds share */
  let f = $state({ title: "", notes: "", tag: "study", course: undefined as string | undefined, date: "" });
  /** event-only */
  let ev = $state({ allDay: false, start: "16:00", end: "17:00", location: "" });
  /** task-only */
  let tk = $state({ timed: false, dueTime: "17:00", priority: "normal" as Priority, status: "todo", estimate: 0, subtasks: [] as Subtask[], doneToday: false });
  let original = $state<CalEvent | Task | null>(null);
  let newSub = $state("");

  let freq = $state<Freq | "none">("none");
  let rep = $state<Repeat>({ freq: "weekly", interval: 1 });
  let ends = $state<"never" | "until" | "count">("never");
  let error = $state<string | null>(null);
  let confirmDelete = $state(false);
  let pos = $state("");
  /** once you pick repeat days yourself, changing the date no longer resets them */
  let daysTouched = $state(false);
  $effect(() => {
    const d = f.date;
    if (d && !daysTouched) rep.weekdays = [weekday(d)];
  });

  $effect(() => {
    if (editor.open && dialog && !dialog.open) void openNow();
  });

  async function openNow() {
    type = editor.type;
    original = editor.type === "event" ? editor.draft : editor.task;
    let start = todayKey();
    let repeat: unknown;
    // Reset both kinds' fields so nothing leaks from the last entry when switching type.
    ev = { allDay: false, start: "16:00", end: "17:00", location: "" };
    tk = { timed: false, dueTime: "17:00", priority: "normal", status: "todo", estimate: 0, subtasks: [], doneToday: false };
    if (editor.type === "event" && editor.draft) {
      const d = editor.draft;
      f = { title: d.title, notes: d.notes ?? "", tag: d.kind, course: d.course, date: d.date };
      ev = { allDay: !!d.allDay, start: d.start ?? "16:00", end: d.end ?? "17:00", location: d.location ?? "" };
      start = d.date;
      repeat = d.repeat;
    } else if (editor.task) {
      const t = editor.task;
      f = { title: t.title, notes: t.notes ?? "", tag: t.tag ?? "task", course: t.course, date: t.due ?? "" };
      tk = {
        timed: !!t.dueTime,
        dueTime: t.dueTime ?? "17:00",
        priority: t.priority,
        status: t.status,
        estimate: t.estimate ?? 0,
        subtasks: (t.subtasks ?? []).map((s) => ({ ...s })),
        doneToday: !!(editor.date && t.doneDates?.includes(editor.date)),
      };
      start = t.due ?? todayKey();
      repeat = t.repeat;
    }
    const r = normalizeRepeat(repeat, start);
    freq = r?.freq ?? "none";
    rep = r ?? { freq: "weekly", interval: 1, weekdays: [weekday(start)] };
    rep.weekdays ??= [weekday(start)];
    daysTouched = !!r;
    rep.monthly ??= "date";
    ends = r?.until ? "until" : r?.count ? "count" : "never";
    rep.until ??= addDays(start, 7 * 15);
    rep.count ??= 10;
    error = null;
    confirmDelete = false;
    newSub = "";
    pos = "";
    dialog!.showModal();
    await tick();
    place();
  }

  /** Beside the click on wide windows, centred on narrow ones. */
  function place() {
    if (!dialog) return;
    const a = editor.anchor;
    const w = dialog.offsetWidth;
    const h = dialog.offsetHeight;
    if (!a || innerWidth < 900) {
      pos = "";
      return;
    }
    const left = a.x + 16 + w < innerWidth - 16 ? a.x + 16 : Math.max(16, a.x - w - 16);
    const top = Math.min(Math.max(16, a.y - 90), Math.max(16, innerHeight - h - 16));
    pos = `margin: 0; left: ${left}px; top: ${top}px;`;
  }

  async function setType(x: "event" | "task") {
    if (x === type) return;
    type = x;
    if (x === "task") {
      f.tag = "task";
    } else {
      f.tag = f.tag === "task" ? "study" : f.tag;
      if (!f.date) f.date = todayKey();
    }
    await tick();
    place();
  }

  function close() {
    editor.open = false;
    dialog?.close();
  }

  function toggleDay(i: number) {
    daysTouched = true;
    const days = rep.weekdays ?? [];
    rep.weekdays = days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort();
  }

  const builtRepeat = $derived.by((): Repeat | undefined => {
    if (freq === "none" || !f.date) return undefined;
    const r: Repeat = { freq, interval: Math.max(1, Math.floor(Number(rep.interval) || 1)) };
    if (freq === "weekly") r.weekdays = rep.weekdays?.length ? rep.weekdays : [weekday(f.date)];
    if (freq === "monthly") r.monthly = rep.monthly;
    if (ends === "until") r.until = rep.until;
    if (ends === "count") r.count = Math.max(1, Math.floor(Number(rep.count) || 1));
    return r;
  });

  function addSub() {
    const title = newSub.trim();
    if (!title) return;
    tk.subtasks = [...tk.subtasks, { id: newId(), title, done: false }];
    newSub = "";
  }

  const clean = <T extends object>(o: T): T => {
    for (const [k, v] of Object.entries(o)) if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) delete (o as Record<string, unknown>)[k];
    return o;
  };

  function save(e: SubmitEvent) {
    e.preventDefault();
    const title = f.title.trim();
    if (!title) return (error = "Give it a title.");
    if (freq !== "none" && !f.date) return (error = type === "task" ? "A repeating task needs a due date." : "Pick a day.");
    if (builtRepeat?.until && builtRepeat.until < f.date) return (error = "The repeat must end after the first day.");
    if (freq === "weekly" && !rep.weekdays?.length) return (error = "Pick at least one day to repeat on.");
    const repeat = builtRepeat ? ($state.snapshot(builtRepeat) as Repeat) : undefined;

    if (type === "event") {
      if (!f.date) return (error = "Pick a day.");
      if (!ev.allDay && (!ev.start || !ev.end || minutes(ev.end) <= minutes(ev.start))) return (error = "The end time must be after the start time.");
      const before = original && "kind" in original ? original : null;
      saveEvent(editor.id, clean({
        title,
        kind: f.tag,
        course: f.course,
        date: f.date,
        allDay: ev.allDay || undefined,
        start: ev.allDay ? undefined : ev.start,
        end: ev.allDay ? undefined : ev.end,
        location: ev.location.trim(),
        notes: f.notes.trim(),
        repeat,
        skip: repeat ? before?.skip : undefined,
      } as CalEvent));
    } else {
      const before = original && !("kind" in original) ? (original as Task) : null;
      let doneDates = repeat ? [...(before?.doneDates ?? [])] : undefined;
      if (repeat && editor.date && doneDates) {
        doneDates = doneDates.filter((d) => d !== editor.date);
        if (tk.doneToday) doneDates.push(editor.date);
      }
      const status = repeat ? "todo" : tk.status;
      saveTask(editor.id, clean({
        title,
        notes: f.notes.trim(),
        tag: f.tag,
        course: f.course,
        due: f.date || undefined,
        dueTime: f.date && tk.timed ? tk.dueTime : undefined,
        priority: tk.priority,
        status,
        doneAt: status === "done" ? (before?.status === "done" ? before.doneAt : Date.now()) : undefined,
        estimate: tk.estimate || undefined,
        repeat,
        doneDates,
        skip: repeat ? before?.skip : undefined,
        subtasks: $state.snapshot(tk.subtasks),
        created: before?.created ?? Date.now(),
      } as Task));
    }
    close();
  }

  function remove(which: "day" | "all") {
    if (!editor.id) return;
    if (type === "event") {
      if (which === "day" && editor.date) skipDay(editor.id, editor.date);
      else deleteEvent(editor.id);
    } else {
      if (which === "day" && editor.date) skipTaskDay(editor.id, editor.date);
      else deleteTask(editor.id);
    }
    close();
  }

  const longDate = (k: string) => fromKey(k).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const ordinal = (k: string) => {
    const { n, last } = nthWeekday(k);
    return `${n === 5 || last ? "last" : ["first", "second", "third", "fourth"][n - 1]} ${fromKey(k).toLocaleDateString("en-US", { weekday: "long" })}`;
  };
  const units: Record<Freq, string> = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };
  const tagChoices = $derived(tags().filter(([id]) => type === "task" || id !== "task" || f.tag === "task"));
  const heading = $derived(type === "event" ? (editor.id ? "Edit schedule" : "Create schedule") : editor.id ? "Edit task" : "New task");
  const ESTIMATES = [0, 15, 30, 45, 60, 90, 120, 180];
  const est = (m: number) => (m === 0 ? "No estimate" : m < 60 ? `${m} min` : `${m / 60} h`.replace(".5 h", "½ h"));
</script>

<dialog bind:this={dialog} style={pos} onclose={() => (editor.open = false)} aria-labelledby="ev-title">
  <form onsubmit={save}>
    <header>
      <span class="badge" aria-hidden="true"><Icon name={type === "event" ? "calendar" : "tasks"} size={20} /></span>
      <div>
        <h2 id="ev-title" class="h2">{heading}</h2>
        <p class="muted">
          {#if editor.id && freq !== "none"}Changes apply to every repeat{:else if type === "task"}Something to get done by a day{:else}Fill in the details below{/if}
        </p>
      </div>
      <button type="button" class="x" aria-label="Close" onclick={close}>×</button>
    </header>

    {#if editor.canSwitch}
      <div class="kind" role="radiogroup" aria-label="Entry type">
        <button type="button" role="radio" aria-checked={type === "event"} class:on={type === "event"} onclick={() => setType("event")}><Icon name="calendar" size={16} /> Event</button>
        <button type="button" role="radio" aria-checked={type === "task"} class:on={type === "task"} onclick={() => setType("task")}><Icon name="tasks" size={16} /> Task</button>
      </div>
    {/if}

    <div class="rows">
      <label class="row" for="ev-t"><span>Title</span></label>
      <!-- svelte-ignore a11y_autofocus -->
      <input id="ev-t" class="input" bind:value={f.title} autofocus placeholder={type === "task" ? "e.g. Finish PGx case write-up" : "e.g. Heart failure review"} />

      <label class="row" for="ev-n"><span>Description</span></label>
      <textarea id="ev-n" class="input" rows="2" bind:value={f.notes} placeholder="Add a description"></textarea>

      <span class="row"><span>Tag</span></span>
      <div class="tags" role="radiogroup" aria-label="Tag">
        {#each tagChoices as [id, t] (id)}
          <button type="button" role="radio" aria-checked={f.tag === id} class="chip" class:on={f.tag === id} style={tagStyle(id)} onclick={() => (f.tag = id)}>
            <span class="tag-dot"></span>{t.name}
          </button>
        {/each}
        <button type="button" class="chip manage" onclick={() => (tagManager.open = true)}>Edit tags</button>
      </div>

      <label class="row" for="ev-d"><span>{type === "task" ? "Due" : "Date"}</span></label>
      <div class="time">
        <input id="ev-d" class="input" type="date" bind:value={f.date} required={type === "event"} />
        {#if type === "task" && f.date}
          <button type="button" class="link" onclick={() => (f.date = "")}>No due date</button>
        {/if}
      </div>

      {#if type === "event"}
        <span class="row"><span>Time</span></span>
        <div class="time">
          {#if !ev.allDay}
            <input class="input" type="time" bind:value={ev.start} aria-label="Start time" />
            <span aria-hidden="true">→</span>
            <input class="input" type="time" bind:value={ev.end} aria-label="End time" />
          {/if}
          <label class="check"><input type="checkbox" bind:checked={ev.allDay} /> All day</label>
        </div>
      {:else if f.date}
        <span class="row"><span>Time</span></span>
        <div class="time">
          <label class="check"><input type="checkbox" bind:checked={tk.timed} /> Due at a time</label>
          {#if tk.timed}<input class="input" type="time" bind:value={tk.dueTime} aria-label="Due time" />{/if}
        </div>
      {/if}

      <label class="row" for="ev-c"><span>Course</span></label>
      <select id="ev-c" class="input" bind:value={f.course}>
        <option value={undefined}>None</option>
        {#each COURSES as c}<option value={c}>{c}</option>{/each}
      </select>

      {#if type === "task"}
        <span class="row"><span>Priority</span></span>
        <div class="seg" role="radiogroup" aria-label="Priority">
          {#each ["high", "normal", "low"] as const as p}
            <button type="button" role="radio" aria-checked={tk.priority === p} class:on={tk.priority === p} class="p-{p}" onclick={() => (tk.priority = p)}>{PRIORITY_LABEL[p]}</button>
          {/each}
        </div>

        {#if freq === "none"}
          <span class="row"><span>Status</span></span>
          <div class="seg" role="radiogroup" aria-label="Status">
            {#each ["todo", "doing", "done"] as st}
              <button type="button" role="radio" aria-checked={tk.status === st} class:on={tk.status === st} onclick={() => (tk.status = st)}>{STATUS_LABEL[st]}</button>
            {/each}
          </div>
        {:else if editor.id && editor.date}
          <span class="row"><span>Done</span></span>
          <label class="check"><input type="checkbox" bind:checked={tk.doneToday} /> Done for {longDate(editor.date)}</label>
        {/if}

        <label class="row" for="ev-e"><span>Estimate</span></label>
        <select id="ev-e" class="input" bind:value={tk.estimate}>
          {#each ESTIMATES as m}<option value={m}>{est(m)}</option>{/each}
        </select>

        <span class="row"><span>Checklist</span></span>
        <div class="subs">
          {#each tk.subtasks as s, i (s.id)}
            <div class="sub">
              <input type="checkbox" bind:checked={s.done} aria-label="Done: {s.title}" />
              <input class="input" bind:value={s.title} aria-label="Checklist item" />
              <button type="button" class="rm" aria-label="Remove {s.title}" onclick={() => (tk.subtasks = tk.subtasks.filter((_, j) => j !== i))}>×</button>
            </div>
          {/each}
          <div class="sub add">
            <span aria-hidden="true">+</span>
            <input
              class="input"
              bind:value={newSub}
              placeholder="Add a step and press Enter"
              aria-label="New checklist item"
              onkeydown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSub();
                }
              }}
            />
          </div>
        </div>
      {/if}

      <label class="row" for="ev-r"><span>Repeat</span></label>
      <div class="repeat-wrap">
        <select id="ev-r" class="input" bind:value={freq} disabled={type === "task" && !f.date}>
          <option value="none">{type === "task" && !f.date ? "Needs a due date" : "Does not repeat"}</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
        {#if freq !== "none" && f.date}
          <div class="repeat">
            <label class="inline">
              Every <input class="input num" type="number" min="1" max="99" bind:value={rep.interval} />
              {units[freq]}{Number(rep.interval) === 1 ? "" : "s"}
            </label>
            {#if freq === "weekly"}
              <div class="days" role="group" aria-label="Repeat on">
                {#each WEEKDAYS as w, i}
                  <button type="button" class:on={rep.weekdays?.includes(i)} aria-pressed={!!rep.weekdays?.includes(i)} onclick={() => toggleDay(i)}>{w.slice(0, 2)}</button>
                {/each}
              </div>
            {:else if freq === "monthly"}
              <div class="radios">
                <label><input type="radio" bind:group={rep.monthly} value="date" /> On day {Number(f.date.slice(8, 10))}</label>
                <label><input type="radio" bind:group={rep.monthly} value="weekday" /> On the {ordinal(f.date)}</label>
              </div>
            {/if}
            <div class="radios">
              <span class="label">Ends</span>
              <label><input type="radio" bind:group={ends} value="never" /> Never</label>
              <label><input type="radio" bind:group={ends} value="until" /> On <input class="input small" type="date" bind:value={rep.until} disabled={ends !== "until"} /></label>
              <label><input type="radio" bind:group={ends} value="count" /> After <input class="input num" type="number" min="1" bind:value={rep.count} disabled={ends !== "count"} /> times</label>
            </div>
            <p class="sum">{describeRepeat(builtRepeat, f.date)}</p>
          </div>
        {/if}
      </div>

      {#if type === "event"}
        <label class="row" for="ev-l"><span>Where</span></label>
        <input id="ev-l" class="input" bind:value={ev.location} placeholder="Optional" />
      {/if}
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <footer>
      {#if editor.id}
        {#if !confirmDelete}
          <button type="button" class="btn quiet" onclick={() => (confirmDelete = true)}>Delete</button>
        {:else if freq !== "none" && editor.date}
          <button type="button" class="btn quiet danger" onclick={() => remove("day")}>Only {longDate(editor.date)}</button>
          <button type="button" class="btn quiet danger" onclick={() => remove("all")}>Every repeat</button>
        {:else}
          <button type="button" class="btn quiet danger" onclick={() => remove("all")}>Yes, delete</button>
        {/if}
      {/if}
      <span class="spacer"></span>
      {#if type === "event" && !ev.allDay && ev.start && ev.end && minutes(ev.end) > minutes(ev.start)}
        <span class="muted small-sum">{fmtTime(ev.start)} – {fmtTime(ev.end)}</span>
      {/if}
      <button type="button" class="btn quiet" onclick={close}>Cancel</button>
      <button type="submit" class="btn primary">Save</button>
    </footer>
  </form>
</dialog>

<style>
  dialog {
    width: min(540px, calc(100vw - 24px));
    max-height: calc(100vh - 32px);
    border: 0;
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 30px 60px -20px rgba(108, 78, 72, 0.45), 0 2px 6px rgba(108, 78, 72, 0.08);
    padding: 0;
  }
  dialog::backdrop {
    background: rgba(59, 48, 51, 0.12);
  }
  form {
    display: grid;
    gap: 16px;
    padding: 20px;
  }
  header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 12px;
    align-items: center;
  }
  .badge {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 14px;
    background: var(--panel);
  }
  header .h2 {
    font-size: 19px;
  }
  header p {
    font-size: 13.5px;
  }
  .x {
    width: var(--hit);
    height: var(--hit);
    border: 0;
    border-radius: 50%;
    background: transparent;
    font-size: 24px;
    color: var(--text-muted);
  }
  .x:hover {
    background: var(--panel);
  }
  .kind,
  .seg {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-pill);
    background: var(--panel);
  }
  .kind button,
  .seg button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 40px;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    font-weight: 500;
    color: var(--text-muted);
  }
  .kind button.on,
  .seg button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  .seg button.p-high.on {
    background: var(--rose);
  }
  .rows {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    gap: 10px 12px;
    align-items: start;
  }
  .row {
    display: flex;
    align-items: center;
    min-height: var(--hit);
    font-size: 14.5px;
    color: var(--text-muted);
  }
  .input {
    padding: 8px 12px;
  }
  textarea.input {
    resize: vertical;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 38px;
    padding: 0 13px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--panel);
    font-size: 14px;
    font-weight: 500;
  }
  .chip.on {
    background: color-mix(in srgb, var(--tag) 45%, var(--white));
    box-shadow: inset 0 0 0 2px var(--charcoal);
  }
  .chip.manage,
  .link {
    background: none;
    border: 0;
    color: var(--text-muted);
    text-decoration: underline;
    text-underline-offset: 3px;
    font-size: 14px;
    min-height: 38px;
    padding: 0 8px;
  }
  .time {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .time .input {
    width: auto;
    flex: 1;
    min-width: 120px;
  }
  .check,
  .radios label,
  .inline {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    font-size: 14.5px;
    cursor: pointer;
  }
  input[type="checkbox"],
  input[type="radio"] {
    width: 18px;
    height: 18px;
    flex: none;
    accent-color: var(--sage-deep);
  }
  .subs {
    display: grid;
    gap: 6px;
  }
  .sub {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }
  .sub .input {
    min-height: 38px;
    padding: 6px 10px;
  }
  .sub.add {
    grid-template-columns: 18px minmax(0, 1fr);
    color: var(--text-muted);
    text-align: center;
  }
  .rm {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    font-size: 20px;
    color: var(--text-muted);
  }
  .rm:hover {
    background: var(--panel);
  }
  .repeat-wrap {
    display: grid;
    gap: 8px;
  }
  .repeat {
    display: grid;
    gap: 8px;
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    background: var(--panel);
  }
  .repeat .input {
    background: var(--surface);
  }
  .num {
    width: 70px;
    padding: 6px 10px;
    min-height: 38px;
  }
  .small {
    width: auto;
    min-height: 38px;
    padding: 6px 10px;
  }
  .days {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .days button {
    width: 42px;
    height: 42px;
    border: 0;
    border-radius: 50%;
    background: var(--surface);
    font-weight: 600;
    font-size: 13.5px;
    color: var(--text-muted);
  }
  .days button.on {
    background: var(--charcoal);
    color: var(--on-primary);
  }
  .radios {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 16px;
  }
  .radios .label {
    width: 100%;
  }
  .sum {
    font-size: 13.5px;
    font-weight: 600;
  }
  .error {
    background: var(--rose-soft);
    color: #8f3b45;
    border-radius: var(--radius-sm);
    padding: 8px 12px;
  }
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .spacer {
    flex: 1;
  }
  .small-sum {
    font-size: 13px;
  }
  .danger {
    background: var(--rose-soft);
    color: #8f3b45;
  }
  select:disabled {
    opacity: 0.6;
  }
  @media (max-width: 560px) {
    .rows {
      grid-template-columns: 1fr;
      gap: 4px;
    }
    .row {
      min-height: 0;
      margin-top: 6px;
    }
  }
</style>
