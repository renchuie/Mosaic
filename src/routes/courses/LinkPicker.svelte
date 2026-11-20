<script lang="ts">
  // "Add to <lecture>": pick notes, PDFs, quizzes, interactive pages, other Materials files and
  // decks to link. This course's things come first; "Everything" shows the rest.
  import Icon from "../../lib/components/Icon.svelte";
  import { candidates, KIND_ICONS, KIND_NAMES, type ShowKind } from "../../lib/stores/linkInfo.svelte";
  import { addLinks, getLecture, lecturesWith, type Link } from "../../lib/stores/outline.svelte";
  import { SvelteSet } from "svelte/reactivity";

  let { open = $bindable(false), lectureId, course }: { open: boolean; lectureId: string; course: string } = $props();
  let dialog = $state<HTMLDialogElement>();
  let q = $state("");
  let kind = $state<ShowKind | "all">("all");
  let mine = $state(true);
  const picked = new SvelteSet<string>();
  const key = (l: Link) => `${l.kind}|${l.ref}`;

  $effect(() => {
    if (open && dialog && !dialog.open) {
      q = "";
      picked.clear();
      dialog.showModal();
    } else if (!open && dialog?.open) dialog.close();
  });

  const all = $derived(open ? candidates() : []);
  const lecture = $derived(getLecture(lectureId));
  const linked = $derived(new Set((lecture?.links ?? []).map(key)));
  const KINDS: ShowKind[] = ["note", "pdf", "quiz", "page", "deck", "file"];
  const shown = $derived.by(() => {
    const t = q.trim().toLowerCase();
    return all
      .filter((x) => !x.gone && (kind === "all" || x.kind === kind))
      .filter((x) => !mine || t || x.course === course)
      .filter((x) => !t || `${x.name} ${x.link.ref}`.toLowerCase().includes(t))
      .slice(0, 200);
  });
  const where = (l: Link) => {
    const others = lecturesWith(l).filter(([id]) => id !== lectureId);
    return others.length ? `In ${others.map(([, x]) => x.title).join(", ")}` : "";
  };
  const folderOf = (ref: string) => (ref.includes("/") ? ref.slice(0, ref.lastIndexOf("/")).split("/").join(" › ") : "");
  function addPicked() {
    addLinks(lectureId, all.filter((x) => picked.has(key(x.link))).map((x) => x.link));
    open = false;
  }
</script>

<dialog bind:this={dialog} class="pick" onclose={() => (open = false)} aria-label="Add to lecture">
  <div class="top">
    <b>Add to {lecture?.title ?? "lecture"}</b>
    <button type="button" class="x" aria-label="Close" onclick={() => (open = false)}><Icon name="i:x" size={18} /></button>
  </div>
  <div class="search">
    <Icon name="search" size={16} />
    <!-- svelte-ignore a11y_autofocus -->
    <input bind:value={q} placeholder="Search" aria-label="Search" autofocus />
  </div>
  <div class="chips">
    <button type="button" class="chip" class:on={kind === "all"} onclick={() => (kind = "all")}>All</button>
    {#each KINDS as k}
      <button type="button" class="chip" class:on={kind === k} onclick={() => (kind = k)}><Icon name={KIND_ICONS[k]} size={13} /> {k === "page" ? "Interactive pages" : k === "quiz" ? "Quizzes" : KIND_NAMES[k] + "s"}</button>
    {/each}
    <span class="grow"></span>
    <button type="button" class="chip soft" class:on={!mine} onclick={() => (mine = !mine)}>{mine ? "This course" : "Everything"}</button>
  </div>
  <div class="list" role="listbox" aria-multiselectable="true" aria-label="Things to add">
    {#each shown as x (key(x.link))}
      {@const k = key(x.link)}
      {@const done = linked.has(k)}
      <button type="button" role="option" aria-selected={picked.has(k) || done} class="row" class:done disabled={done} onclick={() => (picked.has(k) ? picked.delete(k) : picked.add(k))}>
        <span class="ck" class:on={picked.has(k) || done}>{#if picked.has(k) || done}<Icon name="check" size={12} />{/if}</span>
        <span class="ti k-{x.kind}"><Icon name={KIND_ICONS[x.kind]} size={15} /></span>
        <span class="tx"><b>{x.name}</b><small>{done ? "Already here" : [KIND_NAMES[x.kind], folderOf(x.link.ref), where(x.link)].filter(Boolean).join(" · ")}</small></span>
      </button>
    {:else}
      <p class="none">{mine && !q.trim() ? "Nothing in this course yet." : "No matches."}</p>
    {/each}
  </div>
  <div class="foot">
    <span class="n">{picked.size ? `${picked.size} picked` : ""}</span>
    <button type="button" class="btn quiet" onclick={() => (open = false)}>Cancel</button>
    <button type="button" class="btn primary" disabled={!picked.size} onclick={addPicked}>Add{picked.size ? ` ${picked.size}` : ""}</button>
  </div>
</dialog>

<style>
  .pick {
    width: min(640px, calc(100vw - 32px));
    max-height: min(720px, calc(100vh - 48px));
    padding: 20px 22px;
    border: 0;
    border-radius: 28px;
    background: var(--surface-float);
    color: var(--text);
    box-shadow: var(--shadow-lg, var(--shadow));
  }
  .pick[open] {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .pick::backdrop {
    background: var(--scrim);
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .top b {
    font-size: 19px;
    font-weight: 600;
  }
  .x {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    min-height: 44px;
    border-radius: 14px;
    background: var(--field);
    color: var(--text-muted);
  }
  .search input {
    flex: 1;
    border: 0;
    background: none;
    font: inherit;
    color: var(--text);
    outline: none;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 0;
    border-radius: var(--radius-pill);
    padding: 6px 12px;
    min-height: 32px;
    font: inherit;
    font-size: 13px;
    background: var(--chip);
    color: var(--text);
    cursor: pointer;
  }
  .chip.on {
    background: var(--primary);
    color: var(--on-primary);
  }
  .chip.soft.on {
    background: color-mix(in srgb, var(--lavender) 40%, var(--white));
    color: var(--text);
  }
  .grow {
    flex: 1;
  }
  .list {
    flex: 1;
    min-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 -8px;
    padding: 0 8px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 8px 10px;
    border: 0;
    border-radius: 14px;
    background: none;
    font: inherit;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .row:hover:not(:disabled) {
    background: var(--field);
  }
  .row.done {
    opacity: 0.55;
    cursor: default;
  }
  .ck {
    width: 20px;
    height: 20px;
    border-radius: 7px;
    flex: none;
    display: grid;
    place-items: center;
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--text) 25%, transparent);
    color: var(--on-primary);
  }
  .ck.on {
    background: var(--accent);
    box-shadow: none;
  }
  .ti {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    flex: none;
    display: grid;
    place-items: center;
  }
  .k-note { background: color-mix(in srgb, var(--lavender) 35%, var(--white)); }
  .k-pdf { background: color-mix(in srgb, var(--rose) 35%, var(--white)); }
  .k-quiz { background: color-mix(in srgb, var(--peach) 40%, var(--white)); }
  .k-page { background: color-mix(in srgb, var(--sage) 35%, var(--white)); }
  .k-deck { background: color-mix(in srgb, var(--butter) 45%, var(--white)); }
  .k-file { background: var(--chip); }
  .tx {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .tx b {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tx small {
    font-size: 12.5px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .none {
    color: var(--text-muted);
    padding: 20px 4px;
    margin: 0;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: flex-end;
  }
  .n {
    margin-right: auto;
    font-size: 13.5px;
    color: var(--text-muted);
  }
</style>
