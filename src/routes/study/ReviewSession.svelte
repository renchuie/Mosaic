<script lang="ts">
  import { pdfHref, pdfName } from "../../lib/stores/pdfs.svelte";
  import { getItem } from "../../lib/stores/library.svelte";
  // A review session: front → Space → back → rate 1–4. Learning cards come back
  // in the same session when they're due; Z undoes the last rating.
  import { onDestroy, onMount } from "svelte";
  import Icon from "../../lib/components/Icon.svelte";
  import { cardHtml } from "../../lib/cards";
  /** Length of a card side as she reads it (markup, ids and cloze syntax left out). */
  const plainLen = (t: string) => t.replace(/<!--[\s\S]*?-->|<[^>]+>|\{\{(?:c\d+::)?|::[^}]*\}\}|\}\}|[*=_~`]/g, "").trim().length;
  import { courseByName } from "../../lib/stores/courses.svelte";
  import { notes } from "../../lib/stores/notes.svelte";
  import OcclusionView from "../../lib/components/OcclusionView.svelte";
  import { allCards, cramQueue, cramReviewed, ensureIds, grade, LEARN_AHEAD, preview, queue, RATINGS, statusOf, undo, type CardRef, type Scope } from "../../lib/stores/srs.svelte";
  import { get } from "../../lib/stores/synced.svelte";
  import { settings, saveSettings } from "../../lib/stores/settings.svelte";
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

  // ---- list cards (Nov 18, her design on artifact "List Card Retry"): a "?" per item; after Show
  // answer she clicks the items she missed. A miss allows only Again / Hard, and the card comes back
  // a few cards later asking just the missed items (practice, the schedule isn't touched), then
  // once more as the whole list; only a clean whole-list run can be rated Good / Easy. ----
  type Retry = { key: string; phase: "missed" | "full"; ask: number[]; at: number };
  const RETRY_GAP = 5; // other cards before a retry comes back (sooner if nothing else is left)
  let retries = $state<Retry[]>([]);
  let retryNow = $state<Retry | null>(null);
  let seen = 0; // cards finished this session, for spacing the retries
  let missed = $state<number[]>([]);
  /** A list card's items: each top-level bullet with its own indented lines. */
  function listItems(back: string): string[] {
    const out: string[] = [];
    for (const line of back.split("\n")) {
      if (/^[-*] /.test(line)) out.push(line.slice(2));
      else if (out.length && line.trim()) out[out.length - 1] += "\n" + line.replace(/^ {2}/, "");
    }
    return out;
  }
  const isList = $derived(current?.card.kind === "list");
  const items = $derived(isList && current ? listItems(current.card.back) : []);
  const asked = $derived(retryNow ? retryNow.ask : items.map((_, i) => i));
  const missedAsked = $derived(missed.filter((i) => asked.includes(i)));
  const practice = $derived(retryNow?.phase === "missed");
  /** with a miss, only Again / Hard: suggest Again when more than half were missed */
  const suggested = $derived(missedAsked.length ? (missedAsked.length / asked.length > 0.5 ? 1 : 2) : 0);
  function toggleMiss(i: number) {
    if (!shown || !asked.includes(i)) return;
    missed = missed.includes(i) ? missed.filter((x) => x !== i) : [...missed, i];
  }
  /** the missed-items retry is done: what's still missed comes back again, else the whole list */
  function cont() {
    if (!current || !retryNow) return;
    const k = current.card.key;
    seen++;
    retries = [...retries, missedAsked.length
      ? { key: k, phase: "missed", ask: [...missedAsked].sort((a, b) => a - b), at: seen + RETRY_GAP }
      : { key: k, phase: "full", ask: items.map((_, i) => i), at: seen + RETRY_GAP }];
    next();
  }

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
    scratch = "";
    missed = [];
    retryNow = null;
    const now = Date.now();
    retries = retries.filter((r) => refByKey(r.key));
    // a card waiting for a list retry doesn't also come round on its own
    const keys = pending.filter((k) => refByKey(k) && !retries.some((r) => r.key === k));
    const due = retries.find((r) => r.at <= seen) ?? (!keys.length ? retries[0] : undefined);
    if (due) {
      retries = retries.filter((r) => r !== due);
      retryNow = due;
      current = refByKey(due.key);
      shownAt = Date.now();
      intervals = cram ? { 1: "again soon", 2: "again soon", 3: "done", 4: "done" } : preview(due.key);
      return;
    }
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

  // ---- scratchpad (Nov 18, her ask): write what you remember first, then compare and rate
  // yourself on the idea rather than the lecture's exact words. Not saved anywhere. ----
  let scratch = $state("");
  const scratchOn = $derived(!!settings.cardScratch);
  const mustWrite = $derived(scratchOn && !scratch.trim());
  function focusIt(el: HTMLTextAreaElement) {
    requestAnimationFrame(() => el.focus());
  }
  function reveal(skip = false) {
    if (!current || shown) return;
    if (mustWrite && !skip) return;
    if (skip && !scratch.trim()) scratch = "";
    shown = true;
    (document.activeElement as HTMLElement | null)?.blur?.();
  }

  function rate(g: number) {
    if (!current || !shown) return;
    if (practice) return cont();
    const k = current.card.key;
    if (isList && missedAsked.length) {
      if (g >= 3) return; // Good / Easy wait for a clean run through the whole list
      if (cram) cramReviewed(true, Date.now() - shownAt);
      else grade(k, g as (typeof RATINGS)[number]["grade"], Date.now() - shownAt, current.course);
      done++;
      if (g === 1) againCount++;
      seen++;
      pending = pending.filter((x) => x !== k);
      retries = [...retries, { key: k, phase: "missed", ask: [...missedAsked].sort((a, b) => a - b), at: seen + RETRY_GAP }];
      next();
      return;
    }
    seen++;
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
    retries = retries.filter((r) => r.key !== k);
    pending = [k, ...pending.filter((x) => x !== k)];
    next();
  }

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) return;
    // list cards: Shift + the item's number marks it missed
    if (shown && isList && e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
      e.preventDefault();
      toggleMiss(Number(e.code.slice(5)) - 1);
      return;
    }
    if (shown && practice && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      cont();
      return;
    }
    if ((e.key === " " || e.key === "Enter") && !shown) {
      e.preventDefault();
      reveal();
    } else if (shown && ["1", "2", "3", "4"].includes(e.key)) {
      e.preventDefault();
      rate(Number(e.key));
    } else if (shown && (e.key === " " || e.key === "Enter")) {
      e.preventDefault();
      rate(suggested || 3);
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
    return { n, l: l + retries.length, r };
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
        return {
          label: c.grid ? "Table row · cloze" : c.rows ? "Table row" : c.rev ? `Which ${(c.ask || "row").toLowerCase()}?` : "Table",
          icon: "▦",
          tone: "var(--link-ink)",
        };
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

<div class="review" class:centred={settings.cardAlign === "center"} style={course ? `--c: ${course[1].color}` : ""}>
  <header class="top">
    <a class="btn quiet sm" href="#/study/cards"><Icon name="back" size={15} /> Cards</a>
    <span class="scope">{label}</span>
    <span class="prog" aria-hidden="true"><i style="width: {progress}%"></i></span>
    <button type="button" class="btn quiet sm scrbtn" class:on={scratchOn} aria-pressed={scratchOn} title="Scratchpad: write what you remember before the answer shows" onclick={() => saveSettings({ cardScratch: !scratchOn })}>✎ Scratchpad</button>
    <span class="left" aria-label="Cards left">
      <span class="n-new" title="New">{left.n}</span>
      <span class="n-learn" title="Learning">{left.l}</span>
      <span class="n-rev" title="Review">{left.r}</span>
    </span>
  </header>

  {#if !ready}
    <div class="stage"><p class="muted center">Getting your cards ready…</p></div>
  {:else if current}
    <!-- the card sits in the middle and grows both ways; the bars above and below never move -->
    <div class="stage">
    {#key current.card.key}
    <article class="card" class:shown style="--t: {look.tone}" data-kind={current.card.kind}>
      <div class="head">
        <span class="type"><span class="ic">{look.icon}</span>{look.label}</span>
        {#if retryNow}<span class="rtag">↻ {retryNow.phase === "missed" ? `Retry · ${retryNow.ask.length} missed` : "Whole list again"}</span>{/if}
        <span class="ctx">
          {#if course}<span class="cdot" style="background: {course[1].color}"></span><span class="cc">{course[1].code ?? course[1].name}</span>{#if crumbs.length}<span class="sep">›</span>{/if}{/if}
          {#each crumbs as c, i}<span>{c}</span>{#if i < crumbs.length - 1}<span class="sep">›</span>{/if}{/each}
        </span>
        {#if status}<span class="status s-{status}">{status}</span>{/if}
      </div>

      <div class="q" class:cloze={current.card.kind === "cloze"} class:long={!current.card.grid && plainLen(current.card.front) > 90}>
        {#if current.card.kind === "concept" && !current.card.rev}
          <span class="cpt">{@html cardHtml(current.card.front, img)}</span>
        {:else if current.card.kind === "table" && current.card.grid}
          <table class="mini">
            <thead><tr>{#each current.card.grid.header as h}<th>{h}</th>{/each}</tr></thead>
            <tbody><tr>
              {#each current.card.grid.cells as cell, i}
                <td>{#if i === current.card.grid.hide}{#if shown}<mark>{@html cardHtml(cell, img)}</mark>{:else}<span class="gap">[…]</span>{/if}{:else if i === 0}<b>{@html cardHtml(cell, img)}</b>{:else}{@html cardHtml(cell, img)}{/if}</td>
              {/each}
            </tr></tbody>
          </table>
        {:else if current.card.kind === "table" && current.card.rev}
          <span class="muted-lbl">{current.card.prop}:</span> {@html cardHtml(current.card.front.replace(/^[^:]*:\s*/, ""), img)}
        {:else if current.card.kind === "table" && current.card.concept && !current.card.rows}
          <span class="path"><b>{@html cardHtml(current.card.concept, img)}</b><span class="ar">›</span><span>{@html cardHtml(current.card.prop ?? "", img)}</span></span>
        {:else if current.card.kind === "descriptor" && current.card.concept}
          <span class="path"><span class="cpt">{@html cardHtml(current.card.concept, img)}</span><span class="ar">›</span><span>{@html cardHtml(current.card.prop ?? "", img)}</span></span>
        {:else}
          {@html cardHtml(inPlace && shown ? current.card.back : current.card.front, img)}
          {#if isList}<span class="lcount">{asked.length} {practice ? "to recall" : asked.length === 1 ? "item" : "items"}</span>{/if}
        {/if}
      </div>
      {#if current.card.masks && current.card.image}
        <div class="occwrap"><OcclusionView src={img(current.card.image)} masks={current.card.masks} target={current.card.target} reveal={shown} /></div>
      {/if}
      {#if isList}
        {#if shown}<div class="divider">Answer</div>{/if}
        <ol class="litems" class:many={items.length >= 6} style="--rows: {Math.ceil(items.length / 2)}">
          {#each items as it, i}
            {#if !asked.includes(i)}
              <li class="known"><span class="num">{i + 1}</span><span class="tx">{@html cardHtml(it, img)}</span><span class="had">✓ you had this</span></li>
            {:else if !shown}
              <li><span class="num">{i + 1}</span><span class="hole" aria-label="Item {i + 1}, hidden">?</span></li>
            {:else}
              <li class="mark" class:missed={missed.includes(i)}>
                <button type="button" aria-pressed={missed.includes(i)} title="Click if you missed it (Shift+{i + 1})" onclick={() => toggleMiss(i)}>
                  <span class="num">{i + 1}</span><span class="tx">{@html cardHtml(it, img)}</span><span class="x" aria-hidden="true">✕</span>
                </button>
              </li>
            {/if}
          {/each}
        </ol>
        {#if shown}
          <p class="lhint">
            {#if missedAsked.length}<b class="bad">{missedAsked.length} missed · {practice ? "they" : "this card"} come{practice ? "" : "s"} back in a few cards{practice ? "" : ", then the whole list again"}</b>
            {:else if practice}<b class="good">Got them · next time it's the whole list</b>
            {:else}Click anything you missed (or Shift + its number).{/if}
          </p>
        {/if}
      {/if}
      {#if scratchOn && !shown}
        <div class="scratch">
          <textarea use:focusIt bind:value={scratch} rows="3" placeholder="Write what you remember, in your own words…" aria-label="Your answer"
            onkeydown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); reveal(); } }}></textarea>
          <div class="scrrow"><span>Ctrl+Enter to compare</span><button type="button" class="idk" onclick={() => reveal(true)}>I don't know, show me</button></div>
        </div>
      {:else if scratchOn && shown}
        <div class="mine">
          <span class="mlbl">You wrote</span>
          {#if scratch.trim()}<p>{scratch.trim()}</p>{:else}<p class="none">Nothing: you chose "I don't know".</p>{/if}
          <span class="mtip">Rate the idea, not the wording: got the concept → Good, part of it → Hard.</span>
        </div>
      {/if}
      {#if shown && !inPlace && !isList && !current.card.grid && current.card.back.trim()}
        <div class="divider">Answer</div>
        <div class="a" class:list={current.card.kind === "list" || /^\s*- /m.test(current.card.back)}>
          {#if current.card.kind === "concept" && current.card.rev}<span class="cpt">{@html cardHtml(current.card.back, img)}</span>
          {:else if current.card.rows}
            <dl class="kv">{#each current.card.rows as [k, v]}<dt>{k}</dt><dd>{@html cardHtml(v, img)}</dd>{/each}</dl>
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
    </div>

    <div class="actions">
      {#if !shown}
        <button type="button" class="show" disabled={mustWrite} onclick={() => reveal()}>{#if mustWrite}Write your answer first{:else}Show answer <kbd>{scratchOn ? "Ctrl+Enter" : "Space"}</kbd>{/if}</button>
      {:else if practice}
        <button type="button" class="show" onclick={cont}>Continue <kbd>Space</kbd></button>
      {:else}
        <div class="rates">
          {#each RATINGS as r}
            <button type="button" class="rate r{r.grade}" class:sugg={suggested === r.grade} disabled={!!suggested && r.grade >= 3} title={suggested && r.grade >= 3 ? "After a miss, Good comes once you get the whole list" : undefined} onclick={() => rate(r.grade)}>
              <b>{r.label}</b><span>{intervals[r.grade]}</span><kbd>{r.key}</kbd>
            </button>
          {/each}
        </div>
      {/if}
      <button type="button" class="undo" onclick={doUndo} disabled={!done}>Undo <kbd>Z</kbd></button>
    </div>
  {:else}
    <div class="stage">
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
    </div>
  {/if}
</div>

<style>
  /* Nov 18 redesign (canvas board "Flashcards in review"): big type, a colour and badge per card
     type (--t), the course and section on top, the answer under a labelled divider */
  .review {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: 100%;
    gap: 20px;
    max-width: 1000px;
    width: 100%;
    margin: 0 auto;
    container-type: inline-size;
  }
  /* the middle: the card centred, scrolling inside only if it's taller than the space */
  .stage {
    /* flex + auto margins rather than align-content: center, so a card taller than the space
       starts at the top and scrolls instead of being cut off (or shrunk: .card hides overflow) */
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 4px 20px;
    margin: -12px -4px -20px;
  }
  .stage > :global(*) {
    flex: none;
    margin-block: auto;
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
  /* Text sizes (her pick Nov 18, "C · Calm" on the canvas "Flashcard text sizes"): every question
     --qs, every answer --as; lists and table values use the answer size, only small labels go
     smaller (0.6 × answer). Questions over ~90 characters are 80%. */
  .card {
    --qs: 25px;
    --as: 21px;
    --lbl: max(12px, calc(var(--as) * 0.6));
    --t: var(--rose-deep);
    position: relative;
    display: grid;
    gap: 20px;
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
  .q {
    font-size: var(--qs);
    line-height: 1.3;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .q.long {
    font-size: calc(var(--qs) * 0.8);
  }
  .q :global(p),
  .a :global(p) {
    margin: 0 0 0.3em;
  }
  /* table cards */
  .muted-lbl {
    color: var(--text-muted);
    font-weight: 500;
  }
  .kv {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px 22px;
    margin: 0;
  }
  .kv dt {
    padding-top: 0.35em;
    font-size: var(--lbl);
    font-weight: 700;
    color: var(--text-muted);
  }
  .kv dd {
    margin: 0;
  }
  .kv :global(p) {
    margin: 0;
  }
  .mini {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    border-radius: 18px;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 12%, transparent);
    font-size: var(--as);
    font-weight: 500;
  }
  .mini th,
  .mini td {
    padding: 12px 18px;
    text-align: left;
    vertical-align: top;
    border-right: 1px solid color-mix(in srgb, var(--text) 8%, transparent);
  }
  .mini th {
    font-size: var(--lbl);
    font-weight: 700;
    color: var(--text-muted);
    background: color-mix(in srgb, var(--link-ink) 9%, transparent);
  }
  .mini th:last-child,
  .mini td:last-child {
    border-right: 0;
  }
  .mini :global(p) {
    margin: 0;
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
  .a {
    font-size: var(--as);
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
    padding-left: 1.1em;
  }
  .q :global(li)::before,
  .a :global(li)::before {
    content: "";
    position: absolute;
    left: 2px;
    top: 0.5em;
    width: 0.4em;
    height: 0.4em;
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
  /* one fixed-height row for Show answer and the rate buttons, so nothing moves when it switches */
  .actions {
    display: grid;
    grid-template-rows: 92px auto;
    justify-items: center;
    gap: 10px;
  }
  .show {
    width: 100%;
    height: 100%;
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
    height: 100%;
  }
  .rate {
    display: grid;
    justify-items: center;
    gap: 2px;
    align-content: center;
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
  /* scratchpad: tinted with the card type's own colour (--t), like the stripe and badge */
  .scrbtn.on {
    background: var(--text);
    color: var(--surface);
  }
  .scratch {
    display: grid;
    gap: 6px;
  }
  .scratch textarea {
    width: 100%;
    box-sizing: border-box;
    min-height: 96px;
    padding: 14px 16px;
    border: 0;
    border-radius: 16px;
    background: color-mix(in srgb, var(--t) 7%, var(--field));
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--t) 55%, transparent);
    color: var(--text);
    font: inherit;
    font-size: calc(var(--as) * 0.86);
    line-height: 1.45;
    resize: vertical;
  }
  .scratch textarea:focus {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--t);
  }
  .scrrow {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .idk {
    border: 0;
    background: none;
    padding: 0;
    color: var(--link-ink);
    font: inherit;
    cursor: pointer;
  }
  .mine {
    display: grid;
    gap: 4px;
    padding: 12px 16px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--t) 14%, transparent);
    text-align: left;
  }
  .mine p {
    margin: 0;
    font-size: calc(var(--as) * 0.86);
    font-weight: 500;
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .mine .none {
    color: var(--text-muted);
    font-style: italic;
  }
  .mlbl {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--t) 50%, var(--text));
  }
  .mtip {
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .show:disabled {
    opacity: 0.55;
    cursor: default;
    transform: none;
  }
  /* list cards: a numbered "?" per item; after Show answer each item is a button to mark it missed */
  .lcount {
    display: inline-block;
    margin-left: 0.5em;
    padding: 0.15em 0.7em;
    border-radius: 999px;
    background: color-mix(in srgb, var(--lavender) 22%, transparent);
    color: color-mix(in srgb, var(--lavender) 45%, var(--text));
    font-size: 13px;
    font-weight: 600;
    vertical-align: 0.25em;
  }
  .rtag {
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--rose-soft);
    color: var(--alert-ink);
    font-size: 12px;
    font-weight: 600;
  }
  .litems {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--as);
    font-weight: 500;
    line-height: 1.35;
  }
  /* 6+ items: two columns on wide cards, filled down then across (1–4 left, 5–7 right) */
  @container (min-width: 760px) {
    .litems.many {
      grid-template-rows: repeat(var(--rows), auto);
      grid-auto-flow: column;
      grid-auto-columns: minmax(0, 1fr);
      column-gap: 18px;
    }
  }
  .litems li {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    padding: 2px 10px 2px 4px;
    border-radius: 14px;
  }
  .litems .num {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--t) 22%, transparent);
    font-size: 13px;
    font-weight: 700;
  }
  .litems .tx {
    min-width: 0;
    text-align: left;
  }
  .litems .tx :global(ul) {
    margin-top: 4px;
    font-size: 0.86em;
  }
  .hole {
    display: inline-grid;
    place-items: center;
    min-width: 64px;
    padding: 0 16px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--lavender) 22%, transparent);
    color: color-mix(in srgb, var(--lavender) 45%, var(--text));
    font-weight: 700;
    animation: holein 0.3s var(--spring, ease) backwards;
  }
  .litems li:nth-child(2) .hole { animation-delay: 0.04s; }
  .litems li:nth-child(3) .hole { animation-delay: 0.08s; }
  .litems li:nth-child(n + 4) .hole { animation-delay: 0.12s; }
  @keyframes holein {
    from {
      opacity: 0;
      transform: scale(0.85);
    }
  }
  .litems li.known {
    color: var(--text-muted);
  }
  .litems li.known .num {
    background: var(--chip);
  }
  .had {
    flex: none;
    font-size: 13px;
    font-weight: 600;
    color: var(--go-ink);
  }
  .litems li.mark {
    padding: 0;
  }
  .litems li.mark button {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 44px;
    padding: 2px 10px 2px 4px;
    border: 0;
    border-radius: 14px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
  }
  .litems li.mark button:hover {
    background: var(--chip);
  }
  .litems .x {
    flex: none;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    margin-left: auto;
    border-radius: 50%;
    background: var(--chip);
    color: var(--text-muted);
    font-size: 14px;
    transition: transform 0.15s var(--spring, ease), background 0.15s;
  }
  .litems li.missed button {
    background: var(--rose-soft);
  }
  .litems li.missed .num {
    background: var(--rose-deep);
    color: var(--ink-on-color, #fff);
  }
  .litems li.missed .tx {
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--alert-ink) 55%, transparent);
  }
  .litems li.missed .x {
    background: var(--alert-ink);
    color: var(--surface);
    transform: scale(1.06);
  }
  .lhint {
    margin: -4px 0 0;
    font-size: 13px;
    color: var(--text-muted);
  }
  .lhint .bad {
    color: var(--alert-ink);
  }
  .lhint .good {
    color: var(--go-ink);
  }
  .rate:disabled {
    opacity: 0.35;
    cursor: not-allowed;
    transform: none;
  }
  .rate.sugg {
    box-shadow: 0 0 0 3px var(--text);
  }
  .review.centred .litems {
    justify-content: center;
  }
  /* Settings → Appearance → Flashcard review → Card text: Centred */
  .review.centred .q,
  .review.centred .a,
  .review.centred .divider + .a {
    text-align: center;
  }
  .review.centred .q :global(ul),
  .review.centred .a :global(ul),
  .review.centred .kv {
    justify-content: center;
    text-align: left;
  }
  .review.centred .mini {
    margin-inline: auto;
  }
  .review.centred .path {
    justify-content: center;
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
    .card {
      --qs: 22px;
      --as: 19px;
    }
    .rates {
      gap: 8px;
    }
  }
</style>
