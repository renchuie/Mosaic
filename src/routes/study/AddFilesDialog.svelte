<script lang="ts">
  // Add files (Nov 20, her ask: "when you upload a file you should get a pop up that asks if you
  // want to rename it, what course it's for, what lecture it's in"). Opens for Upload, drops and
  // Paste quiz on Files and on lecture pages. One row per file: name, course, lecture (or a new
  // one), and for a quiz or interactive page already in Materials: replace it (keeps progress) or
  // add a copy. "All files" sets course and lecture for every row at once.
  // Where each lands: PDFs → PDF folder/<course>/, notes → notes folder/<course>/ (course set in
  // the note), quizzes and pages → Materials/<course folder>/<exam>/ (as the old upload did).
  import Icon from "../../lib/components/Icon.svelte";
  import { inspectHtml, safeName, destRel, uniqueRel, type Inspected } from "../../lib/materials";
  import { parseQuiz } from "../../lib/quiz";
  import { courseByName, courseNames } from "../../lib/stores/courses.svelte";
  import { allRels, folderMeta, labs, labsIn, materialsIn, saveUploads, type Item, type MaterialMeta } from "../../lib/stores/labs.svelte";
  import { addPdf, pdfs } from "../../lib/stores/pdfs.svelte";
  import { importNote } from "../../lib/stores/notes.svelte";
  import { fileNameFor, joinNote, splitNote } from "../../lib/notes";
  import { exams } from "../../lib/stores/calendar.svelte";
  import { addLecture, addLinks, getLecture, lectures, type Link } from "../../lib/stores/outline.svelte";
  import { shortExam } from "../../lib/stores/deckTree.svelte";
  import { tell } from "../../lib/stores/fileOps.svelte";

  let {
    open = $bindable(false),
    files = [],
    course: startCourse = "",
    lecture: startLecture = "",
    ondone,
  }: { open: boolean; files: File[]; course?: string; lecture?: string; ondone?: (links: Link[]) => void } = $props();

  type Kind = "pdf" | "note" | "quiz" | "page" | "skip";
  type Row = {
    file: File; kind: Kind; name: string; ext: string; text?: string; bytes?: Uint8Array;
    course: string; lecture: string; newLecture: string;
    ins?: Inspected; quiz?: MaterialMeta; existing: Item | null; mode: "replace" | "new";
  };
  let dialog = $state<HTMLDialogElement>();
  let rows = $state<Row[]>([]);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let allCourse = $state("");
  let allLecture = $state("");
  let allNew = $state("");

  $effect(() => {
    if (open && dialog && !dialog.open) {
      error = null;
      rows = [];
      allCourse = startCourse;
      allLecture = startLecture;
      dialog.showModal();
      void load();
    } else if (!open && dialog?.open) dialog.close();
  });

  const stem = (n: string) => n.replace(/\.[^.]+$/, "");
  async function load() {
    const list: Row[] = [];
    for (const file of files) {
      const ext = (/\.[^.]+$/.exec(file.name)?.[0] ?? "").toLowerCase();
      const base: Row = { file, kind: "skip", name: stem(file.name), ext, course: startCourse, lecture: startLecture, newLecture: "", existing: null, mode: "new" };
      if (ext === ".pdf") list.push({ ...base, kind: "pdf", bytes: new Uint8Array(await file.arrayBuffer()) });
      else if ([".md", ".markdown", ".txt"].includes(ext)) {
        const text = await file.text();
        const { meta } = splitNote(text);
        if (meta.mosaic === "quiz") {
          const q = parseQuiz(text, stem(file.name));
          const m: MaterialMeta = { kind: "quiz", title: q.meta.title, id: q.meta.id, course: q.meta.course ?? null, exam: q.meta.exam ?? null, count: q.questions.length };
          const existing = materialsIn(labs.tree, "quiz").find((x) => x.mat.id === m.id)?.item ?? null;
          const c = !startCourse && q.meta.course && courseNames().includes(q.meta.course) ? q.meta.course : startCourse;
          list.push({ ...base, kind: "quiz", text, quiz: m, existing, mode: existing ? "replace" : "new", course: c, name: q.meta.title || base.name });
        } else list.push({ ...base, kind: "note", text, course: startCourse || (meta.course && courseNames().includes(String(meta.course)) ? String(meta.course) : "") });
      } else if (ext === ".html" || ext === ".htm") {
        const text = await file.text();
        const ins = inspectHtml(text, file.name);
        const existing = ins.isLab ? (labsIn(labs.tree).find((l) => l.lab.slug === ins.slug)?.item ?? null) : null;
        list.push({ ...base, kind: "page", text, ins, existing, mode: existing ? "replace" : "new", name: ins.isLab && ins.title ? ins.title : base.name });
      } else list.push(base);
    }
    rows = list;
  }

  // lectures to pick from, grouped by exam
  function lectureGroups(course: string) {
    if (!course) return [];
    const mine = lectures(course);
    const ex = exams().filter((e) => e.course === course);
    const known = new Set(ex.map((e) => e.key));
    const groups = [...ex.filter((e) => e.days >= 0), ...ex.filter((e) => e.days < 0).reverse()].map((e) => ({ name: shortExam(e), items: mine.filter(([, l]) => l.exam === e.key) })).filter((g) => g.items.length);
    const other = mine.filter(([, l]) => !l.exam || !known.has(l.exam));
    if (other.length) groups.push({ name: groups.length ? "Other" : "Lectures", items: other });
    return groups;
  }
  function setAll(field: "course" | "lecture", v: string) {
    for (const r of rows) {
      if (field === "course") {
        r.course = v;
        if (r.lecture && r.lecture !== "new" && getLecture(r.lecture)?.course !== v) r.lecture = "";
      } else r.lecture = v;
    }
    if (field === "course" && allLecture && allLecture !== "new" && getLecture(allLecture)?.course !== v) allLecture = "";
  }
  const KIND_TEXT: Record<Kind, string> = { pdf: "PDF", note: "Note", quiz: "Quiz", page: "Interactive page", skip: "Can't add this kind of file" };
  const KIND_ICON: Record<Kind, string> = { pdf: "file", note: "note", quiz: "i:circle-help", page: "i:app-window", skip: "i:x" };
  const count = $derived(rows.filter((r) => r.kind !== "skip").length);

  /** the Materials folder that holds a course's quizzes and pages */
  function courseDir(course: string): string {
    if (!course) return "";
    const top = labs.tree?.folders.find((f) => folderMeta(f.rel).course === course);
    if (top) return top.rel;
    const c = courseByName(course)?.[1];
    return safeName(c?.code || course);
  }

  async function save() {
    error = null;
    saving = true;
    const made = new Map<string, string>();
    const links: Link[] = [];
    try {
      const takenMat = allRels();
      for (const r of rows) {
        if (r.kind === "skip") continue;
        // the lecture it goes in (a new one is made once per course + name)
        let lec = r.lecture;
        if (lec === "new") {
          const t = r.newLecture.trim();
          if (!t || !r.course) lec = "";
          else {
            const k = `${r.course}|${t.toLowerCase()}`;
            if (!made.has(k)) {
              const next = exams().find((e) => e.course === r.course && e.days >= 0);
              made.set(k, addLecture(r.course, next?.key ?? "", t));
            }
            lec = made.get(k)!;
          }
        }
        const c = r.course ? courseByName(r.course)?.[1] : undefined;
        const name = safeName(r.name.trim()) || stem(r.file.name);
        let link: Link | null = null;
        if (r.kind === "pdf") {
          const dir = c ? safeName(c.code || c.name) : "";
          const taken = new Set(pdfs.files.map((x) => x.rel));
          let rel = `${dir ? dir + "/" : ""}${name}.pdf`;
          for (let n = 2; taken.has(rel); n++) rel = `${dir ? dir + "/" : ""}${name} (${n}).pdf`;
          await addPdf(rel, r.bytes!);
          link = { kind: "pdf", ref: rel };
        } else if (r.kind === "note") {
          const { meta, body } = splitNote(r.text!);
          const text = c && meta.course !== c.name ? joinNote({ ...meta, course: c.name }, body) : r.text!;
          const rel = await importNote(c ? fileNameFor(c.name).replace(/\.md$/, "") : "", `${name}.md`, text);
          link = { kind: "note", ref: rel };
        } else {
          let rel: string;
          let replace = false;
          if (r.existing && r.mode === "replace") {
            rel = r.existing.rel;
            replace = true;
          } else {
            const l = lec ? getLecture(lec) : undefined;
            const ex = l?.exam ? exams().find((e) => e.key === l.exam) : undefined;
            rel = uniqueRel(destRel(courseDir(r.course), ex ? shortExam(ex) : "", name + (r.kind === "quiz" ? ".md" : r.ext)), (x) => takenMat.has(x));
            takenMat.add(rel);
          }
          const lab = r.ins?.isLab ? { title: r.ins.title, version: r.ins.version, slug: r.ins.slug, slug_guessed: r.ins.slugGuessed } : null;
          await saveUploads([{ rel, content: r.text!, replace, course: r.course || undefined, courseDir: r.course ? courseDir(r.course) : undefined, lab, mat: r.quiz ?? null }]);
          link = { kind: "file", ref: rel };
        }
        links.push(link);
        if (lec) addLinks(lec, [link]);
      }
      tell(`Added ${links.length} ${links.length === 1 ? "file" : "files"}`);
      ondone?.(links);
      open = false;
    } catch (e) {
      error = String(e instanceof Error ? e.message : e);
    } finally {
      saving = false;
    }
  }
