<script lang="ts">
  import LectureMenu from "../../lib/components/LectureMenu.svelte";
  // One deck's page (canvas "Flashcards tab: A + C", boards 2 and 3): the deck tree on the left to
  // hop between decks, then the deck: breadcrumb, header, New / Learning / To review and Study now,
  // "Study a different way" (practice: never changes the schedule), its sub-decks in the home's
  // rows, its cards; beside it the exam ring, the next 7 days and its options.
  import { onDestroy, onMount } from "svelte";
  import Icon from "../../lib/components/Icon.svelte";
  import { cardHtml } from "../../lib/cards";
  import { fromKey, todayKey, addDays, toKey } from "../../lib/calendar";
  import { courseByName } from "../../lib/stores/courses.svelte";
  import { deckGroups, examOf, shortExam, subRows, typeLabel, type DeckRow } from "../../lib/stores/deckTree.svelte";
  import { ancestors, getDeck } from "../../lib/stores/decks.svelte";
  import { noteHref, notes } from "../../lib/stores/notes.svelte";
  import { settings } from "../../lib/stores/settings.svelte";
  import { allCards, counts, ensureIds, fitBeforeExam, fmtInterval, inScope, pace, readiness, scopeKey, scopeName, statusOf, type CardRef, type Scope } from "../../lib/stores/srs.svelte";
  import DeckEditor from "./DeckEditor.svelte";
  import DeckRows from "./DeckRows.svelte";

  let { scope }: { scope: Scope } = $props();
  const enc = (s: string) => encodeURIComponent(s);
  $effect(() => {
    if (notes.loaded) void ensureIds();
  });

  const key = $derived(scopeKey(scope));
  const name = $derived(scopeName(scope));
  const deck = $derived(scope.kind === "deck" ? getDeck(scope.id) : undefined);
  const courseName = $derived(
    scope.kind === "course" ? scope.name : scope.kind === "notes" ? scope.course : deck?.courses?.length === 1 ? deck.courses[0] : scope.kind === "note" ? String(notes.files[scope.rel]?.p.meta.course ?? "") : "",
  );
  const course = $derived(courseName ? courseByName(courseName)?.[1] : undefined);
  const icon = $derived(
    deck?.icon || (scope.kind === "library" ? "book" : scope.kind === "note" ? (notes.files[scope.rel]?.p.meta.icon ? String(notes.files[scope.rel]?.p.meta.icon) : "i:file-text") : scope.kind === "notes" ? "i:notebook-pen" : scope.kind === "filter" ? (scope.id === "leech" ? "i:flag" : scope.id === "missed" ? "i:rotate-ccw" : "i:fast-forward") : course?.icon || "i:layers"),
  );
  const tint = $derived(course?.color ?? (scope.kind === "filter" ? "var(--peach)" : "var(--lavender)"));

  const k = $derived(counts(scope));
  const cards = $derived(allCards().filter((r) => r.card.lineId).filter(inScope(scope)));
  const reviews = $derived(Math.max(0, k.due - k.learning));
  const nextLearn = $derived.by(() => {
    const t = cards.filter((r) => r.rec && (r.rec.state === 1 || r.rec.state === 3) && !r.rec.suspended).map((r) => r.rec!.due);
    return t.length ? Math.min(...t) : null;
  });
  const backIn = (ms: number) => {
    const m = Math.round((ms - Date.now()) / 60000);
    return m <= 0 ? "ready now" : m < 60 ? `back in ${m} min` : `back in ${Math.round(m / 60)} h`;
  };
  const exam = $derived(examOf(scope));
  const ready = $derived(exam ? readiness(cards, exam.date) : null);
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
  let fitted = $state<number | null>(null);

  // breadcrumb: Decks › parents › this
  const crumbs = $derived.by((): { name: string; href: string }[] => {
    if (scope.kind === "deck") return ancestors(scope.id).map(([id, d]) => ({ name: d.name, href: `#/study/cards/deck/${enc(`deck:${id}`)}` }));
    if (scope.kind === "note") {
      const c = String(notes.files[scope.rel]?.p.meta.course ?? "");
      return [{ name: scopeName({ kind: "notes", course: c }), href: `#/study/cards/deck/${enc(`notes:${c}`)}` }];
    }
    return [];
  });
  const subtitle = $derived(
    [`${k.total} ${k.total === 1 ? "card" : "cards"}`, course?.name, exam ? `linked to ${shortExam(exam)}` : ""].filter(Boolean).join(" · "),
  );
  const subs = $derived(subRows(scope));

  // the tree: every deck, this one marked
  const tree = $derived(deckGroups());

  // next 7 days for this deck
  const week = $derived.by(() => {
    const t = todayKey();
    const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(t, i), n: 0 }));
    for (const r of cards) {
      if (!r.rec || r.rec.suspended || r.rec.state === 0) continue;
      const d = toKey(new Date(r.rec.due));
      const i = d <= t ? 0 : days.findIndex((x) => x.date === d);
      if (i >= 0) days[i].n++;
    }
    return days;
  });
  const wmax = $derived(Math.max(1, ...week.map((d) => d.n)));
  const dayName = (k: string, i: number) => (i === 0 ? "Today" : fromKey(k).toLocaleDateString("en-US", { weekday: "short" }));

  // the cards table
  const plain = (md: string) => cardHtml(md).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  const typeOf = typeLabel;
  const backOf = (r: CardRef) => {
    if (r.card.kind === "list") return `${r.card.back.split("\n").filter((l) => /^[-*] /.test(l)).length} items`;
    return plain(r.card.back);
  };
  const STATE = { new: ["New", "n"], learning: ["Learning", "l"], review: ["Review", "r"], later: ["Review", "r"], suspended: ["Paused", "s"] } as const;
  const nextOf = (r: CardRef) => {
    if (!r.rec || r.rec.state === 0 || r.rec.suspended) return "—";
    const ms = r.rec.due - Date.now();
    return ms <= 0 ? "now" : fmtInterval(ms);
  };
  let q = $state("");
  let searching = $state(false);
  const rows = $derived.by(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = words.length ? cards.filter((r) => words.every((w) => `${plain(r.card.front)} ${plain(r.card.back)}`.toLowerCase().includes(w))) : cards;
    return [...list].sort((a, b) => (a.rec?.due ?? Infinity) - (b.rec?.due ?? Infinity)).slice(0, 40);
  });

  // "Study a different way" (practice; only Review changes the schedule)
  const missed = $derived(counts({ kind: "filter", id: "missed", in: scope }).total);
  const ahead = $derived(counts({ kind: "filter", id: "ahead", in: scope }).total);

  let editOpen = $state(false);
  let editId = $state<string | null>(null);
  let subParent = $state<string | null>(null);
  const options = (id: string) => {
    editId = id;
    subParent = null;
    editOpen = true;
  };
  const addSub = () => {
    if (scope.kind !== "deck") return;
    editId = null;
    subParent = scope.id;
    editOpen = true;
  };

  function onKey(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable], dialog")) return;
    if (e.key === " " && k.due + k.newToday) {
      e.preventDefault();
      location.hash = `#/study/cards/review/${enc(key)}`;
    }
  }
  onMount(() => window.addEventListener("keydown", onKey));
  onDestroy(() => window.removeEventListener("keydown", onKey));
