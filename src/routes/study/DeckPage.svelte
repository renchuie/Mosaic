<script lang="ts">
  // One deck's page (#/study/cards/deck/<scope>): Review, the practice modes, its numbers and
  // next two weeks, its sub-decks (a course's notes) and its cards.
  import BarChart from "../../lib/components/BarChart.svelte";
  import Icon from "../../lib/components/Icon.svelte";
  import { cardHtml } from "../../lib/cards";
  import { addDays, fromKey, todayKey, toKey } from "../../lib/calendar";
  import { courseByName } from "../../lib/stores/courses.svelte";
  import { getDeck } from "../../lib/stores/decks.svelte";
  import { noteHref, notes } from "../../lib/stores/notes.svelte";
  import { allCards, counts, ensureIds, inScope, recallOf, scopeKey, scopeName, statusOf, type CardRef, type Scope, type Status } from "../../lib/stores/srs.svelte";
  import DeckEditor from "./DeckEditor.svelte";

  let { scope }: { scope: Scope } = $props();
  const enc = (s: string) => encodeURIComponent(s);
  $effect(() => {
    if (notes.loaded) void ensureIds();
  });

  const key = $derived(scopeKey(scope));
  const name = $derived(scopeName(scope));
  const course = $derived(scope.kind === "course" ? courseByName(scope.name)?.[1] : undefined);
  const deck = $derived(scope.kind === "deck" ? getDeck(scope.id) : undefined);
  const icon = $derived(deck?.icon || course?.icon || (scope.kind === "library" ? "book" : scope.kind === "note" ? (notes.files[scope.rel]?.p.meta.icon ? String(notes.files[scope.rel]?.p.meta.icon) : "i:file-text") : "i:layers"));
  const colour = $derived(course?.color ?? "var(--lavender)");

  const k = $derived(counts(scope));
  const cards = $derived(allCards().filter((r) => r.card.lineId).filter(inScope(scope)));
  const recall = $derived.by(() => {
    const seen = cards.filter((r) => r.rec && !r.rec.suspended && r.rec.state !== 0);
    return seen.length ? seen.reduce((n, r) => n + recallOf(r.rec!), 0) / seen.length : null;
  });
  const ahead = $derived.by(() => {
    const t = todayKey();
    const days = Array.from({ length: 14 }, (_, i) => ({ date: addDays(t, i), n: 0 }));
    for (const r of cards) {
      if (!r.rec || r.rec.suspended || r.rec.state === 0) continue;
      const d = toKey(new Date(r.rec.due));
      const i = d <= t ? 0 : days.findIndex((x) => x.date === d);
      if (i >= 0) days[i].n++;
    }
    return days.map((d) => ({
      x: fromKey(d.date).toLocaleDateString("en-US", { weekday: "narrow" }),
      parts: [{ v: d.n, colour: "var(--sage-deep)" }],
      tip: `${fromKey(d.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}\n${d.n} due`,
    }));
  });

  // a course's notes are its sub-decks
  const subs = $derived.by(() => {
    if (scope.kind !== "course") return [];
    const name = scope.name;
    const rels = [...new Set(cards.filter((r) => r.note && String(r.note.p.meta.course ?? "") === name).map((r) => r.note!.rel))];
    return rels
      .map((rel) => ({ rel, title: notes.files[rel]?.p.title ?? rel, k: counts({ kind: "note", rel }) }))
      .sort((a, b) => a.title.localeCompare(b.title));
  });

  const plain = (md: string) => cardHtml(md).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  const STATUS: Record<Status, string> = { new: "New", learning: "Learning", review: "Due", later: "Later", suspended: "Suspended" };
  const shownCards = $derived(
    [...cards]
      .sort((a, b) => (a.rec?.due ?? Infinity) - (b.rec?.due ?? Infinity))
      .slice(0, 40),
  );
  const frontOf = (r: CardRef) => plain(r.card.front) || (r.card.masks ? "Image occlusion" : r.title);

  const MODES = [
    { id: "type", name: "Type it", icon: "i:keyboard" },
    { id: "test", name: "Test", icon: "i:list-checks" },
    { id: "match", name: "Match", icon: "i:grid-2x2" },
  ];
  let editOpen = $state(false);
</script>

