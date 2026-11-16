<script lang="ts">
  // Practise a Mosaic quiz file: one question at a time, Check → feedback with the right
  // answer and the explanation → Next, then results by topic. Progress goes to the synced
  // "quizzes" collection; the file is only read.
  import Icon from "../../lib/components/Icon.svelte";
  import { mdHtml, mdInline } from "../../lib/md";
  import { grade, parseQuiz, rightAnswer, shuffled, TYPE_LABEL, type Question, type Quiz, type Response } from "../../lib/quiz";
  import { encodeRel, folderHref, materialText, parentRel, type Item } from "../../lib/stores/labs.svelte";
  import { finishAttempt, missedIds, quizSummary, recordAnswer } from "../../lib/stores/quizzes.svelte";

  let { item }: { item: Item } = $props();

  let quiz = $state<Quiz | null>(null);
  let loadError = $state("");
  const img = (src: string) => (/^(https?:|data:|\/)/.test(src) ? src : `/__labs/${encodeRel([parentRel(item.rel), src].filter(Boolean).join("/"))}`);

  async function load() {
    try {
      quiz = parseQuiz(await materialText(item.rel), item.mat?.title ?? item.name.replace(/\.md$/i, ""));
    } catch (e) {
      loadError = String((e as Error)?.message ?? e);
    }
  }
  void load();

  const qid = $derived(quiz?.meta.id ?? item.mat?.id ?? item.rel);
  const summary = $derived(quizSummary(qid));
  const missedNow = $derived(quiz ? quiz.questions.filter((q) => missedIds(qid).includes(q.id)) : []);
  const topics = $derived(quiz ? [...new Set(quiz.questions.map((q) => q.topic).filter(Boolean))] : []);

  // ---- session ----------------------------------------------------------------------------
  type Shown = { q: Question; order: number[] }; // order: displayed option index → real index
  let phase = $state<"start" | "q" | "done">("start");
  let mode = $state<"practice" | "missed">("practice");
  let shuffle = $state(true);
  let list = $state<Shown[]>([]);
  let at = $state(0);
  let checked = $state(false);
  let result = $state<{ correct: boolean; parts?: boolean[] } | null>(null);
  let log = $state<{ q: Question; correct: boolean }[]>([]);
  let t0 = 0;
  let elapsed = $state(0);
  let showProblems = $state(false);

  // the answer being built
  let pick = $state<number | null>(null);
  let picks = $state<number[]>([]);
  let tf = $state<boolean | null>(null);
  let fills = $state<string[]>([]);
  let calc = $state("");

  const cur = $derived(list[at]);
  function begin(m: "practice" | "missed") {
    if (!quiz) return;
    mode = m;
    const qs = m === "missed" ? missedNow : quiz.questions;
    const ordered = shuffle ? shuffled(qs) : qs;
    list = ordered.map((q) => ({ q, order: shuffle && (q.type === "single" || q.type === "sata") ? shuffled(q.options.map((_, i) => i)) : q.options.map((_, i) => i) }));
    at = 0;
    log = [];
    t0 = Date.now();
    reset();
    phase = "q";
  }
  function reset() {
    checked = false;
    result = null;
    pick = null;
    picks = [];
    tf = null;
    calc = "";
    fills = list[at] ? list[at].q.blanks.map(() => "") : [];
  }
  const response = (): Response => {
    const q = cur.q;
    if (q.type === "single") return pick === null ? null : cur.order[pick];
    if (q.type === "sata") return picks.map((p) => cur.order[p]);
    if (q.type === "tf") return tf;
    if (q.type === "calc") return calc;
    return fills;
  };
  const ready = $derived.by(() => {
    if (!cur) return false;
    const q = cur.q;
    if (q.type === "single") return pick !== null;
    if (q.type === "sata") return picks.length > 0;
    if (q.type === "tf") return tf !== null;
    if (q.type === "calc") return calc.trim() !== "";
    return fills.some((f) => f.trim() !== "");
  });
  function check() {
    if (!cur || checked || !ready || !quiz) return;
    result = grade(cur.q, response());
    checked = true;
    log = [...log, { q: cur.q, correct: result.correct }];
    recordAnswer(qid, quiz.meta.title, item.rel, cur.q.id, result.correct);
  }
  function next() {
    if (at + 1 < list.length) {
      at++;
      reset();
    } else finish();
  }
  function finish() {
    if (!quiz) return;
    const topicsOut: Record<string, [number, number]> = {};
    for (const l of log) {
      const k = l.q.topic || "Other";
      const t = topicsOut[k] ?? [0, 0];
      topicsOut[k] = [t[0] + (l.correct ? 1 : 0), t[1] + 1];
    }
    elapsed = Date.now() - t0;
    finishAttempt(qid, { at: Date.now(), mode, n: log.length, right: log.filter((l) => l.correct).length, ms: Date.now() - t0, missed: log.filter((l) => !l.correct).map((l) => l.q.id), topics: topicsOut });
    phase = "done";
  }
  function togglePick(i: number) {
    if (checked) return;
    if (cur.q.type === "single") pick = i;
    else picks = picks.includes(i) ? picks.filter((x) => x !== i) : [...picks, i];
  }

  function onKey(e: KeyboardEvent) {
    if (phase !== "q" || !cur) return;
    const typing = (e.target as HTMLElement).closest("input, select, textarea");
    if (e.key === "Enter") {
      e.preventDefault();
      if (checked) next();
      else check();
      return;
    }
    if (typing || checked || e.ctrlKey || e.metaKey || e.altKey) return;
    const q = cur.q;
    if (q.type === "single" || q.type === "sata") {
      const n = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : /^[a-i]$/i.test(e.key) ? e.key.toLowerCase().charCodeAt(0) - 97 : -1;
      if (n >= 0 && n < q.options.length) togglePick(n);
    } else if (q.type === "tf") {
      if (/^[t1]$/i.test(e.key)) tf = true;
      if (/^[f2]$/i.test(e.key)) tf = false;
    }
  }

  const right = $derived(log.filter((l) => l.correct).length);
  const pct = $derived(log.length ? Math.round((right / log.length) * 100) : 0);
  const byTopic = $derived.by(() => {
    const m = new Map<string, [number, number]>();
    for (const l of log) {
      const k = l.q.topic || "Other";
      const t = m.get(k) ?? [0, 0];
      m.set(k, [t[0] + (l.correct ? 1 : 0), t[1] + 1]);
    }
    return [...m].sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]);
  });
  const fmtTime = (ms: number) => {
    const m = Math.round(ms / 60000);
    return m < 1 ? "under a minute" : `${m} min`;
  };
  const ring = (p: number, r: number) => `${(2 * Math.PI * r * p).toFixed(1)} ${(2 * Math.PI * r).toFixed(1)}`;
  const letter = (i: number) => String.fromCharCode(65 + i);
  const textInline = (s: string) => mdInline(s, img).replace(/\n/g, "<br>");
  const blankWidth = (q: Question, i: number) => {
    const b = q.blanks[i];
    return b.kind === "text" ? Math.max(6, Math.min(24, Math.max(...b.answers.map((a) => a.length)) + 2)) : 0;
  };
  const back = $derived(folderHref(parentRel(item.rel)));
