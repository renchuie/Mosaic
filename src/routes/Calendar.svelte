<script lang="ts">
  import Icon from "../lib/components/Icon.svelte";
  import { addDays, addMonths, fromKey, mondayOf, todayKey } from "../lib/calendar";
  import { route } from "../lib/router.svelte";
  import { exams, newEvent, tagManager, tagStyle, tags, toggleSide, toggleTag, view } from "../lib/stores/calendar.svelte";
  import ExamList from "./calendar/ExamList.svelte";
  import ListView from "./calendar/ListView.svelte";
  import MonthPicker from "./calendar/MonthPicker.svelte";
  import MonthView from "./calendar/MonthView.svelte";
  import WeekGrid from "./calendar/WeekGrid.svelte";

  const VIEWS = [
    { id: "day", label: "Day" },
    { id: "", label: "Week" },
    { id: "month", label: "Month" },
    { id: "list", label: "List" },
    { id: "exams", label: "Exams" },
  ];
  const v = $derived(VIEWS.some((x) => x.id === route.rest) ? route.rest : "");
  const go = (id: string) => (location.hash = id ? `#/calendar/${id}` : "#/calendar");

  const weekStart = $derived(mondayOf(view.cursor));
  const weekDays = $derived(Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)));

  function step(n: number) {
    if (v === "day") view.cursor = addDays(view.cursor, n);
    else if (v === "month" || v === "exams") view.cursor = addMonths(view.cursor, n);
    else if (v === "list") view.cursor = addDays(view.cursor, 14 * n);
    else view.cursor = addDays(view.cursor, 7 * n);
  }

  const title = $derived.by(() => {
    const c = fromKey(view.cursor);
    if (v === "day") return c.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    if (v === "list") {
      const e = fromKey(addDays(view.cursor, 13));
      return `${c.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${e.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    }
    if (v === "" ) {
      const a = fromKey(weekStart);
      const b = fromKey(addDays(weekStart, 6));
      const m = (d: Date) => d.toLocaleDateString("en-US", { month: "long" });
      return a.getMonth() === b.getMonth() ? `${m(a)} ${a.getFullYear()}` : `${m(a)} – ${m(b)} ${b.getFullYear()}`;
    }
    return c.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  });

  const upcoming = $derived(exams().filter((e) => e.days >= 0).slice(0, 3));
</script>

<div class="calwrap">
<div class="calpage" class:noside={!view.side}>
  {#if view.side}
  <aside class="side">
    <section class="panel">
      <MonthPicker value={view.cursor} onpick={(d) => (view.cursor = d)} />
    </section>

    <section class="panel">
      <div class="ph">
        <h2 class="h2">Tags</h2>
        <button type="button" class="mini" onclick={() => (tagManager.open = true)} aria-label="Edit tags">Edit</button>
      </div>
      <ul class="taglist">
        {#each tags() as [id, t] (id)}
          <li>
            <label style={tagStyle(id)}>
              <input type="checkbox" checked={!view.hidden.includes(id)} onchange={() => toggleTag(id)} />
              <span class="tag-dot"></span>
              <span class="tn">{t.name}</span>
              {#if t.exam}<span class="ex">Exam</span>{/if}
            </label>
          </li>
        {/each}
      </ul>
      <button type="button" class="addtag" onclick={() => (tagManager.open = true)}>+ New tag</button>
    </section>

    {#if upcoming.length}
      <section class="panel">
        <div class="ph"><h2 class="h2">Coming up</h2></div>
        <ul class="up">
          {#each upcoming as e (e.key)}
            <li style={tagStyle(e.kind)}>
              <b>{e.days}</b><span>{e.days === 1 ? "day" : "days"}</span>
              <em>{e.title}</em>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </aside>
  {/if}

  <section class="main">
    <header class="toolbar">
      <button class="btn quiet icon" type="button" aria-label={view.side ? "Hide side panel" : "Show side panel"} aria-pressed={view.side} onclick={toggleSide}><Icon name="panel" size={18} /></button>
      <div class="seg" role="tablist" aria-label="Calendar view">
        {#each VIEWS as x}
          <button type="button" role="tab" aria-selected={v === x.id} class:on={v === x.id} onclick={() => go(x.id)}>{x.label}</button>
        {/each}
      </div>
      <div class="nav">
        <button class="btn quiet icon" type="button" aria-label="Previous" onclick={() => step(-1)}><Icon name="back" size={18} /></button>
        <button class="btn quiet" type="button" onclick={() => (view.cursor = todayKey())}>Today</button>
        <button class="btn quiet icon flip" type="button" aria-label="Next" onclick={() => step(1)}><Icon name="back" size={18} /></button>
      </div>
      <button class="btn primary add" type="button" onclick={(e) => newEvent(v === "exams" ? { kind: "exam", date: view.cursor, start: "09:00", end: "11:00" } : { date: view.cursor }, e)}>
        + {v === "exams" ? "Add exam" : "Add new"}
      </button>
    </header>
    <h1 class="display title">{title}</h1>

    {#if v === "day"}
      <WeekGrid days={[view.cursor]} />
    {:else if v === "month"}
      <MonthView ondayview={(d) => { view.cursor = d; go("day"); }} />
    {:else if v === "list"}
      <ListView />
    {:else if v === "exams"}
      <ExamList />
    {:else}
      <WeekGrid days={weekDays} />
    {/if}
  </section>
</div>
</div>

<style>
  .calwrap {
    container-type: inline-size;
    min-width: 0;
  }
  .calpage {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: var(--gap);
    align-items: start;
  }
  .calpage.noside {
    grid-template-columns: minmax(0, 1fr);
  }
  .side {
    display: grid;
    gap: 12px;
    position: sticky;
    top: 0;
  }
  .panel {
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 14px;
  }
  .ph {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .ph .h2 {
    font-size: 15.5px;
  }
  .mini {
    min-height: 32px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--panel);
    font-size: 13px;
    font-weight: 500;
  }
  .taglist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .taglist label {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 42px;
    padding: 0 10px;
    border-radius: 12px;
    background: var(--panel);
    cursor: pointer;
    font-size: 14.5px;
  }
  .taglist input {
    width: 18px;
    height: 18px;
    accent-color: var(--charcoal);
  }
  .tn {
    flex: 1;
  }
  .ex {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: var(--radius-pill);
    background: var(--rose-soft);
  }
  .addtag {
    margin-top: 6px;
    width: 100%;
    min-height: 40px;
    border: 1.5px dashed var(--hairline);
    border-radius: 12px;
    background: none;
    color: var(--text-muted);
    font-size: 14px;
  }
  .up {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .up li {
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr);
    align-items: baseline;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--tag) 40%, var(--white));
  }
  .up b {
    font-size: 20px;
    font-weight: 600;
  }
  .up span {
    font-size: 12px;
  }
  .up em {
    font-style: normal;
    font-size: 13.5px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .main {
    display: grid;
    gap: 14px;
    min-width: 0;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .seg {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--chip);
    border-radius: var(--radius-pill);
    overflow-x: auto;
  }
  .seg button {
    min-height: 40px;
    padding: 0 14px;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    font-weight: 500;
    color: var(--text-muted);
    flex: none;
  }
  .seg button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  .nav {
    display: flex;
    gap: 6px;
  }
  .icon {
    width: var(--hit);
    padding: 0;
  }
  .flip :global(svg) {
    transform: scaleX(-1);
  }
  .add {
    margin-left: auto;
  }
  .title {
    font-size: clamp(22px, 2.6vw, 30px);
    font-weight: 600;
    padding: 0 4px;
  }

  @container (max-width: 940px) {
    .calpage {
      grid-template-columns: minmax(0, 1fr);
    }
    .side {
      position: static;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      align-items: start;
      order: 2;
    }
  }
</style>
