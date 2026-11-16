<script lang="ts">
  import { pdfHref, pdfName } from "../../lib/stores/pdfs.svelte";
  import { getItem } from "../../lib/stores/library.svelte";
  // A review session: front → Space → back → rate 1–4. Learning cards come back
  // in the same session when they're due; Z undoes the last rating.
  import { onDestroy, onMount } from "svelte";
  import Icon from "../../lib/components/Icon.svelte";
  import { cardHtml } from "../../lib/cards";
  import { courseByName } from "../../lib/stores/courses.svelte";
  import { notes } from "../../lib/stores/notes.svelte";
  import OcclusionView from "../../lib/components/OcclusionView.svelte";
  import { allCards, cramQueue, cramReviewed, ensureIds, grade, LEARN_AHEAD, preview, queue, RATINGS, statusOf, undo, type CardRef, type Scope } from "../../lib/stores/srs.svelte";
  import { get } from "../../lib/stores/synced.svelte";
  import type { SrsRec } from "../../lib/stores/srs.svelte";

  /** cram: go through every card in scope without changing the schedule */
  let { scope, cram = false }: { scope: Scope; cram?: boolean } = $props();

  let pending = $state<string[]>([]); // keys still to see
  let current = $state<CardRef | null>(null);
  const src = $derived(current?.item ? getItem(current.item.id)?.source : undefined);
  let shown = $state(false);
  let started = $state(0);
  let shownAt = 0;
  let done = $state(0);
  let againCount = $state(0);
  let ready = $state(false);
  let intervals = $state<Record<number, string>>({});

  const label = $derived(
    (cram ? "Cram · " : "") +
      (scope.kind === "all" ? "All decks" : scope.kind === "course" ? scope.name : scope.kind === "library" ? "Card library" : notes.files[scope.rel]?.p.title ?? "Note"),
  );

  onMount(async () => {
    await ensureIds();
    pending = (cram ? cramQueue(scope) : queue(scope)).map((r) => r.card.key);
    started = Date.now();
    ready = true;
    next();
    window.addEventListener("keydown", onKey);
  });
  onDestroy(() => window.removeEventListener("keydown", onKey));

  const refByKey = (k: string) => allCards().find((r) => r.card.key === k) ?? null;

  /** Next card: one that's due now, else the soonest learning card (learn ahead). */
  function next() {
    shown = false;
    const now = Date.now();
    const keys = pending.filter((k) => refByKey(k));
    if (!keys.length) {
      current = null;
      return;
    }
    const rec = (k: string) => get<SrsRec>("srs", k);
    const dueNow = keys.find((k) => !rec(k) || rec(k)!.due <= now + (statusOf(rec(k), now) === "learning" ? 0 : LEARN_AHEAD) || statusOf(rec(k), now) === "review");
    const k = cram ? keys[0] : (dueNow ?? keys.sort((a, b) => (rec(a)?.due ?? 0) - (rec(b)?.due ?? 0))[0]);
    current = refByKey(k);
    shownAt = Date.now();
    intervals = current ? (cram ? { 1: "again soon", 2: "done", 3: "done", 4: "done" } : preview(k)) : {};
  }

  function reveal() {
    if (current && !shown) shown = true;
  }

  function rate(g: number) {
    if (!current || !shown) return;
    const k = current.card.key;
    if (cram) {
      cramReviewed(g === 1, Date.now() - shownAt);
      done++;
      if (g === 1) againCount++;
      // missed cards come back a few cards later
      const rest = pending.filter((x) => x !== k);
      pending = g === 1 ? [...rest.slice(0, 3), k, ...rest.slice(3)] : rest;
      next();
      return;
    }
    grade(k, g as (typeof RATINGS)[number]["grade"], Date.now() - shownAt, current.course);
    done++;
    if (g === 1) againCount++;
    const after = get<SrsRec>("srs", k);
    // learning cards due again today stay in the session
    pending = pending.filter((x) => x !== k);
    if (after && after.due - Date.now() < 60 * 60000) pending = [...pending, k];
    next();
  }

  function doUndo() {
    const k = undo();
    if (!k) return;
    done = Math.max(0, done - 1);
    pending = [k, ...pending.filter((x) => x !== k)];
    next();
  }

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) return;
    if ((e.key === " " || e.key === "Enter") && !shown) {
      e.preventDefault();
      reveal();
    } else if (shown && ["1", "2", "3", "4"].includes(e.key)) {
      e.preventDefault();
      rate(Number(e.key));
    } else if (shown && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      rate(3);
    } else if (e.key === "z" && !cram) doUndo();
  }

  const left = $derived.by(() => {
    const now = Date.now();
    let n = 0, l = 0, r = 0;
    if (cram) return { n: 0, l: 0, r: pending.length };
    for (const k of pending) {
      const s = statusOf(get<SrsRec>("srs", k), now);
      if (s === "new") n++;
      else if (s === "review") r++;
      else l++;
    }
    return { n, l, r };
  });
  const img = (s: string) => (current ? current.img(s) : s);
  const course = $derived(current?.course ? courseByName(current.course) : undefined);