</script>

{#snippet lecturePick(course: string, value: string, set: (v: string) => void, label: string)}
  <select class="input" value={value} aria-label={label} disabled={!course} onchange={(e) => set(e.currentTarget.value)}>
    <option value="">{course ? "No lecture" : "Pick a course first"}</option>
    {#each lectureGroups(course) as g (g.name)}
      <optgroup label={g.name}>{#each g.items as [id, l] (id)}<option value={id}>{l.title}</option>{/each}</optgroup>
    {/each}
    {#if course}<option value="new">+ New lecture…</option>{/if}
  </select>
{/snippet}

<dialog bind:this={dialog} class="addf" onclose={() => (open = false)} aria-labelledby="af-title">
  <form onsubmit={(e) => { e.preventDefault(); void save(); }}>
    <header>
      <h2 id="af-title">Add {files.length} {files.length === 1 ? "file" : "files"}</h2>
      <button type="button" class="x" aria-label="Close" onclick={() => (open = false)}><Icon name="i:x" size={18} /></button>
    </header>

    {#if rows.length > 1}
      <div class="allbar">
        <span class="lbl">All files</span>
        <select class="input" bind:value={allCourse} aria-label="Course for all" onchange={() => setAll("course", allCourse)}>
          <option value="">No course</option>
          {#each courseNames() as c}<option value={c}>{c}</option>{/each}
        </select>
        {@render lecturePick(allCourse, allLecture, (v) => { allLecture = v; setAll("lecture", v); }, "Lecture for all")}
        {#if allLecture === "new"}
          <!-- svelte-ignore a11y_autofocus -->
          <input class="input allnew" bind:value={allNew} placeholder="New lecture" aria-label="New lecture for all" autofocus oninput={() => rows.forEach((x) => x.lecture === "new" && (x.newLecture = allNew))} />
        {/if}
      </div>
    {/if}

    {#if !rows.length}<p class="muted">Reading…</p>{/if}
    <ul class="rows">
      {#each rows as r (r.file)}
        <li class="row" class:skip={r.kind === "skip"}>
          <span class="ti k-{r.kind}"><Icon name={KIND_ICON[r.kind]} size={16} /></span>
          <div class="body">
            {#if r.kind === "skip"}
              <b class="skipname">{r.file.name}</b><span class="muted sm">{KIND_TEXT.skip}</span>
            {:else}
              <div class="nameline">
                <input class="input name" bind:value={r.name} aria-label="Name for {r.file.name}" />
                <span class="kind">{KIND_TEXT[r.kind]}{r.quiz ? ` · ${r.quiz.count} ${r.quiz.count === 1 ? "question" : "questions"}` : ""}</span>
              </div>
              <div class="picks">
                <select class="input" bind:value={r.course} aria-label="Course" onchange={() => { if (r.lecture && r.lecture !== "new" && getLecture(r.lecture)?.course !== r.course) r.lecture = ""; }}>
                  <option value="">No course</option>
                  {#each courseNames() as c}<option value={c}>{c}</option>{/each}
                </select>
                {@render lecturePick(r.course, r.lecture, (v) => (r.lecture = v), "Lecture")}
                {#if r.lecture === "new" && allLecture !== "new"}
                  <!-- svelte-ignore a11y_autofocus -->
                  <input class="input" bind:value={r.newLecture} placeholder="New lecture" aria-label="New lecture name" autofocus />
                {/if}
              </div>
              {#if r.existing}
                <div class="dupe" role="radiogroup" aria-label="Already added">
                  <span class="muted sm">Already in Materials.</span>
                  <label><input type="radio" bind:group={r.mode} value="replace" /> Replace, keep progress</label>
                  <label><input type="radio" bind:group={r.mode} value="new" /> Add a copy</label>
                </div>
              {/if}
            {/if}
          </div>
          <button type="button" class="rm" aria-label="Leave out {r.file.name}" onclick={() => (rows = rows.filter((x) => x !== r))}><Icon name="i:x" size={14} /></button>
        </li>
      {/each}
    </ul>
    {#if error}<p class="err" role="alert">{error}</p>{/if}
    <footer>
      <button type="button" class="btn quiet" onclick={() => (open = false)}>Cancel</button>
      <button type="submit" class="btn primary" disabled={!count || saving}>{saving ? "Adding…" : `Add ${count} ${count === 1 ? "file" : "files"}`}</button>
    </footer>
  </form>
</dialog>

<style>
  .addf {
    width: min(760px, calc(100vw - 24px));
    max-height: calc(100vh - 32px);
    padding: 0;
    border: 0;
    border-radius: 28px;
    background: var(--surface-float);
    color: var(--text);
    box-shadow: var(--shadow-lg, var(--shadow));
  }
  .addf::backdrop {
    background: var(--scrim);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 20px 22px;
    max-height: calc(100vh - 32px);
    box-sizing: border-box;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }
  .x,
  .rm {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--text-muted);
    display: grid;
    place-items: center;
    cursor: pointer;
    flex: none;
  }
  .x:hover,
  .rm:hover {
    background: var(--chip);
  }
  .allbar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 10px 12px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--lavender) 20%, var(--white));
  }
  .allnew {
    flex: 1;
    min-width: 150px;
  }
  .lbl {
    font-size: 13px;
    font-weight: 600;
    color: var(--muted-on-tint);
    margin-right: 4px;
  }
  .input {
    min-height: 38px;
    font-size: 14px;
  }
  select.input {
    flex: 1;
    min-width: 150px;
  }
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px;
    border-radius: 20px;
    background: var(--surface);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--text) 7%, transparent);
  }
  .row.skip {
    opacity: 0.6;
  }
  .ti {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    flex: none;
  }
  .k-note { background: color-mix(in srgb, var(--lavender) 35%, var(--white)); }
  .k-pdf { background: color-mix(in srgb, var(--rose) 35%, var(--white)); }
  .k-quiz { background: color-mix(in srgb, var(--peach) 40%, var(--white)); }
  .k-page { background: color-mix(in srgb, var(--sage) 35%, var(--white)); }
  .k-skip { background: var(--chip); }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .skipname {
    font-weight: 500;
  }
  .nameline {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .name {
    flex: 1;
    min-width: 0;
    font-weight: 500;
  }
  .kind {
    font-size: 12.5px;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .picks {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .picks .input:not(select) {
    flex: 1;
    min-width: 150px;
  }
  .dupe {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 13.5px;
  }
  .dupe label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .sm {
    font-size: 13px;
  }
  .muted {
    color: var(--text-muted);
  }
  .err {
    color: var(--alert-ink);
    margin: 0;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
</style>
