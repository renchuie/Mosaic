<script lang="ts">
  // A lecture of the course hub (H1, board frame 2): everything linked to it, each with its own
  // progress, plus Review (its notes' and decks' cards), the first quiz, and Add.
  import Icon from "../../lib/components/Icon.svelte";
  import { getCourse } from "../../lib/stores/courses.svelte";
  import { exams } from "../../lib/stores/calendar.svelte";
  import { deleteLecture, getLecture, removeLink, saveLecture } from "../../lib/stores/outline.svelte";
  import { describe, KIND_ICONS, KIND_NAMES, materialItems, noteCardStats } from "../../lib/stores/linkInfo.svelte";
  import { counts, scopeKey } from "../../lib/stores/srs.svelte";
  import { shortExam } from "../../lib/stores/deckTree.svelte";
  import LinkPicker from "./LinkPicker.svelte";
  import AddFilesDialog from "../study/AddFilesDialog.svelte";
  import { addLinks } from "../../lib/stores/outline.svelte";
  import { dragHasFiles } from "../../lib/stores/noteOps.svelte";

  let { courseId, id }: { courseId: string; id: string } = $props();
  const course = $derived(getCourse(courseId));
  const lec = $derived(getLecture(id));
  const exam = $derived(lec?.exam ? exams().find((e) => e.key === lec.exam) : undefined);
  const courseExams = $derived(course ? exams().filter((e) => e.course === course.name) : []);
  const stats = $derived(noteCardStats());
  const mats = $derived(materialItems());
  const shown = $derived((lec?.links ?? []).map((x) => describe(x, stats, mats)));
  const scope = $derived({ kind: "lecture" as const, id });
  const cards = $derived(lec ? counts(scope) : null);
  const toReview = $derived(cards ? cards.due + cards.newToday : 0);
  const quiz = $derived(shown.find((x) => x.kind === "quiz" && !x.gone));

  let picking = $state(false);
  let menu = $state(false);
  let confirmDelete = $state(false);
  // dropping files on the lecture: PDFs go to the PDF folder, notes to the notes folder (both in a
  // folder named after the course), quizzes and interactive pages through the Materials upload
  // dialog; everything that lands is linked here
  let over = $state(false);
  let busy = $state("");
  let toast = $state("");
  let upFiles = $state<File[]>([]);
  let uploading = $state(false);
  const say = (m: string) => {
    toast = m;
    setTimeout(() => toast === m && (toast = ""), 4000);
  };
  function dropped(list: File[]) {
    if (!list.length) return;
    upFiles = list;
    uploading = true;
  }
  function rename(v: string) {
    if (v.trim() && v.trim() !== lec?.title) saveLecture(id, { title: v.trim() });
  }
  function remove() {
    deleteLecture(id);
    location.hash = `#/courses/${courseId}`;
  }
</script>