</script>

<DeckEditor bind:open={editOpen} id={editId} parent={subParent} />

{#snippet treeRow(r: DeckRow, depth: number)}
  {@const n = r.k.due + r.k.newToday}
  <a class="t" class:on={r.key === key} style="--depth: {depth}" href="#/study/cards/deck/{enc(r.key)}" aria-current={r.key === key ? "page" : undefined}>
    <Icon name={r.icon} size={15} /><span class="tn">{r.name}</span>{#if n}<span class="ct">{n}</span>{/if}
  </a>
  {#each r.kids as kid (kid.key)}{@render treeRow(kid, depth + 1)}{/each}
{/snippet}

<div class="dwrap"><div class="deckpage" style="--tint: {tint}">
  <nav class="tree" aria-label="Decks">
    <a class="t dim" href="#/study/cards"><Icon name="back" size={14} /> All decks</a>
    {#each tree as g (g.title)}
      <div class="h">{g.title}</div>
      {#each g.rows as r (r.key)}{@render treeRow(r, 0)}{/each}
    {/each}
  </nav>

  <div class="dpage">
    <div class="bc"><a href="#/study/cards">Decks</a>{#each crumbs as c}<span>›</span><a href={c.href}>{c.name}</a>{/each}<span>›</span><b>{name}</b></div>
    <div class="dhead">
      <span class="ic"><Icon name={icon} size={24} /></span>
      <div class="ttl"><h2>{name}</h2><span class="small muted">{subtitle}</span></div>
      <span class="grow"></span>
      {#if scope.kind === "deck" && deck?.courses?.length === 1}<LectureMenu link={{ kind: "deck", ref: scope.id }} course={deck.courses[0]} />{/if}
      {#if scope.kind === "deck"}<button type="button" class="btn" onclick={() => options(scope.id)}><Icon name="i:settings" size={15} /> Options</button>{/if}
      {#if scope.kind === "note"}<a class="btn" href={noteHref(scope.rel)}><Icon name="i:file-text" size={15} /> Open note</a>{/if}
      {#if scope.kind === "deck" && subs.length}
        <button type="button" class="btn" onclick={addSub}><Icon name="i:plus" size={15} /> Sub-deck</button>
      {:else}
        <a class="btn dark" href={scope.kind === "deck" ? `#/study/cards/add?deck=${enc(scope.id)}` : "#/study/cards/add"}><Icon name="i:plus" size={15} /> Add card</a>
      {/if}
    </div>

    <div class="counts">
      <div class="cbox"><span class="small muted">New</span><b class="n new" class:zero={!k.newToday}>{k.newToday}</b><span class="small muted">of {k.new} waiting</span></div>
      <div class="cbox"><span class="small muted">Learning</span><b class="n learn" class:zero={!k.learning}>{k.learning}</b><span class="small muted">{nextLearn ? backIn(nextLearn) : "none"}</span></div>
      <div class="cbox"><span class="small muted">To review</span><b class="n due" class:zero={!reviews}>{reviews}</b><span class="small muted">{reviews ? `~${Math.max(1, Math.round((reviews * pace()) / 60))} min` : "none"}</span></div>
      {#if k.due + k.newToday}
        <a class="cbox go" href="#/study/cards/review/{enc(key)}"><span class="t"><span class="pi"><Icon name="play" size={17} /></span>{subs.length ? `Study all of ${name}` : "Study now"}</span><span class="small">{k.due + k.newToday} cards · Space</span></a>
      {:else}
        <div class="cbox go off"><span class="t">All caught up</span><span class="small">{k.total ? "Nothing due" : "No cards yet"}</span></div>
      {/if}
    </div>

    {#if k.total}
      <section class="card ways">
        <div class="wh"><h3>Study a different way</h3><span class="small muted">doesn't change the schedule</span></div>
        <div class="chips">
          <a href="#/study/cards/cram/{enc(key)}"><Icon name="i:zap" size={15} /> {exam ? `Cram before ${shortExam(exam)}` : "Cram"}</a>
          {#if missed}<a href="#/study/cards/cram/{enc(`filter:missed|${key}`)}"><Icon name="i:rotate-ccw" size={15} /> Only cards I missed</a>{/if}
          {#if ahead}<a href="#/study/cards/cram/{enc(`filter:ahead|${key}`)}"><Icon name="i:fast-forward" size={15} /> Review ahead 2 days</a>{/if}
          <a href="#/study/cards/play/type/{enc(key)}"><Icon name="i:keyboard" size={15} /> Type the answers</a>
          <a href="#/study/cards/play/test/{enc(key)}"><Icon name="i:list-checks" size={15} /> Practice test</a>
          <a href="#/study/cards/play/match/{enc(key)}"><Icon name="i:grid-2x2" size={15} /> Match game</a>
        </div>
      </section>
    {/if}

    {#if subs.length}
      <section class="card sublist">
        <DeckRows groups={[{ title: "", rows: subs }]} head={scope.kind === "deck" ? "Sub-decks" : "Notes"} onoptions={(id) => options(id)} />
      </section>
    {/if}

    {#if k.total}
      <section class="card cardsbox">
        <div class="cbar">
          <h3>Cards</h3><span class="small muted">{k.total}</span><span class="grow"></span>
          {#if searching}<input class="input sm" bind:value={q} placeholder="Search" aria-label="Search this deck's cards" />{:else}<button type="button" class="btn sm" onclick={() => (searching = true)}><Icon name="search" size={14} /> Search</button>{/if}
          <a class="btn sm" href="#/study/cards/browse?scope={enc(key)}">Open in Browse</a>
        </div>
        <div class="tscroll">
          <table class="mini">
            <thead><tr><th>Front</th><th>Back</th><th>Type</th><th>State</th><th>Next</th></tr></thead>
            <tbody>
              {#each rows as r (r.card.key)}
                {@const st = STATE[statusOf(r.rec)]}
                <tr>
                  <td class="fr">{plain(r.card.front) || (r.card.masks ? "Image occlusion" : r.title)}</td>
                  <td class="muted bk">{backOf(r)}</td>
                  <td class="small ty">{typeOf(r)}</td>
                  <td><span class="st {st[1]}">{st[0]}</span></td>
                  <td class="nx">{nextOf(r)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if k.total > rows.length && !q}<a class="more" href="#/study/cards/browse?scope={enc(key)}">{k.total - rows.length} more in Browse</a>{/if}
      </section>
    {/if}
  </div>

  <aside class="side">
    {#if exam && ready && ready.total}
      <section class="card">
        <h3>This deck before {shortExam(exam)}</h3>
        <div class="exam">
          <span class="ring" style="--p: {pct(ready.ready, ready.total)}%"><b>{pct(ready.ready, ready.total)}%</b></span>
          <span class="small muted">{ready.ready} of {ready.total} cards ready · {exam.days} {exam.days === 1 ? "day" : "days"} left</span>
        </div>
        {#if ready.late && fitted === null}<button type="button" class="btn sm" onclick={() => (fitted = fitBeforeExam(exam.course, exam.date))}>Fit {ready.late} before the exam</button>{/if}
        {#if fitted !== null}<span class="small ok">Moved {fitted} cards before the exam.</span>{/if}
      </section>
    {/if}
    <section class="card">
      <h3>Next 7 days</h3>
      <div class="bars" role="img" aria-label="Cards due each of the next 7 days">
        {#each week as d, i (d.date)}<i class:t={i === 0} style="height: {Math.max(4, (d.n / wmax) * 100)}%" title="{d.n} due"></i>{/each}
      </div>
      <div class="days">{#each week as d, i (d.date)}<span>{dayName(d.date, i)}</span>{/each}</div>
    </section>
    <section class="card">
      <div class="oh"><h3>Options</h3>{#if scope.kind === "deck"}<button type="button" class="link" onclick={() => options(scope.id)}>Edit</button>{:else}<a class="link" href="#/settings/flashcards">Settings</a>{/if}</div>
      <div class="stat"><span class="muted">New per day</span><b>{deck?.newPerDay ?? settings.newPerDay}</b></div>
      <div class="stat"><span class="muted">Reviews per day</span><b>{deck?.reviewsPerDay ?? settings.reviewsPerDay ?? "No limit"}</b></div>
      <div class="stat"><span class="muted">Retention goal</span><b>{Math.round((settings.retention || 0.9) * 100)}%</b></div>
      {#if scope.kind === "deck" && !subs.length}<button type="button" class="link sub" onclick={addSub}><Icon name="i:plus" size={13} /> Add a sub-deck</button>{/if}
      {#if deck?.exam && exam}<div class="stat"><span class="muted">Linked to</span><b>{shortExam(exam)} · {fromKey(exam.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</b></div>{/if}
    </section>
  </aside>
</div></div>

<style>
  .dwrap {
    container-type: inline-size;
  }
  .deckpage {
    display: grid;
    grid-template-columns: 230px minmax(0, 1fr) 300px;
    gap: 18px;
    align-items: start;
  }
  /* tree */
  .tree {
    display: grid;
    gap: 1px;
    padding: 12px;
    border-radius: 22px;
    background: var(--surface);
    box-shadow: var(--shadow);
    font-size: 14px;
    position: sticky;
    top: 0;
  }
  .tree .t {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 9px 0 calc(9px + var(--depth, 0) * 18px);
    border-radius: 11px;
    color: var(--text);
    text-decoration: none;
  }
  .tree .t:hover {
    background: color-mix(in srgb, var(--text) 5%, transparent);
  }
  .tree .t.on {
    background: var(--primary, var(--charcoal));
    color: var(--on-primary, var(--white));
  }
  .tree .t.dim {
    color: var(--text-muted);
  }
  .tn {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ct {
    margin-left: auto;
    font-size: 12px;
    font-weight: 700;
    color: var(--go-ink);
  }
  .t.on .ct {
    color: inherit;
    opacity: 0.8;
  }
  .tree .h {
    padding: 10px 9px 4px;
    font-size: 11.5px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }
  /* page */
  .dpage {
    display: grid;
    gap: 16px;
    min-width: 0;
  }
  .bc {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 13.5px;
    color: var(--text-muted);
  }
  .bc a {
    color: inherit;
    text-decoration: none;
  }
  .bc a:hover {
    text-decoration: underline;
  }
  .bc b {
    color: var(--text);
  }
  .dhead {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .dhead .ic {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--tint) 35%, var(--white));
    color: var(--text);
  }
  .ttl {
    display: grid;
    min-width: 0;
  }
  .ttl h2 {
    margin: 0;
    font-size: 28px;
    font-weight: 600;
  }
  .grow {
    flex: 1;
  }
  .btn.dark,
  .cbox.go {
    background: var(--primary, var(--charcoal));
    color: var(--on-primary, var(--white));
  }
  .counts {
    display: grid;
    grid-template-columns: repeat(3, 1fr) 1.3fr;
    gap: 12px;
  }
  .cbox {
    display: grid;
    gap: 2px;
    align-content: start;
    padding: 14px 16px;
    border-radius: 20px;
    background: var(--surface);
    box-shadow: var(--shadow);
    text-decoration: none;
    color: var(--text);
  }
  .cbox b {
    font-size: 32px;
    line-height: 1.1;
  }
  .cbox.go {
    align-content: center;
    gap: 8px;
    transition: transform 0.15s var(--spring, ease);
  }
  .cbox.go:hover {
    transform: translateY(-2px);
  }
  .cbox.go.off {
    opacity: 0.55;
  }
  .cbox.go .t {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    line-height: 1.25;
    font-size: 19px;
    font-weight: 700;
  }
  .pi {
    flex: none;
    display: grid;
    place-items: center;
    height: 1.25em;
  }
  .n.zero {
    color: var(--text-muted);
    opacity: 0.45;
  }
  .cbox.go .small {
    opacity: 0.75;
  }
  .n {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .n.new {
    color: var(--link-ink);
  }
  .n.learn {
    color: var(--alert-ink);
  }
  .n.due {
    color: var(--go-ink);
  }
  h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }
  .card {
    display: grid;
    gap: 10px;
  }
  .wh,
  .oh,
  .cbar {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .oh {
    justify-content: space-between;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chips a {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 38px;
    padding: 0 14px;
    border-radius: 999px;
    background: var(--chip);
    color: var(--text);
    font-size: 13.5px;
    font-weight: 500;
    text-decoration: none;
  }
  .chips a:hover {
    background: color-mix(in srgb, var(--lavender) 30%, var(--chip));
  }
  .sublist {
    padding: 12px 10px;
  }
  .cardsbox {
    padding: 10px 12px;
  }
  .cbar {
    padding: 2px 6px 6px;
  }
  .btn.sm {
    min-height: 32px;
    padding: 0 12px;
    font-size: 13px;
  }
  .input.sm {
    width: 200px;
    min-height: 32px;
    padding: 0 12px;
    font-size: 13.5px;
  }
  .tscroll {
    overflow-x: auto;
  }
  .mini {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  .mini th {
    padding: 6px 10px;
    text-align: left;
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }
  .mini td {
    padding: 9px 10px;
    border-top: 1px solid var(--hairline);
    vertical-align: top;
  }
  .fr {
    max-width: 260px;
  }
  .bk {
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ty,
  .nx {
    white-space: nowrap;
  }
  .st {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }
  .st.n {
    background: color-mix(in srgb, var(--periwinkle) 25%, var(--white));
    color: var(--link-ink);
  }
  .st.l {
    background: color-mix(in srgb, var(--rose) 30%, var(--white));
    color: var(--alert-ink);
  }
  .st.r {
    background: color-mix(in srgb, var(--sage) 35%, var(--white));
    color: var(--go-ink);
  }
  .st.s {
    background: var(--chip);
    color: var(--text-muted);
  }
  .more {
    padding: 4px 8px;
    font-size: 13.5px;
    color: var(--link-ink);
  }
  /* side */
  .side {
    display: grid;
    gap: 14px;
    min-width: 0;
  }
  .exam {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: center;
  }
  .ring {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: conic-gradient(var(--sage-deep) 0 var(--p), color-mix(in srgb, var(--text) 8%, transparent) 0);
  }
  .ring b {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--surface-float, var(--surface));
    font-size: 14px;
  }
  .bars {
    display: flex;
    align-items: flex-end;
    gap: 7px;
    height: 84px;
    padding-top: 6px;
  }
  .bars i {
    flex: 1;
    border-radius: 6px 6px 3px 3px;
    background: linear-gradient(180deg, color-mix(in srgb, var(--lavender) 80%, var(--white)), var(--periwinkle));
  }
  .bars i.t {
    background: linear-gradient(180deg, var(--sage), var(--sage-deep));
  }
  .days {
    display: flex;
    gap: 7px;
    font-size: 11px;
    color: var(--text-muted);
  }
  .days span {
    flex: 1;
    text-align: center;
  }
  .stat {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 14px;
    padding: 2px 0;
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--link-ink);
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
  }
  .link.sub {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    justify-self: start;
  }
  .ok {
    color: var(--go-ink);
    font-weight: 600;
  }
  .muted {
    color: var(--text-muted);
  }
  .small {
    font-size: 13px;
  }
  /* narrow windows: the side column drops under the page, then the tree goes (the breadcrumb stays) */
  @container (max-width: 1180px) {
    .deckpage {
      grid-template-columns: 210px minmax(0, 1fr);
    }
    .side {
      grid-column: 2;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }
  }
  @container (max-width: 820px) {
    .deckpage {
      grid-template-columns: minmax(0, 1fr);
    }
    .tree {
      display: none;
    }
    .side {
      grid-column: 1;
    }
    .counts {
      grid-template-columns: repeat(3, 1fr);
    }
    .cbox.go {
      grid-column: 1 / -1;
    }
  }
</style>
