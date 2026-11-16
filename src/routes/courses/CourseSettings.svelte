<script lang="ts">
  import Icon from "../../lib/components/Icon.svelte";
  import { PALETTE, TAG_ICONS } from "../../lib/calendar";
  import { DEFAULT_SCALE, type Category, type ScaleStep } from "../../lib/grades";
  import { assessments, deleteCourse, getCourse, saveCourse, TERM, type Course } from "../../lib/stores/courses.svelte";
  import { newId } from "../../lib/stores/synced.svelte";
  import { courseEditor } from "./editor.svelte";

  let dialog = $state<HTMLDialogElement>();
  let d = $state<Course | null>(null);
  let error = $state<string | null>(null);
  let confirmDelete = $state(false);

  const PLUS_MINUS: ScaleStep[] = [
    { letter: "A", min: 93 }, { letter: "A-", min: 90 }, { letter: "B+", min: 87 }, { letter: "B", min: 83 }, { letter: "B-", min: 80 },
    { letter: "C+", min: 77 }, { letter: "C", min: 73 }, { letter: "C-", min: 70 }, { letter: "D", min: 60 }, { letter: "F", min: 0 },
  ];
  const TEMPLATES: { label: string; cats: [string, number, number?][] }[] = [
    { label: "Exams, quizzes, assignments", cats: [["Exams", 70], ["Quizzes", 20, 1], ["Assignments", 10]] },
    { label: "Exams and a final", cats: [["Exams", 60], ["Quizzes", 15, 1], ["Final exam", 25]] },
    { label: "Project course", cats: [["Group project", 40], ["Presentations", 20], ["Participation", 10], ["Exams", 30]] },
  ];

  $effect(() => {
    if (courseEditor.shown && dialog && !dialog.open) {
      const c = courseEditor.id ? getCourse(courseEditor.id) : null;
      d = c
        ? structuredClone($state.snapshot(c) as Course)
        : { name: "", code: "", color: PALETTE[8], icon: "book", term: TERM, order: 99, grading: { mode: "category", categories: [], target: 90, scale: DEFAULT_SCALE } };
      error = null;
      confirmDelete = false;
      dialog.showModal();
    }
  });

  function close() {
    courseEditor.shown = false;
    dialog?.close();
  }
  const total = $derived(d ? d.grading.categories.reduce((n, c) => n + (Number(c.weight) || 0), 0) : 0);

  function addCat(name = "", weight = 0, drop?: number) {
    d!.grading.categories = [...d!.grading.categories, { id: newId(), name, weight, ...(drop ? { drop } : {}) }];
  }
  function useTemplate(t: (typeof TEMPLATES)[0]) {
    d!.grading.mode = "category";
    d!.grading.categories = t.cats.map(([n, w, dr]) => ({ id: newId(), name: n, weight: w, ...(dr ? { drop: dr } : {}) }));
  }
  function removeCat(c: Category) {
    const used = courseEditor.id ? assessments(courseEditor.id).filter(([, a]) => a.category === c.id).length : 0;
    if (used && !confirm(`${used} assessments are in “${c.name}”. Remove the category anyway? They'll show as uncategorised.`)) return;
    d!.grading.categories = d!.grading.categories.filter((x) => x.id !== c.id);
  }

  function save(e: SubmitEvent) {
    e.preventDefault();
    if (!d) return;
    if (!d.name.trim()) return (error = "Give the course a name.");
    if (d.grading.mode === "category" && d.grading.categories.length && Math.abs(total - 100) > 0.01)
      return (error = `Category weights add up to ${total}%, not 100%.`);
    if (d.grading.categories.some((c) => !c.name.trim())) return (error = "Every category needs a name.");
    const c: Course = {
      ...$state.snapshot(d),
      name: d.name.trim(),
      code: d.code?.trim() || undefined,
      credits: d.credits ? Number(d.credits) : undefined,
      grading: { ...$state.snapshot(d.grading), target: Number(d.grading.target) || 90, categories: d.grading.categories.map((x) => ({ ...x, weight: Number(x.weight) || 0, drop: Number(x.drop) || undefined })) },
    } as Course;
    const id = saveCourse(courseEditor.id, c);
    if (!courseEditor.id) location.hash = `#/courses/${id}`;
    close();
  }
</script>

