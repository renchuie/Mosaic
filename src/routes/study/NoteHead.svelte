<script lang="ts" module>
  /** Cover presets (front matter `cover: <name>`); anything else is an image path. */
  export const COVERS: Record<string, string> = {
    lilac: "radial-gradient(55% 140% at 12% 10%, #E9DDFF, transparent 70%), radial-gradient(55% 140% at 88% 20%, #CFE4FF, transparent 70%), radial-gradient(60% 140% at 50% 120%, #FFE3EC, transparent 70%), #F6F4FB",
    blush: "radial-gradient(55% 140% at 12% 10%, #FFD3E2, transparent 70%), radial-gradient(55% 140% at 88% 20%, #EBDDFF, transparent 70%), radial-gradient(60% 140% at 50% 120%, #FFE6D2, transparent 70%), #FCF3F6",
    peach: "radial-gradient(55% 140% at 12% 10%, #FFDCC2, transparent 70%), radial-gradient(55% 140% at 88% 20%, #FFD2E1, transparent 70%), radial-gradient(60% 140% at 50% 120%, #FFF0C4, transparent 70%), #FFF7F0",
    butter: "radial-gradient(55% 140% at 12% 10%, #FFF0BF, transparent 70%), radial-gradient(55% 140% at 88% 20%, #E3F2D3, transparent 70%), radial-gradient(60% 140% at 50% 120%, #FFDDC6, transparent 70%), #FFFBEF",
    mint: "radial-gradient(55% 140% at 12% 10%, #C9EFE0, transparent 70%), radial-gradient(55% 140% at 88% 20%, #D5E9FF, transparent 70%), radial-gradient(60% 140% at 50% 120%, #EFF6D2, transparent 70%), #F1FAF6",
    sage: "radial-gradient(55% 140% at 12% 10%, #C7E3D7, transparent 70%), radial-gradient(55% 140% at 88% 20%, #E2EFD0, transparent 70%), radial-gradient(60% 140% at 50% 120%, #D3E4F4, transparent 70%), #F3F8F5",
    sky: "radial-gradient(55% 140% at 12% 10%, #CBE1FF, transparent 70%), radial-gradient(55% 140% at 88% 20%, #D6F1FF, transparent 70%), radial-gradient(60% 140% at 50% 120%, #E6DAFF, transparent 70%), #F3F8FF",
    sunset: "radial-gradient(55% 140% at 12% 10%, #FFC4B3, transparent 70%), radial-gradient(55% 140% at 88% 20%, #FFB3CF, transparent 70%), radial-gradient(60% 140% at 50% 120%, #D5BEFF, transparent 70%), #FFF0EC",
  };
</script>

