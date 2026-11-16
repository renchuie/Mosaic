<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import Icon from "../../lib/components/Icon.svelte";
  import { labUrl } from "../../lib/labStorage";
  import { folderHref, parentRel, progressOf, recordOpen, setOpenLab, type Item } from "../../lib/stores/labs.svelte";
  import { inTauri } from "../../lib/tauri";

  let { item }: { item: Item } = $props();
  let frame = $state<HTMLIFrameElement>();
  const p = $derived(progressOf(item.lab));

  onMount(() => {
    setOpenLab(item.lab);
    recordOpen(item.rel);
  });
  onDestroy(() => setOpenLab(null));

  function reload() {
    if (frame) frame.src = labUrl(item.rel);
  }
</script>

<div class="viewer">
  <header class="bar">
    <a class="btn quiet" href={folderHref(parentRel(item.rel))}><Icon name="back" size={16} /> Back</a>
    <div class="title">
      <b class="display">{item.lab?.title}</b>
      <span class="muted">{parentRel(item.rel) || "Materials"}</span>
    </div>
    <div class="chips">
      {#if p.avgBest !== null}<span class="tag">Avg best {p.avgBest}%</span>{/if}
      {#if p.missed}<span class="tag">{p.missed} to revisit</span>{/if}
      <button class="btn quiet" type="button" onclick={reload}><Icon name="refresh" size={16} /> Reload</button>
    </div>
  </header>
  {#if inTauri}
    <iframe bind:this={frame} src={labUrl(item.rel)} title={item.lab?.title ?? item.name}></iframe>
  {:else}
    <div class="preview muted">The lab opens here inside the app. (This browser preview cannot load files from Drive.)</div>
  {/if}
</div>

<style>
  .viewer {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--hairline);
    flex-wrap: wrap;
  }
  .title {
    display: grid;
    flex: 1;
    min-width: 0;
    line-height: 1.25;
  }
  .title b {
    font-size: 17px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title .muted {
    font-size: 13px;
  }
  .chips {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  iframe,
  .preview {
    width: 100%;
    height: 100%;
    border: 0;
    background: #fff;
    border-radius: 0 0 34px 34px;
  }
  .preview {
    display: grid;
    place-items: center;
    padding: 24px;
    text-align: center;
  }
</style>
