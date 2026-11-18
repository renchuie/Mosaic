<script lang="ts">
  // Card browser (Nov 19, F1 "Flashcards on par with Anki"): every card in one table, search and
  // filters, a side panel with the card and its numbers, the card's own line editable in place,
  // and bulk suspend / due now / reschedule / forget.
  import Icon from "../../lib/components/Icon.svelte";
  import { cardHtml } from "../../lib/cards";
  import { courses } from "../../lib/stores/courses.svelte";
  import { notes } from "../../lib/stores/notes.svelte";
  import { deckMatcher, decks, getDeck } from "../../lib/stores/decks.svelte";
  import { inScope, parseScope, scopeName } from "../../lib/stores/srs.svelte";
  import {
    allCards, cardLine, clearLeech, ensureIds, fmtInterval, forget, reschedule, saveCardLine, setSuspended, statusOf,
    type CardRef, type Status,
  } from "../../lib/stores/srs.svelte";

  type F = "all" | Status | "due" | "leech";
  let q = $state("");
  // #/study/cards/browse?leech opens on the leeches
  let status = $state<F>(location.hash.endsWith("?leech") ? "leech" : "all");
  let course = $state("");
  // "all" | "notes" | "library" | "deck:<id>"
  let source = $state<string>("all");
  // #/study/cards/browse?scope=<scope>: opened from a deck page
  const scopeParam = /[?&]scope=([^&]+)/.exec(location.hash)?.[1];
  let only = $state(scopeParam ? parseScope(decodeURIComponent(scopeParam)) : null);
  const inOnly = $derived(only ? inScope(only) : null);
  const inDeck = $derived(source.startsWith("deck:") ? deckMatcher(getDeck(source.slice(5))) : null);
  let sort = $state<"due" | "added" | "lapses" | "interval" | "note">("due");
  let shown = $state(150);
  let sel = $state<string | null>(null);
  let picked = $state<Set<string>>(new Set());

  // cards written since the last visit get their ids first (a card without one can't be tracked)
  $effect(() => {
    if (notes.loaded) void ensureIds();
  });
  const refs = $derived(allCards().filter((r) => r.card.lineId));
  const now = Date.now();
  const st = (r: CardRef): Status => statusOf(r.rec);
  const isDue = (r: CardRef) => !!r.rec && !r.rec.suspended && r.rec.due <= Date.now() && r.rec.state !== 0;
  const plain = (md: string) =>
    cardHtml(md)
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  const text = new Map<string, { f: string; b: string }>();
  const txt = (r: CardRef) => {
    let t = text.get(r.card.key);
    if (!t) text.set(r.card.key, (t = { f: plain(r.card.front) || (r.card.masks ? "Image occlusion" : ""), b: plain(r.card.back) }));
    return t;
  };

  const filtered = $derived.by(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const out = refs.filter((r) => {
      if (course && r.course !== course) return false;
      if (source === "notes" && !r.note) return false;
      if (source === "library" && !r.item) return false;
      if (inDeck && !inDeck(r)) return false;
      if (inOnly && !inOnly(r)) return false;
      const s = st(r);
      if (status === "leech" ? !r.rec?.leech : status === "due" ? !isDue(r) : status !== "all" && s !== status) return false;
      if (!words.length) return true;
      const t = txt(r);
      const hay = `${t.f} ${t.b} ${r.title} ${(r.card.context ?? []).join(" ")}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const key: Record<typeof sort, (r: CardRef) => number | string> = {
      due: (r) => (r.rec ? (r.rec.suspended ? 9e15 : r.rec.due) : 8e15),
      added: (r) => -(r.rec?.last_review ?? 0),
      lapses: (r) => -(r.rec?.lapses ?? 0),
      interval: (r) => -(r.rec?.scheduled_days ?? -1),
      note: (r) => `${r.title}\u0000${String(r.card.line).padStart(6, "0")}`,
    };
    const k = key[sort];
    return out.sort((a, b) => {
      const x = k(a);
      const y = k(b);
      return x < y ? -1 : x > y ? 1 : 0;
    });
  });
  const list = $derived(filtered.slice(0, shown));
  const current = $derived(sel ? refs.find((r) => r.card.key === sel) : undefined);

  const dueText = (r: CardRef) => {
    if (!r.rec || r.rec.state === 0) return "New";
    if (r.rec.suspended) return "—";
    const d = r.rec.due - Date.now();
    return d <= 0 ? "Now" : fmtInterval(d);
  };
  const ivl = (r: CardRef) => (r.rec && r.rec.scheduled_days ? fmtInterval(r.rec.scheduled_days * 86_400_000) : "—");
  const STATUS_NAME: Record<Status, string> = { new: "New", learning: "Learning", review: "Review", later: "Later", suspended: "Suspended" };

  // ---- picking rows ----
  function toggle(key: string) {
    const n = new Set(picked);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    picked = n;
  }
  const allPicked = $derived(list.length > 0 && list.every((r) => picked.has(r.card.key)));
  function pickAll() {
    picked = allPicked ? new Set() : new Set(filtered.map((r) => r.card.key));
  }
  const pickedRefs = () => refs.filter((r) => picked.has(r.card.key));
  let msg = $state("");
  function bulk(what: "suspend" | "unsuspend" | "now" | "forget" | number) {
    const rs = pickedRefs();
    for (const r of rs) {
      if (what === "suspend") setSuspended(r.card.key, true);
      else if (what === "unsuspend") setSuspended(r.card.key, false);
      else if (what === "now") reschedule(r.card.key, Date.now());
      else if (what === "forget") forget(r.card.key);
      else reschedule(r.card.key, what);
    }
    const n = rs.length;
    msg = `${n} ${n === 1 ? "card" : "cards"} ${what === "suspend" ? "suspended" : what === "unsuspend" ? "unsuspended" : what === "forget" ? "reset to new" : "rescheduled"}.`;
    sure = false;
    resched = false;
  }
  let sure = $state(false);
  let resched = $state(false);
  let reDate = $state("");
  const inDays = (d: number) => {
    const t = new Date();
    t.setHours(4, 0, 0, 0);
    return t.getTime() + d * 86_400_000;
  };

  // ---- editing the selected card's line ----
  let editing = $state(false);
  let draft = $state("");
  let editErr = $state("");
  const line = $derived(current ? cardLine(current) : null);
  const openNote = $derived(!!current?.note && notes.editing === current.note.rel);
  $effect(() => {
    void sel;
    editing = false;
    editErr = "";
  });
  async function saveEdit() {
    if (!current) return;
    try {
      await saveCardLine(current, draft);
      editing = false;
      editErr = "";
    } catch (e) {
      editErr = String(e instanceof Error ? e.message : e);
    }
  }
  const fmtDate = (ms?: number) => (ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : "—");
</script>

<div class="browser" class:withside={!!current}>
  <header class="top">
    <a class="back" href="#/study/cards" aria-label="Back to Cards"><Icon name="back" size={18} /></a>
    <h1 class="h1">Browse</h1>
    <span class="count">{filtered.length} {filtered.length === 1 ? "card" : "cards"}</span>
    {#if only}<span class="onlychip">{scopeName(only)}<button type="button" aria-label="Show all cards" onclick={() => (only = null)}>×</button></span>{/if}
    <label class="search"><Icon name="search" size={16} /><input bind:value={q} placeholder="Search" aria-label="Search cards" /></label>
  </header>

  <div class="filters">
    <div class="seg" role="radiogroup" aria-label="Status">
      {#each [["all", "All"], ["due", "Due"], ["new", "New"], ["learning", "Learning"], ["review", "Review"], ["suspended", "Suspended"], ["leech", "Leeches"]] as [v, n]}
        <button type="button" role="radio" aria-checked={status === v} class:on={status === v} onclick={() => { status = v as F; shown = 150; }}>{n}</button>
      {/each}
    </div>
    <select class="input sm" bind:value={course} aria-label="Course">
      <option value="">All courses</option>
      {#each courses() as [id, c] (id)}<option value={c.name}>{c.code || c.name}</option>{/each}
    </select>
    <select class="input sm" bind:value={source} aria-label="Source">
      <option value="all">Notes + library</option>
      <option value="notes">Notes</option>
      <option value="library">Library</option>
      {#each decks() as [id, d] (id)}<option value="deck:{id}">{d.name}</option>{/each}
    </select>
    <select class="input sm" bind:value={sort} aria-label="Sort">
      <option value="due">Due first</option>
      <option value="added">Last reviewed</option>
      <option value="lapses">Most lapses</option>
      <option value="interval">Longest interval</option>
      <option value="note">By note</option>
    </select>
  </div>

  {#if picked.size}
    <div class="bulk" role="toolbar" aria-label="Selected cards">
      <b>{picked.size} selected</b>
      <button type="button" class="btn quiet sm" onclick={() => bulk("suspend")}>Suspend</button>
      <button type="button" class="btn quiet sm" onclick={() => bulk("unsuspend")}>Unsuspend</button>
      <button type="button" class="btn quiet sm" onclick={() => bulk("now")}>Due now</button>
      <span class="rwrap">
        <button type="button" class="btn quiet sm" onclick={() => (resched = !resched)}>Reschedule…</button>
        {#if resched}
          <div class="menu pop resched">
            <button type="button" onclick={() => bulk(inDays(1))}>Tomorrow</button>
            <button type="button" onclick={() => bulk(inDays(3))}>In 3 days</button>
            <button type="button" onclick={() => bulk(inDays(7))}>In a week</button>
            <label><input class="input sm" type="date" bind:value={reDate} /><button type="button" disabled={!reDate} onclick={() => bulk(new Date(reDate + "T04:00").getTime())}>Set</button></label>
          </div>
        {/if}
      </span>
      {#if sure}
        <button type="button" class="btn sm danger" onclick={() => bulk("forget")}>Reset {picked.size} to new</button>
        <button type="button" class="btn quiet sm" onclick={() => (sure = false)}>Cancel</button>
      {:else}
        <button type="button" class="btn quiet sm" onclick={() => (sure = true)}>Forget…</button>
      {/if}
      <button type="button" class="clr" onclick={() => (picked = new Set())}>Clear</button>
    </div>
  {/if}
  {#if msg}<p class="msg" role="status">{msg} <button type="button" class="clr" onclick={() => (msg = "")}>×</button></p>{/if}

  <div class="body">
    <div class="table" role="table" aria-label="Cards">
      <div class="tr th" role="row">
        <span class="ck"><input type="checkbox" checked={allPicked} onchange={pickAll} aria-label="Select all" /></span>
        <span>Card</span><span>Answer</span><span>From</span><span>Status</span><span class="r">Due</span><span class="r">Interval</span><span class="r">Lapses</span>
      </div>
      {#each list as r (r.card.key)}
        {@const t = txt(r)}
        {@const s = st(r)}
        <div class="tr" role="row" class:on={sel === r.card.key} class:sus={s === "suspended"} tabindex="0"
          onclick={() => (sel = sel === r.card.key ? null : r.card.key)} onkeydown={(e) => { if (e.key === "Enter") sel = r.card.key; }}>
          <span class="ck"><input type="checkbox" checked={picked.has(r.card.key)} onclick={(e) => e.stopPropagation()} onchange={() => toggle(r.card.key)} aria-label="Select card" /></span>
          <span class="f">{t.f}</span>
          <span class="b">{t.b}</span>
          <span class="src">{r.title}</span>
          <span><i class="chip s-{s}">{STATUS_NAME[s]}</i></span>
          <span class="r">{dueText(r)}</span>
          <span class="r">{ivl(r)}</span>
          <span class="r">{r.rec?.lapses || ""}</span>
        </div>
      {:else}
        <p class="empty">No cards match.</p>
      {/each}
      {#if filtered.length > shown}
        <button type="button" class="more" onclick={() => (shown += 300)}>Show more ({filtered.length - shown})</button>
      {/if}
    </div>

    {#if current}
      {@const r = current}
      {@const s = st(r)}
      <aside class="side" aria-label="Card">
        <div class="sh">
          <span class="where">{(r.card.context ?? []).filter((c) => !c.startsWith("#")).join(" › ") || r.title}</span>
          <button type="button" class="x" aria-label="Close" onclick={() => (sel = null)}>×</button>
        </div>
        <div class="face">{@html cardHtml(r.card.front, r.img)}</div>
        <div class="face ans">{@html cardHtml(r.card.back, r.img)}</div>

        {#if r.note}
          {#if editing}
            <textarea class="input edit" bind:value={draft} rows="3" spellcheck="false"></textarea>
            {#if editErr}<p class="err">{editErr}</p>{/if}
            <div class="row"><button type="button" class="btn primary sm" onclick={saveEdit}>Save</button><button type="button" class="btn quiet sm" onclick={() => (editing = false)}>Cancel</button></div>
          {:else}
            <div class="row">
              {#if line !== null && !openNote && r.card.kind !== "table"}<button type="button" class="btn quiet sm" onclick={() => { draft = line ?? ""; editing = true; }}><Icon name="pen" size={14} /> Edit</button>{/if}
              <a class="btn quiet sm" href={r.href} onclick={() => (notes.jump = { rel: r.note!.rel, line: r.card.line })}>Open note</a>
            </div>
          {/if}
        {:else}
          <div class="row"><a class="btn quiet sm" href={r.href}>Edit in library</a></div>
        {/if}

        <dl class="nums">
          <dt>Status</dt><dd>{STATUS_NAME[s]}</dd>
          <dt>Due</dt><dd>{r.rec && r.rec.state !== 0 ? fmtDate(r.rec.due) : "—"}</dd>
          <dt>Interval</dt><dd>{ivl(r)}</dd>
          <dt>Reviews</dt><dd>{r.rec?.reps ?? 0}</dd>
          <dt>Lapses</dt><dd>{r.rec?.lapses ?? 0}{#if r.rec?.leech} · <b class="lch">Leech</b>{/if}</dd>
          <dt>Last review</dt><dd>{fmtDate(r.rec?.last_review)}</dd>
          <dt>Difficulty</dt><dd>{r.rec && r.rec.state !== 0 ? `${Math.round(r.rec.difficulty * 10)}%` : "—"}</dd>
          <dt>Stability</dt><dd>{r.rec && r.rec.state !== 0 ? fmtInterval(r.rec.stability * 86_400_000) : "—"}</dd>
        </dl>

        <div class="acts">
          <button type="button" class="btn quiet sm" onclick={() => setSuspended(r.card.key, s !== "suspended")}>{s === "suspended" ? "Unsuspend" : "Suspend"}</button>
          {#if r.rec && r.rec.state !== 0}<button type="button" class="btn quiet sm" onclick={() => reschedule(r.card.key, Date.now())}>Due now</button>{/if}
          {#if r.rec}<button type="button" class="btn quiet sm" onclick={() => forget(r.card.key)}>Reset to new</button>{/if}
          {#if r.rec?.leech}<button type="button" class="btn quiet sm" onclick={() => clearLeech(r.card.key)}>Not a leech</button>{/if}
        </div>
      </aside>
    {/if}
  </div>
</div>

<style>
  .onlychip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px 2px 12px;
    border-radius: 999px;
    background: var(--chip);
    font-size: 13px;
    font-weight: 600;
  }
  .onlychip button {
    width: 24px;
    height: 24px;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--text-muted);
    font-size: 16px;
    cursor: pointer;
  }
  .lch {
    color: var(--alert-ink);
  }
  .browser {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
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
  .h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 600;
  }
  .count {
    color: var(--text-muted);
    font-size: 14px;
  }
  .search {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: min(320px, 40vw);
    padding: 0 14px;
    border-radius: 999px;
    background: var(--field);
    color: var(--text-muted);
  }
  .search input {
    flex: 1;
    min-height: 40px;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 14px;
    outline: none;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .seg {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--chip);
  }
  .seg button {
    padding: 6px 12px;
    border: 0;
    border-radius: 999px;
    background: none;
    color: var(--text-muted);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .seg button.on {
    background: var(--surface);
    color: var(--text);
  }
  .input.sm {
    width: auto;
    min-height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: var(--field);
    color: var(--text);
    font: inherit;
    font-size: 13px;
  }
  .bulk,
  .msg {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--accent) 16%, var(--white));
    font-size: 13.5px;
  }
  .msg {
    margin: 0;
    background: var(--sage-soft);
  }
  .clr {
    margin-left: auto;
    border: 0;
    background: none;
    color: var(--text-muted);
    font: inherit;
    cursor: pointer;
  }
  .rwrap {
    position: relative;
  }
  .resched {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 20;
    display: grid;
    gap: 2px;
    min-width: 220px;
    padding: 6px;
    border-radius: 14px;
    box-shadow: var(--shadow-lift);
  }
  .resched > button,
  .resched label button {
    padding: 8px 12px;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    text-align: left;
    cursor: pointer;
  }
  .resched > button:hover {
    background: var(--chip);
  }
  .resched label {
    display: flex;
    gap: 6px;
    padding: 4px;
  }
  .danger {
    background: var(--alert-ink);
    color: var(--white);
  }
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }
  .withside .body {
    grid-template-columns: minmax(0, 1fr) 340px;
  }
  .table {
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  .tr {
    display: grid;
    grid-template-columns: 36px minmax(0, 2fr) minmax(0, 1.4fr) minmax(0, 1fr) 96px 72px 72px 56px;
    gap: 8px;
    align-items: center;
    min-height: 42px;
    padding: 0 12px;
    border-top: 1px solid var(--hairline);
    font-size: 13.5px;
    cursor: pointer;
  }
  .withside .tr {
    grid-template-columns: 36px minmax(0, 2fr) minmax(0, 1.2fr) 96px 64px;
  }
  .withside .tr > :nth-child(4),
  .withside .tr > :nth-child(7),
  .withside .tr > :nth-child(8) {
    display: none;
  }
  .tr:hover {
    background: var(--chip);
  }
  .tr.on {
    background: color-mix(in srgb, var(--accent) 16%, var(--white));
  }
  .tr.sus {
    opacity: 0.55;
  }
  .th {
    border-top: 0;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
    cursor: default;
  }
  .th:hover {
    background: none;
  }
  .tr > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .b,
  .src {
    color: var(--text-muted);
  }
  .r {
    text-align: right;
  }
  .ck {
    display: grid;
    place-items: center;
  }
  .chip {
    display: inline-block;
    padding: 2px 9px;
    border-radius: 999px;
    font-style: normal;
    font-size: 12px;
    font-weight: 600;
    background: var(--chip);
  }
  .s-new {
    background: color-mix(in srgb, var(--lavender) 40%, var(--white));
  }
  .s-learning {
    background: color-mix(in srgb, var(--peach) 45%, var(--white));
  }
  .s-review {
    background: color-mix(in srgb, var(--sage) 40%, var(--white));
  }
  .empty {
    padding: 18px;
    color: var(--text-muted);
  }
  .more {
    width: 100%;
    min-height: 44px;
    border: 0;
    border-top: 1px solid var(--hairline);
    background: none;
    color: var(--text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .side {
    position: sticky;
    top: 12px;
    display: grid;
    gap: 12px;
    padding: 16px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
    max-height: calc(100vh - 140px);
    overflow-y: auto;
  }
  .sh {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  .where {
    flex: 1;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .x {
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 50%;
    background: var(--chip);
    color: var(--text-muted);
    font-size: 17px;
    cursor: pointer;
  }
  .face {
    font-size: 16px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .face.ans {
    padding-top: 10px;
    border-top: 1px solid var(--hairline);
    color: var(--muted-on-tint, var(--text));
  }
  .face :global(img) {
    max-width: 100%;
    border-radius: 10px;
  }
  .row,
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .edit {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border: 0;
    border-radius: 12px;
    background: var(--field);
    color: var(--text);
    font: 13px/1.5 ui-monospace, monospace;
    resize: vertical;
  }
  .err {
    margin: 0;
    color: var(--alert-ink);
    font-size: 13px;
  }
  .nums {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 14px;
    margin: 0;
    padding: 12px;
    border-radius: 14px;
    background: var(--panel);
    font-size: 13px;
  }
  .nums dt {
    color: var(--text-muted);
  }
  .nums dd {
    margin: 0;
    font-weight: 600;
  }
  @media (max-width: 980px) {
    .withside .body {
      grid-template-columns: minmax(0, 1fr);
    }
    .side {
      position: static;
      max-height: none;
    }
    .tr {
      grid-template-columns: 36px minmax(0, 2fr) minmax(0, 1fr) 96px 64px;
    }
    .tr > :nth-child(4),
    .tr > :nth-child(7),
    .tr > :nth-child(8) {
      display: none;
    }
  }
</style>
