<script lang="ts">
  // Study Home: the card dashboard from the mockups ("Study tab redesign" canvas), on real data.
  import Icon from "../../lib/components/Icon.svelte";
  import FolderTile from "../../lib/components/FolderTile.svelte";
  import { addDays, fromKey, todayKey } from "../../lib/calendar";
  import { cardHtml } from "../../lib/cards";
  import { fmtClock, fmtDuration, type Block } from "../../lib/plan";
  import { splitNote, previewLine } from "../../lib/notes";
  import { exams } from "../../lib/stores/calendar.svelte";
  import { courseByName, courses } from "../../lib/stores/courses.svelte";
  import { activityByDay } from "../../lib/stores/activity.svelte";
  import { inherited, labHref, labs, labsIn } from "../../lib/stores/labs.svelte";
  import { items as libraryItems } from "../../lib/stores/library.svelte";
  import { dirOf, noteHref, notes, recentNotes, noteDirs } from "../../lib/stores/notes.svelte";
  import { clock, completeBlock, getPlan, nowBlock, pauseBlock, reopenBlock, spent, startBlock } from "../../lib/stores/plan.svelte";
  import { pdfHref, pdfName, recentPdfs } from "../../lib/stores/pdfs.svelte";
  import { settings } from "../../lib/stores/settings.svelte";
  import { allCards, counts, examReadiness, forecast, retention } from "../../lib/stores/srs.svelte";
  import NewNoteDialog from "./NewNoteDialog.svelte";

  let newOpen = $state(false);
  const today = todayKey();
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  // ---- hero: week strip and next exam -------------------------------------------------
  const allExams = $derived(exams());
  const monday = addDays(today, -((now.getDay() + 6) % 7));
  const week = $derived(
    Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i);
      return { d, label: fromKey(d).toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2).toUpperCase(), n: fromKey(d).getDate(), today: d === today, exam: allExams.some((e) => e.date === d) };
    }),
  );
  const nextExam = $derived(allExams.find((e) => e.days >= 0));
  const ready = $derived.by(() => {
    if (!nextExam) return null;
    const r = examReadiness(60).find((x) => x.exam.key === nextExam.key);
    const cardsReady = r ? r.total - r.unseen - r.late : 0;
    const labRefs = labsIn(labs.tree).filter((l) => inherited(l.folder.rel, "course") === nextExam.course && l.progress.avgBest !== null);
    const labAvg = labRefs.length ? Math.round(labRefs.reduce((n, l) => n + (l.progress.avgBest ?? 0), 0) / labRefs.length) : null;
    const parts = [r ? cardsReady / r.total : null, labAvg !== null ? labAvg / 100 : null].filter((x): x is number => x !== null);
    return { r, cardsReady, labAvg, labs: labRefs.length, pct: parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : null };
  });
  const whenExam = (days: number) => (days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`);

  // ---- today's plan ----------------------------------------------------------------------
  const plan = $derived(getPlan(today));
  const studyBlocks = $derived(plan.blocks);
  const doneBlocks = $derived(studyBlocks.filter((b) => b.done).length);
  const doneMin = $derived(studyBlocks.filter((b) => b.done).reduce((n, b) => n + b.minutes, 0));
  const running = $derived(nowBlock());
  const isNow = (b: Block) => running?.block.id === b.id && running.date === today;
  const toggle = (b: Block) => (b.done ? reopenBlock(today, b.id) : completeBlock(today, b.id));

  // ---- flashcards ------------------------------------------------------------------------
  const c = $derived(counts());
  const ret = $derived(retention(30));
  const dueNow = $derived(c.due + c.newToday);
  const fc = $derived(forecast(7));
  const fcMax = $derived(Math.max(1, ...fc.map((x) => x.n)));

  // ---- mastery by course: mature cards, and lab best scores, per course ------------------
  const cards = $derived(allCards().filter((r) => r.card.lineId));
  const mastery = $derived(
    courses()
      .map(([id, co]) => {
        const mine = cards.filter((r) => r.course === co.name);
        const mature = mine.filter((r) => r.rec && r.rec.scheduled_days >= 21).length;
        const ls = labsIn(labs.tree).filter((l) => inherited(l.folder.rel, "course") === co.name && l.progress.avgBest !== null);
        const lab = ls.length ? ls.reduce((n, l) => n + (l.progress.avgBest ?? 0), 0) / ls.length / 100 : null;
        const parts = [mine.length ? mature / mine.length : null, lab].filter((x): x is number => x !== null);
        const pct = parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : null;
        return { id, name: co.name, color: co.color, pct, cards: mine.length };
      })
      .slice(0, 6),
  );

  // ---- jump back in ----------------------------------------------------------------------
  const lastPdf = $derived(recentPdfs(1)[0]);
  const lastNote = $derived(recentNotes(1)[0]);
  const lastLab = $derived(labsIn(labs.tree).filter((l) => l.lastOpened).sort((a, b) => b.lastOpened - a.lastOpened)[0]);

  // ---- habits this week (ticked from what she does) --------------------------------------
  const habits = $derived.by(() => {
    const act = activityByDay();
    const noteDays = new Set(Object.values(notes.files).map((e) => todayKeyOf(e.mtime)));
    const days = week.map((w) => w.d);
    return [
      { name: "Flashcards", on: days.map((d) => (act.get(d)?.reviews ?? 0) > 0) },
      { name: "Studied 1 h", on: days.map((d) => (act.get(d)?.minutes ?? 0) >= 60) },
      { name: "Recall lab", on: days.map((d) => (act.get(d)?.labs ?? 0) > 0) },
      { name: "Notes", on: days.map((d) => noteDays.has(d)) },
    ];
  });
  function todayKeyOf(ms: number) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // ---- weak spots: cards forgotten most, labs with the most to revisit -------------------
  const plainText = (s: string) => s.replace(/<!--sd:\w+-->/g, "").replace(/\{\{(?:c\d+::)?([^}:]+)(?:::[^}]*)?\}\}/g, "[$1]").replace(/[*_`#>]/g, "").trim();
  const weak = $derived.by(() => {
    const fromCards = cards
      .filter((r) => r.rec && r.rec.lapses >= 2 && !r.rec.suspended)
      .sort((a, b) => b.rec!.lapses - a.rec!.lapses)
      .slice(0, 3)
      .map((r) => ({ title: plainText(r.card.front).slice(0, 60), sub: `${r.course ?? "No course"} · forgotten ${r.rec!.lapses}×`, href: r.href, tag: "Card", score: r.rec!.lapses }));
    const fromLabs = labsIn(labs.tree)
      .filter((l) => l.progress.missed > 0)
      .sort((a, b) => b.progress.missed - a.progress.missed)
      .slice(0, 3)
      .map((l) => ({ title: l.lab.title, sub: `${l.progress.missed} to revisit`, href: labHref(l.item.rel), tag: "Lab", score: l.progress.missed / 3 }));
    return [...fromCards, ...fromLabs].sort((a, b) => b.score - a.score).slice(0, 4);
  });

  // ---- note folders ----------------------------------------------------------------------
  const COLORS = ["#E3949B", "#8FB2DA", "#A98CE0", "#E3A86C", "#7FB3A6", "#D9B850"];
  const firstLine = (text: string, title: string) => previewLine(splitNote(text).body, title);
  const folders = $derived.by(() => {
    const tops = [...new Set(noteDirs().map((d) => d.split("/")[0]))];
    const last = recentNotes(1)[0];
    return tops
      .map((d, i) => {
        const list = Object.values(notes.files).filter((e) => e.rel.startsWith(d + "/")).sort((a, b) => b.mtime - a.mtime);
        const co = courses(true).find(([, x]) => [x.name, x.code].some((k) => k && k.toLowerCase() === d.toLowerCase()));
        return { d, n: list.length, latest: list[0]?.mtime ?? 0, color: co?.[1].color ?? COLORS[i % COLORS.length], sheets: list.slice(0, 2).map((e) => ({ title: e.p.title, text: firstLine(e.text, e.p.title) })), open: !!last && dirOf(last.rel).split("/")[0] === d };
      })
      .sort((a, b) => b.latest - a.latest)
      .slice(0, 4);
  });

  // ---- drug of the day (from her Drug cards) ---------------------------------------------
  const drugs = $derived(libraryItems().filter(([, it]) => it.type === "drug" && it.fields.Generic?.trim()));
  const dayNo = Math.floor(fromKey(today).getTime() / 864e5);
  const drug = $derived(drugs.length ? drugs[dayNo % drugs.length][1] : null);
  let reveal = $state(false);

  // ---- focus timer -----------------------------------------------------------------------
  const timerLeft = $derived(running ? Math.max(0, running.block.minutes * 60000 - spent(running.date, running.block)) : 0);
  const timerPct = $derived(running ? Math.min(1, spent(running.date, running.block) / (running.block.minutes * 60000)) : 0);
  const ticking = $derived(!!clock.timer?.startedAt);

  const topLabs = $derived(labsIn(labs.tree).sort((a, b) => b.lastOpened - a.lastOpened).slice(0, 3));
  const when = (ms: number) => {
    const d = Math.round((Date.now() - ms) / 864e5);
    return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
  };
  const ring = (pct: number, r: number) => `${(2 * Math.PI * r * pct).toFixed(1)} ${(2 * Math.PI * r).toFixed(1)}`;
</script>

<div class="sh">
  <div class="row top">
    <section class="hero span2">
      <div>
        <p class="date">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1 class="display">{greeting}, {settings.name}</h1>
        <p class="sum">
          {dueNow} {dueNow === 1 ? "card" : "cards"} due · {studyBlocks.length - doneBlocks} plan {studyBlocks.length - doneBlocks === 1 ? "block" : "blocks"} left{#if nextExam}{` · ${nextExam.title} ${whenExam(nextExam.days).toLowerCase()}`}{/if}
        </p>
      </div>
      <div class="strip" aria-label="This week">
        {#each week as w, i (w.d)}
          <span class="day" class:today={w.today} class:exam={w.exam} style="animation-delay: {80 + i * 35}ms" title={w.exam ? "Exam day" : undefined}>{w.label} {w.n}</span>
        {/each}
      </div>
    </section>

    <section class="card exam">
      {#if nextExam}
        <span class="chip">Next exam</span>
        <div>
          <h2 class="display">{nextExam.title}</h2>
          <p class="soft">{whenExam(nextExam.days)} · {fromKey(nextExam.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}{nextExam.start ? `, ${nextExam.start}` : ""}</p>
        </div>
        <div class="ex-row">
          <svg width="92" height="92" viewBox="0 0 92 92" role="img" aria-label="Readiness {ready?.pct ?? 0} percent">
            <circle cx="46" cy="46" r="38" fill="none" stroke="var(--spot-track)" stroke-width="10" />
            <circle cx="46" cy="46" r="38" fill="none" stroke="var(--sage)" stroke-width="10" stroke-linecap="round" stroke-dasharray={ring((ready?.pct ?? 0) / 100, 38)} transform="rotate(-90 46 46)" />
            <text x="46" y="52" text-anchor="middle" font-size="20" font-weight="600" fill="currentColor">{ready?.pct ?? "–"}{ready?.pct !== null ? "%" : ""}</text>
          </svg>
          <div class="ex-lines">
            {#if ready?.r}<span>Cards ready: <b>{ready.cardsReady} / {ready.r.total}</b></span>{:else}<span class="soft">No cards for this course yet</span>{/if}
            {#if ready?.labAvg !== null && ready?.labAvg !== undefined}<span>Labs avg best: <b>{ready.labAvg}%</b></span>{/if}
            {#if nextExam.course}<span class="soft">{nextExam.course}</span>{/if}
          </div>
        </div>
        <a class="btn ex-btn" href={courseByName(nextExam.course) ? `#/courses/${courseByName(nextExam.course)![0]}` : "#/study/cards"}>Open {courseByName(nextExam.course) ? "course" : "cards"}</a>
      {:else}
        <span class="chip">Next exam</span>
        <h2 class="display">Nothing scheduled</h2>
        <p class="soft">Add exams in the calendar and they count down here.</p>
      {/if}
    </section>
  </div>

  <div class="row">
    <section class="card">
      <header class="ch"><span class="ic sage"><Icon name="calendar" size={18} /></span><h2 class="h2">Today's study plan</h2><a class="lnk" href="#/tasks/plan">Edit</a></header>
      {#if studyBlocks.length}
        <ul class="plan">
          {#each studyBlocks as b (b.id)}
            <li class:done={b.done}>
              <button type="button" class="tick" class:on={b.done} aria-pressed={b.done} aria-label={b.done ? `Undo ${b.title}` : `Mark ${b.title} done`} onclick={() => toggle(b)}>
                {#if b.done}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.2" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>{/if}
              </button>
              <span class="pt">{b.title}</span>
              {#if isNow(b) && !b.done}<span class="pill butter">Now · {b.minutes}m</span>{:else}<span class="muted sm">{b.minutes}m</span>{/if}
            </li>
          {/each}
        </ul>
        <div class="prog">
          <div class="pr"><span class="muted">Daily progress</span><b>{doneBlocks} of {studyBlocks.length} · {fmtDuration(doneMin)}</b></div>
          <div class="bar"><span style="width: {(doneBlocks / studyBlocks.length) * 100}%"></span></div>
        </div>
      {:else}
        <p class="muted">No blocks planned for today.</p>
        <a class="btn primary start" href="#/tasks/plan">Plan my day</a>
      {/if}
    </section>

    <section class="card">
      <header class="ch"><span class="ic lav"><Icon name="star" size={18} /></span><h2 class="h2">Flashcards</h2><a class="lnk" href="#/study/cards">All decks</a></header>
      <div class="big"><span class="n display">{dueNow}</span><span class="muted">due today{dueNow ? ` · about ${Math.max(1, Math.round(dueNow * 0.4))} min` : ""}</span></div>
      <div class="three">
        <div class="mini butter"><b>{c.newToday}</b><span>New</span></div>
        <div class="mini rose"><b>{c.learning}</b><span>Learning</span></div>
        <div class="mini sage"><b>{c.review}</b><span>Review</span></div>
      </div>
      <div class="pr"><span class="muted">30-day retention</span><b>{ret === null ? "–" : `${Math.round(ret * 100)}%`}</b><span class="muted">· target {Math.round((settings.retention || 0.9) * 100)}%</span></div>
      <a class="btn primary start" href={dueNow ? "#/study/cards/review/all" : "#/study/cards"}>{dueNow ? "Start review" : "Nothing due: browse cards"}</a>
    </section>

    <section class="card">
      <header class="ch"><span class="ic peach"><Icon name="courses" size={18} /></span><h2 class="h2">Mastery by course</h2><a class="lnk" href="#/courses">Courses</a></header>
      <ul class="mastery">
        {#each mastery as m (m.id)}
          <li>
            <div class="pr"><span class="cdot" style="background: {m.color}"></span><a href="#/courses/{m.id}" class="mn">{m.name}</a><b>{m.pct === null ? "–" : `${m.pct}%`}</b></div>
            <div class="bar"><span style="width: {m.pct ?? 0}%; background: {m.color}"></span></div>
          </li>
        {/each}
      </ul>
      <p class="muted sm foot">Mature cards and recall lab best scores, per course.</p>
    </section>

    <section class="card">
      <header class="ch"><span class="ic butter"><Icon name="back" size={18} /></span><h2 class="h2">Jump back in</h2></header>
      <div class="jump">
        {#if lastPdf}
          <a href={pdfHref(lastPdf[0], lastPdf[1].page)}>
            <span class="ic rose"><Icon name="file" size={16} /></span>
            <span class="jt"><b>{pdfName(lastPdf[0])}</b><span class="muted sm">PDF · page {lastPdf[1].page}{lastPdf[1].pages ? ` of ${lastPdf[1].pages}` : ""}{lastPdf[1].annots ? ` · ${lastPdf[1].annots} marks` : ""}</span>
              {#if lastPdf[1].pages}<span class="bar thin"><span style="width: {(lastPdf[1].page / lastPdf[1].pages) * 100}%"></span></span>{/if}</span>
          </a>
        {/if}
        {#if lastNote}
          <a href={noteHref(lastNote.rel)}>
            <span class="ic lav"><Icon name="pen" size={16} /></span>
            <span class="jt"><b>{lastNote.p.title}</b><span class="muted sm">Note · edited {when(lastNote.mtime)}</span></span>
          </a>
        {/if}
        {#if lastLab}
          <a href={labHref(lastLab.item.rel)}>
            <span class="ic sage"><Icon name="labs" size={16} /></span>
            <span class="jt"><b>{lastLab.lab.title}</b><span class="muted sm">Lab{lastLab.progress.avgBest !== null ? ` · best ${lastLab.progress.avgBest}%` : ""}{lastLab.progress.missed ? ` · ${lastLab.progress.missed} to revisit` : ""}</span></span>
          </a>
        {/if}
        {#if !lastPdf && !lastNote && !lastLab}<p class="muted">What you open shows up here.</p>{/if}
      </div>
    </section>

    <section class="card">
      <header class="ch"><span class="ic sage"><Icon name="heart" size={18} /></span><h2 class="h2">Study habits</h2><span class="muted sm">This week</span></header>
      <div class="habits">
        <span></span>{#each week as w}<span class="muted hd">{w.label.charAt(0)}</span>{/each}
        {#each habits as h}
          <span class="hn">{h.name}</span>
          {#each h.on as on, i}<span class="hdot" class:on class:future={week[i].d > today} style="animation-delay: {i * 30}ms"></span>{/each}
        {/each}
      </div>
      <p class="muted sm foot">Ticked by what you do in Mosaic.</p>
    </section>

    <section class="card">
      <header class="ch"><span class="ic rose"><Icon name="flag" size={18} /></span><h2 class="h2">Weak spots</h2>{#if weak.some((w) => w.tag === "Card")}<a class="lnk" href="#/study/cards">Cards</a>{/if}</header>
      {#if weak.length}
        <ul class="weak">
          {#each weak as w}
            <li><a href={w.href}><span class="wt"><b>{w.title}</b><span class="muted sm">{w.sub}</span></span><span class="pill" class:rose={w.tag === "Card"} class:peach={w.tag === "Lab"}>{w.tag}</span></a></li>
          {/each}
        </ul>
      {:else}
        <p class="muted">Nothing shaky yet. Cards you keep forgetting and lab questions to revisit show up here.</p>
      {/if}
    </section>

    <section class="card span2">
      <header class="ch"><span class="ic butter"><Icon name="pen" size={18} /></span><h2 class="h2">Notes</h2><button type="button" class="lnk" onclick={() => (newOpen = true)}>+ Note</button><a class="lnk" href="#/study/notes">All folders</a></header>
      {#if folders.length}
        <div class="folders">
          {#each folders as f (f.d)}
            <FolderTile name={f.d} color={f.color} lines={[`${f.n} ${f.n === 1 ? "note" : "notes"}`]} sheets={f.sheets} open={f.open} href="#/study/notes" />
          {/each}
        </div>
      {:else}
        <p class="muted">Your note folders show up here.</p>
      {/if}
    </section>

    <section class="card">
      <header class="ch"><span class="ic lav"><Icon name="clock" size={18} /></span><h2 class="h2">Coming up in reviews</h2></header>
      <div class="fc" aria-label="Reviews over the next 7 days">
        {#each fc as d, i (d.date)}
          <div class="fcol">
            <span class="sm" class:b={i === 0}>{d.n}</span>
            <span class="fbar" class:now={i === 0} style="height: {Math.max(4, (d.n / fcMax) * 80)}px; animation-delay: {i * 40}ms"></span>
            <span class="muted sm">{fromKey(d.date).toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2)}</span>
          </div>
        {/each}
      </div>
    </section>

    {#if drug}
      <section class="card drug">
        <header class="ch"><span class="ic white"><Icon name="pill" size={18} /></span><h2 class="h2">Drug of the day</h2><span class="muted sm">{drugs.length} drugs</span></header>
        <p class="display dn">{drug.fields.Generic}</p>
        {#if reveal}
          <div class="dans">
            {#if drug.fields.Brand}<span><b>Brand</b> {drug.fields.Brand}</span>{/if}
            {#if drug.fields.Class}<span><b>Class</b> {drug.fields.Class}</span>{/if}
            {#if drug.fields.Indications}<span><b>For</b> {drug.fields.Indications}</span>{/if}
            {#if drug.fields.Counselling}<span><b>Counsel</b> {@html cardHtml(drug.fields.Counselling, (s) => s)}</span>{/if}
          </div>
        {:else}
          <p class="muted">Brand? Class? What is it for?</p>
        {/if}
        <button type="button" class="btn primary start" onclick={() => (reveal = !reveal)}>{reveal ? "Hide" : "Show answer"}</button>
      </section>
    {/if}

    <section class="card">
      <header class="ch"><span class="ic butter"><Icon name="clock" size={18} /></span><h2 class="h2">Focus timer</h2></header>
      {#if running}
        <div class="ex-row">
          <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-label="{fmtClock(timerLeft)} left">
            <circle cx="48" cy="48" r="40" fill="none" stroke="var(--track)" stroke-width="9" />
            <circle cx="48" cy="48" r="40" fill="none" stroke="var(--accent)" stroke-width="9" stroke-linecap="round" stroke-dasharray={ring(timerPct, 40)} transform="rotate(-90 48 48)" />
            <text x="48" y="54" text-anchor="middle" font-size="18" font-weight="600" fill="currentColor">{fmtClock(timerLeft)}</text>
          </svg>
          <div class="ex-lines"><b>{running.block.title}</b><span class="muted sm">{ticking ? "Running" : "Paused"} · {running.block.minutes} min block</span></div>
        </div>
        <div class="two">
          {#if ticking}<button type="button" class="btn primary" onclick={pauseBlock}>Pause</button>{:else}<button type="button" class="btn primary" onclick={() => startBlock(running.date, running.block.id)}>Start</button>{/if}
          <button type="button" class="btn quiet" onclick={() => completeBlock(running.date, running.block.id)}>Done</button>
        </div>
      {:else}
        <p class="muted">No block running. Start one from today's plan.</p>
        <a class="btn quiet start" href="#/tasks/plan">Open the plan</a>
      {/if}
    </section>

    <section class="card">
      <header class="ch"><span class="ic sage"><Icon name="labs" size={18} /></span><h2 class="h2">Recall labs</h2><a class="lnk" href="#/labs">All</a></header>
      <div class="jump">
        {#each topLabs as l (l.item.rel)}
          <a href={labHref(l.item.rel)}>
            <span class="jt"><b>{l.lab.title}</b><span class="muted sm">{l.progress.avgBest === null ? "Not started" : `${l.progress.avgBest}% avg best`}{l.progress.missed ? ` · ${l.progress.missed} to revisit` : ""}</span>
              <span class="bar thin"><span style="width: {l.progress.avgBest ?? 0}%"></span></span></span>
          </a>
        {:else}
          <p class="muted">Your labs show up here.</p>
        {/each}
      </div>
    </section>
  </div>
</div>

<NewNoteDialog bind:open={newOpen} />

<style>
  .sh {
    display: grid;
    gap: var(--gap);
    min-width: 0;
    container-type: inline-size;
  }
  .row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--gap);
    align-items: stretch;
  }
  .span2 {
    grid-column: span 2;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  /* hero */
  .hero {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 20px;
    padding: calc(var(--card-pad) + 4px);
    border-radius: calc(var(--radius) + 4px);
    background: var(--feature);
    color: var(--on-feature);
    border: var(--edge);
    box-shadow: var(--shadow);
    animation: pop-in var(--t-slow) var(--spring) backwards;
    min-width: 0;
  }
  .date {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.8;
  }
  .hero h1 {
    font-size: clamp(28px, 3.4vw, 40px);
    line-height: 1.1;
    margin-top: 4px;
  }
  .sum {
    margin-top: 8px;
    font-size: 16px;
  }
  .strip {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
    padding: 6px;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--white) 45%, transparent);
  }
  .day {
    text-align: center;
    padding: 10px 0;
    border-radius: var(--radius-pill);
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    animation: pop-in 0.45s var(--spring) backwards;
  }
  .day.exam {
    color: var(--alert-ink);
    font-weight: 600;
    background: color-mix(in srgb, var(--white) 50%, transparent);
  }
  .day.today {
    background: var(--charcoal);
    color: var(--white);
    font-weight: 600;
  }

  /* next exam */
  .exam {
    background: var(--spot);
    color: var(--on-spot);
  }
  .exam h2 {
    font-size: 22px;
  }
  .chip {
    align-self: flex-start;
    padding: 4px 10px;
    border-radius: var(--radius-pill);
    background: var(--spot-track);
    font-size: 12.5px;
    font-weight: 600;
  }
  .soft {
    opacity: 0.8;
  }
  .ex-row {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .ex-lines {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
    min-width: 0;
  }
  .ex-btn {
    align-self: flex-start;
    background: var(--spot-btn);
    color: var(--on-spot-btn);
    margin-top: auto;
  }

  /* card headers */
  .ch {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .ch h2 {
    flex: 1;
  }
  .ic {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 11px;
    flex: none;
    color: var(--charcoal);
  }
  .ic.sage { background: var(--sage-soft); }
  .ic.lav { background: color-mix(in srgb, var(--lavender) 40%, var(--white)); }
  .ic.peach { background: var(--peach-soft); }
  .ic.butter { background: var(--butter-soft); }
  .ic.rose { background: var(--rose-soft); }
  .ic.white { background: color-mix(in srgb, var(--white) 70%, transparent); }
  .card:hover .ic {
    animation: wiggle 0.5s var(--spring);
  }
  .lnk {
    padding: 8px 10px;
    border: 0;
    border-radius: var(--radius-pill);
    background: none;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
    text-decoration: none;
  }
  .lnk:hover {
    background: var(--chip);
    color: var(--text);
  }
  .sm {
    font-size: 13px;
  }
  .foot {
    margin-top: auto;
  }
  .start {
    margin-top: auto;
  }
  .pill {
    padding: 3px 10px;
    border-radius: var(--radius-pill);
    font-size: 12.5px;
    font-weight: 600;
    white-space: nowrap;
    background: var(--chip);
  }
  .pill.butter { background: var(--butter); }
  .pill.rose { background: var(--rose-soft); }
  .pill.peach { background: var(--peach-soft); }

  /* plan */
  .plan {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }
  .plan li {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .plan li.done .pt {
    text-decoration: line-through;
    opacity: 0.55;
  }
  .pt {
    flex: 1;
    min-width: 0;
  }
  .tick {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 2px solid var(--hairline);
    border-radius: 50%;
    background: none;
    flex: none;
  }
  .tick:hover {
    transform: scale(1.12);
    border-color: var(--sage-deep);
  }
  .tick.on {
    background: var(--sage-deep);
    border-color: var(--sage-deep);
    animation: tick-pop 0.45s var(--spring);
  }
  .prog {
    display: grid;
    gap: 6px;
    margin-top: auto;
  }
  .pr {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .pr > :first-child,
  .mn {
    flex: 1;
  }
  .bar {
    height: 8px;
    border-radius: 99px;
    background: var(--track);
    overflow: hidden;
  }
  .bar > span {
    display: block;
    height: 100%;
    border-radius: 99px;
    background: var(--accent);
  }
  .bar.thin {
    display: block;
    height: 6px;
    margin-top: 6px;
  }

  /* flashcards */
  .big {
    display: flex;
    align-items: flex-end;
    gap: 10px;
  }
  .big .n {
    font-size: 54px;
    line-height: 1;
  }
  .big .muted {
    padding-bottom: 8px;
  }
  .three {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .mini {
    display: grid;
    padding: 10px 12px;
    border-radius: 16px;
    font-size: 13px;
  }
  .mini b {
    font-size: 20px;
  }
  .mini.butter { background: var(--butter-soft); }
  .mini.rose { background: var(--rose-soft); }
  .mini.sage { background: var(--sage-soft); }

  /* mastery */
  .mastery {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
  }
  .cdot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none !important;
  }
  .mn {
    text-decoration: none;
    font-weight: 500;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mastery .bar {
    margin-top: 6px;
  }

  /* jump back in, labs */
  .jump {
    display: grid;
    gap: 10px;
  }
  .jump a {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 18px;
    background: var(--chip);
    text-decoration: none;
  }
  .jump a:hover {
    transform: translateY(-2px);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .jt {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .jt b {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* habits */
  .habits {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) repeat(7, minmax(0, 1fr));
    gap: 10px 4px;
    align-items: center;
    font-size: 13px;
  }
  .hd {
    text-align: center;
  }
  .hn {
    font-weight: 500;
  }
  .hdot {
    justify-self: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--hairline);
    animation: tick-pop 0.45s var(--spring) backwards;
  }
  .hdot.on {
    background: var(--sage-deep);
    border-color: var(--sage-deep);
  }
  .hdot.future {
    opacity: 0.45;
  }

  /* weak spots */
  .weak {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  .weak a {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 14px;
    text-decoration: none;
  }
  .weak a:hover {
    background: var(--chip);
    transform: translateX(3px);
  }
  .wt {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .wt b {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* notes */
  .folders {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--gap);
  }

  /* forecast */
  .fc {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 8px;
    align-items: end;
    min-height: 130px;
  }
  .fcol {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .fcol .b {
    font-weight: 600;
  }
  .fbar {
    width: 100%;
    border-radius: 10px;
    background: color-mix(in srgb, var(--lavender) 55%, var(--white));
    transform-origin: bottom;
    animation: grow-up 0.6s var(--spring) backwards;
  }
  .fbar.now {
    background: var(--accent);
  }
  @keyframes grow-up {
    from {
      transform: scaleY(0);
    }
  }

  /* drug of the day */
  .drug {
    background: linear-gradient(160deg, var(--sage-soft), var(--surface) 75%);
  }
  .dn {
    font-size: 26px;
  }
  .dans {
    display: grid;
    gap: 4px;
    font-size: 14px;
    animation: rise-in 0.35s var(--spring) backwards;
  }
  .dans b {
    font-weight: 600;
    margin-right: 4px;
  }
  .two {
    display: flex;
    gap: 8px;
    margin-top: auto;
  }
  .two .btn {
    flex: 1;
  }

  @container (max-width: 1000px) {
    .row {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .folders {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @container (max-width: 640px) {
    .row {
      grid-template-columns: minmax(0, 1fr);
    }
    .span2 {
      grid-column: auto;
    }
    .habits {
      font-size: 12px;
    }
  }
</style>
