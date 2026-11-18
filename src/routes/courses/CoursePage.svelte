<script lang="ts">
  import { pdfHref, pdfInfo, pdfName, pdfsForCourse } from "../../lib/stores/pdfs.svelte";
  import GradeRing from "../../lib/components/GradeRing.svelte";
  import Icon from "../../lib/components/Icon.svelte";
  import { fmtTime, fromKey, todayKey, dueLabel } from "../../lib/calendar";
  import { fmtDuration } from "../../lib/plan";
  import { editEvent, editTask, newEvent, newTask, tagStyle } from "../../lib/stores/calendar.svelte";
  import { courseGrade, letterFor } from "../../lib/grades";
  import { assessments, getCourse, saveCourse } from "../../lib/stores/courses.svelte";
  import { foldersFor, labsFor, studyFor, upcomingFor } from "../../lib/stores/courseLinks.svelte";
  import { folderHref, folderStats, labHref } from "../../lib/stores/labs.svelte";
  import { toggleTask } from "../../lib/stores/tasks.svelte";
  import { createNote, noteHref, notesForCourse } from "../../lib/stores/notes.svelte";
  import { fileNameFor } from "../../lib/notes";
  import { counts as cardCounts } from "../../lib/stores/srs.svelte";
  import DrugTracker from "./DrugTracker.svelte";
  import GradesModule from "./GradesModule.svelte";
  import { courseEditor } from "./editor.svelte";

  let { id }: { id: string } = $props();
  const course = $derived(getCourse(id));
  let whatIf = $state<Record<string, number>>({});
  let whatIfOn = $state(false);
  $effect(() => {
    if (!whatIfOn) whatIf = {};
  });

  const g = $derived(course ? courseGrade(course.grading, assessments(id)) : null);
  const proj = $derived(course && whatIfOn && Object.keys(whatIf).length ? courseGrade(course.grading, assessments(id), whatIf) : null);
  const up = $derived(course ? upcomingFor(course.name) : null);
  const folders = $derived(course ? foldersFor(course.name) : []);
  const labs = $derived(course ? labsFor(course.name) : []);
  const study = $derived(course ? studyFor(course.name) : { week: 0, total: 0 });
  const today = todayKey();
  const cardsHere = $derived(course ? cardCounts({ kind: "course", name: course.name }) : null);
  const courseNotes = $derived(course ? notesForCourse(course.name) : []);
  const coursePdfs = $derived(course ? pdfsForCourse(course.name).sort((a, b) => (pdfInfo(b.rel)?.opened ?? 0) - (pdfInfo(a.rel)?.opened ?? 0)) : []);
  async function newCourseNote() {
    if (!course) return;
    const rel = await createNote(fileNameFor(course.name).replace(/\.md$/, ""), `${todayKey()} notes`, "lecture", { course: course.name, date: todayKey() });
    location.hash = noteHref(rel);
  }

  const ink = $derived(course ? `color-mix(in srgb, ${course.color} 60%, #3b3033)` : "");
  const targetLetter = $derived(course ? letterFor(course.grading.target, course.grading.scale) : null);
  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "–" : `${Number(n.toFixed(1))}%`);

  // notes pad, saved a moment after you stop typing
  let notes = $state("");
  let notesFor = "";
  let timer = 0;
  $effect(() => {
    if (course && notesFor !== id) {
      notesFor = id;
      notes = course.notes ?? "";
    }
  });
  function typed() {
    clearTimeout(timer);
    timer = window.setTimeout(() => course && saveCourse(id, { ...course, notes }), 600);
  }
  function setTarget(v: number) {
    if (course && v > 0) saveCourse(id, { ...course, grading: { ...course.grading, target: v } });
  }
</script>

