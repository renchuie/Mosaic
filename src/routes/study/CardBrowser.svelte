<script lang="ts">
  // Browse (canvas board "Flashcards tab" → "Browse": Anki's card browser, made friendly): one
  // table of every card (library and note cards together), a search box that takes plain words or
  // filters (deck: tag: is: flag: course:), a sidebar to filter by deck, state, flag and tag, a
  // dark bar for what's selected (move, tag, flag, pause, forget, delete), and the card on the
  // right to edit with its numbers. Route #/study/cards/browse[?leech | ?scope=<scope>].
  import Icon from "../../lib/components/Icon.svelte";
  import { cardHtml } from "../../lib/cards";
  import { plainOf } from "../../lib/play";
  import { courses } from "../../lib/stores/courses.svelte";
  import { deckGroups, typeLabel, type DeckRow } from "../../lib/stores/deckTree.svelte";
  import { deckMatcher, decks, getDeck } from "../../lib/stores/decks.svelte";
  import { deleteItem, getItem, getType, saveItem } from "../../lib/stores/library.svelte";
  import { notes } from "../../lib/stores/notes.svelte";
  import {
    allCards, cardLine, clearLeech, ensureIds, flagOf, FLAGS, fmtInterval, forget, inScope, parseScope, reschedule, saveCardLine, scopeKey, scopeName, setFlag, setSuspended, statusOf,
    type CardRef, type FlagId, type Scope,
  } from "../../lib/stores/srs.svelte";

  $effect(() => {
    if (notes.loaded) void ensureIds();
  });
  const refs = $derived(allCards().filter((r) => r.card.lineId));

  // ---- filters: the sidebar picks one per group; the search box adds its own ----
  type State = "new" | "learning" | "due" | "paused" | "leech";
  const scopeParam = /[?&]scope=([^&]+)/.exec(location.hash)?.[1];
  let deckSel = $state<Scope | null>(scopeParam ? parseScope(decodeURIComponent(scopeParam)) : null);
  let stateSel = $state<State | null>(/[?&]leech\b/.test(location.hash) ? "leech" : null);
  let flagSel = $state<FlagId | null>(null);
  let tagSel = $state<string | null>(null);
  let q = $state("");

  const STATES: { id: State; name: string; colour: string }[] = [
    { id: "new", name: "New", colour: "var(--link-ink)" },
    { id: "learning", name: "Learning", colour: "var(--alert-ink)" },
    { id: "due", name: "Due", colour: "var(--go-ink)" },
    { id: "paused", name: "Paused", colour: "color-mix(in srgb, var(--text) 25%, transparent)" },
    { id: "leech", name: "Keeps slipping", colour: "color-mix(in srgb, var(--peach) 70%, var(--alert-ink))" },
  ];
  const isDue = (r: CardRef) => !!r.rec && !r.rec.suspended && r.rec.state !== 0 && r.rec.due <= Date.now();
  const stateMatch = (s: State, r: CardRef) =>
    s === "new" ? statusOf(r.rec) === "new" : s === "learning" ? !!r.rec && (r.rec.state === 1 || r.rec.state === 3) && !r.rec.suspended : s === "due" ? isDue(r) : s === "paused" ? !!r.rec?.suspended : !!r.rec?.leech;
  const tagsOf = (r: CardRef): string[] => (r.note ? r.note.p.tags : (r.card.context ?? []).filter((t) => t.startsWith("#")).map((t) => t.slice(1)));

  /** the search box: plain words, plus deck:"Name" tag:x is:due flag:rose course:Law */
  const parsed = $derived.by(() => {
    const out: { words: string[]; tests: ((r: CardRef) => boolean)[] } = { words: [], tests: [] };
    for (const m of q.matchAll(/(\w+):(?:"([^"]*)"|(\S+))|"([^"]+)"|(\S+)/g)) {
      const [, key, qv, v, phrase, word] = m;
      const val = (qv ?? v ?? "").toLowerCase();
      if (key === "deck") {
        const hit = decks().find(([, d]) => d.name.toLowerCase() === val) ?? decks().find(([, d]) => d.name.toLowerCase().includes(val));
        out.tests.push(hit ? deckMatcher(hit[1], hit[0]) : () => false);
      } else if (key === "tag") out.tests.push((r) => tagsOf(r).some((t) => t.toLowerCase() === val));
      else if (key === "flag") out.tests.push((r) => flagOf(r.card.key) === val);
      else if (key === "course") out.tests.push((r) => !!r.course && (r.course.toLowerCase().includes(val) || (courses().find(([, c]) => c.name === r.course)?.[1].code ?? "").toLowerCase() === val));
      else if (key === "is") {
        const s = ({ new: "new", learning: "learning", due: "due", paused: "paused", suspended: "paused", leech: "leech", slipping: "leech" } as Record<string, State>)[val];
        if (s) out.tests.push((r) => stateMatch(s, r));
        else if (val === "flagged") out.tests.push((r) => !!flagOf(r.card.key));
      } else if (key) out.words.push(`${key}:${val}`);
      else out.words.push((phrase ?? word ?? "").toLowerCase());
    }
    return out;
  });

  const text = new Map<string, { f: string; b: string }>();
  const txt = (r: CardRef) => {
    let t = text.get(r.card.key);
    if (!t) text.set(r.card.key, (t = { f: plainOf(r.card.front) || (r.card.masks ? "Image occlusion" : r.title), b: plainOf(r.card.back) }));
    return t;
  };
  const deckName = (r: CardRef) => (r.item ? (r.item.deck && getDeck(r.item.deck)?.name) || "Library" : r.title);

  // ---- sorting: click a column ----
  type Col = "front" | "deck" | "type" | "due" | "ivl" | "missed";
  let sortBy = $state<Col>("due");
  let asc = $state(true);
  function sortOn(c: Col) {
    if (sortBy === c) asc = !asc;
    else {
      sortBy = c;
      asc = c !== "missed" && c !== "ivl";
    }
  }
  const SORT: Record<Col, (r: CardRef) => number | string> = {
    front: (r) => txt(r).f.toLowerCase(),
    deck: (r) => deckName(r).toLowerCase(),
    type: (r) => typeLabel(r),
    due: (r) => (r.rec && r.rec.state !== 0 ? (r.rec.suspended ? 9e15 : r.rec.due) : 8e15),
    ivl: (r) => r.rec?.scheduled_days ?? -1,
    missed: (r) => r.rec?.lapses ?? 0,
  };

  const filtered = $derived.by(() => {
    const inDeck = deckSel ? inScope(deckSel) : null;
    const { words, tests } = parsed;
    const out = refs.filter((r) => {
      if (inDeck && !inDeck(r)) return false;
      if (stateSel && !stateMatch(stateSel, r)) return false;
      if (flagSel && flagOf(r.card.key) !== flagSel) return false;
      if (tagSel && !tagsOf(r).includes(tagSel)) return false;
      if (!tests.every((t) => t(r))) return false;
      if (!words.length) return true;
      const t = txt(r);
      const hay = `${t.f} ${t.b} ${r.title} ${(r.card.context ?? []).join(" ")}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const k = SORT[sortBy];
    const dir = asc ? 1 : -1;
    return out.sort((a, b) => {
      const x = k(a), y = k(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  });
  let shown = $state(150);
  const list = $derived(filtered.slice(0, shown));

  // ---- the sidebar's lists ----
  const flat = (rows: DeckRow[], depth = 0): { r: DeckRow; depth: number }[] => rows.flatMap((r) => [{ r, depth }, ...flat(r.kids, depth + 1)]);
  const deckList = $derived(flat(deckGroups().filter((g) => g.title !== "Filtered").flatMap((g) => g.rows)));
  const tagList = $derived.by(() => {
    const n = new Map<string, number>();
    for (const r of refs) for (const t of tagsOf(r)) n.set(t, (n.get(t) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([t]) => t);
  });

  // ---- picking rows (Shift-click picks a range) ----
  let picked = $state<Set<string>>(new Set());
  let lastIdx = -1;
  function pick(i: number, e: MouseEvent) {
    const key = list[i].card.key;
    const n = new Set(picked);
    if (e.shiftKey && lastIdx >= 0) {
      const [a, b] = [Math.min(lastIdx, i), Math.max(lastIdx, i)];
      for (let k = a; k <= b; k++) n.add(list[k].card.key);
    } else if (n.has(key)) n.delete(key);
    else n.add(key);
    lastIdx = i;
    picked = n;
  }
  const allPicked = $derived(list.length > 0 && list.every((r) => picked.has(r.card.key)));
  const pickAll = () => (picked = allPicked ? new Set() : new Set(filtered.map((r) => r.card.key)));
  const pickedRefs = () => refs.filter((r) => picked.has(r.card.key));
  const pickedLib = $derived(refs.filter((r) => picked.has(r.card.key) && r.item));
  const anyPaused = $derived(refs.some((r) => picked.has(r.card.key) && r.rec?.suspended));

  let msg = $state("");
  let pop = $state<"" | "move" | "tag" | "flag" | "forget" | "delete" | "resched">("");
  let tagDraft = $state("");
  let reDate = $state("");
  const done = (n: number, what: string) => {
    msg = `${n} ${n === 1 ? "card" : "cards"} ${what}.`;
    pop = "";
  };
  const items = () => [...new Set(pickedLib.map((r) => r.item!.id))];
  function moveTo(deck: string) {
    for (const id of items()) {
      const it = getItem(id);
      if (it) saveItem(id, { ...it, deck: deck || undefined });
    }
    done(pickedLib.length, deck ? `moved to ${getDeck(deck)?.name}` : "taken out of their deck");
  }
  function addTag() {
    const t = tagDraft.trim().replace(/^#/, "").replace(/\s+/g, "-");
    if (!t) return;
    for (const id of items()) {
      const it = getItem(id);
      if (it && !(it.tags ?? []).includes(t)) saveItem(id, { ...it, tags: [...(it.tags ?? []), t] });
    }
    tagDraft = "";
    done(pickedLib.length, `tagged #${t}`);
  }
  function flagAll(c: FlagId | null) {
    const rs = pickedRefs();
    for (const r of rs) setFlag(r.card.key, c);
    done(rs.length, c ? "flagged" : "unflagged");
  }
  function pause(on: boolean) {
    const rs = pickedRefs();
    for (const r of rs) setSuspended(r.card.key, on);
    done(rs.length, on ? "paused" : "unpaused");
  }
  function forgetAll() {
    const rs = pickedRefs();
    for (const r of rs) forget(r.card.key);
    done(rs.length, "reset to new");
  }
  function deleteAll() {
    const ids = items();
    for (const id of ids) deleteItem(id);
    picked = new Set();
    done(ids.length, "deleted");
  }
  function resched(when: number) {
    const rs = pickedRefs();
    for (const r of rs) reschedule(r.card.key, when);
    done(rs.length, "rescheduled");
  }
  const inDays = (d: number) => {
    const t = new Date();
    t.setHours(4, 0, 0, 0);
    return t.getTime() + d * 86_400_000;
  };

  // ---- the card on the right ----
  let sel = $state<string | null>(null);
  const current = $derived(sel ? refs.find((r) => r.card.key === sel) : undefined);
  const item = $derived(current?.item ? getItem(current.item.id) : undefined);
  const itype = $derived(item ? getType(item.type) : undefined);
  let fields = $state<Record<string, string>>({});
  let editing = $state(false);
  let draft = $state("");
  let editErr = $state("");
  let flagOpen = $state(false);
  $effect(() => {
    void sel;
    fields = item ? { ...item.fields } : {};
    editing = false;
    editErr = "";
    flagOpen = false;
  });
  const fieldsDirty = $derived(!!item && Object.keys(fields).some((k) => (fields[k] ?? "") !== (item.fields[k] ?? "")));
  function saveFields() {
    if (!current?.item || !item) return;
    saveItem(current.item.id, { ...item, fields: { ...fields } });
  }
  const line = $derived(current ? cardLine(current) : null);
  async function saveLine() {
    if (!current) return;
    try {
      await saveCardLine(current, draft);
      editing = false;
    } catch (e) {
      editErr = String(e instanceof Error ? e.message : e);
    }
  }
  const fmtDate = (ms?: number) => (ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric" }) : "—");
  const dueText = (r: CardRef) => {
    if (!r.rec || r.rec.state === 0) return "new";
    if (r.rec.suspended) return "—";
    const d = new Date(r.rec.due);
    if (r.rec.due <= Date.now() || d.toDateString() === new Date().toDateString()) return "today";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const ivl = (r: CardRef) => (!r.rec || r.rec.state === 0 ? "—" : r.rec.state === 1 || r.rec.state === 3 ? fmtInterval(Math.max(60000, r.rec.due - (r.rec.last_review ?? r.rec.due))) : fmtInterval(r.rec.scheduled_days * 86_400_000));
  const remembered = (r: CardRef) => (r.rec && r.rec.reps ? Math.round(((r.rec.reps - r.rec.lapses) / r.rec.reps) * 100) : null);
  const flagColour = (c?: FlagId) => FLAGS.find((f) => f.id === c)?.colour;
  const side = (k: string) => (deckSel ? scopeKey(deckSel) === k : false);
</script>

<div class="bwrap">
  <div class="search">
    <Icon name="search" size={16} />
    {#if deckSel}<span class="tok">{scopeName(deckSel)}<button type="button" aria-label="Show every deck" onclick={() => (deckSel = null)}>×</button></span>{/if}
    <input bind:value={q} placeholder="Search" aria-label="Search cards" />
    <span class="hint">deck: tag: is:due flag: course:</span>
  </div>

  <div class="browse" class:withside={!!current}>
    <nav class="tree" aria-label="Filters">
      <div class="h">Decks</div>
      {#each deckList as { r, depth } (r.key)}
        <button type="button" class="t" class:on={side(r.key)} style="--d: {depth}" onclick={() => (deckSel = side(r.key) ? null : r.scope)}>
          <Icon name={r.icon} size={14} /><span class="tn">{r.name}</span>
        </button>
      {/each}
      <div class="h">State</div>
      {#each STATES as s (s.id)}
        <button type="button" class="t" class:on={stateSel === s.id} onclick={() => (stateSel = stateSel === s.id ? null : s.id)}><span class="dot" style="background: {s.colour}"></span>{s.name}</button>
      {/each}
      <div class="h">Flags</div>
      {#each FLAGS as f (f.id)}
        <button type="button" class="t" class:on={flagSel === f.id} onclick={() => (flagSel = flagSel === f.id ? null : f.id)}><span class="flag" style="background: {f.colour}"></span>{f.name}</button>
      {/each}
      {#if tagList.length}
        <div class="h">Tags</div>
        {#each tagList as t (t)}<button type="button" class="t" class:on={tagSel === t} onclick={() => (tagSel = tagSel === t ? null : t)}>#{t}</button>{/each}
      {/if}
    </nav>

    <div class="mid">
      {#if picked.size}
        <div class="bulk" role="toolbar" aria-label="Selected cards">
          <b>{picked.size} selected</b>
          {#if pickedLib.length}
            <span class="pw"><button type="button" onclick={() => (pop = pop === "move" ? "" : "move")}>Move to deck…</button>
              {#if pop === "move"}<div class="pop menu">{#each decks() as [id, d] (id)}<button type="button" onclick={() => moveTo(id)}>{d.name}</button>{/each}<button type="button" onclick={() => moveTo("")}>No deck</button></div>{/if}</span>
            <span class="pw"><button type="button" onclick={() => (pop = pop === "tag" ? "" : "tag")}>Add tag</button>
              {#if pop === "tag"}<div class="pop menu"><input class="input sm" bind:value={tagDraft} placeholder="tag" aria-label="Tag" onkeydown={(e) => e.key === "Enter" && addTag()} /><button type="button" onclick={addTag}>Add</button></div>{/if}</span>
          {/if}
          <span class="pw"><button type="button" onclick={() => (pop = pop === "flag" ? "" : "flag")}><Icon name="i:flag" size={13} /> Flag</button>
            {#if pop === "flag"}<div class="pop menu">{#each FLAGS as f (f.id)}<button type="button" onclick={() => flagAll(f.id)}><span class="flag" style="background: {f.colour}"></span>{f.name}</button>{/each}<button type="button" onclick={() => flagAll(null)}>No flag</button></div>{/if}</span>
          <button type="button" onclick={() => pause(true)}>Pause</button>
          {#if anyPaused}<button type="button" onclick={() => pause(false)}>Unpause</button>{/if}
          <span class="pw"><button type="button" onclick={() => (pop = pop === "resched" ? "" : "resched")}>Reschedule…</button>
            {#if pop === "resched"}<div class="pop menu">
              <button type="button" onclick={() => resched(Date.now())}>Due now</button>
              <button type="button" onclick={() => resched(inDays(1))}>Tomorrow</button>
              <button type="button" onclick={() => resched(inDays(3))}>In 3 days</button>
              <button type="button" onclick={() => resched(inDays(7))}>In a week</button>
              <label class="dt"><input class="input sm" type="date" bind:value={reDate} aria-label="Date" /><button type="button" disabled={!reDate} onclick={() => resched(new Date(reDate + "T04:00").getTime())}>Set</button></label>
            </div>{/if}</span>
          {#if pop === "forget"}<button type="button" class="warn" onclick={forgetAll}>Reset {picked.size} to new?</button>
          {:else}<button type="button" onclick={() => (pop = "forget")}>Forget (make new)</button>{/if}
          {#if pickedLib.length}
            {#if pop === "delete"}<button type="button" class="warn" onclick={deleteAll}>Delete {items().length}?</button>
            {:else}<button type="button" onclick={() => (pop = "delete")}>Delete</button>{/if}
          {/if}
          <span class="grow"></span>
          <button type="button" class="x" aria-label="Clear selection" onclick={() => { picked = new Set(); pop = ""; }}>×</button>
        </div>
      {/if}
      {#if msg}<p class="msg" role="status">{msg}<button type="button" aria-label="Dismiss" onclick={() => (msg = "")}>×</button></p>{/if}

      <div class="tblwrap">
        <table class="tbl">
          <thead>
            <tr>
              <th class="ckc"><input type="checkbox" checked={allPicked} onchange={pickAll} aria-label="Select all" /></th>
              {#each [["front", "Front"], ["deck", "Deck"], ["type", "Type"], ["due", "Due"], ["ivl", "Interval"], ["missed", "Missed"]] as [c, n]}
                <th aria-sort={sortBy === c ? (asc ? "ascending" : "descending") : undefined}><button type="button" onclick={() => sortOn(c as Col)}>{n}{#if sortBy === c}<span class="ar">{asc ? "↑" : "↓"}</span>{/if}</button></th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each list as r, i (r.card.key)}
              {@const fl = flagOf(r.card.key)}
              <tr class:chk={picked.has(r.card.key)} class:on={sel === r.card.key} class:sus={!!r.rec?.suspended} onclick={() => (sel = sel === r.card.key ? null : r.card.key)}>
                <td class="ckc"><input type="checkbox" checked={picked.has(r.card.key)} onclick={(e) => { e.stopPropagation(); pick(i, e); }} aria-label="Select card" /></td>
                <td class="w">{txt(r).f}{#if fl}<span class="flag" style="background: {flagColour(fl)}"></span>{/if}{#if r.rec?.leech}<span class="slip" title="Keeps slipping"></span>{/if}</td>
                <td class="dk">{deckName(r)}</td>
                <td>{typeLabel(r)}</td>
                <td>{dueText(r)}</td>
                <td>{ivl(r)}</td>
                <td class="num">{r.rec ? r.rec.lapses : "—"}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if !filtered.length}<p class="empty">No cards match.</p>{/if}
      </div>
      <div class="under">
        <span class="small muted">{filtered.length} {filtered.length === 1 ? "card" : "cards"}</span>
        {#if filtered.length > shown}<button type="button" class="btn sm" onclick={() => (shown += 300)}>Show more</button>{/if}
      </div>
    </div>

    {#if current}
      {@const r = current}
      {@const fl = flagOf(r.card.key)}
      <aside class="card ed" aria-label="Card">
        <div class="eh">
          <h3>{txt(r).f}</h3>
          <span class="pw">
            <button type="button" class="btn sm ib" class:flagged={!!fl} style={fl ? `--fc: ${flagColour(fl)}` : ""} title="Flag" aria-label="Flag" onclick={() => (flagOpen = !flagOpen)}><Icon name="i:flag" size={14} /></button>
            {#if flagOpen}<div class="pop menu right">{#each FLAGS as f (f.id)}<button type="button" onclick={() => { setFlag(r.card.key, f.id); flagOpen = false; }}><span class="flag" style="background: {f.colour}"></span>{f.name}</button>{/each}<button type="button" onclick={() => { setFlag(r.card.key, null); flagOpen = false; }}>No flag</button></div>{/if}
          </span>
          <button type="button" class="btn sm" onclick={() => setSuspended(r.card.key, !r.rec?.suspended)}>{r.rec?.suspended ? "Unpause" : "Pause"}</button>
          <button type="button" class="x" aria-label="Close" onclick={() => (sel = null)}>×</button>
        </div>

        {#if item && itype && itype.kind !== "occlusion"}
          {#each itype.fields as f (f)}
            <label class="field"><span class="lb">{f}</span><textarea class="box" rows="2" bind:value={fields[f]}></textarea></label>
          {/each}
          {#if fieldsDirty}<button type="button" class="btn dark sm save" onclick={saveFields}>Save</button>{/if}
        {:else}
          <div class="field"><span class="lb">Front</span><div class="box ro">{@html cardHtml(r.card.front, r.img)}</div></div>
          <div class="field"><span class="lb">Back</span><div class="box ro">{@html cardHtml(r.card.back, r.img)}</div></div>
          {#if r.note}
            {#if editing}
              <textarea class="box" rows="2" bind:value={draft} aria-label="Card line"></textarea>
              {#if editErr}<p class="err">{editErr}</p>{/if}
              <div class="row"><button type="button" class="btn dark sm" onclick={saveLine}>Save</button><button type="button" class="btn sm" onclick={() => (editing = false)}>Cancel</button></div>
            {:else if line !== null && r.card.kind !== "table" && notes.editing !== r.note.rel}
              <button type="button" class="btn sm" onclick={() => { draft = line ?? ""; editing = true; }}><Icon name="pen" size={13} /> Edit line</button>
            {/if}
          {/if}
        {/if}

        <dl class="kv">
          <dt>Deck</dt><dd>{deckName(r)}</dd>
          <dt>Added</dt><dd>{item ? fmtDate(item.created) : r.rec?.born ? fmtDate(r.rec.born) : "—"}</dd>
          <dt>Reviews</dt><dd>{r.rec?.reps ?? 0}{#if remembered(r) !== null} · remembered {remembered(r)}%{/if}</dd>
          <dt>Memory</dt><dd>{r.rec && r.rec.state !== 0 ? `stability ${fmtInterval(r.rec.stability * 86_400_000)}` : "new"}</dd>
          <dt>Next</dt><dd>{r.rec && r.rec.state !== 0 && !r.rec.suspended ? fmtDate(r.rec.due) : "—"}</dd>
          {#if r.rec?.leech}<dt>Note</dt><dd class="slipt">Keeps slipping</dd>{/if}
        </dl>
        <div class="row">
          {#if r.rec && r.rec.state !== 0}<button type="button" class="btn sm" onclick={() => reschedule(r.card.key, Date.now())}>Due now</button>{/if}
          {#if r.rec}<button type="button" class="btn sm" onclick={() => forget(r.card.key)}>Forget</button>{/if}
          {#if r.rec?.leech}<button type="button" class="btn sm" onclick={() => clearLeech(r.card.key)}>Not slipping</button>{/if}
        </div>
        {#if r.note}<a class="small link" href={r.href} onclick={() => (notes.jump = { rel: r.note!.rel, line: r.card.line })}>Edit in {r.title} ↗</a>{/if}
      </aside>
    {/if}
  </div>
</div>

<style>
  .bwrap {
    display: grid;
    gap: 14px;
    container-type: inline-size;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 46px;
    padding: 0 14px;
    border-radius: 16px;
    background: var(--surface-float, var(--surface));
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--text) 8%, transparent);
    color: var(--text-muted);
  }
  .search:focus-within {
    box-shadow: inset 0 0 0 2px var(--lavender);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 14.5px;
    outline: none;
  }
  .hint {
    font-size: 12.5px;
    white-space: nowrap;
  }
  .tok {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 1px 3px 1px 9px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--lavender) 30%, var(--white));
    color: color-mix(in srgb, var(--lavender) 30%, var(--text));
    font-size: 13.5px;
    white-space: nowrap;
  }
  .tok button {
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
  }
  .browse {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }
  .browse.withside {
    grid-template-columns: 200px minmax(0, 1fr) 300px;
  }
  @container (max-width: 1100px) {
    .browse.withside {
      grid-template-columns: minmax(0, 1fr) 300px;
    }
    .browse.withside .tree {
      display: none;
    }
  }
  @container (max-width: 760px) {
    .browse,
    .browse.withside {
      grid-template-columns: minmax(0, 1fr);
    }
    .tree {
      display: none;
    }
  }
  /* sidebar */
  .tree {
    display: grid;
    gap: 1px;
    padding: 12px;
    border-radius: 22px;
    background: var(--surface);
    box-shadow: var(--shadow);
    font-size: 14px;
  }
  .tree .h {
    padding: 10px 9px 4px;
    font-size: 11.5px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
  }
  .tree .h:first-child {
    padding-top: 2px;
  }
  .tree .t {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 0 9px 0 calc(9px + var(--d, 0) * 16px);
    border: 0;
    border-radius: 11px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
  }
  .tree .t:hover {
    background: color-mix(in srgb, var(--text) 5%, transparent);
  }
  .tree .t.on {
    background: var(--primary, var(--charcoal));
    color: var(--on-primary, var(--white));
  }
  .tn {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .flag {
    flex: none;
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  td .flag {
    margin-left: 8px;
    vertical-align: middle;
  }
  .slip {
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-left: 6px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--peach) 70%, var(--alert-ink));
    vertical-align: middle;
  }
  /* middle */
  .mid {
    display: grid;
    gap: 10px;
    min-width: 0;
  }
  .bulk {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 16px;
    background: var(--primary, var(--charcoal));
    color: var(--on-primary, var(--white));
    font-size: 13.5px;
  }
  .bulk > button,
  .bulk .pw > button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 30px;
    padding: 0 11px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--on-primary, #fff) 13%, transparent);
    color: inherit;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .bulk > button:hover,
  .bulk .pw > button:hover {
    background: color-mix(in srgb, var(--on-primary, #fff) 22%, transparent);
  }
  .bulk .warn {
    background: color-mix(in srgb, var(--rose) 70%, transparent);
    color: var(--ink-on-color, #23263a);
    font-weight: 600;
  }
  .bulk .x {
    background: none;
    font-size: 18px;
  }
  .grow {
    flex: 1;
  }
  .pw {
    position: relative;
  }
  .pop {
    position: absolute;
    z-index: 20;
    top: calc(100% + 6px);
    left: 0;
    display: grid;
    min-width: 170px;
    max-height: 300px;
    overflow-y: auto;
    padding: 6px;
    border-radius: 14px;
    background: var(--surface-float, var(--surface));
    color: var(--text);
    box-shadow: var(--shadow-lift);
  }
  .pop.right {
    left: auto;
    right: 0;
  }
  .pop button {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: 10px;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    text-align: left;
    cursor: pointer;
  }
  .pop button:hover {
    background: var(--chip);
  }
  .pop .dt {
    display: flex;
    gap: 6px;
    padding: 4px;
  }
  .pop .input.sm {
    min-height: 32px;
    padding: 0 10px;
    font-size: 13px;
  }
  .msg {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 8px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--sage) 30%, var(--white));
    font-size: 13.5px;
  }
  .msg button {
    margin-left: auto;
    border: 0;
    background: none;
    color: var(--text-muted);
    font-size: 16px;
    cursor: pointer;
  }
  .tblwrap {
    overflow-x: auto;
    border-radius: 18px;
    background: var(--surface);
    box-shadow: var(--shadow);
  }
  .tbl {
    width: 100%;
    border-collapse: collapse;
    font-size: 13.5px;
  }
  .tbl th {
    padding: 0;
    background: color-mix(in srgb, var(--text) 3%, transparent);
    text-align: left;
  }
  .tbl th button {
    width: 100%;
    padding: 10px 8px;
    border: 0;
    background: none;
    color: var(--text-muted);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    text-align: left;
    cursor: pointer;
    white-space: nowrap;
  }
  .ar {
    margin-left: 4px;
  }
  .tbl td {
    padding: 9px 8px;
    border-top: 1px solid var(--hairline);
    white-space: nowrap;
  }
  .tbl td.w {
    white-space: normal;
    min-width: 200px;
  }
  .tbl td.dk {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tbl tbody tr {
    cursor: pointer;
  }
  .tbl tbody tr:hover td {
    background: color-mix(in srgb, var(--text) 3%, transparent);
  }
  .tbl tr.chk td,
  .tbl tr.on td {
    background: color-mix(in srgb, var(--lavender) 22%, var(--white));
  }
  .tbl tr.sus td {
    color: var(--text-muted);
  }
  .ckc {
    width: 30px;
    padding-left: 12px !important;
  }
  .ckc input {
    width: 16px;
    height: 16px;
    accent-color: color-mix(in srgb, var(--lavender) 50%, var(--text));
  }
  .num {
    text-align: right;
    padding-right: 14px !important;
  }
  .empty {
    margin: 0;
    padding: 18px;
    color: var(--text-muted);
  }
  .under {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 6px;
  }
  /* the card */
  .ed {
    display: grid;
    gap: 10px;
    align-content: start;
    min-width: 0;
    position: sticky;
    top: 0;
  }
  .eh {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .eh h3 {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .x {
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--text-muted);
    font-size: 18px;
    cursor: pointer;
  }
  .btn.sm {
    min-height: 32px;
    padding: 0 12px;
    font-size: 13px;
  }
  .btn.ib {
    width: 32px;
    padding: 0;
    justify-content: center;
  }
  .btn.flagged {
    color: var(--fc);
  }
  .btn.dark {
    background: var(--primary, var(--charcoal));
    color: var(--on-primary, var(--white));
  }
  .save {
    justify-self: start;
  }
  .field {
    display: grid;
    gap: 5px;
  }
  .lb {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .box {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border: 0;
    border-radius: 14px;
    background: var(--surface-float, var(--surface));
    color: var(--text);
    font: inherit;
    font-size: 15px;
    line-height: 1.45;
    resize: vertical;
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--text) 8%, transparent);
  }
  .box:focus {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--lavender);
  }
  .box.ro :global(p) {
    margin: 0;
  }
  .box.ro :global(ul) {
    margin: 0;
    padding-left: 18px;
  }
  .kv {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 12px;
    margin: 4px 0;
    font-size: 13px;
  }
  .kv dt {
    color: var(--text-muted);
  }
  .kv dd {
    margin: 0;
    font-weight: 600;
  }
  .slipt {
    color: var(--alert-ink);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .err {
    margin: 0;
    font-size: 13px;
    color: var(--alert-ink);
  }
  .link {
    color: var(--link-ink);
    font-weight: 600;
    text-decoration: none;
  }
  .small {
    font-size: 13px;
  }
  .muted {
    color: var(--text-muted);
  }
</style>