<dialog bind:this={dialog} onclose={() => (courseEditor.shown = false)} aria-labelledby="cs-title">
  {#if d}
    <form onsubmit={save}>
      <header>
        <span class="badge" style="background: {d.color}"><Icon name={d.icon} size={20} /></span>
        <h2 id="cs-title" class="h2">{courseEditor.id ? "Course settings" : "New course"}</h2>
        <button type="button" class="x" aria-label="Close" onclick={close}>×</button>
      </header>

      <section>
        <h3 class="label">About</h3>
        <div class="two">
          <label class="field"><span class="label">Name</span><input class="input" bind:value={d.name} placeholder="e.g. Therapeutics IV" /></label>
          <label class="field"><span class="label">Short name</span><input class="input" bind:value={d.code} placeholder="e.g. Ther IV" /></label>
          <label class="field"><span class="label">Term</span><input class="input" bind:value={d.term} /></label>
          <label class="field"><span class="label">Credits</span><input class="input" type="number" min="0" step="0.5" bind:value={d.credits} /></label>
          <label class="field"><span class="label">Instructor</span><input class="input" bind:value={d.instructor} /></label>
          <label class="field"><span class="label">Email</span><input class="input" type="email" bind:value={d.email} /></label>
          <label class="field"><span class="label">Office hours</span><input class="input" bind:value={d.office} placeholder="e.g. Tue 2–4 PM, Rm 318" /></label>
          <label class="field"><span class="label">Class room</span><input class="input" bind:value={d.location} /></label>
        </div>
        <div class="field">
          <span class="label">Colour and icon</span>
          <div class="pick">
            {#each PALETTE as c}<button type="button" class="dot" class:on={d.color === c} style="background: {c}" aria-label="Colour {c}" onclick={() => (d!.color = c)}></button>{/each}
          </div>
          <div class="pick">
            {#each TAG_ICONS as ic}<button type="button" class="ico" class:on={d.icon === ic} aria-label={ic} onclick={() => (d!.icon = ic)}><Icon name={ic} size={17} /></button>{/each}
          </div>
        </div>
      </section>

      <section>
        <h3 class="label">Grading (from the syllabus)</h3>
        <div class="seg" role="radiogroup" aria-label="How the course is graded">
          <button type="button" role="radio" aria-checked={d.grading.mode === "category"} class:on={d.grading.mode === "category"} onclick={() => (d!.grading.mode = "category")}>Weighted categories</button>
          <button type="button" role="radio" aria-checked={d.grading.mode === "points"} class:on={d.grading.mode === "points"} onclick={() => (d!.grading.mode = "points")}>Total points</button>
        </div>
        {#if d.grading.mode === "category"}
          {#if !d.grading.categories.length}
            <p class="muted small">Start from a template, or add categories one by one.</p>
            <div class="tpls">
              {#each TEMPLATES as t}<button type="button" class="btn quiet" onclick={() => useTemplate(t)}>{t.label}</button>{/each}
            </div>
          {/if}
          <div class="cats">
            {#if d.grading.categories.length}
              <div class="cath"><span>Category</span><span>Weight</span><span>Drop lowest</span><span></span></div>
            {/if}
            {#each d.grading.categories as c (c.id)}
              <div class="cat">
                <input class="input" bind:value={c.name} aria-label="Category name" placeholder="e.g. Exams" />
                <label class="pct"><input class="input" type="number" min="0" max="100" step="0.5" bind:value={c.weight} aria-label="Weight of {c.name}" /><span>%</span></label>
                <input class="input" type="number" min="0" max="20" bind:value={c.drop} aria-label="Drop the lowest in {c.name}" placeholder="0" />
                <button type="button" class="rm" aria-label="Remove {c.name}" onclick={() => removeCat(c)}>×</button>
              </div>
            {/each}
            <div class="catfoot">
              <button type="button" class="btn quiet" onclick={() => addCat()}>+ Category</button>
              {#if d.grading.categories.length}<span class="tot" class:bad={Math.abs(total - 100) > 0.01}>Total {total}%</span>{/if}
            </div>
          </div>
        {:else}
          <p class="muted small">Your grade is points earned ÷ points possible across every assessment.</p>
        {/if}

        <div class="two">
          <label class="field"><span class="label">Your target</span><span class="pct"><input class="input" type="number" min="0" max="110" step="0.5" bind:value={d.grading.target} /><span>%</span></span></label>
          <div class="field">
            <span class="label">Letter scale</span>
            <div class="seg">
              <button type="button" class:on={d.grading.scale.length === 5} onclick={() => (d!.grading.scale = DEFAULT_SCALE)}>A–F (90/80/70/60)</button>
              <button type="button" class:on={d.grading.scale.length > 5} onclick={() => (d!.grading.scale = PLUS_MINUS)}>With + / −</button>
            </div>
          </div>
        </div>
        <details class="scale">
          <summary>Edit the cut-offs</summary>
          <div class="steps">
            {#each d.grading.scale as s, i}
              <label><input class="input" bind:value={s.letter} aria-label="Letter" /> ≥ <input class="input" type="number" bind:value={s.min} aria-label="Minimum for {s.letter}" />%</label>
            {/each}
          </div>
        </details>
      </section>

      <section>
        <h3 class="label">Extras</h3>
        <label class="check"><input type="checkbox" checked={d.tracker === "drugs"} onchange={(e) => (d!.tracker = e.currentTarget.checked ? "drugs" : undefined)} /> Drug quiz tracker (Top 200/300)</label>
        {#if d.tracker === "drugs"}
          <label class="field inline"><span class="label">Drugs on the list</span><input class="input" type="number" min="1" bind:value={d.drugTotal} placeholder="300" /></label>
        {/if}
        <label class="check"><input type="checkbox" bind:checked={d.archived} /> Archived (hidden from pickers and the dashboard)</label>
      </section>

      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <footer>
        {#if courseEditor.id}
          {#if confirmDelete}
            <button type="button" class="btn quiet danger" onclick={() => { deleteCourse(courseEditor.id!); close(); location.hash = "#/courses"; }}>Delete course and its grades</button>
          {:else}
            <button type="button" class="btn quiet" onclick={() => (confirmDelete = true)}>Delete</button>
          {/if}
        {/if}
        <span class="spacer"></span>
        <button type="button" class="btn quiet" onclick={close}>Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </footer>
    </form>
  {/if}
</dialog>

<style>
  dialog {
    width: min(640px, calc(100vw - 24px));
    max-height: calc(100vh - 32px);
    border: 0;
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-lift);
    padding: 0;
  }
  dialog::backdrop {
    background: rgba(59, 48, 51, 0.2);
  }
  form {
    display: grid;
    gap: 18px;
    padding: 22px;
  }
  header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
  }
  .badge {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 14px;
  }
  header .h2 {
    font-size: 20px;
  }
  .x {
    width: var(--hit);
    height: var(--hit);
    border: 0;
    border-radius: 50%;
    background: transparent;
    font-size: 24px;
    color: var(--text-muted);
  }
  section {
    display: grid;
    gap: 12px;
    padding-top: 14px;
    border-top: 1px solid var(--hairline);
  }
  section > .label {
    font-size: 13px;
    font-weight: 600;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 12px;
  }
  @media (max-width: 560px) {
    .two {
      grid-template-columns: 1fr;
    }
  }
  .input {
    padding: 8px 12px;
  }
  .pick {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .dot {
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
  }
  .dot.on {
    box-shadow: 0 0 0 2px var(--surface), 0 0 0 4px var(--charcoal);
  }
  .ico {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 11px;
    background: var(--panel);
    color: var(--text-muted);
  }
  .ico.on {
    background: var(--charcoal);
    color: var(--on-primary);
  }
  .seg {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-pill);
    background: var(--panel);
  }
  .seg button {
    flex: 1;
    min-height: 38px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    font-weight: 500;
    font-size: 13.5px;
    color: var(--text-muted);
  }
  .seg button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  .small {
    font-size: 13.5px;
  }
  .tpls {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .cats {
    display: grid;
    gap: 6px;
  }
  .cath,
  .cat {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 110px 110px 36px;
    gap: 8px;
    align-items: center;
  }
  .cath {
    font-size: 12px;
    color: var(--text-muted);
    padding: 0 4px;
  }
  .pct {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pct span {
    color: var(--text-muted);
  }
  .rm {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    background: none;
    font-size: 20px;
    color: var(--text-muted);
  }
  .rm:hover {
    background: var(--rose-soft);
  }
  .catfoot {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .tot {
    font-weight: 600;
    font-size: 14px;
  }
  .tot.bad {
    color: #a8434f;
  }
  .scale summary {
    cursor: pointer;
    font-size: 13.5px;
    color: var(--text-muted);
  }
  .steps {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 6px;
    margin-top: 8px;
  }
  .steps label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .steps .input {
    width: 56px;
    min-height: 34px;
    padding: 4px 8px;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    font-size: 14.5px;
    cursor: pointer;
  }
  .check input {
    width: 18px;
    height: 18px;
    accent-color: var(--sage-deep);
  }
  .inline {
    grid-template-columns: auto 120px;
    align-items: center;
  }
  .error {
    background: var(--rose-soft);
    color: #8f3b45;
    border-radius: var(--radius-sm);
    padding: 8px 12px;
  }
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .spacer {
    flex: 1;
  }
  .danger {
    background: var(--rose-soft);
    color: #8f3b45;
  }
</style>