{#if scope.kind === "deck"}<DeckEditor bind:open={editOpen} id={scope.id} />{/if}

<div class="deckpage" style="--c: {colour}">
  <header class="top">
    <a class="back" href="#/study/cards" aria-label="Back to Cards"><Icon name="back" size={18} /></a>
    <span class="badge"><Icon name={icon} size={22} /></span>
    <h1 class="h1">{name}</h1>
    {#if scope.kind === "deck"}<button type="button" class="btn quiet sm" onclick={() => (editOpen = true)}><Icon name="pen" size={14} /> Edit</button>{/if}
    {#if scope.kind === "note"}<a class="btn quiet sm" href={noteHref(scope.rel)}><Icon name="i:file-text" size={14} /> Open note</a>{/if}
  </header>

  <section class="hero">
    <div class="nums">
      <span><b class="due">{k.due}</b>Due</span>
      <span><b class="new">{k.newToday}</b>New</span>
      <span><b>{k.learning}</b>Learning</span>
    </div>
    <div class="go">
      {#if k.due + k.newToday}
        <a class="btn primary lg" href="#/study/cards/review/{enc(key)}"><Icon name="play" size={18} /> Review {k.due + k.newToday}</a>
      {:else if k.total}<p class="done">All caught up 🎉</p>{/if}
      {#if k.total}
        <div class="modes">
          <a href="#/study/cards/cram/{enc(key)}"><Icon name="flame" size={16} /> Cram</a>
          {#each MODES as m}<a href="#/study/cards/play/{m.id}/{enc(key)}"><Icon name={m.icon} size={16} /> {m.name}</a>{/each}
        </div>
      {/if}
    </div>
  </section>

  {#if !k.total}
    <section class="card"><p class="muted">No cards in this deck.</p></section>
  {:else}
    <div class="grid">
      <div class="main">
        {#if subs.length}
          <section class="card">
            <h2 class="h2">Notes</h2>
            <ul class="subs">
              {#each subs as s (s.rel)}
                <li>
                  <a class="sn" href="#/study/cards/deck/{enc(`note:${s.rel}`)}">{s.title}</a>
                  <span class="n due" class:z={!s.k.due}>{s.k.due}</span>
                  <span class="n new" class:z={!s.k.newToday}>{s.k.newToday}</span>
                  <span class="n tot">{s.k.total}</span>
                </li>
              {/each}
            </ul>
          </section>
        {/if}

        <section class="card">
          <div class="ch"><h2 class="h2">Cards</h2><a class="btn quiet sm" href="#/study/cards/browse?scope={enc(key)}">Browse all {k.total}</a></div>
          <ul class="clist">
            {#each shownCards as r (r.card.key)}
              {@const st = statusOf(r.rec)}
              <li>
                <span class="cf">{frontOf(r)}</span>
                <i class="chip s-{st}">{STATUS[st]}</i>
              </li>
            {/each}
          </ul>
          {#if k.total > shownCards.length}<a class="more" href="#/study/cards/browse?scope={enc(key)}">{k.total - shownCards.length} more</a>{/if}
        </section>
      </div>

      <aside class="side">
        <section class="card tiles">
          <span><b>{k.total}</b>Cards</span>
          <span><b>{k.mature}</b>Mature</span>
          <span><b>{recall === null ? "–" : `${Math.round(recall * 100)}%`}</b>Recall now</span>
          <span><b>{k.suspended}</b>Suspended</span>
        </section>
        <section class="card">
          <h2 class="h2">Next 2 weeks</h2>
          <BarChart data={ahead} height={110} xEvery={1} label="Cards due per day for the next 14 days" />
        </section>
      </aside>
    </div>
  {/if}
</div>

<style>
  .deckpage {
    display: grid;
    gap: var(--gap);
    container-type: inline-size;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .back {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--chip);
    color: var(--text);
  }
  .badge {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--c) 40%, var(--white));
    color: var(--text);
  }
  .h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 600;
    margin-right: auto;
  }
  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
    padding: 22px 26px;
    border-radius: 30px;
    background: var(--hero);
    color: var(--on-hero);
    box-shadow: var(--shadow-lift);
  }
  .nums {
    display: flex;
    gap: 34px;
  }
  .nums span {
    display: grid;
    font-size: 13px;
    opacity: 0.85;
  }
  .nums b {
    font-size: 48px;
    font-weight: 600;
    line-height: 1.05;
    font-variant-numeric: tabular-nums;
  }
  .go {
    display: grid;
    gap: 12px;
    justify-items: end;
  }
  .lg {
    min-height: 54px;
    padding: 0 26px;
    font-size: 17px;
    background: var(--sage);
    color: var(--ink-on-color);
  }
  .done {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
  .modes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .modes a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--on-hero) 10%, transparent);
    color: var(--on-hero);
    font-size: 13.5px;
    font-weight: 600;
    text-decoration: none;
  }
  .modes a:hover {
    background: color-mix(in srgb, var(--on-hero) 18%, transparent);
  }
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: var(--gap);
    align-items: start;
  }
  @container (max-width: 860px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .main,
  .side {
    display: grid;
    gap: var(--gap);
    min-width: 0;
  }
  .card {
    display: grid;
    gap: 12px;
    align-content: start;
  }
  .h2 {
    margin: 0;
  }
  .ch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .sm {
    min-height: 34px;
    padding: 0 14px;
    font-size: 13px;
  }
  .subs,
  .clist {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 2px;
  }
  .subs li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 44px 44px 52px;
    gap: 6px;
    align-items: center;
    min-height: 40px;
    padding: 0 8px;
    border-radius: 12px;
  }
  .subs li:hover,
  .clist li:hover {
    background: var(--chip);
  }
  .sn {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font-weight: 600;
    text-decoration: none;
  }
  .sn:hover {
    text-decoration: underline;
  }
  .n {
    text-align: right;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .n.due,
  .nums .due {
    color: var(--go-ink);
  }
  .nums .due,
  .nums .new {
    color: inherit;
  }
  .n.new {
    color: var(--link-ink);
  }
  .n.tot {
    font-weight: 500;
    color: var(--text-muted);
  }
  .n.z {
    color: var(--text-muted);
    opacity: 0.5;
  }
  .clist li {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    padding: 0 8px;
    border-radius: 12px;
    font-size: 14px;
  }
  .cf {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip {
    flex: none;
    padding: 2px 9px;
    border-radius: 999px;
    background: var(--chip);
    font-size: 11.5px;
    font-style: normal;
    font-weight: 600;
    color: var(--text-muted);
  }
  .s-new {
    background: color-mix(in srgb, var(--periwinkle) 25%, var(--white));
    color: var(--link-ink);
  }
  .s-review,
  .s-learning {
    background: color-mix(in srgb, var(--sage) 35%, var(--white));
    color: var(--go-ink);
  }
  .s-suspended {
    opacity: 0.7;
  }
  .more {
    font-size: 13.5px;
    color: var(--link-ink);
  }
  .tiles {
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .tiles span {
    display: grid;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .tiles b {
    font-size: 26px;
    font-weight: 600;
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
  .muted {
    color: var(--text-muted);
  }
</style>
