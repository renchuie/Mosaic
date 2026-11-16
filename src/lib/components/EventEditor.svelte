<script lang="ts">
  import { KIND_LABEL, WEEKDAYS, addDays, fmtTime, fromKey, minutes, weekday, type CalEvent, type EventKind } from "../calendar";
  import { COURSES } from "../courses";
  import { deleteEvent, editor, saveEvent, skipDay } from "../stores/calendar.svelte";

  let dialog = $state<HTMLDialogElement>();
  let d = $state<CalEvent | null>(null);
  let repeats = $state(false);
  let error = $state<string | null>(null);
  let confirmDelete = $state(false);

  $effect(() => {
    if (editor.open && editor.draft && dialog && !dialog.open) {
      d = { ...editor.draft, skip: editor.draft.skip ? [...editor.draft.skip] : undefined };
      repeats = !!d.repeat?.weekdays.length;
      if (!d.repeat) d.repeat = { weekdays: [weekday(d.date)], until: addDays(d.date, 7 * 15) };
      error = null;
      confirmDelete = false;
      dialog.showModal();
    }
  });

  function close() {
    editor.open = false;
    dialog?.close();
  }

  function toggleDay(i: number) {
    if (!d?.repeat) return;
    d.repeat.weekdays = d.repeat.weekdays.includes(i) ? d.repeat.weekdays.filter((x) => x !== i) : [...d.repeat.weekdays, i].sort();
  }

  function save(e: SubmitEvent) {
    e.preventDefault();
    if (!d) return;
    if (!d.title.trim()) return (error = "Give it a title.");
    if (!d.allDay && (!d.start || !d.end || minutes(d.end) <= minutes(d.start))) return (error = "The end time must be after the start time.");
    if (repeats && (!d.repeat?.weekdays.length || !d.repeat.until || d.repeat.until < d.date)) return (error = "Pick repeat days and an end date after the first day.");
    const ev: CalEvent = { ...d, title: d.title.trim() };
    if (!repeats) {
      delete ev.repeat;
      delete ev.skip;
    }
    if (ev.allDay) {
      delete ev.start;
      delete ev.end;
    }
    for (const k of ["course", "location", "notes"] as const) if (!ev[k]?.trim()) delete ev[k];
    saveEvent(editor.id, $state.snapshot(ev) as CalEvent);
    close();
  }

  function remove(which: "day" | "all") {
    if (!editor.id) return;
    if (which === "day" && editor.date) skipDay(editor.id, editor.date);
    else deleteEvent(editor.id);
    close();
  }

  const kinds = Object.keys(KIND_LABEL) as EventKind[];
  const longDate = (k: string) => fromKey(k).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
</script>

