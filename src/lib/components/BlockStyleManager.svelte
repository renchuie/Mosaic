<script lang="ts">
  // Callouts & quotes: one place to style both (her block style manager). Callout types: label,
  // icon, colour, order, hide (built-in) or delete (her own); quotes: bar colour, tint, italic.
  import { PALETTE } from "../calendar";
  import {
    CALLOUT_ICONS, MAX_PALETTE, activePaletteId, blockStylesCss, calloutTypes, deleteCallout, deleteHlColor, deletePalette, hlColor, hlColors,
    isBuiltinCallout, isBuiltinHl, isBuiltinPalette, moveCallout, palettes, quoteStyle, saveCallout, saveHlColor, savePalette, saveQuote,
    setActivePalette, styleManager, type CalloutType, type HlPalette,
  } from "../stores/blockStyles.svelte";

  // the generated look for callouts, quotes and highlights, for the whole app
  const css = $derived(blockStylesCss());

  let dialog = $state<HTMLDialogElement>();
  let open = $state<string | null>(null); // the type whose colour / icon picker is showing
  let confirming = $state<string | null>(null);
  let newLabel = $state("");
  let newColor = $state(PALETTE[10]);

  $effect(() => {
    if (styleManager.open && dialog && !dialog.open) {
      open = null;
      confirming = null;
      dialog.showModal();
    }
  });

  function add(e: SubmitEvent) {
    e.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    const id = saveCallout(null, { label, icon: "✦", color: newColor });
    newLabel = "";
    open = id;
  }
  const upd = (k: string, t: CalloutType, patch: Partial<CalloutType>) => saveCallout(k, { ...t, ...patch });
  const q = $derived(quoteStyle());
  const QUOTE_BARS = [null, "#3B3033", ...PALETTE.filter((_, i) => i % 2 === 0), "#E3949B", "#7FB3A6", "#8B9BE8"];

  // ---- highlights ----
  let editColor = $state<string | null>(null);
  let editPal = $state<string | null>(null);
  let slotPick = $state<number | null>(null); // which slot of the palette being edited is choosing a colour
  let newColLabel = $state("");
  let newColHex = $state("#FFD6A5");
  let newPalName = $state("");
  const HL_SUGGEST = ["#F9DE8C", "#F6EE9E", "#F8DBBE", "#F7C0AE", "#F5CDCB", "#F3C6DC", "#E6D4F7", "#D9CCF5", "#CFE6F7", "#C4DBF2", "#C9EFD9", "#C2DCD5", "#E4E0E2", "#FFD6A5"];
  function addColor(e: SubmitEvent) {
    e.preventDefault();
    if (!newColLabel.trim()) return;
    editColor = saveHlColor(null, { label: newColLabel.trim(), color: newColHex });
    newColLabel = "";
  }
  function addPalette(e: SubmitEvent) {
    e.preventDefault();
    if (!newPalName.trim()) return;
    editPal = savePalette(null, { name: newPalName.trim(), colors: ["yellow", "rose", "sage"] });
    newPalName = "";
    slotPick = null;
  }
  const palSave = (id: string, p: HlPalette, colors: string[]) => savePalette(id, { ...p, colors });
  function moveSlot(id: string, p: HlPalette, i: number, d: -1 | 1) {
    const c = [...p.colors];
    const j = i + d;
    if (j < 0 || j >= c.length) return;
    [c[i], c[j]] = [c[j], c[i]];
    palSave(id, p, c);
  }
</script>

<svelte:head>
  {@html `<style data-mosaic="block-styles">${css}</style>`}
</svelte:head>

