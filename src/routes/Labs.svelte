<script lang="ts">
  import { route } from "../lib/router.svelte";
  import { findFolder, labs, parentRel } from "../lib/stores/labs.svelte";
  import FolderView from "./labs/FolderView.svelte";
  import LabViewer from "./labs/LabViewer.svelte";

  const folder = $derived(labs.tree ? findFolder(route.rest) : null);
  const item = $derived.by(() => {
    if (folder || !labs.tree) return null;
    return findFolder(parentRel(route.rest))?.items.find((i) => i.rel === route.rest) ?? null;
  });
</script>

{#if item && item.kind === "lab"}
  {#key item.rel}
    <LabViewer {item} />
  {/key}
{:else if folder}
  <FolderView {folder} />
{:else if labs.tree}
  <section class="card empty">
    <h1 class="display">Not found</h1>
    <p class="muted">“{route.rest}” is not in your labs folder any more. It may have been moved or renamed.</p>
    <a class="btn quiet" href="#/labs">Back to Recall Labs</a>
  </section>
{:else if labs.error}
  <section class="card empty">
    <h1 class="display">Can’t reach your labs</h1>
    <p class="muted">{labs.error}</p>
    <a class="btn quiet" href="#/settings">Check the folder in Settings</a>
  </section>
{:else}
  <section class="card empty">
    <h1 class="display">Looking for your labs…</h1>
    <p class="muted">Scanning {labs.root || "your labs folder"}. The first scan of the Drive mount can take a moment.</p>
  </section>
{/if}

<style>
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
