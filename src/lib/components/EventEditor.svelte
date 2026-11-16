<script lang="ts">
  import { tick } from "svelte";
  import Icon from "./Icon.svelte";
  import {
    WEEKDAYS, addDays, describeRepeat, fmtTime, fromKey, minutes, normalizeRepeat, nthWeekday, weekday,
    type CalEvent, type Freq, type Repeat,
  } from "../calendar";
  import { COURSES } from "../courses";
  import { deleteEvent, editor, saveEvent, skipDay, tagManager, tagStyle, tags } from "../stores/calendar.svelte";

  let dialog = $state<HTMLDialogElement>();
  let d = $state<CalEvent | null>(null);
  let freq = $state<Freq | "none">("none");
  let rep = $state<Repeat>({ freq: "weekly", interval: 1 });
  let ends = $state<"never" | "until" | "count">("never");
  let error = $state<string | null>(null);
  let confirmDelete = $state(false);
  let pos = $state("");

  $effect(() => {
    if (editor.open && editor.draft && dialog && !dialog.open) void openNow();
  });

  async function openNow() {
    const draft = editor.draft!;
    d = { ...draft, skip: draft.skip ? [...draft.skip] : undefined };
    const r = normalizeRepeat(draft.repeat, draft.date);
    freq = r?.freq ?? "none";
    rep = r ?? { freq: "weekly", interval: 1, weekdays: [weekday(draft.date)] };
    rep.weekdays ??= [weekday(draft.date)];
    rep.monthly ??= "date";
    ends = r?.until ? "until" : r?.count ? "count" : "never";
    rep.until ??= addDays(draft.date, 7 * 15);
    rep.count ??= 10;
    error = null;
    confirmDelete = false;
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

  function close() {
    editor.open = false;
    dialog?.close();
  }

  function toggleDay(i: number) {
    const days = rep.weekdays ?? [];
    rep.weekdays = days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort();
  }

  const builtRepeat = $derived.by((): Repeat | undefined => {
    if (freq === "none" || !d) return undefined;
    const r: Repeat = { freq, interval: Math.max(1, Math.floor(Number(rep.interval) || 1)) };
    if (freq === "weekly") r.weekdays = rep.weekdays?.length ? rep.weekdays : [weekday(d.date)];
    if (freq === "monthly") r.monthly = rep.monthly;
    if (ends === "until") r.until = rep.until;
    if (ends === "count") r.count = Math.max(1, Math.floor(Number(rep.count) || 1));
    return r;
  });

  function save(e: SubmitEvent) {
    e.preventDefault();
    if (!d) return;
    if (!d.title.trim()) return (error = "Give it a title.");
    if (!d.allDay && (!d.start || !d.end || minutes(d.end) <= minutes(d.start))) return (error = "The end time must be after the start time.");
    if (builtRepeat?.until && builtRepeat.until < d.date) return (error = "The repeat must end after the first day.");
    if (freq === "weekly" && !rep.weekdays?.length) return (error = "Pick at least one day to repeat on.");
    const ev: CalEvent = { ...$state.snapshot(d), title: d.title.trim() };
    if (builtRepeat) ev.repeat = $state.snapshot(builtRepeat) as Repeat;
    else {
      delete ev.repeat;
      delete ev.skip;
    }
    if (ev.allDay) {
      delete ev.start;
      delete ev.end;
    }
    for (const k of ["course", "location", "notes"] as const) if (!ev[k]?.trim()) delete ev[k];
    saveEvent(editor.id, ev);
    close();
  }

  function remove(which: "day" | "all") {
    if (!editor.id) return;
    if (which === "day" && editor.date) skipDay(editor.id, editor.date);
    else deleteEvent(editor.id);
    close();
  }

  const longDate = (k: string) => fromKey(k).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const ordinal = (k: string) => {
    const { n, last } = nthWeekday(k);
    return `${n === 5 || last ? "last" : ["first", "second", "third", "fourth"][n - 1]} ${fromKey(k).toLocaleDateString("en-US", { weekday: "long" })}`;
  };
  const units: Record<Freq, string> = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };
</script>

