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

  // ---- the look of each card type (Nov 18 redesign: big, colourful, a badge per type) ----
  type Look = { label: string; icon: string; tone: string };
  const look = $derived.by((): Look => {
    const c = current?.card;
    if (!c) return { label: "", icon: "", tone: "" };
    if (c.masks) return { label: "Image", icon: "▣", tone: "var(--rose)" };
    switch (c.kind) {
      case "basic":
        return c.two ? { label: "Both ways · 1 of 2", icon: "⇄", tone: "var(--lavender)" } : { label: "Flashcard", icon: "→", tone: "var(--rose-deep)" };
      case "reverse":
        return c.two ? { label: "Both ways · 2 of 2", icon: "⇄", tone: "var(--lavender)" } : { label: "Reverse", icon: "←", tone: "var(--peach)" };
      case "cloze":
        return { label: "Cloze", icon: "{ }", tone: "var(--butter)" };
      case "list":
        return { label: "List", icon: "→•", tone: "var(--sage-deep)" };
      case "table":
        return { label: "Table", icon: "▦", tone: "var(--link-ink)" };
      case "concept":
        return c.rev ? { label: "Which concept?", icon: "◆", tone: "var(--sage-deep)" } : { label: "Concept", icon: "◆", tone: "var(--sage-deep)" };
      case "descriptor":
        return { label: "Descriptor", icon: "›", tone: "color-mix(in srgb, var(--lavender) 70%, var(--link-ink))" };
      default: {
        const t = c.context[0] ?? "Card";
        return { label: t, icon: /drug/i.test(t) ? "💊" : "→", tone: "color-mix(in srgb, var(--lavender) 60%, var(--rose-deep))" };
      }
    }
  });
  /** where the card is, without the card-type name the library puts first */
  const crumbs = $derived(current ? (current.card.kind === "item" ? current.card.context.slice(1) : current.card.context) : []);
  const status = $derived.by(() => {
    if (!current || cram) return "";
    const s = statusOf(get<SrsRec>("srs", current.card.key), Date.now());
    return s === "new" ? "new" : s === "learning" ? "learning" : "review";
  });
  /** cloze: after "Show answer" the sentence itself fills in, instead of a second copy below */
  const inPlace = $derived(current?.card.kind === "cloze");
  const progress = $derived(done + pending.length ? Math.round((done / (done + pending.length)) * 100) : 0);
  const course = $derived(current?.course ? courseByName(current.course) : undefined);
</script>

