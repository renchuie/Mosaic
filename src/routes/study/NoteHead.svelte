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
  export const EMOJI = [
    "💊", "🧪", "🧬", "🫀", "🧠", "🫁", "🩺", "💉", "🩸", "🦠", "🧫", "🔬", "🏥", "⚕️", "🧑‍⚕️", "⚖️",
    "📚", "📖", "📝", "✏️", "📌", "📎", "🗂️", "📅", "⏰", "💡", "🎯", "✅", "❗", "❓", "⭐", "✨",
    "🌸", "🌷", "🌿", "🍀", "🌙", "☀️", "🔥", "🌈", "❤️", "🧡", "💛", "💚", "💙", "💜", "🍵", "☕", "🎧", "🐱", "🦋", "🐻",
  ];
</script>

<script lang="ts">
  import Icon from "../../lib/components/Icon.svelte";
  import { HL_COLOURS } from "../../lib/editor/blocks";
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
    onrun,
    oncoverfile,
    ontheirs,
    onmine,
  }: {
    rel: string;
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

  let pick = $state<"icon" | "cover" | "menu" | null>(null);
  let emojiText = $state("");
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

<svelte:window onkeydown={(e) => e.key === "Escape" && pick && (pick = null)} />

<header class="nh" class:hascover={!!cover}>
  {#if cover}
    <div class="cover" style={coverStyle}>
      <div class="cbtns">
        <button type="button" onclick={() => (pick = pick === "cover" ? null : "cover")}><Icon name="image" size={14} /> Change cover</button>
        <button type="button" onclick={shuffleCover} title="Another cover">↻</button>
      </div>
    </div>
  {/if}

  <div class="inner">
    {#if !cover || !icon}
      <div class="adds">
        {#if !icon}<button type="button" onclick={() => (pick = "icon")}><Icon name="smile" size={14} /> Add icon</button>{/if}
        {#if !cover}<button type="button" onclick={() => onmeta({ cover: "lilac" })}><Icon name="image" size={14} /> Add cover</button>{/if}
      </div>
    {/if}

    <div class="titlerow">
      {#if icon}
        <button type="button" class="icon" class:over={!!cover} title="Change icon" onclick={() => (pick = pick === "icon" ? null : "icon")}>{icon}</button>
      {/if}
      <div class="tcol">
        <div class="crumbs">
          <span>{dirOf(rel) || "Notes"}</span>
          <span class="st" class:bad={status === "conflict" || status === "error"} class:busy={status === "saving"}>
            {status === "saved" ? "Saved" : status === "saving" ? "Saving…" : status === "conflict" ? "Changed elsewhere" : "Couldn't save"}
          </span>
        </div>
        <input class="title" bind:value={title} aria-label="Note title" spellcheck="false" onblur={onrename} onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      </div>
    </div>

    <div class="chips">
      <label class="chip course" style={course ? `--c: ${course[1].color}` : ""}>
        <Icon name="book" size={13} />
        <select value={meta.course ?? ""} aria-label="Course" onchange={(e) => onmeta({ course: e.currentTarget.value || undefined })}>
          <option value="">No course</option>{#each courseNames() as c}<option value={c}>{c}</option>{/each}
        </select>
      </label>
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
        <button type="button" class="chip add" onclick={() => (addingTag = true)}>+ Tag</button>
      {/if}
      <span class="grow"></span>
      <button type="button" class="chip more" class:on={source} title={source ? "Back to the page view" : "Edit as Markdown"} onclick={ontoggleSource}><Icon name="code" size={14} /></button>
      <div class="mwrap">
        <button type="button" class="chip more" aria-label="More" onclick={() => (pick = pick === "menu" ? null : "menu")}><Icon name="dots" size={16} /></button>
        {#if pick === "menu"}
          <div class="pop menu right">
            <label>Move to
              <select value={dirOf(rel)} onchange={(e) => { onmove(e.currentTarget.value); pick = null; }}>{#each dirs as d}<option value={d}>{d || "Notes (top level)"}</option>{/each}</select>
            </label>
            {#if icon}<button type="button" class="mi" onclick={() => { onmeta({ icon: undefined }); pick = null; }}>Remove icon</button>{/if}
            {#if cover}<button type="button" class="mi" onclick={() => { onmeta({ cover: undefined }); pick = null; }}>Remove cover</button>{/if}
            {#if confirmDel}
              <button type="button" class="mi del" onclick={ondelete}>Move to trash (.trash in the Notes folder)</button>
            {:else}
              <button type="button" class="mi soft" onclick={() => (confirmDel = true)}>Delete…</button>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    {#if status === "conflict"}
      <div class="conflict" role="alert">
        <span>This note was changed on another computer since you opened it.</span>
        <button type="button" class="btn quiet sm" onclick={ontheirs}>Load that version</button>
        <button type="button" class="btn primary sm" onclick={onmine}>Keep mine</button>
      </div>
    {:else if status === "error"}
      <div class="conflict" role="alert"><span>{errorText}</span></div>
    {/if}

    {#if !source}
      <div class="toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" onclick={() => onrun("block", "heading:1")} title="Heading 1">H1</button>
        <button type="button" onclick={() => onrun("block", "heading:2")} title="Heading 2">H2</button>
        <button type="button" onclick={() => onrun("block", "heading:3")} title="Heading 3">H3</button>
        <span class="sep"></span>
        <button type="button" onclick={() => onrun("mark", "bold")} title="Bold (Ctrl+B)"><b>B</b></button>
        <button type="button" onclick={() => onrun("mark", "italic")} title="Italic (Ctrl+I)"><i>I</i></button>
        <button type="button" onclick={() => onrun("mark", "strike")} title="Strike (Ctrl+Shift+X)"><s>S</s></button>
        <span class="hl">
          {#each HL_COLOURS as c}<button type="button" class="dot" data-color={c} title="Highlight {c}" aria-label="Highlight {c}" onclick={() => onrun("hl", c)}></button>{/each}
        </span>
        <span class="sep"></span>
        <button type="button" onclick={() => onrun("ul")} title="Bullet list">•</button>
        <button type="button" onclick={() => onrun("ol")} title="Numbered list">1.</button>
        <button type="button" onclick={() => onrun("todo")} title="To-do">☐</button>
        <button type="button" onclick={() => onrun("table")} title="Table">▦</button>
        <button type="button" onclick={() => onrun("c-note")} title="Callout">❝</button>
        <span class="sep"></span>
        <button type="button" class="study" onclick={() => onrun("card")} title="Flashcard: question → answer (or type ::)">→</button>
        <button type="button" class="study" onclick={() => onrun("card2")} title="Two-way flashcard (or type :::)">⇄</button>
        <button type="button" class="study" onclick={() => onrun("cloze")} title="Cloze: hide the selected part">{"{ }"}</button>
        <button type="button" onclick={() => onrun("link")} title="Link to a note ([[)">[[ ]]</button>
        <span class="hint">Type <kbd>/</kbd> for blocks</span>
      </div>
    {/if}
  </div>

  {#if pick === "icon"}
    <button type="button" class="scrim" aria-label="Close" onclick={() => (pick = null)}></button>
    <div class="pop emoji" role="dialog" aria-label="Choose an icon">
      <div class="grid">
        {#each EMOJI as e}<button type="button" onclick={() => { onmeta({ icon: e }); pick = null; }}>{e}</button>{/each}
      </div>
      <div class="row">
        <input class="input" bind:value={emojiText} placeholder="Or paste any emoji" maxlength="8"
          onkeydown={(e) => { if (e.key === "Enter" && emojiText.trim()) { onmeta({ icon: emojiText.trim() }); pick = null; emojiText = ""; } }} />
        {#if icon}<button type="button" class="btn quiet sm" onclick={() => { onmeta({ icon: undefined }); pick = null; }}>Remove</button>{/if}
      </div>
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
    height: 120px;
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
  .cbtns button,
  .adds button {
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
  .cbtns button:hover,
  .adds button:hover {
    color: var(--text);
    background: var(--surface);
  }
  .inner {
    max-width: 860px;
    margin: 0 auto;
    padding: 14px 40px 8px;
    display: grid;
    gap: 8px;
  }
  .adds {
    display: flex;
    gap: 6px;
    height: 30px;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .nh:hover .adds,
  .adds:focus-within {
    opacity: 1;
  }
  .hascover .adds {
    position: absolute;
    top: 10px;
    left: 20px;
  }
  .titlerow {
    display: flex;
    align-items: flex-end;
    gap: 14px;
  }
  .icon {
    flex: none;
    width: 62px;
    height: 62px;
    border: var(--edge, 0);
    border-radius: 18px;
    background: var(--surface);
    box-shadow: 0 10px 22px -12px rgba(40, 44, 80, 0.4);
    font-size: 32px;
    line-height: 1;
    cursor: pointer;
    transition: transform 0.25s var(--spring, ease);
  }
  .icon:hover {
    transform: rotate(-6deg) scale(1.06);
  }
  .icon.over {
    margin-top: -46px;
  }
  .tcol {
    flex: 1;
    min-width: 0;
  }
  .crumbs {
    display: flex;
    gap: 10px;
    justify-content: space-between;
    font-size: 12.5px;
    color: var(--text-muted);
  }
  .st.busy {
    opacity: 0.7;
  }
  .st.bad {
    color: #a8434f;
    font-weight: 600;
  }
  .title {
    width: 100%;
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    font-size: 30px;
    font-weight: 700;
    line-height: 1.25;
    color: var(--text);
  }
  .title:focus {
    outline: none;
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
  .chip.course select {
    max-width: 170px;
  }
  .chip.course[style] {
    background: color-mix(in srgb, var(--c) 40%, var(--white, #fff));
    color: var(--text);
  }
  .chip select,
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
    background: color-mix(in srgb, var(--lavender, #c9b8f0) 35%, transparent);
    color: var(--text);
    padding-right: 4px;
  }
  .chip.tag button {
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--text-muted);
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
  .grow {
    flex: 1;
  }
  .chip.more {
    width: 32px;
    padding: 0;
    justify-content: center;
    cursor: pointer;
  }
  .chip.more.on {
    background: var(--primary, var(--text));
    color: var(--on-primary, #fff);
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
    color: #8f3b45;
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
    top: 70px;
    width: 340px;
  }
  .hascover .emoji {
    top: 150px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 2px;
  }
  .grid button {
    aspect-ratio: 1;
    border: 0;
    border-radius: 10px;
    background: none;
    font-size: 22px;
    cursor: pointer;
    transition: transform 0.2s var(--spring, ease);
  }
  .grid button:hover {
    background: var(--panel);
    transform: scale(1.15);
  }
  .row {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .row .input {
    flex: 1;
    min-height: 36px;
  }
  .covers {
    right: 14px;
    top: 96px;
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
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    align-items: center;
  }
  .toolbar button {
    min-width: 32px;
    min-height: 30px;
    padding: 0 7px;
    border: 0;
    border-radius: 9px;
    background: none;
    font: inherit;
    font-size: 13px;
    color: var(--text-muted);
    cursor: pointer;
  }
  .toolbar button:hover {
    background: var(--panel);
    color: var(--text);
  }
  .toolbar .study {
    color: #a8434f;
    font-weight: 700;
  }
  .hl {
    display: inline-flex;
    gap: 3px;
    padding: 0 4px;
  }
  .toolbar .dot {
    min-width: 0;
    width: 16px;
    height: 16px;
    min-height: 0;
    padding: 0;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px rgba(59, 48, 51, 0.1);
  }
  .toolbar .dot:hover {
    transform: scale(1.25);
  }
  .sep {
    width: 1px;
    height: 16px;
    margin: 0 4px;
    background: var(--hairline);
  }
  .hint {
    margin-left: auto;
    font-size: 12px;
    color: var(--text-muted);
  }
  .hint kbd {
    font: inherit;
    font-weight: 700;
    padding: 0 5px;
    border-radius: 5px;
    background: var(--chip);
  }
  @container (max-width: 700px) {
    .inner {
      padding: 12px 18px 8px;
    }
    .hint {
      display: none;
    }
  }
</style>