</script>

<div class="review" style={course ? `--c: ${course[1].color}` : ""}>
  <header class="top">
    <a class="btn quiet sm" href="#/study/cards"><Icon name="back" size={15} /> Cards</a>
    <span class="scope">{label}</span>
    <span class="left" aria-label="Cards left">
      <span class="n-new" title="New">{left.n}</span>
      <span class="n-learn" title="Learning">{left.l}</span>
      <span class="n-rev" title="Review">{left.r}</span>
    </span>
  </header>

  {#if !ready}
    <p class="muted center">Getting your cards ready…</p>
  {:else if current}
    <article class="card" class:shown>
      <div class="ctx">
        {#if course}<span class="cc">{course[1].code ?? course[1].name}</span>{/if}
        {#each current.card.context as c, i}<span>{c}</span>{#if i < current.card.context.length - 1}<span class="sep">›</span>{/if}{/each}
      </div>
      <div class="front" class:cloze={current.card.kind === "cloze"}>{@html cardHtml(current.card.front, img)}</div>
      {#if current.card.masks && current.card.image}
        <div class="occwrap"><OcclusionView src={img(current.card.image)} masks={current.card.masks} target={current.card.target} reveal={shown} /></div>
      {/if}
      {#if current.card.kind === "list" && !shown}<p class="hint muted">List card: recall every item.</p>{/if}
      {#if shown && current.card.back.trim()}
        <hr />
        <div class="back">{@html cardHtml(current.card.back, img)}</div>
      {/if}
      <span class="edit">
        {#if src}<a href={pdfHref(src.pdf, src.page)}><Icon name="file" size={13} /> {pdfName(src.pdf)}, p. {src.page}</a>{/if}
        <a href={current.href} onclick={() => current?.note && (notes.jump = { rel: current.note.rel, line: current.card.line })}>
          <Icon name="pen" size={13} /> {src && current.title === `${pdfName(src.pdf)}, p. ${src.page}` ? "Edit" : current.title}
        </a>
      </span>
    </article>

    <div class="actions">
      {#if !shown}
        <button type="button" class="btn primary show" onclick={reveal}>Show answer <kbd>Space</kbd></button>
      {:else}
        <div class="rates">
          {#each RATINGS as r}
            <button type="button" class="rate r{r.grade}" onclick={() => rate(r.grade)}>
              <b>{r.label}</b><span>{intervals[r.grade]}</span><kbd>{r.key}</kbd>
            </button>
          {/each}
        </div>
      {/if}
      <button type="button" class="undo" onclick={doUndo} disabled={!done}>Undo <kbd>Z</kbd></button>
    </div>
  {:else}
    <section class="card finished">
      <span class="big">🎉</span>
      <h2 class="display">{done ? "Session done" : "Nothing due here"}</h2>
      {#if done}
        <p>{done} {cram ? "cards crammed" : "reviews"} in {Math.max(1, Math.round((Date.now() - started) / 60000))} min · {done ? Math.round(((done - againCount) / done) * 100) : 0}% remembered</p>
      {:else}
        <p class="muted">No cards are due in this deck right now.</p>
      {/if}
      <a class="btn primary" href="#/study/cards">Back to cards</a>
    </section>
  {/if}
</div>

<style>
  .review {
    display: grid;
    gap: 18px;
    max-width: 860px;
    width: 100%;
    margin: 0 auto;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .sm {
    min-height: 36px;
    padding: 0 14px;
    font-size: 13.5px;
  }
  .scope {
    flex: 1;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .left {
    display: inline-flex;
    gap: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .n-new {
    color: #7a5bbf;
  }
  .n-learn {
    color: #a8434f;
  }
  .n-rev {
    color: #3f7366;
  }
  .center {
    text-align: center;
    padding: 40px;
  }
  .card {
    position: relative;
    display: grid;
    gap: 18px;
    min-height: 340px;
    align-content: start;
    padding: 28px 32px 48px;
    border-radius: 30px;
    background: var(--surface);
    box-shadow: var(--shadow-lift);
    border-top: 6px solid var(--c, var(--peach));
  }
  .ctx {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .cc {
    padding: 2px 10px;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--c, var(--peach)) 45%, var(--white));
    color: var(--text);
    font-weight: 600;
  }
  .sep {
    opacity: 0.5;
  }
  .front,
  .back {
    font-size: 24px;
    line-height: 1.5;
    text-align: center;
  }
  .front {
    font-weight: 600;
  }
  .back {
    font-size: 21px;
  }
  .front :global(ul),
  .back :global(ul) {
    display: inline-block;
    text-align: left;
    margin: 0;
    padding-left: 22px;
  }
  .front :global(.gap) {
    display: inline-block;
    min-width: 60px;
    padding: 0 10px;
    border-radius: 10px;
    background: var(--butter);
    color: #8a6a12;
  }
  .back :global(mark) {
    background: var(--butter);
    border-radius: 6px;
    padding: 0 4px;
  }
  .front :global(img),
  .back :global(img) {
    max-width: 100%;
    max-height: 340px;
    border-radius: 14px;
  }
  .front :global(.lk),
  .back :global(.lk) {
    color: #6b4fb3;
  }
  .front :global(code),
  .back :global(code) {
    font-size: 0.85em;
    background: var(--chip);
    padding: 1px 6px;
    border-radius: 6px;
  }
  .occwrap {
    text-align: center;
  }
  .hint {
    text-align: center;
    font-size: 14px;
  }
  hr {
    width: 100%;
    border: 0;
    border-top: 2px dashed var(--hairline);
    margin: 0;
  }
  .edit a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: inherit;
    text-decoration: none;
  }
  .edit {
    position: absolute;
    right: 20px;
    bottom: 16px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--text-muted);
    text-decoration: none;
  }
  .edit:hover {
    color: var(--text);
  }
  .actions {
    display: grid;
    justify-items: center;
    gap: 10px;
  }
  .show {
    min-height: 56px;
    min-width: 280px;
    font-size: 17px;
  }
  kbd {
    padding: 1px 7px;
    border-radius: 6px;
    background: rgba(255, 253, 251, 0.2);
    font-family: var(--font-body);
    font-size: 11.5px;
    opacity: 0.8;
  }
  .rates {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
  }
  .rate {
    display: grid;
    justify-items: center;
    gap: 2px;
    min-height: 74px;
    padding: 8px;
    border: 0;
    border-radius: 20px;
    background: var(--surface);
    box-shadow: var(--shadow);
    transition: transform 0.12s ease, box-shadow 0.12s ease;
  }
  .rate:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lift);
  }
  .rate b {
    font-size: 16px;
  }
  .rate span {
    font-size: 13px;
    color: var(--text-muted);
  }
  .rate kbd {
    background: var(--chip);
  }
  .r1 {
    background: var(--rose-soft);
  }
  .r2 {
    background: var(--butter-soft);
  }
  .r3 {
    background: var(--sage-soft);
  }
  .r4 {
    background: color-mix(in srgb, #b9d4ee 45%, var(--white));
  }
  .undo {
    border: 0;
    background: none;
    font-size: 13px;
    color: var(--text-muted);
  }
  .undo:disabled {
    opacity: 0.4;
  }
  .undo kbd {
    background: var(--chip);
  }
  .finished {
    justify-items: center;
    text-align: center;
    min-height: 0;
    padding: 40px;
    border-top: 0;
  }
  .finished .big {
    font-size: 42px;
  }
  .finished h2 {
    font-size: 28px;
    font-weight: 600;
  }
</style>
