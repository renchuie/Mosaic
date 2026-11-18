<script lang="ts">
  // Practice games (her Nov 18 list): Type it, Test (multiple choice) and Match. Practice only:
  // the schedule never changes here. Route #/study/cards/play/<type|test|match>/<scope>.
  import { onDestroy, onMount } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import Icon from "../../lib/components/Icon.svelte";
  import { cardHtml } from "../../lib/cards";
  import { answerOf, check, distractors, normalize, plainOf, shuffle, type Pair, type Verdict } from "../../lib/play";
  import { markStudyDay } from "../../lib/stores/labs.svelte";
  import { notes } from "../../lib/stores/notes.svelte";
  import { allCards, ensureIds, inScope, scopeKey, scopeName, type Scope } from "../../lib/stores/srs.svelte";
  import { get, put } from "../../lib/stores/synced.svelte";

  type Mode = "type" | "test" | "match";
  let { mode, scope }: { mode: Mode; scope: Scope } = $props();
  const enc = (s: string) => encodeURIComponent(s);
  const key = $derived(scopeKey(scope));
  const NAMES: Record<Mode, string> = { type: "Type it", test: "Test", match: "Match" };
  const ROUND = 20;

  let ready = $state(false);
  let pool = $state<Pair[]>([]);
  onMount(async () => {
    for (let i = 0; i < 100 && !notes.loaded; i++) await new Promise((r) => setTimeout(r, 50));
    await ensureIds();
    pool = allCards()
      .filter((r) => r.card.lineId && !r.rec?.suspended)
      .filter(inScope(scope))
      .flatMap((r) => {
        const a = answerOf(r.card);
        return a ? [{ key: r.card.key, q: r.card.front, a, kind: r.card.kind, img: r.img }] : [];
      });
    ready = true;
    start();
    window.addEventListener("keydown", onKey);
  });
  onDestroy(() => {
    window.removeEventListener("keydown", onKey);
    clearInterval(tick);
  });

  // ---- Type it / Test: a queue of up to 20; a miss comes back once at the end ----
  let queue = $state<Pair[]>([]);
  let total = $state(0);
  let firstTry = $state(0);
  let missed = $state<Pair[]>([]);
  let current = $state<Pair | null>(null);
  let typed = $state("");
  let result = $state<{ verdict: Verdict; hit: Set<string> } | null>(null);
  let options = $state<string[]>([]);
  let picked = $state<number | null>(null);
  let finished = $state(false);
  const retried = new SvelteSet<string>();

  function start() {
    finished = false;
    missed = [];
    firstTry = 0;
    answered = 0;
    retried.clear();
    if (mode === "match") return startMatch();
    queue = shuffle(pool).slice(0, ROUND);
    total = queue.length;
    nextCard();
  }
  function nextCard() {
    typed = "";
    result = null;
    picked = null;
    current = queue[0] ?? null;
    if (!current) return finish();
    queue = queue.slice(1);
    if (mode === "test") options = shuffle([current.a, ...distractors(current, pool)]);
  }
  function finish() {
    finished = true;
    markStudyDay("reviews");
  }
  /** after an answer: a miss comes back once at the end; first-try rights are counted */
  function settle(ok: boolean) {
    if (!current) return;
    answered++;
    const again = retried.has(current.key);
    if (ok && !again) firstTry++;
    if (!ok && !again) {
      retried.add(current.key);
      missed = [...missed, current];
      queue = [...queue, current];
    }
  }
  function submitTyped() {
    if (!current || result) return;
    const r = check(typed, current.a);
    result = { verdict: r.verdict, hit: r.hit };
    settle(r.verdict === "right");
  }
  /** "I was right": the typed answer counts after all */
  function override() {
    if (!current || !result || result.verdict === "right") return;
    result = { ...result, verdict: "right" };
    if (missed.at(-1)?.key === current.key) {
      missed = missed.slice(0, -1);
      queue = queue.filter((x, i) => !(x.key === current!.key && i === queue.length - 1));
      retried.delete(current.key);
      answered--;
      settle(true);
    }
  }
  function pick(i: number) {
    if (!current || picked !== null || !options[i]) return;
    picked = i;
    settle(normalize(options[i]) === normalize(current.a));
  }
  const rightIndex = $derived(current ? options.findIndex((o) => normalize(o) === normalize(current!.a)) : -1);

  /** the answer with the found key words marked */
  function marked(answer: string, hit: Set<string>): string {
    return answer
      .split(/(\s+)/)
      .map((w) => {
        const n = normalize(w);
        const esc = w.replace(/&/g, "&amp;").replace(/</g, "&lt;");
        return n && n.split(" ").some((x) => hit.has(x)) ? `<mark>${esc}</mark>` : esc;
      })
      .join("");
  }

  // ---- Match: 6 pairs as 12 tiles, against the clock ----
  type Tile = { id: string; key: string; text: string; side: "q" | "a"; done: boolean; bad: boolean };
  let tiles = $state<Tile[]>([]);
  let sel = $state<string | null>(null);
  let startedAt = $state(0);
  let now = $state(0);
  let penalty = $state(0);
  let tick: ReturnType<typeof setInterval> | undefined;
  const short = (s: string, n = 90) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
  function startMatch() {
    // shorter answers fit a tile better: take them first, mixed
    const pick6 = shuffle(shuffle(pool).sort((a, b) => a.a.length - b.a.length).slice(0, 10)).slice(0, 6);
    tiles = shuffle(
      pick6.flatMap((p) => [
        { id: `${p.key}|q`, key: p.key, text: short(plainOf(p.q)), side: "q" as const, done: false, bad: false },
        { id: `${p.key}|a`, key: p.key, text: short(p.a), side: "a" as const, done: false, bad: false },
      ]),
    );
    total = pick6.length;
    sel = null;
    penalty = 0;
    startedAt = now = Date.now();
    clearInterval(tick);
    tick = setInterval(() => (now = Date.now()), 100);
  }
  const elapsed = $derived(now - startedAt + penalty);
  const fmt = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  const bestKey = $derived(`match:${key}`);
  let best = $state<number | null>(null);
  function tap(t: Tile) {
    if (t.done || finished) return;
    if (!sel) return void (sel = t.id);
    if (sel === t.id) return void (sel = null);
    const a = tiles.find((x) => x.id === sel)!;
    sel = null;
    if (a.key === t.key && a.side !== t.side) {
      a.done = t.done = true;
      if (tiles.every((x) => x.done)) {
        clearInterval(tick);
        now = Date.now();
        const time = elapsed;
        const prev = get<{ ms: number }>("games", bestKey)?.ms;
        best = prev ?? null;
        if (!prev || time < prev) put("games", bestKey, { ms: time });
        finish();
      }
    } else {
      a.bad = t.bad = true;
      penalty += 1000;
      setTimeout(() => (a.bad = t.bad = false), 450);
    }
  }

  function onKey(e: KeyboardEvent) {
    if (finished || mode === "match") return;
    const inField = (e.target as HTMLElement)?.closest("input, textarea");
    if (mode === "test") {
      if (picked === null && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        pick(Number(e.key) - 1);
      } else if (picked !== null && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        nextCard();
      }
    } else if (mode === "type" && e.key === "Enter" && result && !inField) {
      e.preventDefault();
      nextCard();
    }
  }
  function onInputKey(e: KeyboardEvent) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (result) nextCard();
    else submitTyped();
  }
  const focus = (el: HTMLElement) => void requestAnimationFrame(() => el.focus());
  /** answered = asked and settled; a miss adds its second go to the total */
  let answered = $state(0);
  const progress = $derived(
    mode === "match" ? (tiles.filter((t) => t.done).length / Math.max(1, tiles.length)) * 100 : total ? Math.min(100, (answered / (total + missed.length)) * 100) : 0,
  );
  const enough = $derived(mode === "test" ? pool.length >= 4 : mode === "match" ? pool.length >= 3 : pool.length >= 1);
