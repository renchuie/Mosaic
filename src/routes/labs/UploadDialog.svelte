<script lang="ts">
  // Add materials: recall lab .html files and Mosaic quiz .md files (dropped, picked or pasted). Each file is checked, then
  // filed under Materials/<course folder>/<exam or topic>/. A lab that already exists (same
  // progress key) can be replaced in place, which keeps all its progress.
  import Icon from "../../lib/components/Icon.svelte";
  import { inspectHtml, safeName, type Inspected } from "../../lib/materials";
  import { parseQuiz } from "../../lib/quiz";
  import { courseByName, courseNames } from "../../lib/stores/courses.svelte";
  import {
    allRels, destRel, findFolder, folderMeta, inherited, labs, labsIn, materialsIn, saveUploads, uniqueRel, type Item, type MaterialMeta,
  } from "../../lib/stores/labs.svelte";

  let {
    open = $bindable(false),
    files = [],
    dir = "",
    onsaved,
  }: { open: boolean; files: File[]; dir?: string; onsaved?: (rels: string[]) => void } = $props();

  type Row = {
    file: File; text: string; ins: Inspected; course: string; exam: string; existing: Item | null; mode: "replace" | "new"; include: boolean;
    /** set for Mosaic quiz files */
    quiz?: { meta: MaterialMeta; problems: number };
  };
  let dialog = $state<HTMLDialogElement>();
  let rows = $state<Row[]>([]);
  let saving = $state(false);
  let error = $state<string | null>(null);

  /** the top-level folder that holds a course's materials */
  function courseDir(course: string): string {
    if (!course) return "";
    const top = labs.tree?.folders.find((f) => folderMeta(f.rel).course === course);
    if (top) return top.rel;
    const c = courseByName(course)?.[1];
    return safeName(c?.code || course);
  }
  const examChoices = (course: string) => findFolder(courseDir(course))?.folders.map((f) => f.name) ?? [];

  $effect(() => {
    if (open && dialog && !dialog.open) {
      error = null;
      rows = [];
      dialog.showModal();
      void load();
    }
  });

  async function load() {
    const here = dir ? (folderMeta(dir).course ?? inherited(dir, "course") ?? "") : "";
    const top = dir.split("/")[0] ?? "";
    const examFromDir = dir.includes("/") ? dir.slice(top.length + 1) : "";
    const list: Row[] = [];
    for (const file of files) {
      const text = await file.text();
      if (/\.md$/i.test(file.name)) {
        const q = parseQuiz(text, file.name.replace(/\.md$/i, ""));
        const isQuiz = q.meta.mosaic === "quiz";
        const meta: MaterialMeta = { kind: "quiz", title: q.meta.title, id: q.meta.id, course: q.meta.course ?? null, exam: q.meta.exam ?? null, count: q.questions.length };
        const existing = isQuiz ? (materialsIn(labs.tree, "quiz").find((m) => m.mat.id === meta.id)?.item ?? null) : null;
        const course = !dir && q.meta.course && courseNames().includes(q.meta.course) ? q.meta.course : here;
        const exam = !dir && q.meta.exam ? q.meta.exam : examFromDir;
        list.push({ file, text, ins: { isLab: false, title: q.meta.title, slug: q.meta.id, slugGuessed: false, version: "" }, course, exam, existing, mode: existing ? "replace" : "new", include: isQuiz && q.questions.length > 0, quiz: isQuiz ? { meta, problems: q.problems.length } : undefined });
        continue;
      }
      const ins = inspectHtml(text, file.name);
      const existing = ins.isLab ? (labsIn(labs.tree).find((l) => l.lab.slug === ins.slug)?.item ?? null) : null;
      list.push({ file, text, ins, course: here, exam: examFromDir, existing, mode: existing ? "replace" : "new", include: ins.isLab });
    }
    rows = list;
  }

  /** where each row goes, with names made unique across the folder and this batch */
  const plan = $derived.by(() => {
    const taken = allRels();
    return rows.map((r) => {
      if (!r.include) return null;
      if (r.existing && r.mode === "replace") return { rel: r.existing.rel, replace: true };
      const base = dir && !r.course && !r.exam ? `${dir}/${safeName(r.file.name)}` : destRel(r.course ? courseDir(r.course) : dir.split("/")[0] ?? "", r.exam, r.file.name);
      const rel = uniqueRel(base, (x) => taken.has(x));
      taken.add(rel);
      return { rel, replace: false };
    });
  });
  const count = $derived(plan.filter(Boolean).length);

  async function save() {
    error = null;
    saving = true;
    try {
      const saved = await saveUploads(
        rows.flatMap((r, i) => {
          const p = plan[i];
          if (!p) return [];
          return [{ rel: p.rel, content: r.text, replace: p.replace, course: r.course || undefined, courseDir: r.course ? courseDir(r.course) : undefined, lab: r.ins.isLab ? { title: r.ins.title, version: r.ins.version, slug: r.ins.slug, slug_guessed: r.ins.slugGuessed } : null, mat: r.quiz?.meta ?? null }];
        }),
      );
      onsaved?.(saved);
      dialog?.close();
    } catch (e) {
      error = String((e as Error)?.message ?? e);
    } finally {
      saving = false;
    }
  }
