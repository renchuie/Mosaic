<script lang="ts">
  import Icon from "../../../lib/components/Icon.svelte";
  import { cardHtml } from "../../../lib/cards";
  import type { FlashItem } from "../../../lib/cardTypes";
  import { courseByName, courseNames } from "../../../lib/stores/courses.svelte";
  import { cardsOfItem, cardTypes, getType, items, previewImages, saveItem } from "../../../lib/stores/library.svelte";
  import { imageUrl } from "../../../lib/stores/notes.svelte";
  import { counts } from "../../../lib/stores/srs.svelte";
  import ImportDialog from "./ImportDialog.svelte";
  import ItemDialog from "./ItemDialog.svelte";
  import OcclusionEditor from "./OcclusionEditor.svelte";
  import TypeDialog from "./TypeDialog.svelte";

  let { open: openId = null }: { open?: string | null } = $props();

  let type = $state<string>("");
  let course = $state("");
  let q = $state("");
  let editId = $state<string | null>(null);
  let typeId = $state<string | null>(null);
  let importOpen = $state(false);
  let occOpen = $state(false);
  $effect(() => {
    if (openId) editId = openId;
  });

  const all = $derived(items());
  const list = $derived(
    all.filter(([, i]) => (!type || i.type === type) && (!course || i.course === course) && (!q.trim() || Object.values(i.fields).join(" ").toLowerCase().includes(q.trim().toLowerCase()))),
  );
  const t = $derived(type ? getType(type) : undefined);
  const lib = $derived(counts({ kind: "library" }));
  const img = (s: string) => previewImages.get(s) ?? imageUrl("", s);

  // quick add
  const addType = $derived(type && getType(type)?.kind !== "occlusion" ? type : "basic");
  let draft = $state<Record<string, string>>({});
  let addCourse = $state("");
  let addTags = $state("");
  let firstField = $state<HTMLTextAreaElement>();
  const at = $derived(getType(addType));
  const willMake = $derived(at ? cardsOfItem(`draft-${JSON.stringify(draft)}`, { type: addType, fields: { ...draft }, created: 0 }).length : 0);
  function add(e?: Event) {
    e?.preventDefault();
    if (!at || !willMake) return;
    saveItem(null, { type: addType, fields: { ...draft }, course: addCourse || undefined, tags: addTags.split(",").map((x) => x.trim().replace(/^#/, "")).filter(Boolean), created: Date.now() } as FlashItem);
    draft = {};
    firstField?.focus();
  }
  const preview = (id: string, i: FlashItem) => {
    const ty = getType(i.type);
    if (ty?.kind === "occlusion") return [i.fields.Header || "Image", ""];
    const vals = (ty?.fields ?? []).map((f) => i.fields[f]).filter((v) => v?.trim());
    return [vals[0] ?? "", vals[1] ?? ""];
  };
</script>

<div class="lib">
  <header class="top">
    <div>
      <a class="back" href="#/study/cards"><Icon name="back" size={15} /> Cards</a>
      <h1 class="display">Card library</h1>
      <p class="muted">{all.length} items · {lib.total} cards · {lib.due + lib.newToday} to review today</p>
    </div>
    <div class="acts">
      <button type="button" class="btn quiet" onclick={() => (importOpen = true)}><Icon name="external" size={15} /> Import</button>
      <button type="button" class="btn quiet" onclick={() => (occOpen = true)}><Icon name="star" size={15} /> Image occlusion</button>
      <button type="button" class="btn quiet" onclick={() => (typeId = "new")}>+ Card type</button>
      {#if lib.due + lib.newToday}<a class="btn primary" href="#/study/cards/review/library"><Icon name="play" size={15} /> Review</a>{/if}
    </div>
  </header>

  <nav class="types" aria-label="Card types">
    <button type="button" class:on={!type} onclick={() => (type = "")}>All <span>{all.length}</span></button>
    {#each cardTypes() as [id, ct] (id)}
      {@const n = all.filter(([, i]) => i.type === id).length}
      <button type="button" class:on={type === id} onclick={() => (type = id)}>{ct.name} <span>{n}</span></button>
    {/each}
    {#if t}<button type="button" class="edit" onclick={() => (typeId = type)}><Icon name="settings" size={14} /> Edit “{t.name}”</button>{/if}
  </nav>

  {#if at && at.kind !== "occlusion"}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <form class="card quick" onsubmit={add} onkeydown={(e) => e.key === "Enter" && e.ctrlKey && add(e)}>
      <div class="qh">
        <b>Add a {at.name.toLowerCase()} card</b>
        <span class="muted">{willMake ? `makes ${willMake} ${willMake === 1 ? "card" : "cards"}` : "fill the fields"} · Ctrl+Enter to add</span>
      </div>
      <div class="qf" style="--n: {Math.min(at.fields.length, 4)}">
        {#each at.fields as f, i}
          <label class="field"><span class="label">{f}</span>
            {#if i === 0}
              <textarea class="input" rows="1" bind:this={firstField} value={draft[f] ?? ""} oninput={(e) => (draft = { ...draft, [f]: e.currentTarget.value })}></textarea>
            {:else}
              <textarea class="input" rows="1" value={draft[f] ?? ""} oninput={(e) => (draft = { ...draft, [f]: e.currentTarget.value })}></textarea>
            {/if}
          </label>
        {/each}
      </div>
      <div class="qb">
        <select class="input" bind:value={addCourse} aria-label="Course"><option value="">No course</option>{#each courseNames() as c}<option value={c}>{c}</option>{/each}</select>
        <input class="input" bind:value={addTags} placeholder="tags" aria-label="Tags" />
        <button type="submit" class="btn primary" disabled={!willMake}>Add</button>
      </div>
    </form>
  {/if}

  <div class="filters">
    <input class="input" bind:value={q} placeholder="Search the library" aria-label="Search the library" />
    <select class="input" bind:value={course} aria-label="Course filter"><option value="">All courses</option>{#each courseNames() as c}<option value={c}>{c}</option>{/each}</select>
  </div>

  {#if list.length}
    <div class="table" role="table" aria-label="Library items">
      {#each list.slice(0, 400) as [id, it] (id)}
        {@const [a, b] = preview(id, it)}
        {@const c = it.course ? courseByName(it.course) : undefined}
        <button type="button" class="tr" onclick={() => (editId = id)} style={c ? `--c: ${c[1].color}` : ""}>
          <span class="ty">{getType(it.type)?.name ?? it.type}</span>
          <span class="a">{@html cardHtml(a.split("\n")[0], img)}</span>
          <span class="b muted">{@html cardHtml(b.split("\n")[0], img)}</span>
          <span class="co">{#if c}<i></i>{c[1].code ?? c[1].name}{/if}</span>
          <span class="n">{cardsOfItem(id, it).length}</span>
        </button>
      {/each}
    </div>
  {:else}
    <section class="card empty">
      <p>{all.length ? "Nothing matches." : "No library cards yet."}</p>
    </section>
  {/if}
</div>

<ItemDialog bind:id={editId} />
<TypeDialog bind:id={typeId} onsaved={(k) => (type = k)} />
<ImportDialog bind:open={importOpen} type={type && getType(type)?.kind !== "occlusion" ? type : "basic"} />
<OcclusionEditor bind:open={occOpen} />

<style>
  .lib {
    display: grid;
    gap: 14px;
    container-type: inline-size;
  }
  .top {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13.5px;
    color: var(--text-muted);
    text-decoration: none;
  }
  h1 {
    font-size: clamp(26px, 3vw, 34px);
    font-weight: 600;
  }
  .acts {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .types {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .types button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    padding: 0 14px;
    border: 0;
    border-radius: var(--radius-pill);
    background: var(--surface);
    font-size: 14px;
    font-weight: 500;
  }
  .types button span {
    font-size: 12px;
    color: var(--text-muted);
  }
  .types button.on {
    background: var(--charcoal);
    color: var(--on-primary);
  }
  .types button.on span {
    color: inherit;
    opacity: 0.7;
  }
  .types .edit {
    background: none;
    color: var(--text-muted);
  }
  .quick {
    display: grid;
    gap: 10px;
    background: linear-gradient(150deg, color-mix(in srgb, var(--lavender) 25%, var(--white)), var(--surface) 70%);
  }
  .qh {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 14px;
  }
  .qf {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 8px;
  }
  @container (max-width: 700px) {
    .qf {
      grid-template-columns: 1fr 1fr;
    }
  }
  .qf textarea {
    resize: vertical;
    min-height: 44px;
  }
  .qb {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr) auto;
    gap: 8px;
  }
  .filters {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 220px;
    gap: 8px;
  }
  .filters .input {
    background: var(--surface);
  }
  .table {
    display: grid;
    gap: 4px;
  }
  .tr {
    display: grid;
    grid-template-columns: 110px minmax(0, 1.2fr) minmax(0, 1fr) 110px 40px;
    gap: 12px;
    align-items: center;
    min-height: 48px;
    padding: 6px 14px;
    border: 0;
    border-radius: 14px;
    background: var(--surface);
    text-align: left;
    font: inherit;
    font-size: 14px;
    box-shadow: 0 1px 2px rgba(108, 78, 72, 0.06);
  }
  .tr:hover {
    box-shadow: var(--shadow-lift);
  }
  .tr :global(p) {
    margin: 0;
  }
  .ty {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .a,
  .b {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .a {
    font-weight: 600;
  }
  .co {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
  }
  .co i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--c);
  }
  .n {
    text-align: right;
    font-weight: 700;
    color: var(--text-muted);
  }
  @container (max-width: 700px) {
    .tr {
      grid-template-columns: minmax(0, 1fr) 40px;
    }
    .ty,
    .b,
    .co {
      display: none;
    }
  }
</style>
