<script lang="ts">
  // Assessments for a course, grouped by category, edited in place. In what-if mode,
  // ungraded rows take hypothetical scores that feed the projection in the header.
  import Icon from "../../lib/components/Icon.svelte";
  import { fromKey } from "../../lib/calendar";
  import { isGraded, pctOf, type Assessment, type GradeResult } from "../../lib/grades";
  import { assessments, deleteAssessment, getCourse, saveAssessment } from "../../lib/stores/courses.svelte";
  import { courseEditor } from "./editor.svelte";

  let { id, g, whatIf = $bindable(), whatIfOn = $bindable() }: { id: string; g: GradeResult; whatIf: Record<string, number>; whatIfOn: boolean } = $props();

  const course = $derived(getCourse(id)!);
  const list = $derived(assessments(id));
  const cats = $derived(course.grading.mode === "category" ? course.grading.categories : [{ id: "", name: "Assessments", weight: 100 }]);
  const inCat = (cid: string) =>
    course.grading.mode === "points" ? list : list.filter(([, a]) => (cid ? a.category === cid : false));
  const orphans = $derived(course.grading.mode === "category" ? list.filter(([, a]) => !a.category || !cats.some((c) => c.id === a.category)) : []);
  const res = (cid: string) => g.categories.find((c) => c.id === (course.grading.mode === "points" ? "all" : cid));

  function patch(aid: string, a: Assessment, p: Partial<Assessment>) {
    saveAssessment(aid, { ...a, ...p });
  }
  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  let adding = $state<Record<string, { name: string; max: string }>>({});
  function add(cid: string) {
    const f = adding[cid];
    if (!f?.name.trim()) return;
    saveAssessment(null, { courseId: id, name: f.name.trim(), category: cid || undefined, max: Number(f.max) || 100, score: null, created: Date.now() });
    adding[cid] = { name: "", max: f.max };
  }
  const fmt = (n: number | null | undefined, d = 1) => (n === null || n === undefined ? "–" : `${Number(n.toFixed(d))}%`);
</script>