</script>

<div class="play">
  <header class="top">
    <a class="btn quiet sm" href="#/study/cards/deck/{enc(key)}"><Icon name="back" size={15} /> {scopeName(scope)}</a>
    <span class="prog" aria-hidden="true"><i style="width: {finished ? 100 : progress}%"></i></span>
    <nav class="modes" aria-label="Game">
      {#each Object.entries(NAMES) as [m, n]}<a href="#/study/cards/play/{m}/{enc(key)}" class:on={m === mode} aria-current={m === mode ? "page" : undefined}>{n}</a>{/each}
    </nav>
    {#if mode === "match" && !finished}<span class="clock">{fmt(elapsed)}</span>{/if}
  </header>

  <div class="stage">
    {#if !ready}
      <p class="muted">Getting cards…</p>
    {:else if !enough}
      <section class="card msg"><p>Not enough cards for {NAMES[mode]}.</p><a class="btn quiet" href="#/study/cards/deck/{enc(key)}">Back</a></section>
    {:else if finished}
      <section class="card end">
        {#if mode === "match"}
          <b class="big">{fmt(elapsed)}</b>
          <p>{best === null ? "First time" : elapsed < best ? `New best · was ${fmt(best)}` : `Best ${fmt(best)}`}{penalty ? ` · ${penalty / 1000} s for misses` : ""}</p>
        {:else}
          <b class="big">{firstTry} / {total}</b>
          <p>right first time</p>
          {#if missed.length}
            <ul class="missed">
              {#each missed as m (m.key)}<li><span class="mq">{@html cardHtml(m.q, m.img)}</span><span class="ma">{m.a}</span></li>{/each}
            </ul>
          {/if}
        {/if}
        <div class="row">
          <button type="button" class="btn primary" onclick={start}>Play again</button>
          <a class="btn quiet" href="#/study/cards/deck/{enc(key)}">Done</a>
        </div>
      </section>
    {:else if mode === "match"}
      <div class="tiles">
        {#each tiles as t (t.id)}
          <button type="button" class="tile {t.side}" class:sel={sel === t.id} class:done={t.done} class:bad={t.bad} disabled={t.done} onclick={() => tap(t)}>{t.text}</button>
        {/each}
      </div>
    {:else if current}
      {#key current.key + String(retried.has(current.key))}
        <article class="card q">
          <span class="kicker">{retried.has(current.key) && !result && picked === null ? "Again" : NAMES[mode]}</span>
          <div class="qt">{@html cardHtml(current.q, current.img)}</div>

          {#if mode === "type"}
            <input class="input answer" class:r={result?.verdict === "right"} class:c={result?.verdict === "close"} class:w={result?.verdict === "wrong"}
              use:focus bind:value={typed} readonly={!!result} placeholder="Answer" aria-label="Your answer" onkeydown={onInputKey} />
            {#if result}
              <div class="verdict v-{result.verdict}">
                <b>{result.verdict === "right" ? "Right" : result.verdict === "close" ? "Almost" : "Not quite"}</b>
                {#if result.verdict !== "right"}<button type="button" class="link" onclick={override}>I was right</button>{/if}
              </div>
              <p class="ans">{@html marked(current.a, result.hit)}</p>
            {/if}
          {:else}
            <ol class="opts">
              {#each options as o, i}
                <li>
                  <button type="button" class:right={picked !== null && i === rightIndex} class:wrong={picked === i && i !== rightIndex} disabled={picked !== null} onclick={() => pick(i)}>
                    <kbd>{i + 1}</kbd><span>{o}</span>
                  </button>
                </li>
              {/each}
            </ol>
          {/if}
        </article>
      {/key}
      <div class="actions">
        {#if mode === "type"}
          {#if result}<button type="button" class="btn primary go" onclick={nextCard}>Next <kbd>Enter</kbd></button>
          {:else}<button type="button" class="btn primary go" onclick={submitTyped}>Check <kbd>Enter</kbd></button>{/if}
        {:else if picked !== null}
          <button type="button" class="btn primary go" onclick={nextCard}>Next <kbd>Enter</kbd></button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .play {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 16px;
    height: 100%;
    min-height: 0;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .sm {
    min-height: 36px;
    padding: 0 14px;
    font-size: 13.5px;
  }
  .prog {
    flex: 1;
    min-width: 80px;
    height: 8px;
    border-radius: 999px;
    background: var(--chip);
    overflow: hidden;
  }
  .prog i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--lavender), var(--sage-deep));
    transition: width 0.3s var(--ease-out, ease);
  }
  .modes {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--chip);
  }
  .modes a {
    padding: 6px 14px;
    border-radius: 999px;
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
  }
  .modes a.on {
    background: var(--surface, var(--white));
    color: var(--text);
  }
  .clock {
    min-width: 64px;
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 4px 24px;
  }
  .stage > :first-child {
    margin-top: auto;
  }
  .stage > :last-child {
    margin-bottom: auto;
  }
  .card {
    width: min(100%, 860px);
  }
  .q {
    display: grid;
    gap: 18px;
    padding: 30px 34px;
    border-radius: 28px;
  }
  .kicker {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .qt {
    font-size: 24px;
    font-weight: 600;
    line-height: 1.35;
  }
  .qt :global(p) {
    margin: 0;
  }
  .answer {
    min-height: 56px;
    font-size: 18px;
  }
  .answer.r {
    background: color-mix(in srgb, var(--sage) 40%, var(--white));
  }
  .answer.c {
    background: color-mix(in srgb, var(--butter) 55%, var(--white));
  }
  .answer.w {
    background: color-mix(in srgb, var(--rose) 40%, var(--white));
  }
  .verdict {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 16px;
  }
  .v-right b {
    color: var(--go-ink);
  }
  .v-close b {
    color: color-mix(in srgb, var(--peach) 30%, var(--text));
  }
  .v-wrong b {
    color: var(--alert-ink);
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--link-ink);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .ans {
    margin: 0;
    font-size: 19px;
    line-height: 1.5;
  }
  .ans :global(mark) {
    padding: 0 3px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--sage) 45%, var(--white));
    color: inherit;
  }
  .opts {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 8px;
  }
  .opts button {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    min-height: 56px;
    padding: 10px 16px;
    border: 0;
    border-radius: 16px;
    background: var(--chip);
    color: var(--text);
    font: inherit;
    font-size: 16px;
    text-align: left;
    cursor: pointer;
    transition: transform 0.15s var(--spring, ease);
  }
  .opts button:not(:disabled):hover {
    transform: translateY(-1px);
    background: color-mix(in srgb, var(--lavender) 22%, var(--chip));
  }
  .opts button:disabled {
    cursor: default;
  }
  .opts button.right {
    background: color-mix(in srgb, var(--sage) 50%, var(--white));
  }
  .opts button.wrong {
    background: color-mix(in srgb, var(--rose) 50%, var(--white));
    animation: shake 0.35s;
  }
  kbd {
    flex: none;
    display: inline-grid;
    place-items: center;
    min-width: 26px;
    height: 26px;
    padding: 0 6px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--text) 8%, transparent);
    font: 600 12px/1 var(--font-body, inherit);
  }
  .actions {
    width: min(100%, 860px);
    display: flex;
    justify-content: flex-end;
    min-height: 54px;
  }
  .go {
    min-height: 54px;
    padding: 0 28px;
    font-size: 16px;
    gap: 10px;
  }
  .go kbd {
    background: color-mix(in srgb, var(--on-primary, #fff) 18%, transparent);
  }
  .tiles {
    width: min(100%, 980px);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }
  .tile {
    display: grid;
    place-items: center;
    min-height: 110px;
    padding: 14px 16px;
    border: 0;
    border-radius: 20px;
    background: var(--surface);
    box-shadow: var(--shadow);
    color: var(--text);
    font: inherit;
    font-size: 15px;
    line-height: 1.35;
    cursor: pointer;
    transition: transform 0.15s var(--spring, ease), opacity 0.3s, background 0.15s;
  }
  .tile.q {
    font-weight: 600;
  }
  .tile:hover {
    transform: translateY(-2px);
  }
  .tile.sel {
    background: color-mix(in srgb, var(--lavender) 40%, var(--white));
    transform: scale(1.03);
  }
  .tile.bad {
    background: color-mix(in srgb, var(--rose) 50%, var(--white));
    animation: shake 0.35s;
  }
  .tile.done {
    opacity: 0;
    transform: scale(0.9);
    pointer-events: none;
  }
  @keyframes shake {
    20%, 60% { transform: translateX(-5px); }
    40%, 80% { transform: translateX(5px); }
  }
  .end,
  .msg {
    display: grid;
    justify-items: center;
    gap: 10px;
    padding: 30px;
    text-align: center;
  }
  .big {
    font-size: 54px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .end p,
  .msg p {
    margin: 0;
    color: var(--text-muted);
  }
  .missed {
    width: 100%;
    margin: 10px 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 6px;
    text-align: left;
  }
  .missed li {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 14px;
    background: var(--chip);
    font-size: 14px;
  }
  .mq :global(p) {
    margin: 0;
  }
  .mq {
    font-weight: 600;
  }
  .row {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }
  .muted {
    color: var(--text-muted);
  }
  @media (prefers-reduced-motion: reduce) {
    .tile,
    .opts button {
      transition: none;
      animation: none;
    }
  }
</style>
