<script lang="ts">
  import Icon from "../../lib/components/Icon.svelte";
  import { fromKey } from "../../lib/calendar";
  import { TEMPLATES } from "../../lib/notes";
  import { courseByName, courses } from "../../lib/stores/courses.svelte";
  import { labHref, labs, labsIn } from "../../lib/stores/labs.svelte";
  import { getNote, noteHref, notes, notesForCourse, recentNotes } from "../../lib/stores/notes.svelte";
  import NewNoteDialog from "./NewNoteDialog.svelte";
  import { counts as cardCounts } from "../../lib/stores/srs.svelte";
  const cardsNow = $derived(cardCounts());

  const lastRel = (() => {
    try {
      return (JSON.parse(localStorage.getItem("studydesk.recentNotes") ?? "[]") as string[]).find((r) => getNote(r));
    } catch {
      return undefined;
    }
  })();
  const last = $derived(lastRel ? getNote(lastRel) : recentNotes(1)[0]);
  const recent = $derived(recentNotes(8));
  const topLabs = $derived(labsIn(labs.tree).sort((a, b) => b.lastOpened - a.lastOpened).slice(0, 4));
  const byCourse = $derived(courses().map(([id, c]) => ({ id, c, n: notesForCourse(c.name).length })));
  const total = $derived(Object.keys(notes.files).length);
  let newOpen = $state(false);

  const when = (ms: number) => {
    const d = Math.round((Date.now() - ms) / 864e5);
    return d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${d} days ago`;
  };
  const plain = (text: string) =>
    text
      .replace(/^---[\s\S]*?---/, "")
      .replace(/^#.*$/m, "")
      .replace(/(^|\n)\s*([-*+]|#{1,6})\s+/g, " ")
      .replace(/[*_`>[\]{}|=#]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
</script>

<div class="home">
  <header class="hero">
    <div>
      <span class="kicker">Study</span>
      <h1 class="display">Your study space</h1>
      <p>{total} {total === 1 ? "note" : "notes"} · {labsIn(labs.tree).length} Recall Labs</p>
    </div>
    <div class="qa">
      <button type="button" class="btn primary" onclick={() => (newOpen = true)}><Icon name="pen" size={16} /> New note</button>
      <a class="btn" href="#/labs"><Icon name="labs" size={16} /> Recall Labs</a>
    </div>
  </header>

  <div class="cols">
    <div class="main">
      {#if last}
        {@const c = last.p.meta.course ? courseByName(String(last.p.meta.course)) : undefined}
        <a class="continue" href={noteHref(last.rel)} style={c ? `--c: ${c[1].color}` : ""}>
          <span class="label">Continue · {when(last.mtime)}</span>
          <h2 class="display">{last.p.title}</h2>
          <p>{plain(last.text) || "Empty note"}</p>
          <span class="go"><Icon name="arrow" size={16} /></span>
        </a>
      {/if}

      <section>
        <div class="sh"><h2 class="h2">Recent notes</h2><a class="link" href="#/study/notes">All notes <Icon name="arrow" size={14} /></a></div>
        {#if recent.length}
          <div class="grid">
            {#each recent as e (e.rel)}
              {@const c = e.p.meta.course ? courseByName(String(e.p.meta.course)) : undefined}
              <a class="nc" href={noteHref(e.rel)} style={c ? `--c: ${c[1].color}` : ""}>
                <span class="nt">{c ? c[1].code ?? c[1].name : e.rel.includes("/") ? e.rel.split("/")[0] : "Notes"}</span>
                <b>{e.p.title}</b>
                <span class="ns">{plain(e.text)}</span>
                <span class="nf">{e.p.meta.date ? fromKey(String(e.p.meta.date)).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : when(e.mtime)}{e.p.tags.length ? ` · #${e.p.tags.slice(0, 2).join(" #")}` : ""}</span>
              </a>
            {/each}
          </div>
        {:else}
          <div class="card empty">
            <p>No notes yet. Start with a template:</p>
            <div class="tpls">{#each Object.entries(TEMPLATES).filter(([k]) => k !== "blank") as [, v]}<span class="tag">{v.label}</span>{/each}</div>
            <button type="button" class="btn primary" onclick={() => (newOpen = true)}>+ New note</button>
          </div>
        {/if}
      </section>
    </div>

    <aside class="side">
      <section class="card">
        <div class="sh"><h2 class="h2">Recall Labs</h2><a class="link" href="#/labs">All <Icon name="arrow" size={14} /></a></div>
        {#each topLabs as l (l.item.rel)}
          <a class="lab" href={labHref(l.item.rel)}>
            <span class="lt"><Icon name="labs" size={16} /></span>
            <span class="lx"><b>{l.lab.title}</b><span>{l.progress.avgBest === null ? "Not started" : `${l.progress.avgBest}% avg best`}{l.progress.missed ? ` · ${l.progress.missed} to revisit` : ""}</span></span>
            <span class="bar"><span style="width: {l.progress.avgBest ?? 0}%"></span></span>
          </a>
        {:else}
          <p class="muted small">Your labs show up here.</p>
        {/each}
      </section>
      <section class="card">
        <div class="sh"><h2 class="h2">Notes by course</h2></div>
        {#each byCourse as r (r.id)}
          <a class="crs" href="#/courses/{r.id}" style="--c: {r.c.color}"><span class="cd"></span><span>{r.c.name}</span><b>{r.n}</b></a>
        {/each}
      </section>
      <section class="card due">
        <div class="sh"><h2 class="h2">Flashcards</h2><a class="link" href="#/study/cards">All <Icon name="arrow" size={14} /></a></div>
        {#if cardsNow.total}
          <p><b class="display dn">{cardsNow.due + cardsNow.newToday}</b> to review today <span class="muted">({cardsNow.due} due · {cardsNow.newToday} new)</span></p>
          {#if cardsNow.due + cardsNow.newToday}<a class="btn primary" href="#/study/cards/review/all"><Icon name="play" size={15} /> Review now</a>{/if}
        {:else}
          <p class="muted small">Write <code>Q :: A</code> or <code>{"{{cloze}}"}</code> in any note and it becomes a card.</p>
        {/if}
      </section>
    </aside>
  </div>
</div>

<NewNoteDialog bind:open={newOpen} />

<style>
  .home {
    display: grid;
    gap: var(--gap);
    container-type: inline-size;
  }
  .hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 24px;
    border-radius: 30px;
    background: linear-gradient(130deg, #e7dcfb 0%, var(--peach-soft) 55%, var(--sage-soft) 100%);
    box-shadow: var(--shadow);
  }
  .kicker {
    font-size: 13px;
    font-weight: 600;
  }
  h1 {
    font-size: clamp(28px, 3.6vw, 40px);
    font-weight: 600;
    line-height: 1.1;
    margin: 2px 0 6px;
  }
  .qa {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: var(--gap);
    align-items: start;
  }
  @container (max-width: 900px) {
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
  .continue {
    position: relative;
    display: grid;
    gap: 4px;
    padding: 22px 70px 22px 22px;
    border-radius: var(--radius);
    background: linear-gradient(135deg, color-mix(in srgb, var(--c, var(--peach)) 45%, var(--white)), var(--c, var(--peach)));
    box-shadow: var(--shadow);
    text-decoration: none;
  }
  .continue .label {
    color: var(--text);
  }
  .continue h2 {
    font-size: 26px;
    font-weight: 600;
  }
  .continue p {
    font-size: 14px;
    opacity: 0.8;
  }
  .go {
    position: absolute;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--charcoal);
    color: var(--on-primary);
  }
  .sh {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 0 4px 10px;
  }
  .card .sh {
    margin: 0 0 8px;
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;
    color: var(--text-muted);
    text-decoration: none;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }
  .nc {
    display: grid;
    gap: 6px;
    align-content: start;
    min-height: 150px;
    padding: 14px 16px;
    border-radius: 22px;
    background: var(--surface);
    box-shadow: var(--shadow);
    text-decoration: none;
    border-top: 5px solid var(--c, var(--hairline));
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }
  .nc:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lift);
  }
  .nt {
    justify-self: start;
    padding: 2px 10px;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--c, var(--panel)) 40%, var(--white));
    font-size: 12px;
    font-weight: 600;
  }
  .nc b {
    font-size: 16px;
    font-weight: 600;
  }
  .ns {
    font-size: 13px;
    color: var(--text-muted);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
  }
  .nf {
    margin-top: auto;
    font-size: 12px;
    color: var(--text-muted);
  }
  .empty {
    display: grid;
    gap: 10px;
    justify-items: start;
  }
  .tpls {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .side .card {
    display: grid;
    gap: 6px;
  }
  .lab {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 4px 10px;
    align-items: center;
    padding: 8px 10px;
    border-radius: 14px;
    background: var(--panel);
    text-decoration: none;
  }
  .lt {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: var(--peach-soft);
  }
  .lx {
    display: grid;
    min-width: 0;
  }
  .lx b {
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lx span {
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .lab .bar {
    grid-column: 1 / -1;
    height: 5px;
    border-radius: var(--radius-pill);
    background: var(--surface);
    overflow: hidden;
  }
  .lab .bar span {
    display: block;
    height: 100%;
    background: var(--charcoal);
  }
  .crs {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    min-height: 38px;
    padding: 0 10px;
    border-radius: 12px;
    text-decoration: none;
    font-size: 14px;
  }
  .crs:hover {
    background: var(--panel);
  }
  .cd {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c);
  }
  .small {
    font-size: 13.5px;
  }
  .due {
    background: linear-gradient(150deg, color-mix(in srgb, #cdb4f7 35%, var(--white)), var(--surface) 70%);
  }
  .dn {
    font-size: 30px;
    font-weight: 600;
  }
  .due code {
    font-size: 12px;
    background: var(--chip);
    padding: 1px 5px;
    border-radius: 5px;
  }
</style>