</script>

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="up-title">
  <form onsubmit={(e) => { e.preventDefault(); void save(); }}>
    <header>
      <h2 id="up-title" class="h2">Add to Materials</h2>
      <button type="button" class="x" aria-label="Close" onclick={() => dialog?.close()}>×</button>
    </header>
    {#if !rows.length}
      <p class="muted">Reading {files.length} {files.length === 1 ? "file" : "files"}…</p>
    {/if}
    <ul class="rows">
      {#each rows as r, i}
        <li class="row" class:off={!r.include}>
          <div class="top">
            <span class="kind" class:lab={r.ins.isLab} class:quiz={!!r.quiz}><Icon name={r.ins.isLab ? "labs" : r.quiz ? "check" : "file"} size={16} /></span>
            <span class="what">
              <b>{r.ins.title}</b>
              <span class="muted sm">{r.file.name} · {r.quiz ? `Quiz · ${r.quiz.meta.count} ${r.quiz.meta.count === 1 ? "question" : "questions"}${r.quiz.problems ? ` · ${r.quiz.problems} ${r.quiz.problems === 1 ? "part" : "parts"} couldn't be read` : ""}` : r.ins.isLab ? `Recall lab v${r.ins.version}` : /\.md$/i.test(r.file.name) ? "Not a Mosaic quiz (no “mosaic: quiz” header)" : "Not a recall lab"}{r.ins.isLab && r.ins.slugGuessed ? " · progress key guessed from the file name" : ""}</span>
            </span>
            {#if !r.ins.isLab && !r.quiz}
              <label class="inc"><input type="checkbox" bind:checked={r.include} /> Add anyway as a file</label>
            {/if}
          </div>
          {#if r.include}
            {#if r.existing}
              <div class="dupe" role="radiogroup" aria-label="Already in Materials">
                <span class="sm">You already have this {r.quiz ? "quiz" : "lab"} at <b>{r.existing.rel}</b>.</span>
                <label><input type="radio" bind:group={r.mode} value="replace" /> Replace it, keep my progress</label>
                <label><input type="radio" bind:group={r.mode} value="new" /> Add a second copy (both share the same progress)</label>
              </div>
            {/if}
            {#if !(r.existing && r.mode === "replace")}
              <div class="where">
                <label class="field"><span class="label">Course</span>
                  <select class="input" bind:value={r.course}><option value="">No course</option>{#each courseNames() as c}<option value={c}>{c}</option>{/each}</select>
                </label>
                <label class="field"><span class="label">Exam or topic folder</span>
                  <input class="input" bind:value={r.exam} placeholder="Optional" list="exams-{i}" />
                  <datalist id="exams-{i}">{#each examChoices(r.course) as e}<option value={e}></option>{/each}</datalist>
                </label>
              </div>
            {/if}
            {#if plan[i]}<p class="dest sm"><Icon name="folder" size={13} /> {plan[i]!.replace ? "Replaces" : "Saves as"} <b>Materials/{plan[i]!.rel}</b></p>{/if}
          {/if}
        </li>
      {/each}
    </ul>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <footer>
      <span class="muted sm">Copied into Materials.</span>
      <span class="sp"></span>
      <button type="button" class="btn quiet" onclick={() => dialog?.close()}>Cancel</button>
      <button type="submit" class="btn primary" disabled={!count || saving}>{saving ? "Saving…" : `Add ${count || ""} ${count === 1 ? "file" : "files"}`}</button>
    </footer>
  </form>
</dialog>

<style>
  dialog {
    width: min(720px, calc(100vw - 24px));
    max-height: calc(100vh - 24px);
    border: 0;
    border-radius: var(--radius);
    background: var(--surface-float);
    color: var(--text);
    box-shadow: var(--shadow-lift);
    padding: 0;
  }
  dialog::backdrop {
    background: var(--scrim);
  }
  form {
    display: grid;
    gap: 14px;
    padding: 20px 22px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .x {
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 50%;
    background: var(--chip);
    font-size: 20px;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
    max-height: 56vh;
    overflow: auto;
  }
  .row {
    display: grid;
    gap: 10px;
    padding: 14px;
    border-radius: 18px;
    background: var(--chip);
    animation: pop-in 0.4s var(--spring) backwards;
  }
  .row.off {
    opacity: 0.7;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .kind {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    flex: none;
    border-radius: 12px;
    background: var(--surface);
  }
  .kind.lab {
    background: var(--sage-soft);
  }
  .kind.quiz {
    background: color-mix(in srgb, var(--lavender) 40%, var(--white));
  }
  .what {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .what b {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .sm {
    font-size: 13px;
  }
  .inc {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    white-space: nowrap;
  }
  .dupe {
    display: grid;
    gap: 6px;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--butter-soft);
  }
  .dupe label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    min-height: 32px;
  }
  .where {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .dest {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }
  .error {
    color: var(--rose-deep);
  }
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .sp {
    flex: 1;
  }
  @media (max-width: 560px) {
    .where {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
