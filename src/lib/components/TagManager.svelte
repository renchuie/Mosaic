<script lang="ts">
  import Icon from "./Icon.svelte";
  import { BUILTIN_TAGS, PALETTE, TAG_ICONS } from "../calendar";
  import { deleteTag, events, saveTag, tagIcon, tagManager, tagStyle, tags } from "../stores/calendar.svelte";

  let dialog = $state<HTMLDialogElement>();
  let picking = $state<string | null>(null);
  let newName = $state("");
  let newColor = $state(PALETTE[8]);
  let confirming = $state<string | null>(null);

  $effect(() => {
    if (tagManager.open && dialog && !dialog.open) {
      picking = null;
      confirming = null;
      const usedColors = new Set(tags().map(([, t]) => t.color.toLowerCase()));
      newColor = PALETTE.find((c) => !usedColors.has(c.toLowerCase())) ?? PALETTE[0];
      dialog.showModal();
    }
  });

  const used = (id: string) => events().filter(([, e]) => e.kind === id).length;

  function add(e: SubmitEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    saveTag(null, { name: newName.trim(), color: newColor });
    newName = "";
  }
</script>

<dialog bind:this={dialog} onclose={() => (tagManager.open = false)} aria-labelledby="tm-title">
  <div class="wrap">
    <header>
      <h2 id="tm-title" class="h2">Tags</h2>
      <button type="button" class="x" aria-label="Close" onclick={() => dialog?.close()}>×</button>
    </header>
    <p class="muted">Rename tags, change their colours, and choose which ones count as exams for your countdowns.</p>

    <ul>
      {#each tags() as [id, t] (id)}
        <li>
          <div class="line">
            <button type="button" class="swatch" style={tagStyle(id)} aria-label="Change colour and icon of {t.name}" aria-expanded={picking === id} onclick={() => (picking = picking === id ? null : id)}><Icon name={tagIcon(id)} size={18} /></button>
            <input class="input" value={t.name} aria-label="Tag name" onchange={(e) => e.currentTarget.value.trim() && saveTag(id, { ...t, name: e.currentTarget.value.trim() })} />
            <label class="check"><input type="checkbox" checked={!!t.exam} onchange={(e) => saveTag(id, { ...t, exam: e.currentTarget.checked })} /> Exam</label>
            {#if !BUILTIN_TAGS.includes(id)}
              {#if confirming === id}
                <button type="button" class="btn quiet danger" onclick={() => deleteTag(id)}>Delete{used(id) ? ` (${used(id)} → Other)` : ""}</button>
              {:else}
                <button type="button" class="btn quiet" onclick={() => (confirming = id)}>Delete</button>
              {/if}
            {:else}
              <span class="builtin muted">Built in</span>
            {/if}
          </div>
          {#if picking === id}
            <div class="palette">
              {#each PALETTE as c}
                <button type="button" class="dot" class:on={t.color.toLowerCase() === c.toLowerCase()} style="background: {c}" aria-label="Colour {c}" onclick={() => saveTag(id, { ...t, color: c })}></button>
              {/each}
              <label class="custom">Any colour <input type="color" value={t.color} onchange={(e) => saveTag(id, { ...t, color: e.currentTarget.value })} /></label>
              <div class="icons" role="radiogroup" aria-label="Icon for {t.name}">
                {#each TAG_ICONS as ic}
                  <button type="button" role="radio" aria-checked={tagIcon(id) === ic} aria-label={ic} class="ico" class:on={tagIcon(id) === ic} onclick={() => saveTag(id, { ...t, icon: ic })}><Icon name={ic} size={17} /></button>
                {/each}
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    <form class="add" onsubmit={add}>
      <input type="color" bind:value={newColor} aria-label="New tag colour" />
      <input class="input" bind:value={newName} placeholder="New tag, e.g. Quiz or Group project" aria-label="New tag name" />
      <button type="submit" class="btn primary" disabled={!newName.trim()}>Add tag</button>
    </form>
  </div>
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 24px));
    max-height: calc(100vh - 32px);
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
    gap: 14px;
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
    width: var(--hit);
    height: var(--hit);
    border: 0;
    border-radius: 50%;
    background: transparent;
    font-size: 24px;
    color: var(--text-muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .line {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    gap: 10px;
    align-items: center;
  }
  .swatch {
    display: grid;
    place-items: center;
    width: var(--hit);
    height: var(--hit);
    border: 0;
    border-radius: 14px;
    background: var(--tag);
    color: var(--tag-ink);
    box-shadow: inset 0 0 0 1px var(--hairline);
  }
  .icons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    width: 100%;
    padding-top: 8px;
    border-top: 1px solid var(--hairline);
  }
  .ico {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border: 0;
    border-radius: 12px;
    background: var(--surface);
    color: var(--text-muted);
  }
  .ico.on {
    background: var(--charcoal);
    color: var(--on-primary);
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: var(--hit);
    font-size: 14px;
    cursor: pointer;
  }
  .check input {
    width: 18px;
    height: 18px;
    accent-color: var(--sage-deep);
  }
  .builtin {
    font-size: 13px;
    min-width: 84px;
    text-align: center;
  }
  .palette {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 8px 0 4px 54px;
    padding: 10px;
    border-radius: var(--radius-sm);
    background: var(--panel);
  }
  .dot {
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px var(--hairline);
  }
  .dot.on {
    box-shadow: 0 0 0 2px var(--panel), 0 0 0 4px var(--charcoal);
  }
  .custom {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-left: 6px;
    font-size: 14px;
  }
  input[type="color"] {
    width: var(--hit);
    height: var(--hit);
    border: 0;
    border-radius: 12px;
    padding: 2px;
    background: var(--panel);
    cursor: pointer;
  }
  .add {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--hairline);
  }
  .danger {
    background: var(--rose-soft);
    color: #8f3b45;
  }
  @media (max-width: 520px) {
    .line {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }
    .line > :last-child {
      grid-column: 2 / -1;
      justify-self: start;
    }
  }
</style>