{#if !course}
  <section class="card"><p>This course doesn't exist any more. <a href="#/courses">Back to courses</a></p></section>
{:else}
  <div class="page" style="--c: {course.color}">
    <a class="back" href="#/courses"><Icon name="back" size={16} /> Courses</a>

    <header class="hero">
      <div class="who">
        <span class="tile"><Icon name={course.icon} size={26} /></span>
        <div>
          <span class="kicker">{[course.code, course.term, course.credits ? `${course.credits} credits` : ""].filter(Boolean).join(" · ")}</span>
          <h1 class="display">{course.name}</h1>
          <div class="facts">
            {#if course.instructor}<span><Icon name="users" size={13} /> {course.instructor}</span>{/if}
            {#if course.email}<a href="mailto:{course.email}"><Icon name="chat" size={13} /> {course.email}</a>{/if}
            {#if course.office}<span><Icon name="clock" size={13} /> {course.office}</span>{/if}
            {#if course.location}<span><Icon name="pin" size={13} /> {course.location}</span>{/if}
            <button type="button" class="edit" onclick={() => courseEditor.open(id)}><Icon name="settings" size={13} /> Edit course</button>
          </div>
        </div>
      </div>

      <div class="gradebox">
        <GradeRing pct={g?.current ?? null} color={ink} size={124} width={10} track="rgba(255,253,251,0.65)" sub={g?.letter ?? (g?.current === null ? "no grades yet" : "")} />
        <div class="gstats">
          <div class="target">
            <span class="label">Target</span>
            <span class="tv"><input type="number" min="1" max="110" step="0.5" value={course.grading.target} aria-label="Target grade" onchange={(e) => setTarget(Number(e.currentTarget.value))} />%{#if targetLetter}<small>({targetLetter})</small>{/if}</span>
          </div>
          {#if proj}
            <p class="need wi">With your what-ifs: <b>{fmt(proj.current)}</b>{#if proj.letter} ({proj.letter}){/if}</p>
          {/if}
          {#if g?.needed}
            <p class="need" class:bad={g.needed.status === "out-of-reach"}>
              {#if g.needed.status === "secured"}You've locked in {course.grading.target}% even with zeros on the rest.
              {:else if g.needed.status === "out-of-reach"}{course.grading.target}% isn't reachable any more; the most you can finish with is {fmt(g.ceiling)}.
              {:else}You need an average of <b>{fmt(g.needed.pct)}</b> on everything left.{/if}
            </p>
          {:else if g && g.current !== null}
            <p class="need">Everything is graded.</p>
          {/if}
          {#if g && g.floor !== null}
            <div class="range" title="Worst and best case">
              <span>Worst {fmt(g.floor)}</span>
              <span class="rb"><span style="left: {g.floor}%; width: {Math.max(1, (g.ceiling ?? 0) - g.floor)}%"></span>{#if g.current !== null}<i style="left: {g.current}%"></i>{/if}</span>
              <span>Best {fmt(g.ceiling)}</span>
            </div>
            <span class="share">{Math.round(g.gradedShare * 100)}% of the course graded</span>
          {/if}
        </div>
      </div>
    </header>

    <div class="cols">
      <div class="main">
        {#if course.tracker === "drugs"}<DrugTracker {id} />{/if}
        {#if g}<GradesModule {id} {g} bind:whatIf bind:whatIfOn />{/if}
      </div>

      <aside class="side">
        <section class="card">
          <div class="sh"><h2 class="h2">Coming up</h2>
            <span class="adds">
              <button type="button" class="mini" onclick={(e) => newTask({ course: course.name }, e)}>+ Task</button>
              <button type="button" class="mini" onclick={(e) => newEvent({ course: course.name }, e)}>+ Event</button>
            </span>
          </div>
          {#if up && (up.exams.length || up.due.length || up.events.length)}
            <ul class="up">
              {#each up.exams.slice(0, 2) as e (e.key)}
                <li class="exam"><span class="d"><b>{e.days}</b><small>{e.days === 1 ? "day" : "days"}</small></span><span class="t"><b>{e.title}</b><span>{fromKey(e.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span></span></li>
              {/each}
              {#each up.due.slice(0, 5) as o (o.id + o.date)}
                <li style={tagStyle(o.task.tag ?? "task")}>
                  <button type="button" class="tk" aria-label="Mark done: {o.task.title}" onclick={() => toggleTask(o.id, o.date)}></button>
                  <button type="button" class="t lnk" onclick={(e) => editTask(o.id, o.date, e)}><b>{o.task.title}</b><span class:late={o.date < today}>{dueLabel(o.date, today)}</span></button>
                </li>
              {/each}
              {#each up.events.filter((o) => o.ev.kind !== "exam").slice(0, 4) as o (o.id + o.date)}
                <li style={tagStyle(o.ev.kind)}>
                  <span class="dot"></span>
                  <button type="button" class="t lnk" onclick={(e) => editEvent(o.id, o.date, e)}><b>{o.ev.title}</b><span>{fromKey(o.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{o.ev.start && !o.ev.allDay ? ` · ${fmtTime(o.ev.start)}` : ""}</span></button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="muted small">Nothing in the next three weeks for this course.</p>
          {/if}
        </section>

        <section class="card">
          <div class="sh"><h2 class="h2">Study</h2><span class="tag">{fmtDuration(study.week)} this week</span></div>
          {#if labs.length}
            <ul class="labs">
              {#each labs as l (l.item.rel)}
                <li><a href={labHref(l.item.rel)}><span class="lt"><Icon name="labs" size={16} /></span><span class="t"><b>{l.lab.title}</b><span>{l.progress.avgBest === null ? "Not started" : `${l.progress.avgBest}% avg best`}{l.progress.missed ? ` · ${l.progress.missed} to revisit` : ""}</span></span><Icon name="play" size={14} /></a></li>
              {/each}
            </ul>
          {/if}
          {#if folders.length}
            <div class="folders">
              {#each folders as f (f.rel)}
                {@const s = folderStats(f)}
                <a href={folderHref(f.rel)} class="folder"><Icon name="folder" size={15} /> {f.name} <span class="muted">· {s.count} labs · {f.items.filter((x) => x.kind !== "lab").length} files</span></a>
              {/each}
            </div>
          {:else}
            <p class="muted small">Link a Recall Labs folder to this course (Labs → folder → Link this folder) to see its labs, notes and files here.</p>
          {/if}
          {#if cardsHere?.total}
            <div class="cardsrow">
              <Icon name="star" size={16} />
              <span><b>{cardsHere.due + cardsHere.newToday}</b> flashcards to review <span class="muted">· {cardsHere.total} in this course's notes</span></span>
              {#if cardsHere.due + cardsHere.newToday}<a class="mini" href="#/study/cards/review/course:{encodeURIComponent(course.name)}">Review</a>{/if}
            </div>
          {/if}
          <p class="muted small">{fmtDuration(study.total)} studied in plan blocks for this course so far.</p>
        </section>

        <section class="card">
          <div class="sh"><h2 class="h2">Course notes</h2><button type="button" class="mini" onclick={newCourseNote}>+ Note</button></div>
          {#if courseNotes.length}
            <ul class="cnotes">
              {#each courseNotes.slice(0, 8) as n (n.rel)}
                <li><a href={noteHref(n.rel)}><Icon name="pen" size={14} /><span>{n.p.title}</span>{#if n.p.meta.date}<small>{fromKey(String(n.p.meta.date)).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small>{/if}</a></li>
              {/each}
            </ul>
            {#if courseNotes.length > 8}<a class="more" href="#/study/notes">All {courseNotes.length} notes</a>{/if}
          {:else}
            <p class="muted small">No notes for this course yet.</p>
          {/if}
        </section>

        {#if coursePdfs.length}
          <section class="card">
            <div class="sh"><h2 class="h2">PDFs</h2><a class="mini" href="#/study/pdfs">All</a></div>
            <ul class="cnotes">
              {#each coursePdfs.slice(0, 6) as f (f.rel)}
                {@const info = pdfInfo(f.rel)}
                <li><a href={pdfHref(f.rel)}><Icon name="file" size={14} /><span>{pdfName(f.rel)}</span>{#if info?.annots}<small>{info.annots} {info.annots === 1 ? "mark" : "marks"}</small>{:else if info?.opened}<small>p. {info.page}</small>{/if}</a></li>
              {/each}
            </ul>
            {#if coursePdfs.length > 6}<a class="more" href="#/study/pdfs">All {coursePdfs.length} PDFs</a>{/if}
          </section>
        {/if}

        <section class="card">
          <div class="sh"><h2 class="h2">Scratch pad</h2></div>
          <textarea class="input notes" rows="7" bind:value={notes} oninput={typed} placeholder="Notes about this course…"></textarea>
        </section>
      </aside>
    </div>
  </div>
{/if}

<style>
  .page {
    display: grid;
    gap: var(--gap);
    container-type: inline-size;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    justify-self: start;
    min-height: 36px;
    padding: 0 14px 0 10px;
    border-radius: var(--radius-pill);
    background: var(--chip);
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
  }
  /* dark themes: the course colour is a pastel, so tint it into the dark page behind light text */
  :global(:root[data-family="dark"]) .hero {
    background: linear-gradient(135deg, color-mix(in srgb, var(--c) 32%, var(--surface)) 0%, color-mix(in srgb, var(--c) 18%, var(--surface)) 100%) !important;
  }
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 20px;
    align-items: center;
    padding: 24px;
    border-radius: 30px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--c) 55%, var(--white)) 0%, var(--c) 100%);
    box-shadow: var(--shadow);
  }
  @container (max-width: 820px) {
    .hero {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .who {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    min-width: 0;
  }
  .tile {
    display: grid;
    place-items: center;
    flex: none;
    width: 58px;
    height: 58px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--white) 75%, transparent);
  }
  .kicker {
    font-size: 13px;
    font-weight: 500;
  }
  h1 {
    font-size: clamp(26px, 3.4vw, 38px);
    font-weight: 600;
    line-height: 1.1;
    margin: 2px 0 10px;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .facts > * {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--white) 60%, transparent);
    font-size: 12.5px;
    text-decoration: none;
  }
  .edit {
    border: 0;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    min-height: 30px;
  }
  .gradebox {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 16px 20px;
    border-radius: 24px;
    background: color-mix(in srgb, var(--white) 55%, transparent);
    backdrop-filter: blur(6px);
  }
  .gstats {
    display: grid;
    gap: 6px;
    width: 280px;
    max-width: 100%;
  }
  .target {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .target .label {
    color: var(--text);
  }
  .tv {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 600;
  }
  .tv input {
    width: 64px;
    min-height: 34px;
    padding: 2px 8px;
    border: 0;
    border-radius: 10px;
    background: var(--surface);
    font: inherit;
    font-weight: 700;
    text-align: right;
  }
  .tv small {
    font-weight: 500;
    color: var(--text-muted);
    margin-left: 2px;
  }
  .need {
    font-size: 14px;
    line-height: 1.35;
  }
  .need.bad {
    color: var(--alert-ink);
  }
  .need.wi {
    padding: 6px 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--lavender) 35%, var(--white));
  }
  .range {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    font-size: 11.5px;
    color: var(--text-muted);
  }
  .rb {
    position: relative;
    height: 8px;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--white) 80%, transparent);
  }
  .rb span {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: inherit;
    background: color-mix(in srgb, var(--c) 60%, var(--charcoal));
    opacity: 0.55;
  }
  .rb i {
    position: absolute;
    top: -4px;
    width: 4px;
    height: 16px;
    margin-left: -2px;
    border-radius: 2px;
    background: var(--charcoal);
  }
  .share {
    font-size: 12.5px;
    color: var(--text-muted);
  }

  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 330px;
    gap: var(--gap);
    align-items: start;
  }
  @container (max-width: 980px) {
    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .main,
  .side {
    display: grid;
    gap: var(--gap);
    min-width: 0;
  }
  .side .card {
    display: grid;
    gap: 10px;
  }
  .sh {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .adds {
    display: flex;
    gap: 4px;
  }
  .mini {
    min-height: 32px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--panel);
    font-size: 12.5px;
    font-weight: 600;
  }
  a.mini {
    display: inline-flex;
    align-items: center;
    color: var(--text);
    text-decoration: none;
  }
  .small {
    font-size: 13.5px;
  }
  .up,
  .labs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .up li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    padding: 6px 8px;
    border-radius: 14px;
    background: var(--panel);
  }
  .up li.exam {
    background: var(--g-rose);
  }
  .d {
    display: grid;
    justify-items: center;
    min-width: 40px;
    line-height: 1;
  }
  .d b {
    font-size: 20px;
    font-weight: 600;
  }
  .d small {
    font-size: 10.5px;
  }
  .t {
    display: grid;
    min-width: 0;
    text-align: left;
  }
  .t b {
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .t span {
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .t span.late {
    color: var(--alert-ink);
    font-weight: 600;
  }
  .lnk {
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
  }
  .tk {
    width: 22px;
    height: 22px;
    margin: 0 9px;
    border: 1.5px solid color-mix(in srgb, var(--charcoal) 40%, transparent);
    border-radius: 50%;
    background: var(--white);
  }
  .tk:hover {
    border-color: var(--sage-deep);
  }
  .dot {
    width: 10px;
    height: 10px;
    margin: 0 15px;
    border-radius: 50%;
    background: var(--tag);
  }
  .labs a {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    padding: 8px 10px;
    border-radius: 14px;
    background: var(--panel);
    text-decoration: none;
  }
  .labs a:hover {
    background: color-mix(in srgb, var(--c) 30%, var(--white));
  }
  .lt {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--c) 45%, var(--white));
  }
  .folders {
    display: grid;
    gap: 4px;
  }
  .folder {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
  }
  .folder .muted {
    font-weight: 400;
    font-size: 13px;
  }
  .cardsrow {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--lavender) 25%, var(--white));
    font-size: 13.5px;
  }
  .cardsrow > span {
    flex: 1;
  }
  .cardsrow .mini {
    display: inline-flex;
    align-items: center;
    text-decoration: none;
    background: var(--surface);
  }
  .cnotes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .cnotes a {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
    min-height: 36px;
    padding: 0 10px;
    border-radius: 10px;
    text-decoration: none;
    font-size: 14px;
  }
  .cnotes a:hover {
    background: var(--panel);
  }
  .cnotes span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cnotes small {
    color: var(--text-muted);
    font-size: 12px;
  }
  .more {
    font-size: 13px;
    color: var(--text-muted);
  }
  .notes {
    resize: vertical;
    font-size: 14.5px;
    line-height: 1.5;
    background: var(--butter-soft);
  }
</style>
