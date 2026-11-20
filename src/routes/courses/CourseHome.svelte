<script lang="ts">
  import GradeRing from "../../lib/components/GradeRing.svelte";
  import Icon from "../../lib/components/Icon.svelte";
  import { fromKey } from "../../lib/calendar";
  import { gpa } from "../../lib/grades";
  import { courses, gradeOf } from "../../lib/stores/courses.svelte";
  import { currentTerm } from "../../lib/stores/settings.svelte";
  import { labsFor, upcomingFor } from "../../lib/stores/courseLinks.svelte";
  import { courseEditor } from "./editor.svelte";

  let showArchived = $state(false);
  const list = $derived(courses(showArchived));
  const rows = $derived(list.map(([id, c]) => ({ id, c, g: gradeOf(id), up: upcomingFor(c.name), labCount: labsFor(c.name).length })));
  const termGpa = $derived(gpa(rows.filter((r) => !r.c.archived).map((r) => ({ letter: r.g?.letter ?? null, credits: r.c.credits ?? 0 }))));
  const credits = $derived(rows.filter((r) => !r.c.archived).reduce((n, r) => n + (r.c.credits ?? 0), 0));

  function nextUp(r: (typeof rows)[0]) {
    const items = [
      ...r.up.exams.map((e) => ({ date: e.date, text: `${e.title}`, kind: "exam" })),
      ...r.up.due.map((o) => ({ date: o.date, text: o.task.title, kind: "task" })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    return items[0];
  }
  const short = (d: string) => fromKey(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const needText = (r: (typeof rows)[0]) => {
    const n = r.g?.needed;
    if (!r.c.grading.categories.length && r.c.grading.mode === "category") return "Set up grading from the syllabus";
    if (!n) return r.g?.current !== null ? "Everything is graded" : "No assessments yet";
    if (n.status === "secured") return `${r.c.grading.target}% is locked in`;
    if (n.status === "out-of-reach") return `${r.c.grading.target}% is out of reach`;
    return `Need ${Math.round(n.pct * 10) / 10}% on the rest for ${r.c.grading.target}%`;
  };
</script>

<div class="home">
  <header class="top">
    <div>
      <h1 class="display">Courses</h1>
      <p class="muted">{currentTerm()} · {rows.filter((r) => !r.c.archived).length} courses{credits ? ` · ${credits} credits` : ""}</p>
    </div>
    <div class="acts">
      {#if termGpa !== null}<span class="gpa"><small>Term GPA estimate</small><b class="display">{termGpa.toFixed(2)}</b></span>{/if}
      <button class="btn primary" type="button" onclick={() => courseEditor.open(null)}>+ Add course</button>
    </div>
  </header>

  <div class="grid">
    {#each rows as r (r.id)}
      {@const nx = nextUp(r)}
      <a class="card course" class:arch={r.c.archived} href="#/courses/{r.id}" style="--c: {r.c.color}">
        <div class="head">
          <span class="tile"><Icon name={r.c.icon} size={20} /></span>
          <span class="code">{r.c.code ?? ""}</span>
          <span class="open" aria-hidden="true"><Icon name="arrow" size={15} /></span>
        </div>
        <div class="body">
          <div class="txt">
            <h2 class="display">{r.c.name}</h2>
            <p class="need" class:warn={r.g?.needed?.status === "out-of-reach"}>{needText(r)}</p>
          </div>
          <GradeRing pct={r.g?.current ?? null} color="color-mix(in srgb, {r.c.color} 70%, #3b3033)" size={84} sub={r.g?.letter ?? (r.g?.current === null ? "no grades" : "")} />
        </div>
        <div class="share">
          <span class="bar"><span style="width: {Math.round((r.g?.gradedShare ?? 0) * 100)}%"></span></span>
          <span>{Math.round((r.g?.gradedShare ?? 0) * 100)}% graded</span>
        </div>
        <div class="foot">
          {#if nx}
            <span class="chip" class:exam={nx.kind === "exam"}><Icon name={nx.kind === "exam" ? "flag" : "tasks"} size={13} /> {nx.text} · {short(nx.date)}</span>
          {:else}
            <span class="chip muted">Nothing due soon</span>
          {/if}
          {#if r.labCount}<span class="chip"><Icon name="labs" size={13} /> {r.labCount} {r.labCount === 1 ? "page" : "pages"}</span>{/if}
        </div>
      </a>
    {/each}
  </div>

  <label class="check"><input type="checkbox" bind:checked={showArchived} /> Show archived courses</label>
</div>

<style>
  .home {
    display: grid;
    gap: var(--gap);
  }
  .top {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 0 4px;
  }
  h1 {
    font-size: clamp(28px, 3.4vw, 38px);
    font-weight: 600;
  }
  .acts {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .gpa {
    display: grid;
    padding: 6px 16px;
    border-radius: 16px;
    background: var(--surface);
    box-shadow: var(--shadow);
    line-height: 1.1;
  }
  .gpa small {
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .gpa b {
    font-size: 22px;
    font-weight: 600;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--gap);
  }
  .course {
    position: relative;
    display: grid;
    gap: 14px;
    padding: 0;
    overflow: hidden;
    text-decoration: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .course:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lift);
  }
  .course:hover .open {
    background: var(--charcoal);
    color: var(--on-primary);
  }
  .course.arch {
    opacity: 0.6;
  }
  :global(:root[data-family="dark"]) .head {
    background: linear-gradient(135deg, color-mix(in srgb, var(--c) 34%, var(--surface)), color-mix(in srgb, var(--c) 20%, var(--surface))) !important;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px 30px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--c) 75%, var(--white)), var(--c));
  }
  .tile {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--white) 75%, transparent);
  }
  .code {
    font-weight: 600;
    font-size: 14px;
  }
  .open {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    margin-left: auto;
    border-radius: 50%;
    background: color-mix(in srgb, var(--white) 75%, transparent);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    margin-top: -28px;
    padding: 14px 16px 0;
    border-radius: 22px 22px 0 0;
    background: var(--surface);
  }
  .txt h2 {
    font-size: 19px;
    font-weight: 600;
    line-height: 1.2;
  }
  .need {
    margin-top: 4px;
    font-size: 13.5px;
    color: var(--text-muted);
  }
  .need.warn {
    color: var(--alert-ink);
  }
  .share {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .bar {
    flex: 1;
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--panel);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: color-mix(in srgb, var(--c) 75%, var(--charcoal));
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 0 16px 16px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    padding: 4px 10px;
    border-radius: var(--radius-pill);
    background: var(--panel);
    font-size: 12.5px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip.exam {
    background: var(--rose-soft);
    color: var(--alert-ink);
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: var(--hit);
    font-size: 14px;
    color: var(--text-muted);
    cursor: pointer;
    justify-self: start;
  }
  .check input {
    width: 18px;
    height: 18px;
    accent-color: var(--sage-deep);
  }
</style>