<dialog bind:this={dialog} onclose={() => (styleManager.open = false)} aria-labelledby="bsm-title">
  <div class="wrap">
    <header>
      <h2 id="bsm-title" class="h2">Block styles</h2>
      <button type="button" class="x" aria-label="Close" onclick={() => dialog?.close()}>×</button>
    </header>
    <div class="tabs" role="tablist" aria-label="What to style">
      {#each [["callouts", "Callouts"], ["quotes", "Quotes"], ["highlights", "Highlights"]] as [id, label]}
        <button type="button" role="tab" aria-selected={styleManager.tab === id} class:on={styleManager.tab === id} onclick={() => (styleManager.tab = id as typeof styleManager.tab)}>{label}</button>
      {/each}
    </div>

    {#if styleManager.tab === "callouts"}
    <section>
      <h3>Callout types</h3>
      <p class="muted small">Rename them, change their icon and colour, put them in your order, or add your own. In the file a callout is written as <code>&gt; [!word]</code>, so your notes still open anywhere.</p>
      <ul>
        {#each calloutTypes() as [k, t], i (k)}
          <li class:hidden={t.hidden}>
            <div class="line">
              <button type="button" class="badge" style="--cc: {t.color}" aria-expanded={open === k} aria-label="Icon and colour of {t.label}" onclick={() => (open = open === k ? null : k)}>
                <span class="bi">{t.icon || "•"}</span>{t.label}
              </button>
              <input class="input" value={t.label} aria-label="Name" onchange={(e) => e.currentTarget.value.trim() && upd(k, t, { label: e.currentTarget.value.trim() })} />
              <span class="word muted" title="Written in the note as > [!{k}]">[!{k}]</span>
              <span class="order">
                <button type="button" class="mini" disabled={i === 0} aria-label="Move up" onclick={() => moveCallout(k, -1)}>↑</button>
                <button type="button" class="mini" disabled={i === calloutTypes().length - 1} aria-label="Move down" onclick={() => moveCallout(k, 1)}>↓</button>
              </span>
              {#if isBuiltinCallout(k)}
                <button type="button" class="btn quiet sm" onclick={() => upd(k, t, { hidden: !t.hidden })} title={t.hidden ? "Show it in the / menu again" : "Hide it from the / menu (callouts you already wrote keep their look)"}>{t.hidden ? "Show" : "Hide"}</button>
              {:else if confirming === k}
                <button type="button" class="btn quiet sm danger" onclick={() => { deleteCallout(k); confirming = null; }}>Delete</button>
              {:else}
                <button type="button" class="btn quiet sm" onclick={() => (confirming = k)}>Delete</button>
              {/if}
            </div>
            {#if open === k}
              <div class="picker">
                <div class="row">
                  {#each PALETTE as c}
                    <button type="button" class="dot" class:on={t.color.toLowerCase() === c.toLowerCase()} style="background: {c}" aria-label="Colour {c}" onclick={() => upd(k, t, { color: c })}></button>
                  {/each}
                  <label class="custom">Any colour <input type="color" value={t.color} onchange={(e) => upd(k, t, { color: e.currentTarget.value })} /></label>
                </div>
                <div class="row icons">
                  {#each CALLOUT_ICONS as ic}
                    <button type="button" class="ico" class:on={t.icon === ic} aria-label="Icon {ic}" onclick={() => upd(k, t, { icon: ic })}>{ic}</button>
                  {/each}
                  <input class="input any" maxlength="4" placeholder="Any" aria-label="Any icon or emoji" onchange={(e) => e.currentTarget.value.trim() && upd(k, t, { icon: e.currentTarget.value.trim() })} />
                </div>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      <form class="add" onsubmit={add}>
        <input type="color" bind:value={newColor} aria-label="New callout colour" />
        <input class="input" bind:value={newLabel} placeholder="New callout, e.g. Mnemonic or Clinical pearl" aria-label="New callout name" />
        <button type="submit" class="btn primary" disabled={!newLabel.trim()}>Add</button>
      </form>
    </section>
    {:else if styleManager.tab === "quotes"}

    <section>
      <h3>Quotes</h3>
      <blockquote class="qprev" style="--bar: {q.bar ?? 'color-mix(in srgb, var(--text) 25%, transparent)'}" class:tint={q.tint} class:it={q.italic}>
        <span>Drug therapy problems are the pharmacist's business.</span>
        <b>— Pharmacotherapy, ch. 1</b>
      </blockquote>
      <div class="field">
        <span class="label">Bar colour</span>
        <div class="row">
          {#each QUOTE_BARS as c}
            <button type="button" class="dot" class:on={q.bar === c} class:def={c === null} style={c ? `background: ${c}` : ""} aria-label={c ? `Bar ${c}` : "Default grey bar"} title={c ? c : "Default"} onclick={() => saveQuote({ bar: c })}></button>
          {/each}
          <label class="custom">Any colour <input type="color" value={q.bar ?? "#8a8085"} onchange={(e) => saveQuote({ bar: e.currentTarget.value })} /></label>
        </div>
      </div>
      <div class="toggles">
        <label class="check"><input type="checkbox" checked={q.tint} onchange={(e) => saveQuote({ tint: e.currentTarget.checked })} /> Soft background</label>
        <label class="check"><input type="checkbox" checked={q.italic} onchange={(e) => saveQuote({ italic: e.currentTarget.checked })} /> Italic</label>
      </div>
      <p class="muted small">A source line: end the quote with a line starting with <b>—</b>, or use ⠿ → <i>Add a source line</i>.</p>
    </section>
    {:else}

    <section>
      <h3>Palettes</h3>
      <p class="muted small">The palette you use fills the highlight dots on the toolbars, in order, and the shortcuts <b>Ctrl+Shift+1…{MAX_PALETTE}</b> (<b>Ctrl+Shift+0</b> removes a highlight).</p>
      <ul>
        {#each palettes() as [id, p] (id)}
          <li>
            <div class="pline">
              <label class="use"><input type="radio" name="hl-palette" checked={activePaletteId() === id} onchange={() => setActivePalette(id)} /> <span class="sr">Use {p.name}</span></label>
              <button type="button" class="pal" aria-expanded={editPal === id} onclick={() => { editPal = editPal === id ? null : id; slotPick = null; }}>
                <span class="sw">{#each p.colors as c}<i style="background: {hlColor(c)?.color ?? '#eee'}"></i>{/each}</span>
                <b>{p.name}</b>
              </button>
              {#if activePaletteId() === id}<span class="inuse">In use</span>{/if}
              {#if !isBuiltinPalette(id)}
                {#if confirming === `p:${id}`}
                  <button type="button" class="btn quiet sm danger" onclick={() => { deletePalette(id); confirming = null; }}>Delete</button>
                {:else}
                  <button type="button" class="btn quiet sm" onclick={() => (confirming = `p:${id}`)}>Delete</button>
                {/if}
              {/if}
            </div>
            {#if editPal === id}
              <div class="picker">
                {#if !isBuiltinPalette(id)}
                  <input class="input" value={p.name} aria-label="Palette name" onchange={(e) => e.currentTarget.value.trim() && savePalette(id, { ...p, name: e.currentTarget.value.trim() })} />
                {/if}
                <div class="slots">
                  {#each p.colors as c, i (c + i)}
                    <div class="slot">
                      <span class="n">{i + 1}</span>
                      <button type="button" class="chip" style="background: {hlColor(c)?.color ?? '#eee'}" class:on={slotPick === i} onclick={() => (slotPick = slotPick === i ? null : i)}>{hlColor(c)?.label ?? c}</button>
                      <button type="button" class="mini" disabled={i === 0} aria-label="Move left" onclick={() => moveSlot(id, p, i, -1)}>←</button>
                      <button type="button" class="mini" disabled={i === p.colors.length - 1} aria-label="Move right" onclick={() => moveSlot(id, p, i, 1)}>→</button>
                      <button type="button" class="mini" disabled={p.colors.length <= 1} aria-label="Remove from palette" onclick={() => { palSave(id, p, p.colors.filter((_, k) => k !== i)); slotPick = null; }}>×</button>
                    </div>
                  {/each}
                  {#if p.colors.length < MAX_PALETTE}
                    <button type="button" class="btn quiet sm" onclick={() => { const free = hlColors().find(([k]) => !p.colors.includes(k)); if (free) { palSave(id, p, [...p.colors, free[0]]); slotPick = p.colors.length; } }}>+ Add a colour</button>
                  {/if}
                </div>
                {#if slotPick !== null && slotPick < p.colors.length}
                  <div class="row">
                    <span class="muted small">Slot {slotPick + 1}:</span>
                    {#each hlColors() as [k, hc] (k)}
                      <button type="button" class="dot" class:on={p.colors[slotPick] === k} style="background: {hc.color}" title={hc.label} aria-label={hc.label}
                        onclick={() => { const cs = [...p.colors]; const j = cs.indexOf(k); if (j >= 0 && j !== slotPick) cs[j] = cs[slotPick!]; cs[slotPick!] = k; palSave(id, p, cs); }}></button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      <form class="add" onsubmit={addPalette}>
        <span></span>
        <input class="input" bind:value={newPalName} placeholder="New palette, e.g. Exam review" aria-label="New palette name" />
        <button type="submit" class="btn primary" disabled={!newPalName.trim()}>Add</button>
      </form>
    </section>

    <section>
      <h3>Your colours</h3>
      <p class="muted small">Every colour a palette can use. In the file a highlight is <code>==text==</code> (yellow) or <code>&lt;mark class="word"&gt;</code>.</p>
      <div class="colors">
        {#each hlColors() as [k, c] (k)}
          <button type="button" class="ccard" class:on={editColor === k} onclick={() => (editColor = editColor === k ? null : k)}>
            <mark style="background: {c.color}">{c.label}</mark>
          </button>
        {/each}
      </div>
      {#if editColor && hlColor(editColor)}
        {@const c = hlColor(editColor)!}
        {@const k = editColor}
        <div class="picker">
          <div class="row">
            <input class="input" value={c.label} aria-label="Colour name" onchange={(e) => e.currentTarget.value.trim() && saveHlColor(k, { ...c, label: e.currentTarget.value.trim() })} />
            <span class="word muted">{k === "yellow" ? "==…==" : `class="${k}"`}</span>
            {#if !isBuiltinHl(k)}
              {#if confirming === `c:${k}`}
                <button type="button" class="btn quiet sm danger" onclick={() => { deleteHlColor(k); confirming = null; editColor = null; }}>Delete</button>
              {:else}
                <button type="button" class="btn quiet sm" onclick={() => (confirming = `c:${k}`)}>Delete</button>
              {/if}
            {/if}
          </div>
          <div class="row">
            {#each HL_SUGGEST as h}
              <button type="button" class="dot" class:on={c.color.toLowerCase() === h.toLowerCase()} style="background: {h}" aria-label="Colour {h}" onclick={() => saveHlColor(k, { ...c, color: h })}></button>
            {/each}
            <label class="custom">Any colour <input type="color" value={c.color} onchange={(e) => saveHlColor(k, { ...c, color: e.currentTarget.value })} /></label>
          </div>
        </div>
      {/if}
      <form class="add" onsubmit={addColor}>
        <input type="color" bind:value={newColHex} aria-label="New colour" />
        <input class="input" bind:value={newColLabel} placeholder="New colour, e.g. Mint or Exam pink" aria-label="New colour name" />
        <button type="submit" class="btn primary" disabled={!newColLabel.trim()}>Add</button>
      </form>
    </section>
    {/if}
  </div>
</dialog>

<style>
  dialog {
    width: min(640px, calc(100vw - 24px));
    max-height: calc(100vh - 32px);
    border: 0;
    border-radius: var(--radius);
    background: var(--surface-float, var(--surface));
    color: var(--text);
    box-shadow: var(--shadow-lift);
    padding: 0;
  }
  dialog[open] {
    animation: pop 0.22s var(--spring, ease) backwards;
  }
  @keyframes pop {
    from {
      opacity: 0;
      scale: 0.96;
    }
  }
  dialog::backdrop {
    background: rgba(59, 48, 51, 0.2);
  }
  .wrap {
    display: grid;
    gap: 18px;
    padding: 20px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  header .h2 {
    font-size: 21px;
  }
  .x {
    width: var(--hit, 44px);
    height: var(--hit, 44px);
    border: 0;
    border-radius: 50%;
    background: transparent;
    font-size: 24px;
    color: var(--text-muted);
  }
  section {
    display: grid;
    gap: 10px;
  }
  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  .small {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
  }
  code {
    font-size: 12.5px;
    padding: 1px 5px;
    border-radius: 5px;
    background: var(--chip);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  li.hidden .line {
    opacity: 0.55;
  }
  .line {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr) 104px auto 64px;
    gap: 8px;
    align-items: center;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px 0 5px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--cc) 60%, var(--white, #fff));
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    cursor: pointer;
    transition: transform 0.2s var(--spring, ease);
  }
  .badge:hover {
    transform: scale(1.04);
  }
  .bi {
    display: grid;
    place-items: center;
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--white, #fff);
    font-size: 12px;
  }
  .line .input {
    min-height: 36px;
  }
  .word {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-family: ui-monospace, monospace;
  }
  .order {
    display: inline-flex;
    gap: 2px;
  }
  .mini {
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 8px;
    background: var(--panel);
    color: var(--text-muted);
    cursor: pointer;
  }
  .mini:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .sm {
    min-height: 34px;
    padding: 0 12px;
    font-size: 13px;
  }
  .danger {
    background: var(--rose-soft);
    color: #8f3b45;
  }
  .picker {
    display: grid;
    gap: 8px;
    margin: 6px 0 4px;
    padding: 10px;
    border-radius: var(--radius-sm, 14px);
    background: var(--panel);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .dot {
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px var(--hairline);
    cursor: pointer;
  }
  .dot.def {
    background: linear-gradient(135deg, transparent 45%, color-mix(in srgb, var(--text) 30%, transparent) 46% 54%, transparent 55%), var(--surface);
  }
  .dot.on {
    box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--text);
  }
  .custom {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .custom input {
    width: 34px;
    height: 30px;
    padding: 0;
    border: 0;
    background: none;
  }
  .ico {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 10px;
    background: var(--surface);
    font-size: 16px;
    cursor: pointer;
  }
  .ico.on {
    background: var(--text);
    color: var(--on-primary, #fff);
  }
  .any {
    width: 70px;
    min-height: 34px;
    text-align: center;
  }
  .add {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 8px;
    align-items: center;
  }
  .add input[type="color"] {
    width: 40px;
    height: 40px;
    padding: 0;
    border: 0;
    background: none;
  }
  .tabs {
    display: flex;
    gap: 2px;
    padding: 4px;
    border-radius: 999px;
    background: var(--panel);
    justify-self: start;
  }
  .tabs button {
    height: 34px;
    padding: 0 16px;
    border: 0;
    border-radius: 999px;
    background: none;
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
  }
  .tabs button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 2px 8px -4px rgba(40, 44, 80, 0.35);
  }
  .pline {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    gap: 10px;
    align-items: center;
  }
  .use input {
    width: 18px;
    height: 18px;
    accent-color: var(--sage-deep);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .pal {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 42px;
    padding: 0 12px;
    border: 0;
    border-radius: 14px;
    background: var(--panel);
    font: inherit;
    font-size: 14px;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }
  .sw {
    display: inline-flex;
  }
  .sw i {
    width: 20px;
    height: 20px;
    margin-right: -5px;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--surface);
  }
  .inuse {
    font-size: 12px;
    font-weight: 700;
    color: var(--sage-deep, #5f9184);
  }
  .slots {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .slot {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border-radius: 12px;
    background: var(--surface);
  }
  .slot .n {
    width: 18px;
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    color: var(--text-muted);
  }
  .chip {
    height: 28px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    cursor: pointer;
  }
  .chip.on {
    box-shadow: 0 0 0 2px var(--text);
  }
  .colors {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .ccard {
    padding: 6px 8px;
    border: 0;
    border-radius: 12px;
    background: var(--panel);
    cursor: pointer;
  }
  .ccard.on {
    box-shadow: inset 0 0 0 2px var(--text);
  }
  .ccard mark {
    padding: 1px 6px;
    border-radius: 5px;
    color: var(--text);
    font-size: 13.5px;
    font-weight: 600;
  }
  .qprev {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 4px 0 4px 16px;
    border-left: 3px solid var(--bar);
  }
  .qprev.tint {
    padding: 10px 14px 10px 16px;
    border-radius: 0 12px 12px 0;
    background: color-mix(in srgb, var(--bar) 14%, transparent);
  }
  .qprev.it span {
    font-style: italic;
  }
  .qprev b {
    font-size: 0.88em;
    color: var(--text-muted);
  }
  .field {
    display: grid;
    gap: 6px;
  }
  .label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .toggles {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    cursor: pointer;
  }
  .check input {
    width: 18px;
    height: 18px;
    accent-color: var(--sage-deep);
  }
  @media (max-width: 560px) {
    .line {
      grid-template-columns: 1fr auto auto;
    }
    .line .input,
    .word {
      display: none;
    }
  }
</style>