<dialog bind:this={dialog} style={pos} onclose={() => (editor.open = false)} aria-labelledby="ev-title">
  {#if d}
    <form onsubmit={save}>
      <header>
        <span class="badge" aria-hidden="true"><Icon name="calendar" size={20} /></span>
        <div>
          <h2 id="ev-title" class="h2">{editor.id ? "Edit schedule" : "Create schedule"}</h2>
          <p class="muted">{editor.id && freq !== "none" ? "Changes apply to every repeat" : "Fill in the details below"}</p>
        </div>
        <button type="button" class="x" aria-label="Close" onclick={close}>×</button>
      </header>

      <div class="rows">
        <label class="row" for="ev-t"><span>Title</span></label>
        <!-- svelte-ignore a11y_autofocus -->
        <input id="ev-t" class="input" bind:value={d.title} autofocus placeholder="e.g. Heart failure review" />

        <label class="row" for="ev-n"><span>Description</span></label>
        <textarea id="ev-n" class="input" rows="2" bind:value={d.notes} placeholder="Add a description"></textarea>

        <span class="row"><span>Tag</span></span>
        <div class="tags" role="radiogroup" aria-label="Tag">
          {#each tags() as [id, t] (id)}
            <button type="button" role="radio" aria-checked={d.kind === id} class="chip" class:on={d.kind === id} style={tagStyle(id)} onclick={() => (d!.kind = id)}>
              <span class="tag-dot"></span>{t.name}
            </button>
          {/each}
          <button type="button" class="chip manage" onclick={() => (tagManager.open = true)}>Edit tags</button>
        </div>

        <label class="row" for="ev-d"><span>Date</span></label>
        <input id="ev-d" class="input" type="date" bind:value={d.date} required />

        <span class="row"><span>Time</span></span>
        <div class="time">
          {#if !d.allDay}
            <input class="input" type="time" step="300" bind:value={d.start} aria-label="Start time" />
            <span aria-hidden="true">→</span>
            <input class="input" type="time" step="300" bind:value={d.end} aria-label="End time" />
          {/if}
          <label class="check"><input type="checkbox" bind:checked={d.allDay} /> All day</label>
        </div>

        <label class="row" for="ev-c"><span>Course</span></label>
        <select id="ev-c" class="input" bind:value={d.course}>
          <option value={undefined}>None</option>
          {#each COURSES as c}<option value={c}>{c}</option>{/each}
        </select>

        <label class="row" for="ev-r"><span>Repeat</span></label>
        <div class="repeat-wrap">
          <select id="ev-r" class="input" bind:value={freq}>
            <option value="none">Does not repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          {#if freq !== "none"}
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
                  <label><input type="radio" bind:group={rep.monthly} value="date" /> On day {Number(d.date.slice(8, 10))}</label>
                  <label><input type="radio" bind:group={rep.monthly} value="weekday" /> On the {ordinal(d.date)}</label>
                </div>
              {/if}
              <div class="radios">
                <span class="label">Ends</span>
                <label><input type="radio" bind:group={ends} value="never" /> Never</label>
                <label><input type="radio" bind:group={ends} value="until" /> On <input class="input small" type="date" bind:value={rep.until} disabled={ends !== "until"} /></label>
                <label><input type="radio" bind:group={ends} value="count" /> After <input class="input num" type="number" min="1" bind:value={rep.count} disabled={ends !== "count"} /> times</label>
              </div>
              <p class="sum">{describeRepeat(builtRepeat, d.date)}</p>
            </div>
          {/if}
        </div>

        <label class="row" for="ev-l"><span>Where</span></label>
        <input id="ev-l" class="input" bind:value={d.location} placeholder="Optional" />
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
        {#if !d.allDay && d.start && d.end && minutes(d.end) > minutes(d.start)}
          <span class="muted small-sum">{fmtTime(d.start)} – {fmtTime(d.end)}</span>
        {/if}
        <button type="button" class="btn quiet" onclick={close}>Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </footer>
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(520px, calc(100vw - 24px));
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
  .chip.manage {
    background: none;
    color: var(--text-muted);
    text-decoration: underline;
    text-underline-offset: 3px;
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
    accent-color: var(--sage-deep);
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