<dialog bind:this={dialog} onclose={() => (editor.open = false)} aria-labelledby="ev-title">
  {#if d}
    <form onsubmit={save}>
      <header>
        <h2 id="ev-title" class="h2">{editor.id ? "Edit event" : "New event"}</h2>
        {#if editor.id && repeats}<span class="tag">Changes apply to every repeat</span>{/if}
      </header>

      <label class="field">
        <span class="label">Title</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="input" bind:value={d.title} autofocus placeholder="e.g. Ther IV lecture" />
      </label>

      <div class="field">
        <span class="label">Type</span>
        <div class="seg" role="radiogroup" aria-label="Type">
          {#each kinds as k}
            <button type="button" role="radio" aria-checked={d.kind === k} class="k-{k}" class:on={d.kind === k} onclick={() => (d!.kind = k)}>{KIND_LABEL[k]}</button>
          {/each}
        </div>
      </div>

      <label class="field">
        <span class="label">Course</span>
        <select class="input" bind:value={d.course}>
          <option value={undefined}>None</option>
          {#each COURSES as c}<option value={c}>{c}</option>{/each}
        </select>
      </label>

      <div class="row3">
        <label class="field">
          <span class="label">{repeats ? "First day" : "Day"}</span>
          <input class="input" type="date" bind:value={d.date} required />
        </label>
        {#if !d.allDay}
          <label class="field">
            <span class="label">Start</span>
            <input class="input" type="time" step="300" bind:value={d.start} />
          </label>
          <label class="field">
            <span class="label">End</span>
            <input class="input" type="time" step="300" bind:value={d.end} />
          </label>
        {/if}
      </div>

      <div class="checks">
        <label class="check"><input type="checkbox" bind:checked={d.allDay} /> All day</label>
        <label class="check"><input type="checkbox" bind:checked={repeats} /> Repeats weekly</label>
      </div>

      {#if repeats && d.repeat}
        <div class="repeat">
          <div class="days" role="group" aria-label="Repeat on">
            {#each WEEKDAYS as w, i}
              <button type="button" class:on={d.repeat.weekdays.includes(i)} aria-pressed={d.repeat.weekdays.includes(i)} onclick={() => toggleDay(i)}>{w}</button>
            {/each}
          </div>
          <label class="field">
            <span class="label">Last day</span>
            <input class="input" type="date" bind:value={d.repeat.until} />
          </label>
        </div>
      {/if}

      <label class="field">
        <span class="label">Where</span>
        <input class="input" bind:value={d.location} placeholder="Optional" />
      </label>
      <label class="field">
        <span class="label">Notes</span>
        <textarea class="input" rows="2" bind:value={d.notes} placeholder="Optional"></textarea>
      </label>

      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <footer>
        {#if editor.id}
          {#if !confirmDelete}
            <button type="button" class="btn quiet" onclick={() => (confirmDelete = true)}>Delete</button>
          {:else if repeats && editor.date}
            <button type="button" class="btn quiet danger" onclick={() => remove("day")}>Only {longDate(editor.date)}</button>
            <button type="button" class="btn quiet danger" onclick={() => remove("all")}>Every repeat</button>
          {:else}
            <button type="button" class="btn quiet danger" onclick={() => remove("all")}>Yes, delete</button>
          {/if}
        {/if}
        <span class="spacer"></span>
        <button type="button" class="btn quiet" onclick={close}>Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </footer>
      {#if !d.allDay && d.start && d.end && minutes(d.end) > minutes(d.start)}
        <p class="sum muted">{fmtTime(d.start)} – {fmtTime(d.end)}</p>
      {/if}
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    border: 0;
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-lift);
    padding: 0;
  }
  dialog::backdrop {
    background: rgba(59, 48, 51, 0.28);
  }
  form {
    display: grid;
    gap: 14px;
    padding: 22px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  header .h2 {
    font-size: 22px;
  }
  .seg,
  .days {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .seg button,
  .days button {
    min-height: var(--hit);
    padding: 0 16px;
    border: 0;
    border-radius: var(--radius-pill);
    font-weight: 500;
    opacity: 0.55;
  }
  .days button {
    background: var(--panel);
    padding: 0 12px;
    min-width: var(--hit);
  }
  .seg button.on,
  .days button.on {
    opacity: 1;
    box-shadow: 0 0 0 2px var(--charcoal);
  }
  .days button.on {
    background: var(--sage);
  }
  .row3 {
    display: grid;
    grid-template-columns: 1.4fr 1fr 1fr;
    gap: 10px;
  }
  @media (max-width: 520px) {
    .row3 {
      grid-template-columns: 1fr 1fr;
    }
    .row3 .field:first-child {
      grid-column: 1 / -1;
    }
  }
  .checks {
    display: flex;
    gap: 18px;
    flex-wrap: wrap;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: var(--hit);
    cursor: pointer;
  }
  .check input {
    width: 20px;
    height: 20px;
    accent-color: var(--sage-deep);
  }
  .repeat {
    display: grid;
    gap: 10px;
    padding: 14px;
    border-radius: var(--radius-sm);
    background: var(--sage-soft);
  }
  .repeat .input {
    background: var(--surface);
  }
  textarea.input {
    resize: vertical;
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
  .danger {
    background: var(--rose-soft);
    color: #8f3b45;
  }
  .sum {
    font-size: 13px;
    margin-top: -6px;
    text-align: right;
  }
</style>
