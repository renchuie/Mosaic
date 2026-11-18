<script lang="ts">
  import { route } from "../lib/router.svelte";
  import { findFolder, labs, parentRel } from "../lib/stores/labs.svelte";
  import FolderView from "./labs/FolderView.svelte";
  import LabViewer from "./labs/LabViewer.svelte";
  import StudyNav from "./study/StudyNav.svelte";
  import UploadDialog from "./labs/UploadDialog.svelte";
  import QuizPlayer from "./labs/QuizPlayer.svelte";
  import { adoptMaterials, folderHref } from "../lib/stores/labs.svelte";

  // drop .html files anywhere on Materials to add them (to the folder being viewed)
  let dropping = $state(false);
  let upFiles = $state<File[]>([]);
  let upOpen = $state(false);
  let toast = $state<string | null>(null);
  function onDrop(e: DragEvent) {
    e.preventDefault();
    dropping = false;
    const list = [...(e.dataTransfer?.files ?? [])].filter((f) => /\.(html?|md)$/i.test(f.name));
    if (list.length) {
      upFiles = list;
      upOpen = true;
    } else if (e.dataTransfer?.files.length) toast = "Only labs (.html) and quizzes (.md) can be added.";
  }
  const isFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes("Files");

  let moving = $state(false);
  async function move() {
    moving = true;
    try {
      const r = await adoptMaterials();
      toast = r.skipped.length ? `Moved ${r.moved} into Materials. Left in Recall Labs (a folder with the same name was already in Materials): ${r.skipped.join(", ")}` : `Moved ${r.moved} ${r.moved === 1 ? "item" : "items"} into Materials. Progress and folder links came along.`;
    } catch (e) {
      toast = String(e);
    } finally {
      moving = false;
    }
  }
  $effect(() => {
    if (toast) {
      const t = setTimeout(() => (toast = null), 6000);
      return () => clearTimeout(t);
    }
  });

  const folder = $derived(labs.tree ? findFolder(route.rest) : null);
  const item = $derived.by(() => {
    if (folder || !labs.tree) return null;
    return findFolder(parentRel(route.rest))?.items.find((i) => i.rel === route.rest) ?? null;
  });
  const here = $derived(folder?.rel ?? "");
</script>

<svelte:window
  ondragover={(e) => { if (isFiles(e) && !item) { e.preventDefault(); dropping = true; } }}
  ondragleave={(e) => { if (!e.relatedTarget) dropping = false; }}
  ondrop={(e) => { if (isFiles(e) && !item) onDrop(e); }}
/>

{#if !(item && item.kind === "lab")}<StudyNav />{/if}
{#if labs.legacy && !(item && item.kind === "lab")}
  <section class="card legacy">
    <div>
      <h2 class="h2">Move your labs into Materials?</h2>
      <p class="muted">Your labs are still in <b>{labs.legacy.split("/").pop()}</b>. Progress, folder links and exam dates come along.</p>
    </div>
    <button type="button" class="btn primary" onclick={move} disabled={moving}>{moving ? "Moving…" : "Move into Materials"}</button>
  </section>
{/if}
{#if item && item.kind === "lab"}
  {#key item.rel}
    <LabViewer {item} />
  {/key}
{:else if item && item.kind === "material" && item.mat?.kind === "quiz"}
  {#key item.rel}
    <QuizPlayer {item} />
  {/key}
{:else if folder}
  <FolderView {folder} />
{:else if labs.tree}
  <section class="card empty">
    <h1 class="display">Not found</h1>
    <p class="muted">“{route.rest}” is not in your Materials folder any more. It may have been moved or renamed.</p>
    <a class="btn quiet" href="#/labs">Back to Materials</a>
  </section>
{:else if labs.error}
  <section class="card empty">
    <h1 class="display">Can’t reach your Materials folder</h1>
    <p class="muted">{labs.error}</p>
    <a class="btn quiet" href="#/settings/files">Check the folder in Settings</a>
  </section>
{:else}
  <section class="card empty">
    <h1 class="display">Looking for your materials…</h1>
    <p class="muted">Scanning {labs.root || "your Materials folder"}. The first scan can take a moment.</p>
  </section>
{/if}

{#if dropping}
  <div class="drop" aria-hidden="true"><div><b class="display">Drop to add to Materials</b><span>{here ? `Into ${here}` : "You'll pick the course next"}</span></div></div>
{/if}
{#if toast}<div class="toast" role="status">{toast}</div>{/if}
<UploadDialog bind:open={upOpen} files={upFiles} dir={here} onsaved={(rels) => { toast = `Added ${rels.length} ${rels.length === 1 ? "file" : "files"} to Materials.`; const d = rels[0]?.split("/").slice(0, -1).join("/"); if (d !== undefined && d !== here) location.hash = folderHref(d); }} />

<style>
  .legacy {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
    margin-bottom: var(--gap);
    background: var(--butter-soft);
  }
  .legacy > div {
    flex: 1 1 320px;
    display: grid;
    gap: 6px;
  }
  .drop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    background: rgba(35, 38, 58, 0.18);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    animation: fade-in 0.2s ease;
    pointer-events: none;
  }
  .drop > div {
    display: grid;
    gap: 6px;
    justify-items: center;
    padding: 34px 48px;
    border-radius: 28px;
    border: 2px dashed var(--accent);
    background: var(--surface-float);
    box-shadow: var(--shadow-lift);
    animation: dialog-pop 0.4s var(--spring);
  }
  .drop b {
    font-size: 24px;
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    z-index: 61;
    max-width: min(640px, calc(100vw - 32px));
    padding: 12px 20px;
    border-radius: 18px;
    background: var(--primary);
    color: var(--on-primary);
    box-shadow: var(--shadow-lift);
    animation: rise-in 0.4s var(--spring);
  }
  .empty {
    max-width: 560px;
    display: grid;
    gap: 12px;
    justify-items: start;
    padding: 28px;
  }
  h1 {
    font-size: 28px;
  }
</style>
