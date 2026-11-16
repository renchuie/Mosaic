<script lang="ts">
  // Top 200/300 drug quiz tracker: quizzes with the drug numbers they cover,
  // a score trend, and how much of the list you've been quizzed on.
  import Icon from "../../lib/components/Icon.svelte";
  import { fromKey, todayKey } from "../../lib/calendar";
  import { isGraded, pctOf } from "../../lib/grades";
  import { assessments, getCourse, saveAssessment } from "../../lib/stores/courses.svelte";

  let { id }: { id: string } = $props();
  const course = $derived(getCourse(id)!);
  const catId = $derived(course.grading.categories[0]?.id);
  const quizzes = $derived(assessments(id).filter(([, a]) => course.grading.mode === "points" || a.category === catId));
  const graded = $derived(quizzes.filter(([, a]) => isGraded(a)));
  const pcts = $derived(graded.map(([, a]) => pctOf(a)!));
  const avg = $derived(pcts.length ? pcts.reduce((x, y) => x + y, 0) / pcts.length : null);
  const best = $derived(pcts.length ? Math.max(...pcts) : null);
  const total = $derived(course.drugTotal ?? 300);
  const covered = $derived(Math.max(0, ...quizzes.filter(([, a]) => isGraded(a)).map(([, a]) => a.drugs?.to ?? 0)));
  const lastTo = $derived(Math.max(0, ...quizzes.map(([, a]) => a.drugs?.to ?? 0)));
  const lastMax = $derived(quizzes.length ? quizzes[quizzes.length - 1][1].max : 10);

  // trend line
  let W = $state(600);
  const H = 110;
  const pts = $derived(pcts.map((p, i) => [pcts.length === 1 ? W / 2 : (i / (pcts.length - 1)) * (W - 16) + 8, H - 8 - (p / 100) * (H - 16)]));
  const path = $derived(pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" "));

  // number inputs hand back numbers (or null when empty), so keep these loosely typed
  let nf = $state<{ from: string | number; to: string | number; score: string | number | null; max: string | number; date: string }>({ from: "", to: "", score: "", max: "", date: todayKey() });
  $effect(() => {
    nf.from = String(lastTo + 1);
    nf.to = String(Math.min(total, lastTo + 10));
    nf.max = String(lastMax);
  });
  function add(e: SubmitEvent) {
    e.preventDefault();
    const from = Number(nf.from);
    const to = Number(nf.to);
    const n = quizzes.length + 1;
    saveAssessment(null, {
      courseId: id,
      name: `Quiz ${n} · drugs ${from}–${to}`,
      category: catId,
      max: Number(nf.max) || 10,
      score: String(nf.score ?? "").trim() === "" ? null : Number(nf.score),
      date: nf.date || undefined,
      drugs: from && to ? { from, to } : undefined,
      created: Date.now(),
    });
    nf.score = "";
  }
</script>