<section class="card grades">
  <div class="gh">
    <h2 class="h2">Grades</h2>
    <div class="ghr">
      <label class="switch"><input type="checkbox" bind:checked={whatIfOn} /> What if…</label>
      <button type="button" class="btn quiet sm" onclick={() => courseEditor.open(id)}><Icon name="settings" size={15} /> Grading setup</button>
    </div>
  </div>

  {#if course.grading.mode === "category" && !course.grading.categories.length}
    <div class="setup">
      <Icon name="bulb" size={22} />
      <div>
        <b>Add the grading breakdown from the syllabus</b>
        <p class="muted">Weighted categories (like Exams 60%) or total points. Then enter scores as they come in, and see what you need on the rest.</p>
      </div>
      <button type="button" class="btn primary" onclick={() => courseEditor.open(id)}>Set up grading</button>
    </div>
  {:else}
    {#if course.grading.mode === "category"}
      <div class="catbars">
        {#each g.categories as c (c.id)}
          <div class="cb" title="{c.name}: {fmt(c.pct)} on {c.gradedCount} graded">
            <div class="cbt"><b>{c.name}</b><span>{c.weight}%</span></div>
            <span class="bar"><span style="width: {c.pct ?? 0}%"></span></span>
            <div class="cbs"><span>{fmt(c.pct)}</span><span>{c.gradedCount}/{c.gradedCount + c.remainingCount} graded</span></div>
          </div>
        {/each}
      </div>
    {/if}
    {#if whatIfOn}
      <p class="wi">Type a score you might get on anything not graded yet; the header shows where that would leave you. Nothing is saved.</p>
    {/if}

    {#each cats as c (c.id)}
      {@const rows = inCat(c.id)}
      {@const r = res(c.id)}
      <div class="cat">
        <div class="ch">
          <b>{c.name}</b>
          {#if course.grading.mode === "category"}<span class="tag">{c.weight}%</span>{/if}
          {#if "drop" in c && c.drop}<span class="tag">drops lowest {c.drop}</span>{/if}
          <span class="cp">{fmt(r?.pct ?? null)}</span>
        </div>
        {#if rows.length}
          <div class="table" role="table" aria-label="{c.name} assessments">
            <div class="tr th" role="row"><span role="columnheader">Assessment</span><span role="columnheader">Date</span><span role="columnheader">Score</span><span role="columnheader">%</span><span></span></div>
            {#each rows as [aid, a] (aid)}
              {@const dropped = r?.dropped.includes(aid)}
              <div class="tr" role="row" class:ungraded={!isGraded(a)} class:dropped class:excluded={a.excluded}>
                <input class="cell name" value={a.name} aria-label="Name" onchange={(e) => e.currentTarget.value.trim() && patch(aid, a, { name: e.currentTarget.value.trim() })} />
                <input class="cell date" type="date" value={a.date ?? ""} aria-label="Date of {a.name}" onchange={(e) => patch(aid, a, { date: e.currentTarget.value || undefined })} />
                <span class="score">
                  {#if whatIfOn && !isGraded(a)}
                    <input class="cell n wif" type="number" step="any" placeholder="?" value={whatIf[aid] ?? ""} aria-label="What-if score for {a.name}"
                      oninput={(e) => { const v = num(e.currentTarget.value); if (v === null) { const { [aid]: _, ...rest } = whatIf; whatIf = rest; } else whatIf = { ...whatIf, [aid]: v }; }} />
                  {:else}
                    <input class="cell n" type="number" step="any" placeholder="–" value={a.score ?? ""} aria-label="Score for {a.name}" onchange={(e) => patch(aid, a, { score: num(e.currentTarget.value) })} />
                  {/if}
                  <span class="sl">/</span>
                  <input class="cell n" type="number" step="any" min="0" value={a.max} aria-label="Out of, for {a.name}" onchange={(e) => patch(aid, a, { max: Number(e.currentTarget.value) || 0 })} />
                </span>
                <span class="p">
                  {#if whatIfOn && !isGraded(a) && whatIf[aid] !== undefined && a.max}<i>{fmt((whatIf[aid] / a.max) * 100, 0)}</i>{:else}{fmt(pctOf(a), 1)}{/if}
                  {#if dropped}<small>dropped</small>{/if}{#if a.extra}<small>extra</small>{/if}{#if a.excluded}<small>excused</small>{/if}
                </span>
                <details class="more">
                  <summary aria-label="More for {a.name}"><Icon name="dots" size={16} /></summary>
                  <div class="menu">
                    <label><input type="checkbox" checked={!!a.extra} onchange={(e) => patch(aid, a, { extra: e.currentTarget.checked || undefined })} /> Extra credit</label>
                    <label><input type="checkbox" checked={!!a.excluded} onchange={(e) => patch(aid, a, { excluded: e.currentTarget.checked || undefined })} /> Excused (not counted)</label>
                    {#if course.grading.mode === "category"}
                      <label class="mv">Category
                        <select value={a.category ?? ""} onchange={(e) => patch(aid, a, { category: e.currentTarget.value || undefined })}>
                          {#each course.grading.categories as k}<option value={k.id}>{k.name}</option>{/each}
                        </select>
                      </label>
                    {/if}
                    <button type="button" class="del" onclick={() => deleteAssessment(aid)}>Delete</button>
                  </div>
                </details>
              </div>
            {/each}
          </div>
        {/if}
        <form class="add" onsubmit={(e) => { e.preventDefault(); add(c.id); }}>
          <input class="input" placeholder={`Add to ${c.name}, e.g. ${c.name.toLowerCase().includes("exam") ? "Exam 3" : c.name.toLowerCase().includes("quiz") ? "Quiz 4" : "Case 2"}`} aria-label="New assessment in {c.name}"
            value={adding[c.id]?.name ?? ""} oninput={(e) => (adding[c.id] = { name: e.currentTarget.value, max: adding[c.id]?.max ?? "100" })} />
          <label class="outof">out of <input class="input" type="number" min="0" step="any" aria-label="Points possible"
            value={adding[c.id]?.max ?? "100"} oninput={(e) => (adding[c.id] = { name: adding[c.id]?.name ?? "", max: e.currentTarget.value })} /></label>
          <button type="submit" class="btn quiet sm">Add</button>
        </form>
      </div>
    {/each}

    {#if orphans.length}
      <div class="cat orph">
        <div class="ch"><b>Not in a category</b><span class="muted small">These don't count until you move them (⋯ → Category).</span></div>
        {#each orphans as [aid, a] (aid)}
          <div class="orow"><span>{a.name}</span><span class="muted">{a.score ?? "–"} / {a.max}</span>
            <select class="input" aria-label="Category for {a.name}" onchange={(e) => patch(aid, a, { category: e.currentTarget.value || undefined })}>
              <option value="">Choose…</option>
              {#each course.grading.categories as k}<option value={k.id}>{k.name}</option>{/each}
            </select>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</section>

<style>
  .grades {
    display: grid;
    gap: 16px;
  }
  .gh {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .ghr {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sm {
    min-height: 38px;
    padding: 0 14px;
    font-size: 13.5px;
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    padding: 0 14px;
    border-radius: var(--radius-pill);
    background: var(--lavender);
    background: color-mix(in srgb, var(--lavender) 25%, var(--white));
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .switch input {
    width: 17px;
    height: 17px;
    accent-color: #8e6fd1;
  }
  .wi {
    font-size: 13.5px;
    padding: 8px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--lavender) 22%, var(--white));
  }
  .setup {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 14px;
    align-items: center;
    padding: 16px;
    border-radius: 18px;
    background: var(--butter-soft);
  }
  .setup p {
    font-size: 13.5px;
  }
  @media (max-width: 640px) {
    .setup {
      grid-template-columns: auto 1fr;
    }
    .setup .btn {
      grid-column: 1 / -1;
    }
  }
  .catbars {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 10px;
  }
  .cb {
    display: grid;
    gap: 6px;
    padding: 12px;
    border-radius: 16px;
    background: var(--panel);
  }
  .cbt,
  .cbs {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
  }
  .cbt b {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cbt span,
  .cbs span:last-child {
    color: var(--text-muted);
  }
  .cbs span:first-child {
    font-weight: 600;
  }
  .bar {
    height: 8px;
    border-radius: var(--radius-pill);
    background: var(--surface);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: color-mix(in srgb, var(--c) 75%, var(--charcoal));
  }
  .cat {
    display: grid;
    gap: 6px;
  }
  .ch {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 0 4px;
  }
  .ch b {
    font-size: 15px;
    font-weight: 600;
  }
  .cp {
    margin-left: auto;
    font-weight: 600;
  }
  .table {
    display: grid;
    border-radius: 16px;
    background: var(--panel);
    padding: 4px;
  }
  .tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 140px 170px 84px 38px;
    gap: 6px;
    align-items: center;
    padding: 3px 4px;
    border-radius: 12px;
  }
  .tr:not(.th):hover {
    background: var(--surface);
  }
  .th {
    font-size: 12px;
    color: var(--text-muted);
    padding: 6px 8px 2px;
  }
  .cell {
    min-width: 0;
    min-height: 36px;
    padding: 4px 8px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    font: inherit;
    font-size: 14px;
    color: inherit;
  }
  .cell:hover,
  .cell:focus {
    background: var(--surface);
  }
  .name {
    font-weight: 500;
  }
  .date {
    font-size: 13px;
    color: var(--text-muted);
  }
  .score {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .n {
    width: 74px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .wif {
    background: color-mix(in srgb, var(--lavender) 30%, var(--white));
  }
  .sl {
    color: var(--text-muted);
  }
  .p {
    display: grid;
    font-weight: 600;
    font-size: 14px;
    text-align: right;
    line-height: 1.1;
  }
  .p i {
    font-style: normal;
    color: var(--link-ink);
  }
  .p small {
    font-size: 10.5px;
    font-weight: 500;
    color: var(--text-muted);
  }
  .ungraded .name {
    color: var(--text-muted);
  }
  .dropped .name,
  .excluded .name {
    text-decoration: line-through;
  }
  .more {
    position: relative;
  }
  .more summary {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    cursor: pointer;
    list-style: none;
    color: var(--text-muted);
  }
  .more summary::-webkit-details-marker {
    display: none;
  }
  .more summary:hover {
    background: var(--surface);
  }
  .menu {
    position: absolute;
    right: 0;
    top: 38px;
    z-index: 5;
    display: grid;
    gap: 2px;
    min-width: 220px;
    padding: 8px;
    border-radius: 14px;
    background: var(--surface);
    box-shadow: var(--shadow-lift);
  }
  .menu label {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 8px;
    font-size: 13.5px;
    cursor: pointer;
  }
  .menu input {
    width: 16px;
    height: 16px;
    accent-color: var(--sage-deep);
  }
  .menu select {
    margin-left: auto;
    min-height: 32px;
    padding: 2px 30px 2px 8px;
    background-color: var(--panel);
    font: inherit;
    font-size: 13px;
  }
  .del {
    min-height: 36px;
    border: 0;
    border-radius: 10px;
    background: var(--rose-soft);
    color: var(--alert-ink);
    font-weight: 500;
  }
  .add {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px;
    align-items: center;
  }
  .add .input {
    min-height: 40px;
    padding: 6px 12px;
  }
  .outof {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text-muted);
  }
  .outof .input {
    width: 80px;
  }
  .orph {
    padding: 12px;
    border-radius: 16px;
    background: var(--rose-soft);
  }
  .small {
    font-size: 13px;
  }
  .orow {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 180px;
    gap: 10px;
    align-items: center;
    font-size: 14px;
  }
  @media (max-width: 760px) {
    .tr {
      grid-template-columns: minmax(0, 1fr) 160px 38px;
    }
    .th span:nth-child(2),
    .th span:nth-child(4),
    .date,
    .p {
      display: none;
    }
  }
</style>