{#if !course || !lec}
  <section class="card"><p>This lecture isn't here any more. <a href="#/courses/{courseId}">Back to the course</a></p></section>
{:else}
  <div class="page" style="--c: {course.color}">
    <nav class="crumb" aria-label="Where you are">
      <a href="#/courses">Courses</a><Icon name="i:chevron-right" size={13} />
      <a href="#/courses/{courseId}">{course.name}</a><Icon name="i:chevron-right" size={13} />
      {#if exam}<a href="#/courses/{courseId}">{shortExam(exam)}</a><Icon name="i:chevron-right" size={13} />{/if}
      <span>{lec.title}</span>
    </nav>

    <header class="head">
      <span class="tile"><Icon name="folder" size={22} /></span>
      <div class="who">
        <input class="title" value={lec.title} aria-label="Lecture name" onchange={(e) => rename(e.currentTarget.value)} onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        <div class="meta">
          <input type="date" class="date" class:empty={!lec.date} value={lec.date ?? ""} aria-label="Date" onchange={(e) => saveLecture(id, { date: e.currentTarget.value || undefined })} />
          <select class="exsel" value={lec.exam} aria-label="Exam" onchange={(e) => saveLecture(id, { exam: e.currentTarget.value })}>
            <option value="">No exam</option>
            {#each courseExams as e (e.key)}<option value={e.key}>{shortExam(e)}</option>{/each}
          </select>
          <span>{shown.length} {shown.length === 1 ? "thing" : "things"}</span>
        </div>
      </div>
      <div class="acts">
        {#if cards?.total}
          <a class="btn quiet" class:off={!toReview} href="#/study/cards/review/{scopeKey(scope)}"><Icon name="cards" size={16} /> {toReview ? `Review ${toReview} ${toReview === 1 ? "card" : "cards"}` : "Cards done"}</a>
        {/if}
        {#if quiz}<a class="btn quiet" href={quiz.href}><Icon name="i:circle-help" size={16} /> Quiz</a>{/if}
        <button type="button" class="btn primary" onclick={() => (picking = true)}><Icon name="plus" size={16} /> Add</button>
        <div class="more">
          <button type="button" class="dots" aria-label="More" aria-expanded={menu} onclick={() => (menu = !menu)}><Icon name="dots" size={18} /></button>
          {#if menu}
            <div class="menu" role="menu">
              {#if !confirmDelete}
                <button type="button" role="menuitem" onclick={() => (confirmDelete = true)}><Icon name="trash" size={15} /> Delete lecture</button>
              {:else}
                <span class="warn">Files stay where they are.</span>
                <button type="button" role="menuitem" class="danger" onclick={remove}>Delete lecture</button>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </header>

    {#if shown.length}
      <div class="grid">
        {#each shown as x (x.link.kind + x.link.ref)}
          <div class="item" class:gone={x.gone}>
            <a class="main" href={x.href || undefined} draggable="false">
              <span class="ti k-{x.kind}"><Icon name={KIND_ICONS[x.kind]} size={19} /></span>
              <span class="tx"><b>{x.name}</b><small>{KIND_NAMES[x.kind]}{x.sub && x.sub !== KIND_NAMES[x.kind] ? ` · ${x.sub}` : ""}</small></span>
              {#if x.kind === "pdf" && x.done !== undefined}
                <span class="bar" aria-hidden="true"><i style="width: {Math.round(x.done * 100)}%"></i></span>
              {:else if x.tone && !x.gone}
                <span class="pill {x.tone}">{x.sub}</span>
              {/if}
            </a>
            <button type="button" class="rm" aria-label="Remove {x.name} from this lecture" title="Remove from lecture" onclick={() => removeLink(id, x.link)}><Icon name="i:x" size={14} /></button>
          </div>
        {/each}
        <button type="button" class="addtile" onclick={() => (picking = true)}><Icon name="plus" size={18} /> Add</button>
      </div>
    {:else}
      <button type="button" class="emptybig" onclick={() => (picking = true)}>
        <Icon name="plus" size={20} />
        <b>Nothing linked yet.</b>
        <span>Notes, PDFs, quizzes, interactive pages, decks</span>
      </button>
    {/if}
  </div>
  <LinkPicker bind:open={picking} lectureId={id} course={course.name} />
  <AddFilesDialog bind:open={uploading} files={upFiles} course={course.name} lecture={id} />
  {#if over}<div class="dropcover" aria-hidden="true"><Icon name="plus" size={26} /><b>Add to {lec.title}</b></div>{/if}
  {#if toast || busy}<div class="toast" role="status">{busy || toast}</div>{/if}
{/if}

<svelte:window
  ondragover={(e) => { if (dragHasFiles(e)) { e.preventDefault(); over = true; } }}
  ondragleave={(e) => { if (!e.relatedTarget) over = false; }}
  ondrop={(e) => { if (!dragHasFiles(e)) return; e.preventDefault(); over = false; dropped([...(e.dataTransfer?.files ?? [])]); }}
  onclick={(e) => { if (menu && !(e.target as HTMLElement).closest(".more")) { menu = false; confirmDelete = false; } }} />

<style>
  .page {
    display: grid;
    gap: 18px;
    align-content: start;
  }
  .crumb {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 13.5px;
    color: var(--text-muted);
  }
  .crumb a {
    color: inherit;
    text-decoration: none;
    padding: 4px 8px;
    border-radius: var(--radius-pill);
  }
  .crumb a:hover {
    background: var(--chip);
  }
  .crumb span {
    color: var(--text);
    font-weight: 600;
    padding: 4px 8px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .tile {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--c) 45%, var(--white));
    flex: none;
  }
  .who {
    flex: 1;
    min-width: 220px;
    display: grid;
    gap: 4px;
  }
  .title {
    font: inherit;
    font-size: 28px;
    font-weight: 600;
    border: 0;
    background: transparent;
    color: var(--text);
    padding: 2px 6px;
    margin-left: -6px;
    border-radius: 10px;
    min-width: 0;
  }
  .title:focus {
    outline: none;
    background: var(--field);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 13.5px;
    color: var(--text-muted);
  }
  .date,
  .exsel {
    font: inherit;
    font-size: 13px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--chip);
    color: var(--text);
    padding: 4px 10px;
    min-height: 30px;
  }
  .date.empty {
    color: var(--text-muted);
  }
  .acts {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .btn.off {
    opacity: 0.6;
  }
  .more {
    position: relative;
  }
  .dots {
    width: 44px;
    height: 44px;
    border: 0;
    border-radius: 50%;
    background: var(--chip);
    color: var(--text);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .menu {
    position: absolute;
    right: 0;
    top: 50px;
    z-index: 20;
    min-width: 220px;
    padding: 6px;
    border-radius: 18px;
    background: var(--surface-float);
    box-shadow: var(--shadow-lg, var(--shadow));
    display: grid;
    gap: 4px;
    animation: pop-in 0.25s var(--spring) backwards;
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 12px;
    border: 0;
    border-radius: 12px;
    background: none;
    font: inherit;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .menu button:hover {
    background: var(--field);
  }
  .menu .danger {
    color: var(--alert-ink);
    font-weight: 600;
  }
  .warn {
    font-size: 13px;
    color: var(--text-muted);
    padding: 6px 12px 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 12px;
  }
  .item {
    position: relative;
    border-radius: 22px;
    background: var(--surface);
    box-shadow: var(--shadow-sm, var(--shadow));
    animation: pop-in 0.35s var(--spring) backwards;
    transition: transform 0.2s var(--spring);
  }
  .item:hover {
    transform: translateY(-2px);
  }
  .item.gone {
    opacity: 0.55;
  }
  .main {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 44px 14px 14px;
    color: var(--text);
    text-decoration: none;
    min-height: 44px;
  }
  .ti {
    width: 42px;
    height: 42px;
    border-radius: 13px;
    display: grid;
    place-items: center;
    flex: none;
  }
  .k-note { background: color-mix(in srgb, var(--lavender) 35%, var(--white)); }
  .k-pdf { background: color-mix(in srgb, var(--rose) 35%, var(--white)); }
  .k-quiz { background: color-mix(in srgb, var(--peach) 40%, var(--white)); }
  .k-page { background: color-mix(in srgb, var(--sage) 35%, var(--white)); }
  .k-deck { background: color-mix(in srgb, var(--butter) 45%, var(--white)); }
  .k-file { background: var(--chip); }
  .tx {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .tx b {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tx small {
    font-size: 13px;
    color: var(--text-muted);
  }
  .bar {
    width: 70px;
    height: 6px;
    border-radius: 9px;
    background: var(--chip);
    overflow: hidden;
    flex: none;
  }
  .bar i {
    display: block;
    height: 100%;
    background: color-mix(in srgb, var(--rose) 80%, var(--text));
    border-radius: 9px;
  }
  .pill {
    font-size: 12.5px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: var(--radius-pill);
    flex: none;
  }
  .pill.rose { background: color-mix(in srgb, var(--rose) 40%, var(--white)); color: var(--alert-ink); }
  .pill.sage { background: color-mix(in srgb, var(--sage) 40%, var(--white)); color: var(--go-ink); }
  .pill.peach { background: color-mix(in srgb, var(--peach) 45%, var(--white)); color: var(--text); }
  .rm {
    position: absolute;
    top: 50%;
    right: 8px;
    transform: translateY(-50%);
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    display: grid;
    place-items: center;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .item:hover .rm,
  .rm:focus-visible {
    opacity: 1;
  }
  .rm:hover {
    background: var(--chip);
  }
  .addtile,
  .emptybig {
    border: 0;
    border-radius: 22px;
    background: transparent;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--lavender) 60%, transparent);
    color: color-mix(in srgb, var(--lavender) 55%, var(--text));
    font: inherit;
    font-weight: 600;
    min-height: 70px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: pointer;
  }
  .emptybig {
    flex-direction: column;
    min-height: 180px;
    gap: 6px;
  }
  .emptybig span {
    font-weight: 400;
    font-size: 14px;
    color: var(--text-muted);
  }
  .dropcover {
    position: fixed;
    inset: 16px;
    z-index: 150;
    border-radius: 30px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: color-mix(in srgb, var(--lavender) 22%, transparent);
    box-shadow: inset 0 0 0 3px color-mix(in srgb, var(--lavender) 85%, var(--text));
    color: var(--text);
    font-size: 18px;
    pointer-events: none;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
    z-index: 300;
    max-width: min(560px, calc(100vw - 32px));
    padding: 10px 18px;
    border-radius: var(--radius-pill);
    background: var(--primary);
    color: var(--on-primary);
    font-size: 14px;
  }
  @media (prefers-reduced-motion: reduce) {
    .item, .menu { animation: none; transition: none; }
  }
</style>
