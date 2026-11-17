<script lang="ts">
  // Image occlusion card: every box is covered; the asked one is pink with "?",
  // and on the back it opens to show what was under it.
  import type { Mask } from "../cardTypes";
  let { src, masks, target, reveal = false }: { src: string; masks: Mask[]; target?: string; reveal?: boolean } = $props();
</script>

<div class="occ">
  <img {src} alt="" />
  {#each masks as m (m.id)}
    <span
      class="m"
      class:target={m.id === target}
      class:open={reveal && m.id === target}
      style="left: {m.x * 100}%; top: {m.y * 100}%; width: {m.w * 100}%; height: {m.h * 100}%"
    >{m.id === target && !reveal ? "?" : ""}</span>
  {/each}
</div>

<style>
  .occ {
    position: relative;
    display: inline-block;
    max-width: 100%;
    line-height: 0;
  }
  img {
    max-width: 100%;
    max-height: 60vh;
    border-radius: 12px;
  }
  .m {
    position: absolute;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: #e9e1d6;
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--charcoal) 25%, transparent);
    font-size: 20px;
    font-weight: 700;
    line-height: 1;
    color: var(--alert-ink);
  }
  .m.target {
    background: var(--rose);
    box-shadow: inset 0 0 0 2px var(--rose-deep);
  }
  .m.open {
    background: transparent;
    box-shadow: inset 0 0 0 3px var(--sage-deep);
  }
</style>