</script>

<svelte:window onkeydown={onKey} />

<div class="qz">
  <header class="bar">
    <a class="ib" href={back} aria-label="Back to the folder"><Icon name="back" size={18} /></a>
    <div class="ttl">
      <b>{quiz?.meta.title ?? item.mat?.title ?? item.name}</b>
      <span class="muted sm">{[quiz?.meta.course ?? item.mat?.course, quiz?.meta.exam ?? item.mat?.exam].filter(Boolean).join(" · ") || parentRel(item.rel) || "Materials"}</span>
    </div>
    {#if phase === "q"}
      <span class="count">Question {at + 1} of {list.length}</span>
      <button type="button" class="btn quiet sm" onclick={finish} disabled={!log.length}>End quiz</button>
    {/if}
  </header>
  {#if phase === "q"}
    <div class="prog" aria-hidden="true"><span style="width: {((at + (checked ? 1 : 0)) / list.length) * 100}%"></span></div>
  {/if}

  {#if loadError}
    <section class="card msg"><b>Couldn't open this quiz.</b><p class="muted">{loadError}</p></section>
  {:else if !quiz}
    <p class="muted">Opening…</p>
  {:else if phase === "start"}
    <section class="card start">
      <div class="st-top">
        <span class="badge"><Icon name="check" size={22} /></span>
        <div>
          <h1 class="display">{quiz.meta.title}</h1>
          <p class="muted">{quiz.questions.length} {quiz.questions.length === 1 ? "question" : "questions"}{topics.length ? ` · ${topics.length} ${topics.length === 1 ? "topic" : "topics"}` : ""}</p>
        </div>
      </div>
      {#if topics.length}<div class="chips">{#each topics as t}<span class="chip">{t}</span>{/each}</div>{/if}
      {#if quiz.intro}<div class="intro">{@html mdHtml(quiz.intro, img)}</div>{/if}
      <div class="stats">
        <div><span class="label">Best</span><b class="display">{summary.best === null ? "–" : `${summary.best}%`}</b></div>
        <div><span class="label">Last</span><b class="display">{summary.last === null ? "–" : `${summary.last}%`}</b></div>
        <div><span class="label">Attempts</span><b class="display">{summary.attempts}</b></div>
        <div><span class="label">To redo</span><b class="display">{missedNow.length}</b></div>
      </div>
      <label class="tog"><input type="checkbox" bind:checked={shuffle} /> Shuffle questions and options</label>
      <div class="go">
        <button type="button" class="btn primary big" onclick={() => begin("practice")} disabled={!quiz.questions.length}><Icon name="play" size={16} /> Practice all</button>
        <button type="button" class="btn big" onclick={() => begin("missed")} disabled={!missedNow.length}>Redo missed ({missedNow.length})</button>
      </div>
      {#if quiz.problems.length}
        <div class="problems">
          <button type="button" class="linkish" onclick={() => (showProblems = !showProblems)}><Icon name="flag" size={14} /> {quiz.problems.length} {quiz.problems.length === 1 ? "part of the file couldn't be read" : "parts of the file couldn't be read"} and {quiz.problems.length === 1 ? "is" : "are"} skipped</button>
          {#if showProblems}<ul>{#each quiz.problems as p}<li><span class="ln">line {p.line}</span> {p.msg}</li>{/each}</ul>{/if}
        </div>
      {/if}
      <p class="muted sm keys">Keys: 1–9 or A–I pick an option, T / F for true or false, Enter checks and goes on.</p>
    </section>
  {:else if phase === "q" && cur}
    {#key at}
      <section class="card question" class:right={checked && result?.correct} class:wrong={checked && !result?.correct}>
        <div class="qmeta"><span class="chip">{TYPE_LABEL[cur.q.type]}</span>{#if cur.q.topic}<span class="muted sm">{cur.q.topic}</span>{/if}</div>

        {#if cur.q.type === "blank" || cur.q.type === "dropdown"}
          <div class="stem inline">
            {#each cur.q.parts as p}
              {#if p.t === "text"}{@html textInline(p.s)}{:else}
                {@const b = cur.q.blanks[p.i]}
                {@const ok = checked ? result?.parts?.[p.i] : undefined}
                {#if b.kind === "text"}
                  <input class="blank" class:ok={ok === true} class:no={ok === false} style="width: {blankWidth(cur.q, p.i)}ch" bind:value={fills[p.i]} disabled={checked} aria-label="Blank {p.i + 1}" autocomplete="off" spellcheck="false" />
                {:else}
                  <select class="blank sel" class:ok={ok === true} class:no={ok === false} bind:value={fills[p.i]} disabled={checked} aria-label="Choice {p.i + 1}">
                    <option value="" disabled>choose…</option>
                    {#each b.options as o, oi}<option value={String(oi)}>{o}</option>{/each}
                  </select>
                {/if}
                {#if ok === false}<span class="fix">{b.kind === "text" ? b.answers[0] : b.options[b.correct]}</span>{/if}
              {/if}
            {/each}
          </div>
        {:else}
          <div class="stem">{@html mdHtml(cur.q.stem, img)}</div>
        {/if}

        {#if cur.q.type === "single" || cur.q.type === "sata"}
          {#if cur.q.type === "sata"}<p class="muted sm">Select all that apply.</p>{/if}
          <div class="opts" role={cur.q.type === "single" ? "radiogroup" : "group"} aria-label="Options">
            {#each cur.order as real, i}
              {@const o = cur.q.options[real]}
              {@const on = cur.q.type === "single" ? pick === i : picks.includes(i)}
              <button type="button" role={cur.q.type === "single" ? "radio" : "checkbox"} aria-checked={on} class="opt" class:on class:good={checked && o.correct} class:bad={checked && on && !o.correct} class:missed={checked && !on && o.correct && cur.q.type === "sata"} onclick={() => togglePick(i)} disabled={checked} style="animation-delay: {i * 45}ms">
                <span class="key">{letter(i)}</span>
                <span class="otext">{@html mdInline(o.text, img)}</span>
                {#if checked && o.correct}<span class="mark ok"><Icon name="check" size={16} /></span>{:else if checked && on}<span class="mark x">×</span>{/if}
              </button>
            {/each}
          </div>
        {:else if cur.q.type === "tf"}
          <div class="tf" role="radiogroup" aria-label="True or false">
            {#each [true, false] as v}
              <button type="button" role="radio" aria-checked={tf === v} class="opt big" class:on={tf === v} class:good={checked && cur.q.answer === v} class:bad={checked && tf === v && cur.q.answer !== v} disabled={checked} onclick={() => (tf = v)}>{v ? "True" : "False"}</button>
            {/each}
          </div>
        {:else if cur.q.type === "calc"}
          <label class="calc" class:ok={checked && result?.correct} class:no={checked && !result?.correct}>
            <span class="sr">Your answer</span>
            <input inputmode="decimal" bind:value={calc} disabled={checked} placeholder="Your answer" autocomplete="off" />
            {#if cur.q.calc?.unit}<span class="unit">{cur.q.calc.unit}</span>{/if}
          </label>
        {/if}

        {#if checked && result}
          <div class="fb" class:ok={result.correct} role="status">
            <b class="display">{result.correct ? "Correct!" : "Not quite"}</b>
            {#if !result.correct}<p><span class="label">Answer</span> {@html mdInline(rightAnswer(cur.q), img)}</p>{/if}
            {#if cur.q.explanation}<div class="ex">{@html mdHtml(cur.q.explanation, img)}</div>{/if}
          </div>
        {/if}

        <div class="act">
          <span class="muted sm">{log.filter((l) => l.correct).length} right so far</span>
          <span class="sp"></span>
          {#if !checked}
            <button type="button" class="btn primary" onclick={check} disabled={!ready}>Check <kbd>Enter</kbd></button>
          {:else}
            <button type="button" class="btn primary" onclick={next}>{at + 1 < list.length ? "Next" : "See results"} <kbd>Enter</kbd></button>
          {/if}
        </div>
      </section>
    {/key}
  {:else if phase === "done"}
    <section class="card done">
      <div class="res">
        <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label="{pct} percent">
          <circle cx="66" cy="66" r="54" fill="none" stroke="var(--track)" stroke-width="14" />
          <circle cx="66" cy="66" r="54" fill="none" stroke={pct >= 80 ? "var(--sage-deep)" : pct >= 60 ? "var(--peach)" : "var(--rose-deep)"} stroke-width="14" stroke-linecap="round" stroke-dasharray={ring(pct / 100, 54)} transform="rotate(-90 66 66)" class="ringfill" />
          <text x="66" y="74" text-anchor="middle" font-size="28" font-weight="600" fill="currentColor">{pct}%</text>
        </svg>
        <div>
          <h1 class="display">{pct >= 90 ? "Excellent!" : pct >= 75 ? "Nice work!" : pct >= 50 ? "Getting there" : "Keep going"}</h1>
          <p class="muted">{right} of {log.length} right · {fmtTime(elapsed)}{mode === "missed" ? " · missed questions only" : ""}</p>
        </div>
      </div>
      {#if byTopic.length > 1 || (byTopic.length === 1 && byTopic[0][0] !== "Other")}
        <div class="topics">
          <h2 class="h2">By topic</h2>
          {#each byTopic as [t, [r, n]]}
            <div class="trow"><span class="tn">{t}</span><span class="tbar"><span style="width: {(r / n) * 100}%; background: {r / n >= 0.8 ? 'var(--sage-deep)' : r / n >= 0.6 ? 'var(--peach)' : 'var(--rose-deep)'}"></span></span><span class="tc">{r}/{n}</span></div>
          {/each}
        </div>
      {/if}
      {#if log.some((l) => !l.correct)}
        <div class="missedlist">
          <h2 class="h2">To review</h2>
          {#each log.filter((l) => !l.correct) as l (l.q.id)}
            <details>
              <summary>{@html mdInline(l.q.stem.replace(/\{\{([^{}]+)\}\}/g, "____").split("\n")[0].slice(0, 140), img)}</summary>
              <p><span class="label">Answer</span> {@html mdInline(rightAnswer(l.q), img)}</p>
              {#if l.q.explanation}<div class="ex">{@html mdHtml(l.q.explanation, img)}</div>{/if}
            </details>
          {/each}
        </div>
      {/if}
      <div class="go">
        {#if missedNow.length}<button type="button" class="btn primary big" onclick={() => begin("missed")}>Redo missed ({missedNow.length})</button>{/if}
        <button type="button" class="btn big" onclick={() => begin("practice")}>Practice all again</button>
        <a class="btn quiet big" href={back}>Back to the folder</a>
      </div>
    </section>
  {/if}
</div>

<style>
  .qz {
    display: grid;
    gap: var(--gap);
    max-width: 860px;
    width: 100%;
    margin: 0 auto;
    align-content: start;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .ib {
    display: grid;
    place-items: center;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    background: var(--chip);
    text-decoration: none;
    flex: none;
  }
  .ttl {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .ttl b {
    font-weight: 600;
    font-size: 17px;
  }
  .sm {
    font-size: 13px;
  }
  .count {
    font-weight: 600;
    font-size: 14px;
  }
  .btn.sm {
    min-height: 38px;
    padding: 0 14px;
    font-size: 14px;
  }
  .prog {
    height: 8px;
    border-radius: 99px;
    background: var(--track);
    overflow: hidden;
  }
  .prog span {
    display: block;
    height: 100%;
    border-radius: 99px;
    background: var(--accent);
    transition: width 0.6s var(--spring-soft);
  }
  .msg {
    display: grid;
    gap: 6px;
  }

  /* start */
  .start {
    display: grid;
    gap: 18px;
  }
  .st-top {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .badge {
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--lavender) 45%, white);
    flex: none;
    animation: tick-pop 0.6s var(--spring) backwards;
  }
  .start h1 {
    font-size: clamp(24px, 3vw, 32px);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    padding: 4px 11px;
    border-radius: var(--radius-pill);
    background: var(--chip);
    font-size: 12.5px;
    font-weight: 600;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .stats > div {
    display: grid;
    gap: 2px;
    padding: 12px 14px;
    border-radius: 18px;
    background: var(--chip);
  }
  .stats b {
    font-size: 24px;
  }
  .tog {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .go {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .btn.big {
    min-height: 50px;
    padding: 0 24px;
    font-size: 16px;
  }
  .problems {
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--butter-soft);
  }
  .linkish {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: none;
    padding: 0;
    font-weight: 600;
    text-align: left;
  }
  .problems ul {
    margin: 8px 0 0;
    padding-left: 18px;
    font-size: 14px;
  }
  .ln {
    font-size: 12px;
    color: var(--text-muted);
    margin-right: 4px;
  }
  .keys {
    margin: 0;
  }

  /* question */
  .question {
    display: grid;
    gap: 18px;
    animation: pop-in 0.45s var(--spring) backwards;
    transition: box-shadow var(--t) ease;
  }
  .question.right {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--sage-deep) 55%, transparent), var(--shadow);
  }
  .question.wrong {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--rose-deep) 50%, transparent), var(--shadow);
    animation: pop-in 0.45s var(--spring) backwards, shake 0.4s ease 0.05s;
  }
  @keyframes shake {
    25% { transform: translateX(-6px); }
    50% { transform: translateX(5px); }
    75% { transform: translateX(-3px); }
  }
  .qmeta {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .stem {
    font-size: 18px;
    line-height: 1.55;
  }
  .stem :global(p) {
    margin: 0 0 10px;
  }
  .stem :global(table),
  .ex :global(table),
  .intro :global(table) {
    border-collapse: collapse;
    margin: 6px 0 12px;
    font-size: 15px;
  }
  .stem :global(th),
  .stem :global(td),
  .ex :global(th),
  .ex :global(td) {
    padding: 6px 12px;
    border-bottom: 1px solid var(--hairline);
    text-align: left;
  }
  .stem :global(th) {
    font-weight: 600;
    background: var(--chip);
  }
  .stem :global(img),
  .ex :global(img) {
    max-width: 100%;
    border-radius: 12px;
  }
  .stem.inline {
    line-height: 2.3;
  }
  .blank {
    display: inline-block;
    min-height: 40px;
    margin: 0 4px;
    padding: 4px 10px;
    border: 2px solid var(--hairline);
    border-radius: 12px;
    background: var(--surface-float);
    font: inherit;
    font-size: 17px;
    color: var(--text);
    vertical-align: middle;
    transition: border-color var(--t-fast) ease, background var(--t-fast) ease;
  }
  .blank:focus {
    outline: none;
    border-color: var(--accent);
  }
  .blank.sel {
    min-width: 9ch;
  }
  .blank.ok {
    border-color: var(--sage-deep);
    background: var(--sage-soft);
  }
  .blank.no {
    border-color: var(--rose-deep);
    background: var(--rose-soft);
    text-decoration: line-through;
  }
  .fix {
    display: inline-block;
    padding: 2px 10px;
    margin-right: 4px;
    border-radius: 10px;
    background: var(--sage-soft);
    font-weight: 600;
    font-size: 15px;
    animation: rise-in 0.35s var(--spring);
  }
  .opts {
    display: grid;
    gap: 10px;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 56px;
    padding: 10px 16px;
    border: 2px solid transparent;
    border-radius: 18px;
    background: var(--chip);
    color: var(--text);
    font: inherit;
    font-size: 16px;
    text-align: left;
    animation: pop-in 0.4s var(--spring) backwards;
  }
  .opt:hover:not(:disabled) {
    transform: translateX(4px);
    background: color-mix(in srgb, var(--accent) 10%, var(--chip));
  }
  .opt:active:not(:disabled) {
    transform: scale(0.98);
  }
  .opt.on {
    border-color: var(--primary);
    background: var(--surface-float);
  }
  .opt.good {
    border-color: var(--sage-deep);
    background: var(--sage-soft);
  }
  .opt.bad {
    border-color: var(--rose-deep);
    background: var(--rose-soft);
  }
  .opt.missed {
    border-style: dashed;
  }
  .opt:disabled {
    cursor: default;
    opacity: 1;
  }
  .key {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    flex: none;
    border-radius: 10px;
    background: var(--surface);
    font-size: 13px;
    font-weight: 700;
  }
  .opt.on .key {
    background: var(--primary);
    color: var(--on-primary);
  }
  .otext {
    flex: 1;
  }
  .mark {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    flex: none;
    animation: tick-pop 0.45s var(--spring);
  }
  .mark.ok {
    background: var(--sage-deep);
    color: #fff;
  }
  .mark.x {
    background: var(--rose-deep);
    color: #fff;
    font-weight: 700;
  }
  .tf {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .opt.big {
    justify-content: center;
    min-height: 72px;
    font-size: 20px;
    font-weight: 600;
  }
  .calc {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 360px;
    padding: 6px 6px 6px 16px;
    border: 2px solid var(--hairline);
    border-radius: 18px;
    background: var(--surface-float);
  }
  .calc input {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    border: 0;
    background: none;
    font: inherit;
    font-size: 20px;
    color: var(--text);
    outline: none;
  }
  .calc.ok {
    border-color: var(--sage-deep);
  }
  .calc.no {
    border-color: var(--rose-deep);
  }
  .unit {
    padding: 8px 14px;
    border-radius: 12px;
    background: var(--chip);
    font-weight: 600;
  }
  .sr {
    position: absolute;
    left: -9999px;
  }
  .fb {
    display: grid;
    gap: 8px;
    padding: 16px 18px;
    border-radius: 20px;
    background: var(--rose-soft);
    animation: rise-in 0.4s var(--spring);
  }
  .fb.ok {
    background: var(--sage-soft);
  }
  .fb b {
    font-size: 20px;
  }
  .fb.ok b {
    animation: tick-pop 0.5s var(--spring);
    display: inline-block;
  }
  .fb p {
    margin: 0;
  }
  .ex {
    font-size: 15px;
    color: var(--text);
  }
  .ex :global(p) {
    margin: 0 0 6px;
  }
  .act {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sp {
    flex: 1;
  }
  kbd {
    font: inherit;
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.2);
  }

  /* results */
  .done {
    display: grid;
    gap: 22px;
  }
  .res {
    display: flex;
    align-items: center;
    gap: 24px;
    flex-wrap: wrap;
  }
  .res h1 {
    font-size: 30px;
  }
  .ringfill {
    animation: ring-in 1s var(--spring-soft) backwards;
  }
  @keyframes ring-in {
    from {
      stroke-dasharray: 0 400;
    }
  }
  .topics,
  .missedlist {
    display: grid;
    gap: 10px;
  }
  .trow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2fr auto;
    align-items: center;
    gap: 12px;
    font-size: 14px;
  }
  .tbar {
    height: 10px;
    border-radius: 99px;
    background: var(--track);
    overflow: hidden;
  }
  .tbar span {
    display: block;
    height: 100%;
    border-radius: 99px;
    animation: grow-x 0.8s var(--spring-soft) backwards;
    transform-origin: left;
  }
  @keyframes grow-x {
    from {
      transform: scaleX(0);
    }
  }
  .tc {
    font-weight: 600;
  }
  details {
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--chip);
  }
  details[open] {
    background: var(--surface-float);
    box-shadow: var(--shadow);
  }
  summary {
    cursor: pointer;
    font-weight: 500;
  }
  details p {
    margin: 10px 0 4px;
  }
  @media (max-width: 640px) {
    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .stem {
      font-size: 17px;
    }
  }
</style>
