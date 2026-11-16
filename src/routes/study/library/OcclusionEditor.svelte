<script lang="ts">
  // Draw boxes over an image; each box becomes a card.
  import type { Mask } from "../../../lib/cardTypes";
  import { courseNames } from "../../../lib/stores/courses.svelte";
  import { previewImages, saveCardImage, saveItem } from "../../../lib/stores/library.svelte";
  import { imageUrl } from "../../../lib/stores/notes.svelte";

  let { open = $bindable(false) }: { open: boolean } = $props();
  let dialog = $state<HTMLDialogElement>();
  let image = $state("");
  let masks = $state<Mask[]>([]);
  let header = $state("");
  let extra = $state("");
  let course = $state("");
  let drawing = $state<{ x0: number; y0: number; x: number; y: number } | null>(null);
  let box = $state<HTMLDivElement>();
  let saving = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (open && dialog && !dialog.open) {
      image = "";
      masks = [];
      header = "";
      extra = "";
      error = null;
      dialog.showModal();
    }
  });

  async function useFile(f: File | undefined) {
    if (!f || !f.type.startsWith("image/")) return;
    const data = await new Promise<string>((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.readAsDataURL(f);
    });
    image = await saveCardImage(data, f.type.split("/")[1]?.replace("jpeg", "jpg") || "png");
  }
  function onPaste(e: ClipboardEvent) {
    const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
    if (f) {
      e.preventDefault();
      void useFile(f);
    }
  }

  const rel = (e: PointerEvent) => {
    const r = box!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  function down(e: PointerEvent) {
    if ((e.target as HTMLElement).closest(".m")) return;
    const p = rel(e);
    drawing = { x0: p.x, y0: p.y, x: p.x, y: p.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drawing) return;
    const p = rel(e);
    drawing.x = p.x;
    drawing.y = p.y;
  }
  function up() {
    if (!drawing) return;
    const d = drawing;
    drawing = null;
    const m = { x: Math.min(d.x0, d.x), y: Math.min(d.y0, d.y), w: Math.abs(d.x - d.x0), h: Math.abs(d.y - d.y0) };
    if (m.w > 0.01 && m.h > 0.01) masks = [...masks, { id: Math.random().toString(36).slice(2, 7), ...m }];
  }

  function save() {
    if (!image) return (error = "Pick or paste an image first.");
    if (!masks.length) return (error = "Drag over the image to cover at least one label.");
    saving = true;
    saveItem(null, { type: "occlusion", fields: { Image: image, Masks: JSON.stringify($state.snapshot(masks)), Header: header, Extra: extra }, course: course || undefined, created: Date.now() });
    saving = false;
    open = false;
    dialog?.close();
  }
  const src = $derived(image ? (previewImages.get(image) ?? imageUrl("", image)) : "");
</script>

<svelte:window onpaste={(e) => open && onPaste(e)} />

<dialog bind:this={dialog} onclose={() => (open = false)} aria-labelledby="oc-title">
  <div class="wrap">
    <header><h2 id="oc-title" class="h2">Image occlusion</h2><button type="button" class="x" aria-label="Close" onclick={() => dialog?.close()}>×</button></header>
    {#if !image}
      <label class="drop">
        <b>Choose an image</b> or paste one (Ctrl+V): a diagram, pathway, structure or slide.
        <input type="file" accept="image/*" onchange={(e) => useFile(e.currentTarget.files?.[0])} />
      </label>
    {:else}
      <p class="muted small">Drag over each label you want to hide. Every box becomes a card. Click a box's × to remove it.</p>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="stage" bind:this={box} onpointerdown={down} onpointermove={move} onpointerup={up}>
        <img {src} alt="" draggable="false" />
        {#each masks as m, i (m.id)}
          <span class="m" style="left: {m.x * 100}%; top: {m.y * 100}%; width: {m.w * 100}%; height: {m.h * 100}%">
            <i>{i + 1}</i><button type="button" aria-label="Remove box {i + 1}" onclick={() => (masks = masks.filter((x) => x.id !== m.id))}>×</button>
          </span>
        {/each}
        {#if drawing}
          <span class="m drawing" style="left: {Math.min(drawing.x0, drawing.x) * 100}%; top: {Math.min(drawing.y0, drawing.y) * 100}%; width: {Math.abs(drawing.x - drawing.x0) * 100}%; height: {Math.abs(drawing.y - drawing.y0) * 100}%"></span>
        {/if}
      </div>
      <div class="two">
        <label class="field"><span class="label">Title (shown on every card)</span><input class="input" bind:value={header} placeholder="e.g. RAAS pathway" /></label>
        <label class="field"><span class="label">Course</span><select class="input" bind:value={course}><option value="">None</option>{#each courseNames() as c}<option value={c}>{c}</option>{/each}</select></label>
      </div>
      <label class="field"><span class="label">Extra (shown on the back)</span><input class="input" bind:value={extra} placeholder="Optional" /></label>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <footer>
      {#if image}<button type="button" class="btn quiet" onclick={() => { image = ""; masks = []; }}>Different image</button>{/if}
      <span class="sp"></span>
      <button type="button" class="btn quiet" onclick={() => dialog?.close()}>Cancel</button>
      <button type="button" class="btn primary" onclick={save} disabled={saving}>Make {masks.length || ""} {masks.length === 1 ? "card" : "cards"}</button>
    </footer>
  </div>
</dialog>

<style>
  dialog {
    width: min(920px, calc(100vw - 24px));
    max-height: calc(100vh - 24px);
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
  .wrap {
    display: grid;
    gap: 12px;
    padding: 22px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .x {
    width: var(--hit);
    height: var(--hit);
    border: 0;
    border-radius: 50%;
    background: none;
    font-size: 24px;
    color: var(--text-muted);
  }
  .drop {
    position: relative;
    display: grid;
    place-items: center;
    gap: 6px;
    min-height: 220px;
    padding: 20px;
    border: 2px dashed var(--hairline);
    border-radius: 20px;
    background: var(--panel);
    text-align: center;
    cursor: pointer;
  }
  .drop input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
  .small {
    font-size: 13.5px;
  }
  .stage {
    position: relative;
    justify-self: center;
    max-width: 100%;
    line-height: 0;
    cursor: crosshair;
    user-select: none;
    touch-action: none;
  }
  .stage img {
    max-width: 100%;
    max-height: 56vh;
    border-radius: 12px;
  }
  .m {
    position: absolute;
    border-radius: 6px;
    background: color-mix(in srgb, var(--rose) 75%, transparent);
    box-shadow: inset 0 0 0 2px var(--rose-deep);
  }
  .m.drawing {
    background: color-mix(in srgb, var(--rose) 40%, transparent);
  }
  .m i {
    position: absolute;
    left: 4px;
    top: 4px;
    font-style: normal;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }
  .m button {
    position: absolute;
    right: -10px;
    top: -10px;
    width: 22px;
    height: 22px;
    border: 0;
    border-radius: 50%;
    background: var(--charcoal);
    color: var(--on-primary);
    font-size: 13px;
    line-height: 1;
    cursor: pointer;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .error {
    background: var(--rose-soft);
    color: #8f3b45;
    border-radius: var(--radius-sm);
    padding: 8px 12px;
  }
  footer {
    display: flex;
    gap: 8px;
  }
  .sp {
    flex: 1;
  }
</style>