<script lang="ts">
  import Icon from "../../lib/components/Icon.svelte";
  import IconPicker from "../../lib/components/IconPicker.svelte";
  import NoteToolbar from "./NoteToolbar.svelte";
  import type { Meta } from "../../lib/notes";
  import { courseByName, courseNames } from "../../lib/stores/courses.svelte";
  import { allTags, dirOf } from "../../lib/stores/notes.svelte";

  let {
    rel,
    meta,
    title = $bindable(),
    status,
    errorText,
    source,
    dirs,
    coverUrl,
    onmeta,
    onrename,
    onmove,
    ondelete,
    ontoggleSource,
    full = false,
    onheadstyle,
    onrun,
    oncoverfile,
    ontheirs,
    onmine,
    onprint,
  }: {
    rel: string;
    onprint?: () => void;
    meta: Meta;
    title: string;
    status: "saved" | "saving" | "conflict" | "error";
    errorText: string;
    source: boolean;
    dirs: string[];
    coverUrl: (src: string) => string;
    onmeta: (patch: Meta) => void;
    onrename: () => void;
    onmove: (folder: string) => void;
    ondelete: () => void;
    ontoggleSource: () => void;
    /** full header: breadcrumb, big icon, chips and the toolbar on their own row */
    full?: boolean;
    onheadstyle: (full: boolean) => void;
    onrun: (cmd: string, arg?: string) => void;
    oncoverfile: (file: File) => void;
    ontheirs: () => void;
    onmine: () => void;
  } = $props();

  const course = $derived(meta.course ? courseByName(String(meta.course)) : undefined);
  const tags = $derived(((meta.tags as string[]) ?? []).map(String));
  const cover = $derived(typeof meta.cover === "string" && meta.cover ? meta.cover : "");
  const icon = $derived(typeof meta.icon === "string" && meta.icon ? meta.icon : "");
  const coverStyle = $derived(cover ? (COVERS[cover] ? `background: ${COVERS[cover]}` : `background: center / cover no-repeat url("${coverUrl(cover)}")`) : "");

  let pick = $state<"icon" | "cover" | "menu" | "course" | null>(null);
  let tagText = $state("");
  let addingTag = $state(false);
  let confirmDel = $state(false);
  let fileIn = $state<HTMLInputElement>();

  function addTag() {
    const t = tagText.trim().replace(/^#/, "").replace(/\s+/g, "-");
    tagText = "";
    if (!t || tags.includes(t)) return;
    onmeta({ tags: [...tags, t] });
  }
  const shuffleCover = () => {
    const keys = Object.keys(COVERS).filter((k) => k !== cover);
    onmeta({ cover: keys[Math.floor(Math.random() * keys.length)] });
  };
</script>

<!-- the course list and the ⋯ menu close on a click anywhere outside them (Nov 18 bug: they stayed
     open); the icon and cover pickers have their own scrim -->
<svelte:window
  onkeydown={(e) => e.key === "Escape" && pick && (pick = null)}
  onpointerdown={(e) => {
    if ((pick === "course" || pick === "menu") && !(e.target as HTMLElement | null)?.closest?.(".mwrap")) pick = null;
  }}
/>

{#snippet chipRow()}
    <div class="chips">
      <div class="mwrap">
        <button type="button" class="chip course" style={course ? `--c: ${course[1].color}` : ""} aria-haspopup="listbox" aria-expanded={pick === "course"}
          onclick={() => (pick = pick === "course" ? null : "course")}>
          <Icon name="book" size={13} /><span class="cn">{meta.course ?? "No course"}</span><span class="chev" aria-hidden="true">▾</span>
        </button>
        {#if pick === "course"}
          <div class="pop menu clist" role="listbox" aria-label="Course">
            {#each ["", ...courseNames()] as c}
              {@const cc = c ? courseByName(c) : undefined}
              <button type="button" role="option" aria-selected={(meta.course ?? "") === c} class="mi copt" class:on={(meta.course ?? "") === c}
                onclick={() => { onmeta({ course: c || undefined }); pick = null; }}>
                <span class="cdot" style={cc ? `background: ${cc[1].color}` : ""}></span>{c || "No course"}
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <label class="chip"><Icon name="calendar" size={13} /><input type="date" class:empty={!meta.date} value={meta.date ?? ""} aria-label="Date" onchange={(e) => onmeta({ date: e.currentTarget.value || undefined })} /></label>
      {#each tags as t (t)}
        <span class="chip tag">#{t}<button type="button" aria-label="Remove tag {t}" onclick={() => onmeta({ tags: tags.filter((x) => x !== t) })}>×</button></span>
      {/each}
      {#if addingTag}
        <!-- svelte-ignore a11y_autofocus -->
        <input class="chip tagin" list="note-tags" bind:value={tagText} placeholder="tag" autofocus aria-label="New tag"
          onkeydown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } if (e.key === "Escape") addingTag = false; }}
          onblur={() => { addTag(); addingTag = false; }} />
        <datalist id="note-tags">{#each allTags().filter((t) => !tags.includes(t)) as t}<option value={t}></option>{/each}</datalist>
      {:else}
        <button type="button" class="chip add" title="Add a tag" aria-label="Add a tag" onclick={() => (addingTag = true)}>+ Tag</button>
      {/if}
      <button type="button" class="chip more" class:on={source} title={source ? "Back to the page view" : "Edit as Markdown"} onclick={ontoggleSource}><Icon name="code" size={14} /></button>
      <div class="mwrap">
        <button type="button" class="chip more" aria-label="More" onclick={() => (pick = pick === "menu" ? null : "menu")}><Icon name="dots" size={16} /></button>
        {#if pick === "menu"}
          <div class="pop menu right">
            <label>Move to
              <select value={dirOf(rel)} onchange={(e) => { onmove(e.currentTarget.value); pick = null; }}>{#each dirs as d}<option value={d}>{d || "Notes (top level)"}</option>{/each}</select>
            </label>
            <div class="hs" role="group" aria-label="Header style for this note" title="For this note. The default for every note is in Settings → Notes.">
              <span>Header</span>
              <button type="button" class:on={!full} aria-pressed={!full} onclick={() => { onheadstyle(false); pick = null; }}>Compact</button>
              <button type="button" class:on={full} aria-pressed={full} onclick={() => { onheadstyle(true); pick = null; }}>Full</button>
            </div>
            {#if icon}<button type="button" class="mi" onclick={() => { onmeta({ icon: undefined }); pick = null; }}>Remove icon</button>{/if}
            {#if cover}
              <button type="button" class="mi" onclick={() => { pick = "cover"; }}>Change cover…</button>
              <button type="button" class="mi" onclick={() => { onmeta({ cover: undefined }); pick = null; }}>Remove cover</button>
            {:else}
              <button type="button" class="mi" onclick={() => { onmeta({ cover: "lilac" }); pick = null; }}>Add a cover</button>
            {/if}
            {#if onprint}<button type="button" class="mi" onclick={() => { pick = null; onprint(); }}>Print or save as PDF…</button>{/if}
            {#if confirmDel}
              <button type="button" class="mi del" onclick={ondelete}>Move to trash (.trash in the Notes folder)</button>
            {:else}
              <button type="button" class="mi soft" onclick={() => (confirmDel = true)}>Delete…</button>
            {/if}
          </div>
        {/if}
      </div>
    </div>
{/snippet}

<header class="nh" class:hascover={!!cover} class:full>
  {#if cover}
    <div class="cover" style={coverStyle}>
      <div class="cbtns">
        <button type="button" onclick={() => (pick = pick === "cover" ? null : "cover")}><Icon name="image" size={14} /> Change cover</button>
        <button type="button" onclick={shuffleCover} title="Another cover">↻</button>
      </div>
    </div>
  {/if}

  <div class="inner">
    {#if cover && icon}
      <!-- with a cover the icon sits on the cover's edge, on its own line, and the title lines up below -->
      <button type="button" class="icon over" title="Change icon" onclick={() => (pick = pick === "icon" ? null : "icon")}><Icon name={icon} size={full ? 30 : 24} /></button>
    {/if}
    {#if full}
      <div class="crumbs">{["Notes", ...(dirOf(rel) ? dirOf(rel).split("/") : [])].join(" › ")}</div>
    {/if}
    <div class="titlerow">
      {#if icon && !cover}
        <button type="button" class="icon" title="Change icon" onclick={() => (pick = pick === "icon" ? null : "icon")}><Icon name={icon} size={full ? 30 : 24} /></button>
      {:else if !icon}
        <button type="button" class="icon ghost" title="Add an icon" aria-label="Add an icon" onclick={() => (pick = "icon")}><Icon name="smile" size={18} /></button>
      {/if}
      <input class="title" bind:value={title} aria-label="Note title" title="{dirOf(rel) || 'Notes'} / {title}" spellcheck="false" onblur={onrename} onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()} />

      {#if !full}{@render chipRow()}{/if}
    </div>
    {#if full}
      <div class="metarow">
        {@render chipRow()}
        {#if !source}<NoteToolbar {onrun} />{/if}
      </div>
    {/if}

    {#if status === "conflict"}
      <div class="conflict" role="alert">
        <span>This note was changed on another computer since you opened it.</span>
        <button type="button" class="btn quiet sm" onclick={ontheirs}>Load that version</button>
        <button type="button" class="btn primary sm" onclick={onmine}>Keep mine</button>
      </div>
    {:else if status === "error"}
      <div class="conflict" role="alert"><span>{errorText}</span></div>
    {/if}

  </div>

  {#if pick === "icon"}
    <button type="button" class="scrim" aria-label="Close" onclick={() => (pick = null)}></button>
    <div class="pop emoji">
      <IconPicker value={icon || undefined} onpick={(v, recoloured) => { onmeta({ icon: v }); if (!recoloured) pick = null; }} />
    </div>
  {/if}
  {#if pick === "cover"}
    <button type="button" class="scrim" aria-label="Close" onclick={() => (pick = null)}></button>
    <div class="pop covers" role="dialog" aria-label="Choose a cover">
      <div class="cgrid">
        {#each Object.entries(COVERS) as [k, bg]}
          <button type="button" class:on={cover === k} style="background: {bg}" title={k} aria-label="Cover {k}" onclick={() => { onmeta({ cover: k }); pick = null; }}></button>
        {/each}
      </div>
      <div class="row">
        <button type="button" class="btn quiet sm" onclick={() => fileIn?.click()}><Icon name="image" size={14} /> Use an image…</button>
        <button type="button" class="btn quiet sm" onclick={() => { onmeta({ cover: undefined }); pick = null; }}>Remove</button>
      </div>
      <input type="file" accept="image/*" hidden bind:this={fileIn} onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) { oncoverfile(f); pick = null; } }} />
    </div>
  {/if}
</header>

<style>
  .nh {
    position: relative;
    flex: none;
    border-bottom: 1px solid var(--hairline);
  }
  .cover {
    position: relative;
    height: 76px;
    animation: coverin 0.5s var(--ease-out, ease) backwards;
  }
  @keyframes coverin {
    from {
      opacity: 0;
    }
  }
  .cbtns {
    position: absolute;
    right: 14px;
    bottom: 10px;
    display: flex;
    gap: 6px;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .nh:hover .cbtns,
  .cbtns:focus-within {
    opacity: 1;
  }
  .cbtns button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    font: inherit;
    font-size: 12.5px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .cbtns button:hover {
    color: var(--text);
    background: var(--surface);
  }
  .inner {
    max-width: var(--note-box, 860px);
    box-sizing: border-box;
    margin: 0 auto;
    padding: 22px var(--doc-pad, 40px) 12px;
    display: grid;
    gap: 8px;
  }
  .titlerow {
    position: relative;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
    padding: 0;
    color: var(--text);
    width: 46px;
    height: 46px;
    border: var(--edge, 0);
    border-radius: 14px;
    background: var(--surface);
    box-shadow: 0 8px 18px -10px rgba(40, 44, 80, 0.4);
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    transition: transform 0.25s var(--spring, ease), opacity 0.2s;
  }
  .icon:hover {
    transform: rotate(-6deg) scale(1.06);
  }
  .icon.over {
    position: relative;
    z-index: 1;
    justify-self: start;
    margin: -46px 0 -2px;
  }
  .icon.ghost {
    position: absolute;
    left: -42px;
    top: 50%;
    margin-top: -17px;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    box-shadow: none;
    border: 0;
    background: var(--panel);
    color: var(--text-muted);
    opacity: 0;
  }
  .nh:hover .icon.ghost,
  .icon.ghost:focus-visible {
    opacity: 1;
  }
  .title {
    flex: 1 1 260px;
    min-width: 0;
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    font-size: 28px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--text);
    text-overflow: ellipsis;
  }
  .title:focus {
    outline: none;
  }
  /* full header (her other favourite): breadcrumb, big icon and title, then chips + toolbar */
  .full .inner {
    padding-top: 26px;
    gap: 10px;
  }
  .crumbs {
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .full .titlerow {
    flex-wrap: nowrap;
    gap: 14px;
  }
  .full .icon:not(.ghost) {
    width: 60px;
    height: 60px;
    border-radius: 18px;
    font-size: 30px;
  }
  .full .icon.over {
    margin: -56px 0 -2px;
  }
  .full .title {
    font-size: 30px;
  }
  .metarow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 14px;
  }
  .hs {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 3px 3px 10px;
    border-radius: 12px;
    background: var(--panel);
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .hs span {
    flex: 1;
  }
  .hs button {
    min-height: 30px;
    padding: 0 10px;
    border: 0;
    border-radius: 9px;
    background: none;
    font: inherit;
    font-weight: 600;
    color: var(--text-muted);
    cursor: pointer;
  }
  .hs button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 10px;
    border: 0;
    border-radius: 999px;
    background: var(--panel);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .chip.course {
    cursor: pointer;
    max-width: 230px;
  }
  .chip.course .cn {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chev {
    font-size: 10px;
    opacity: 0.6;
  }
  .chip:focus-visible,
  .chip:focus-within {
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--lavender) 80%, transparent);
  }
  .chip input:focus {
    outline: none;
  }
  .clist {
    left: 0;
    width: 250px;
    max-height: 320px;
    overflow-y: auto;
    gap: 2px;
  }
  .copt {
    display: flex;
    align-items: center;
    gap: 10px;
    background: none;
  }
  .copt:hover {
    background: var(--panel);
  }
  .copt.on {
    background: color-mix(in srgb, var(--lavender) 30%, transparent);
    font-weight: 600;
  }
  .cdot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--hairline);
  }
  .chip.course[style] {
    background: color-mix(in srgb, var(--c) 40%, var(--white));
    color: var(--text);
  }
  .chip input {
    border: 0;
    background-color: transparent;
    font: inherit;
    color: inherit;
    min-height: 0;
    height: 28px;
    padding: 0 22px 0 0;
  }
  .chip input[type="date"] {
    padding-right: 4px;
  }
  .chip input.empty {
    color: color-mix(in srgb, var(--text-muted) 55%, transparent);
  }
  .chip.tag {
    background: color-mix(in srgb, var(--lavender) 35%, transparent);
    color: var(--text);
    padding-right: 4px;
  }
  .chip.tag button {
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--muted-on-tint);
    cursor: pointer;
  }
  .chip.tag button:hover {
    background: var(--surface);
  }
  .chip.add {
    cursor: pointer;
    background: none;
    box-shadow: inset 0 0 0 1px var(--hairline);
  }
  .chip.add:hover {
    color: var(--text);
  }
  .tagin {
    width: 120px;
    color: var(--text);
    outline: none;
  }
  .chip.more {
    width: 32px;
    padding: 0;
    justify-content: center;
    cursor: pointer;
  }
  .chip.more.on {
    background: var(--primary, var(--text));
    color: var(--on-primary);
  }
  .mwrap {
    position: relative;
  }
  .pop {
    position: absolute;
    z-index: 30;
    padding: 10px;
    border-radius: 18px;
    background: var(--surface-float, var(--surface));
    box-shadow: var(--shadow-lift);
    border: var(--edge, 0);
    animation: pop 0.18s var(--spring, ease) backwards;
  }
  @keyframes pop {
    from {
      opacity: 0;
      scale: 0.94;
    }
  }
  .menu {
    top: 38px;
    width: 270px;
    display: grid;
    gap: 6px;
  }
  .menu.right {
    right: 0;
  }
  .menu label {
    display: grid;
    gap: 4px;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .menu select {
    min-height: 34px;
    border-radius: 10px;
    background-color: var(--panel);
    padding-left: 10px;
    font: inherit;
  }
  .mi {
    min-height: 36px;
    padding: 0 10px;
    border: 0;
    border-radius: 10px;
    background: var(--panel);
    font: inherit;
    font-size: 13.5px;
    text-align: left;
    cursor: pointer;
  }
  .mi.del {
    background: var(--rose-soft);
    color: var(--alert-ink);
    font-weight: 600;
  }
  .mi.soft {
    color: var(--text-muted);
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 29;
    border: 0;
    background: none;
    cursor: default;
  }
  .emoji {
    left: 40px;
    top: 64px;
    width: auto;
  }
  .hascover .emoji {
    top: 96px;
  }
  .row {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .covers {
    right: 14px;
    top: 60px;
    width: 320px;
  }
  .cgrid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .cgrid button {
    height: 46px;
    border: 0;
    border-radius: 12px;
    cursor: pointer;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
    transition: transform 0.2s var(--spring, ease);
  }
  .cgrid button:hover {
    transform: scale(1.06);
  }
  .cgrid button.on {
    box-shadow: inset 0 0 0 2px var(--text);
  }
  .conflict {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--rose-soft);
    font-size: 13.5px;
  }
  .conflict span {
    flex: 1;
  }
  .sm {
    min-height: 32px;
    padding: 0 12px;
    font-size: 13px;
  }
  @container (max-width: 700px) {
    .inner {
      padding: 16px 18px 8px;
    }
  }
</style>