<div class="review" style={course ? `--c: ${course[1].color}` : ""}>
  <header class="top">
    <a class="btn quiet sm" href="#/study/cards"><Icon name="back" size={15} /> Cards</a>
    <span class="scope">{label}</span>
    <span class="prog" aria-hidden="true"><i style="width: {progress}%"></i></span>
    <span class="left" aria-label="Cards left">
      <span class="n-new" title="New">{left.n}</span>
      <span class="n-learn" title="Learning">{left.l}</span>
      <span class="n-rev" title="Review">{left.r}</span>
    </span>
  </header>

  {#if !ready}
    <p class="muted center">Getting your cards ready…</p>
  {:else if current}
    {#key current.card.key}
    <article class="card" class:shown style="--t: {look.tone}" data-kind={current.card.kind}>
      <div class="head">
        <span class="type"><span class="ic">{look.icon}</span>{look.label}</span>
        <span class="ctx">
          {#if course}<span class="cdot" style="background: {course[1].color}"></span><span class="cc">{course[1].code ?? course[1].name}</span>{#if crumbs.length}<span class="sep">›</span>{/if}{/if}
          {#each crumbs as c, i}<span>{c}</span>{#if i < crumbs.length - 1}<span class="sep">›</span>{/if}{/each}
        </span>
        {#if status}<span class="status s-{status}">{status}</span>{/if}
      </div>

      <div class="q" class:cloze={current.card.kind === "cloze"} class:big={current.card.kind === "concept" && !current.card.rev}>
        {#if current.card.kind === "concept" && !current.card.rev}
          <span class="cpt">{@html cardHtml(current.card.front, img)}</span>
        {:else if current.card.kind === "descriptor" && current.card.concept}
          <span class="path"><span class="cpt">{@html cardHtml(current.card.concept, img)}</span><span class="ar">›</span><span>{@html cardHtml(current.card.prop ?? "", img)}</span></span>
        {:else}
          {@html cardHtml(inPlace && shown ? current.card.back : current.card.front, img)}
        {/if}
      </div>
      {#if current.card.masks && current.card.image}
        <div class="occwrap"><OcclusionView src={img(current.card.image)} masks={current.card.masks} target={current.card.target} reveal={shown} /></div>
      {/if}
      {#if current.card.kind === "list" && !shown}<p class="hint">List card: recall every item, then show the answer.</p>{/if}
      {#if shown && !inPlace && current.card.back.trim()}
        <div class="divider">Answer</div>
        <div class="a" class:list={current.card.kind === "list" || /^\s*- /m.test(current.card.back)}>
          {#if current.card.kind === "concept" && current.card.rev}<span class="cpt">{@html cardHtml(current.card.back, img)}</span>
          {:else}{@html cardHtml(current.card.back, img)}{/if}
        </div>
      {/if}

      <div class="foot">
        <a href={current.href} onclick={() => current?.note && (notes.jump = { rel: current.note.rel, line: current.card.line })}>
          <Icon name="pen" size={14} /> {src && current.title === `${pdfName(src.pdf)}, p. ${src.page}` ? "Edit" : current.title}
        </a>
        {#if src}<a href={pdfHref(src.pdf, src.page)}><Icon name="file" size={14} /> {pdfName(src.pdf)}, p. {src.page}</a>{/if}
      </div>
    </article>
    {/key}

    <div class="actions">
      {#if !shown}
        <button type="button" class="show" onclick={reveal}>Show answer <kbd>Space</kbd></button>
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
  /* Nov 18 redesign (canvas board "Flashcards in review"): big type, a colour and badge per card
     type (--t), the course and section on top, the answer under a labelled divider */
  .review {
    display: grid;
    gap: 20px;
    max-width: 1000px;
    width: 100%;
    margin: 0 auto;
    container-type: inline-size;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .sm {
    min-height: 36px;
    padding: 0 14px;
    font-size: 13.5px;
  }
  .scope {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 40%;
  }
  .prog {
    flex: 1;
    height: 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    overflow: hidden;
  }
  .prog i {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--lavender), color-mix(in srgb, var(--lavender) 50%, var(--link-ink)));
    transition: width 0.4s var(--ease-out, ease);
  }
  .left {
    display: inline-flex;
    gap: 12px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .n-new {
    color: var(--link-ink);
  }
  .n-learn {
    color: var(--alert-ink);
  }
  .n-rev {
    color: var(--go-ink);
  }
  .center {
    text-align: center;
    padding: 40px;
  }
  .card {
    --t: var(--rose-deep);
    position: relative;
    display: grid;
    gap: 20px;
    min-height: 360px;
    align-content: start;
    padding: 30px 40px 26px 44px;
    border-radius: 30px;
    background:
      radial-gradient(70% 90% at 0% 0%, color-mix(in srgb, var(--t) 22%, transparent), transparent 60%),
      var(--surface);
    box-shadow: var(--shadow-lift);
    border: var(--edge, 0);
    overflow: hidden;
    animation: cardin 0.3s var(--spring, ease) backwards;
  }
  @keyframes cardin {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
  /* the type's colour as a stripe down the left side */
  .card::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 6px;
    background: linear-gradient(180deg, var(--t), color-mix(in srgb, var(--t) 40%, transparent));
  }
  .head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px 12px;
  }
  .type {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 14px 5px 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--t) 18%, var(--surface));
    font-size: 14px;
    font-weight: 700;
    color: color-mix(in srgb, var(--t) 55%, var(--text));
  }
  .type .ic {
    display: grid;
    place-items: center;
    min-width: 28px;
    height: 28px;
    padding: 0 4px;
    box-sizing: border-box;
    border-radius: 999px;
    background: color-mix(in srgb, var(--t) 85%, var(--text));
    color: var(--white, #fff);
    font-size: 13px;
  }
  .ctx {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    color: var(--text-muted);
  }
  .cdot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
  .cc {
    font-weight: 600;
    color: var(--text);
  }
  .sep {
    opacity: 0.5;
  }
  .status {
    padding: 4px 11px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text) 6%, transparent);
    font-size: 13px;
    color: var(--text-muted);
  }
  .s-new {
    color: var(--link-ink);
  }
  .s-learning {
    color: var(--alert-ink);
  }
  /* the question: big */
  .q {
    font-size: 36px;
    line-height: 1.3;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .q :global(p),
  .a :global(p) {
    margin: 0 0 0.3em;
  }
  .q.big {
    font-size: 38px;
  }
  /* a concept's term: a soft green chip (like in the note) */
  .cpt {
    display: inline-block;
    padding: 0.04em 0.4em 0.1em;
    border-radius: 14px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--sage-deep) 22%, transparent), color-mix(in srgb, var(--lavender) 22%, transparent));
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--sage-deep) 40%, transparent);
    font-weight: 700;
  }
  .cpt :global(p) {
    display: inline;
  }
  .path {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.3em;
  }
  .path .ar {
    color: var(--t);
    font-weight: 700;
  }
  .path :global(p) {
    display: inline;
    margin: 0;
  }
  .divider {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    animation: fadein 0.25s var(--ease-out, ease) backwards;
  }
  .divider::before,
  .divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--text) 18%, transparent), transparent);
  }
  /* the answer: big too */
  .a {
    font-size: 29px;
    line-height: 1.4;
    font-weight: 500;
    overflow-wrap: anywhere;
    animation: answerin 0.3s var(--ease-out, ease) backwards;
  }
  @keyframes answerin {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  @keyframes fadein {
    from {
      opacity: 0;
    }
  }
  .q :global(ul),
  .a :global(ul) {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 8px;
  }
  .q :global(li),
  .a :global(li) {
    position: relative;
    padding-left: 26px;
    font-size: 0.92em;
  }
  .q :global(li)::before,
  .a :global(li)::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 0.55em;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--t);
  }
  /* cloze gaps: a big butter pill; after "Show answer" the answer fills in as a sage pill */
  .q :global(.gap) {
    display: inline-block;
    min-width: 3em;
    padding: 0 0.35em;
    border-radius: 12px;
    background: var(--butter);
    box-shadow: inset 0 -3px 0 color-mix(in srgb, var(--butter) 60%, var(--text));
    color: color-mix(in srgb, var(--butter) 30%, var(--text));
    text-align: center;
  }
  .q :global(mark),
  .a :global(mark) {
    padding: 0 0.3em;
    border-radius: 12px;
    background: var(--sage-soft, var(--sage));
    box-shadow: inset 0 -3px 0 var(--sage-deep);
    color: inherit;
    animation: fadein 0.3s var(--ease-out, ease) backwards;
  }
  .q :global(img),
  .a :global(img) {
    max-width: 100%;
    max-height: 420px;
    border-radius: 16px;
  }
  .q :global(.lk),
  .a :global(.lk) {
    color: var(--link-ink);
  }
  .q :global(code),
  .a :global(code) {
    font-size: 0.8em;
    background: var(--chip);
    padding: 1px 8px;
    border-radius: 8px;
  }
  .occwrap {
    text-align: center;
  }
  .occwrap :global(img),
  .occwrap :global(svg) {
    max-width: 100%;
  }
  .hint {
    margin: 0;
    font-size: 15px;
    color: var(--text-muted);
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding-top: 2px;
    font-size: 14px;
  }
  .foot a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--link-ink);
    font-weight: 600;
    text-decoration: none;
  }
  .foot a:hover {
    text-decoration: underline;
  }
  .actions {
    display: grid;
    justify-items: center;
    gap: 10px;
  }
  .show {
    width: 100%;
    min-height: 62px;
    border: 0;
    border-radius: 22px;
    background: linear-gradient(135deg, var(--primary, var(--text)), color-mix(in srgb, var(--primary, var(--text)) 75%, var(--lavender)));
    color: var(--on-primary, #fff);
    font: inherit;
    font-size: 19px;
    font-weight: 700;
    box-shadow: var(--shadow-lift);
    cursor: pointer;
    transition: transform 0.15s var(--spring, ease);
  }
  .show:hover {
    transform: translateY(-2px);
  }
  kbd {
    padding: 1px 7px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--white) 20%, transparent);
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 500;
    opacity: 0.8;
  }
  .rates {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    width: 100%;
  }
  .rate {
    display: grid;
    justify-items: center;
    gap: 2px;
    min-height: 84px;
    padding: 10px;
    border: 0;
    border-radius: 22px;
    box-shadow: var(--shadow);
    font: inherit;
    cursor: pointer;
    transition: transform 0.12s ease, box-shadow 0.12s ease;
  }
  .rate:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lift);
  }
  .rate b {
    font-size: 18px;
  }
  .rate span {
    font-size: 14px;
    opacity: 0.8;
  }
  .rate kbd {
    background: color-mix(in srgb, var(--text) 8%, transparent);
  }
  .r1 {
    background: var(--rose-soft);
    color: var(--alert-ink);
  }
  .r2 {
    background: var(--butter-soft, var(--peach-soft));
    color: color-mix(in srgb, var(--peach) 35%, var(--text));
  }
  .r3 {
    background: var(--sage-soft);
    color: var(--go-ink);
  }
  .r4 {
    background: color-mix(in srgb, #b9d4ee 50%, var(--surface));
    color: var(--link-ink);
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
  }
  .finished::before {
    display: none;
  }
  .finished .big {
    font-size: 42px;
  }
  .finished h2 {
    font-size: 28px;
    font-weight: 600;
  }
  /* narrow windows: a little smaller, never back to tiny */
  @container (max-width: 700px) {
    .card {
      padding: 24px 22px 22px 28px;
    }
    .q {
      font-size: 30px;
    }
    .a {
      font-size: 24px;
    }
    .rates {
      gap: 8px;
    }
  }
</style>