<section class="card drugs">
  <div class="dh">
    <span class="tile"><Icon name="pill" size={20} /></span>
    <div>
      <h2 class="h2">Drug quiz tracker</h2>
      <p class="muted">Top {total} · quizzes and the drugs they cover</p>
    </div>
  </div>

  <div class="stats">
    <div><span class="label">Average</span><b class="display">{avg === null ? "–" : `${Math.round(avg)}%`}</b></div>
    <div><span class="label">Best</span><b class="display">{best === null ? "–" : `${Math.round(best)}%`}</b></div>
    <div><span class="label">Quizzes</span><b class="display">{graded.length}<small>/{quizzes.length}</small></b></div>
    <div><span class="label">Drugs covered</span><b class="display">{covered}<small>/{total}</small></b></div>
  </div>

  <div class="cover" aria-label="{covered} of {total} drugs quizzed">
    <span style="width: {(covered / total) * 100}%"></span>
    {#each [50, 100, 150, 200, 250].filter((m) => m < total) as m}<i style="left: {(m / total) * 100}%">{m}</i>{/each}
  </div>

  {#if pcts.length > 1}
    <div class="trendbox" bind:clientWidth={W}>
    <svg class="trend" width={W} height={H} viewBox="0 0 {W} {H}" role="img" aria-label="Quiz scores over time">
      <line x1="8" x2={W - 8} y1={H - 8 - 0.9 * (H - 16)} y2={H - 8 - 0.9 * (H - 16)} class="goal" />
      <path d={path} class="line" />
      {#each pts as [x, y], i}<circle cx={x} cy={y} r="4.5"><title>{graded[i][1].name}: {Math.round(pcts[i])}%</title></circle>{/each}
      <text x={W - 8} y={H - 8 - 0.9 * (H - 16) - 5} text-anchor="end">90%</text>
    </svg>
    </div>
  {/if}

  {#if quizzes.length}
    <ol class="ql">
      {#each [...quizzes].reverse() as [qid, q] (qid)}
        {@const p = pctOf(q)}
        <li>
          <span class="qn">{q.drugs ? `${q.drugs.from}–${q.drugs.to}` : "—"}</span>
          <span class="qt"><b>{q.name}</b><span class="muted">{q.date ? fromKey(q.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "No date"}</span></span>
          <span class="qs">
            <input type="number" step="any" class="cell" placeholder="–" value={q.score ?? ""} aria-label="Score for {q.name}"
              onchange={(e) => saveAssessment(qid, { ...q, score: e.currentTarget.value.trim() === "" ? null : Number(e.currentTarget.value) })} />
            <span>/ {q.max}</span>
          </span>
          <span class="qp" class:good={p !== null && p >= 90} class:low={p !== null && p < 70}>{p === null ? "–" : `${Math.round(p)}%`}</span>
        </li>
      {/each}
    </ol>
  {/if}

  <form class="qadd" onsubmit={add}>
    <label>Drugs <input class="input" type="number" min="1" bind:value={nf.from} aria-label="From drug number" /> – <input class="input" type="number" min="1" bind:value={nf.to} aria-label="To drug number" /></label>
    <label>Score <input class="input" type="number" step="any" bind:value={nf.score} placeholder="later" aria-label="Score" /> / <input class="input" type="number" min="1" bind:value={nf.max} aria-label="Out of" /></label>
    <label>On <input class="input date" type="date" bind:value={nf.date} aria-label="Quiz date" /></label>
    <button type="submit" class="btn primary">Add quiz</button>
  </form>
</section>

<style>
  .drugs {
    display: grid;
    gap: 14px;
    background: linear-gradient(160deg, color-mix(in srgb, var(--c) 35%, var(--white)), var(--surface) 55%);
  }
  .dh {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .tile {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 14px;
    background: var(--c);
  }
  .dh p {
    font-size: 13.5px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  @media (max-width: 640px) {
    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .stats div {
    display: grid;
    padding: 10px 12px;
    border-radius: 14px;
    background: rgba(255, 253, 251, 0.8);
  }
  .stats b {
    font-size: 24px;
    font-weight: 600;
  }
  .stats small {
    font-size: 13px;
    color: var(--text-muted);
  }
  .cover {
    position: relative;
    height: 14px;
    border-radius: var(--radius-pill);
    background: var(--panel);
    margin-bottom: 12px;
  }
  .cover span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--c), color-mix(in srgb, var(--c) 60%, #3b3033));
  }
  .cover i {
    position: absolute;
    top: 17px;
    transform: translateX(-50%);
    font-style: normal;
    font-size: 10.5px;
    color: var(--text-muted);
  }
  .trendbox {
    width: 100%;
    min-width: 0;
  }
  .trend {
    display: block;
  }
  .trend text {
    font-size: 10.5px;
    fill: var(--text-muted);
  }
  .trend .line {
    fill: none;
    stroke: color-mix(in srgb, var(--c) 55%, #3b3033);
    stroke-width: 2.5;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .trend circle {
    fill: var(--surface);
    stroke: color-mix(in srgb, var(--c) 55%, #3b3033);
    stroke-width: 2.5;
  }
  .goal {
    stroke: var(--hairline);
    stroke-dasharray: 4 4;
  }
  .ql {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .ql li {
    display: grid;
    grid-template-columns: 78px minmax(0, 1fr) auto 52px;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    border-radius: 14px;
    background: rgba(255, 253, 251, 0.85);
  }
  .qn {
    display: grid;
    place-items: center;
    height: 30px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--c) 45%, var(--white));
    font-size: 12.5px;
    font-weight: 600;
  }
  .qt {
    display: grid;
    min-width: 0;
  }
  .qt b {
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .qt span {
    font-size: 12px;
  }
  .qs {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .cell {
    width: 60px;
    min-height: 34px;
    padding: 4px 8px;
    border: 0;
    border-radius: 9px;
    background: var(--panel);
    font: inherit;
    text-align: right;
    color: var(--text);
  }
  .qp {
    font-weight: 700;
    text-align: right;
  }
  .qp.good {
    color: #3f7366;
  }
  .qp.low {
    color: #a8434f;
  }
  .qadd {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
    padding: 12px;
    border-radius: 16px;
    background: var(--panel);
  }
  .qadd label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13.5px;
    color: var(--text-muted);
  }
  .qadd .input {
    width: 70px;
    min-height: 38px;
    padding: 4px 8px;
    background: var(--surface);
  }
  .qadd .date {
    width: auto;
  }
</style>
