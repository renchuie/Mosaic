<script lang="ts">
  // Add card (canvas board "Flashcards tab" → "Add card", her pick for every option): fast like
  // Anki's Add window. Pick a type and a deck once, type, Ctrl+Enter; the form clears for the next
  // card while pinned fields stay filled. A live preview shows the card as review will, a
  // duplicate check warns about a front that already exists, and the cards added this visit are
  // listed. Route #/study/cards/add[?deck=<id>]; last type / deck / course / pins remembered per
  // machine (localStorage "mosaic.addCard").
  import { onDestroy, onMount, tick } from "svelte";
  import Icon from "../../lib/components/Icon.svelte";
  import { cardHtml } from "../../lib/cards";
  import type { FlashItem } from "../../lib/cardTypes";
  import { plainOf } from "../../lib/play";
  import { courseByName, courseNames } from "../../lib/stores/courses.svelte";
  import { decks, getDeck } from "../../lib/stores/decks.svelte";
  import { cardsOfItem, cardTypes, getType, previewImages, saveItem } from "../../lib/stores/library.svelte";
  import { imageUrl } from "../../lib/stores/notes.svelte";
  import { allCards } from "../../lib/stores/srs.svelte";
  import OcclusionEditor from "./library/OcclusionEditor.svelte";
  import TypeDialog from "./library/TypeDialog.svelte";

  type Saved = { type?: string; deck?: string; course?: string; pins?: Record<string, string[]>; tagsPinned?: boolean };
  const load = (): Saved => {
    try {
      return JSON.parse(localStorage.getItem("mosaic.addCard") || "{}");
    } catch {
      return {};
    }
  };
  const saved = load();
  const fromHash = /[?&]deck=([^&]+)/.exec(location.hash)?.[1];

  let type = $state(saved.type && getType(saved.type) && getType(saved.type)?.kind !== "occlusion" ? saved.type : "basic");
  let deck = $state(fromHash ? decodeURIComponent(fromHash) : (saved.deck && getDeck(saved.deck) ? saved.deck : ""));
  let course = $state(saved.course ?? "");
  let pins = $state<Record<string, string[]>>(saved.pins ?? {});
  let tagsPinned = $state(saved.tagsPinned ?? true);
  let fields = $state<Record<string, string>>({});
  let tags = $state<string[]>([]);
  let tagDraft = $state("");
  let added = $state<{ id: string; text: string }[]>([]);
  let occOpen = $state(false);
  let typeOpen = $state<string | null>(null);
  let focused = $state<string | null>(null);
  const boxes: Record<string, HTMLTextAreaElement | undefined> = $state({});

  // a deck with one course fills the course in
  $effect(() => {
    const d = deck ? getDeck(deck) : undefined;
    if (d?.courses?.length === 1) course = d.courses[0];
  });
  $effect(() => {
    try {
      localStorage.setItem("mosaic.addCard", JSON.stringify({ type, deck, course, pins, tagsPinned }));
    } catch {}
  });

  const t = $derived(getType(type));
  const pinned = (f: string) => (pins[type] ?? []).includes(f);
  function togglePin(f: string) {
    const cur = pins[type] ?? [];
    pins = { ...pins, [type]: cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f] };
  }

  const TYPE_ICON: Record<string, string> = { basic: "→", reverse: "⇄", cloze: "{ }", drug: "", occlusion: "▣" };
  const types = $derived(cardTypes());

  const item = $derived<FlashItem>({ type, fields: { ...fields }, course: course || undefined, tags: tags.length ? tags : undefined, created: 0 });
  const preview = $derived(t && t.kind !== "occlusion" ? cardsOfItem(`draft:${type}:${JSON.stringify(fields)}`, item) : []);
  const first = $derived(preview[0]);
  const img = (s: string) => previewImages.get(s) ?? imageUrl("", s);

  // duplicate check: the first field's text is already the front of a card
  const firstField = $derived(t?.fields[0] ?? "");
  const dupes = $derived.by(() => {
    const f = plainOf(fields[firstField] ?? "").toLowerCase();
    if (f.length < 3) return 0;
    return allCards().filter((r) => plainOf(r.card.front).toLowerCase() === f).length;
  });

  const tone = $derived(type === "reverse" ? "var(--lavender)" : type === "cloze" ? "var(--butter)" : type === "drug" ? "color-mix(in srgb, var(--lavender) 60%, var(--rose-deep))" : "var(--rose-deep)");
  const kicker = $derived(
    [t?.kind === "cloze" ? "{ } Cloze" : type === "reverse" ? "⇄ Both ways" : type === "drug" ? "Drug" : "→ Flashcard", course ? (courseByName(course)?.[1].code ?? course) : "", deck ? getDeck(deck)?.name : ""].filter(Boolean).join(" · "),
  );

  function addTag(raw = tagDraft) {
    const v = raw.trim().replace(/^#/, "").replace(/\s+/g, "-");
    if (v && !tags.includes(v)) tags = [...tags, v];
    tagDraft = "";
  }
  function tagKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && !tagDraft && tags.length) tags = tags.slice(0, -1);
  }

  async function add() {
    if (!t || !preview.length) return;
    if (tagDraft.trim()) addTag();
    const id = saveItem(null, { ...item, fields: { ...fields }, tags: tags.length ? [...tags] : undefined, created: Date.now(), ...(deck ? { deck } : {}) });
    added = [{ id, text: plainOf(fields[firstField] ?? "") || "Card" }, ...added].slice(0, 8);
    const keep = pins[type] ?? [];
    fields = Object.fromEntries(Object.entries(fields).filter(([k]) => keep.includes(k)));
    if (!tagsPinned) tags = [];
    await tick();
    const target = t.fields.find((f) => !keep.includes(f)) ?? t.fields[0];
    boxes[target]?.focus();
  }

  // the format bar works on the field that had focus last
  function wrap(before: string, after = before) {
    const f = focused;
    const el = f ? boxes[f] : undefined;
    if (!f || !el) return;
    const a = el.selectionStart, b = el.selectionEnd;
    const v = fields[f] ?? "";
    fields = { ...fields, [f]: v.slice(0, a) + before + v.slice(a, b) + after + v.slice(b) };
    tick().then(() => {
      el.focus();
      el.setSelectionRange(a + before.length, b + before.length);
    });
  }
  /** next cloze number in the field: {{c1::…}}, {{c2::…}} */
  function cloze() {
    const f = focused;
    const used = [...(fields[f ?? ""] ?? "").matchAll(/\{\{c(\d+)::/g)].map((m) => Number(m[1]));
    const n = used.length ? Math.max(...used) + 1 : 1;
    wrap(`{{c${n}::`, "}}");
  }

  function onKey(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.closest("dialog")) return;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void add();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c") {
      e.preventDefault();
      cloze();
    } else if (e.key === "Escape" && !(e.target as HTMLElement)?.closest("input, textarea")) {
      history.back();
    }
  }
  onMount(() => {
    window.addEventListener("keydown", onKey);
    tick().then(() => t && boxes[t.fields.find((f) => !pinned(f)) ?? t.fields[0]]?.focus());
  });
  onDestroy(() => window.removeEventListener("keydown", onKey));
  function pickType(id: string) {
    if (getType(id)?.kind === "occlusion") {
      occOpen = true;
      return;
    }
    type = id;
    fields = {};
  }
</script>

<OcclusionEditor bind:open={occOpen} />
<TypeDialog bind:id={typeOpen} />

<div class="addw">
  <div class="form">
    <div class="types" role="radiogroup" aria-label="Card type">
      {#each types as [id, ct] (id)}
        <button type="button" role="radio" aria-checked={type === id} class:on={type === id} onclick={() => pickType(id)}>
          {#if id === "drug"}<Icon name="pill" size={15} />{:else if TYPE_ICON[id]}<span class="gl">{TYPE_ICON[id]}</span>{:else}<span class="gl">✦</span>{/if}
          {ct.name}
        </button>
      {/each}
      <button type="button" onclick={() => (typeOpen = "new")}><Icon name="i:plus" size={14} /> My types</button>
    </div>

    <div class="pick">
      <label class="sel"><small>Deck</small>
        <select bind:value={deck} aria-label="Deck">
          <option value="">None</option>
          {#each decks() as [id, d] (id)}<option value={id}>{d.parent && getDeck(d.parent) ? `${getDeck(d.parent)!.name} › ` : ""}{d.name}</option>{/each}
        </select>
      </label>
      <label class="sel"><small>Course</small>
        <select bind:value={course} aria-label="Course">
          <option value="">None</option>
          {#each courseNames() as c}<option value={c}>{c}</option>{/each}
        </select>
      </label>
    </div>

    {#if t}
      {#each t.fields as f, i (type + f)}
        <div class="field">
          <span class="lb">
            <label for="af-{i}">{f}</label>
            {#if focused === f}
              <span class="tb" role="toolbar" aria-label="Format">
                <button type="button" title="Bold (Ctrl+B)" onmousedown={(e) => e.preventDefault()} onclick={() => wrap("**")}><b>B</b></button>
                <button type="button" title="Italic (Ctrl+I)" onmousedown={(e) => e.preventDefault()} onclick={() => wrap("*")}><i>I</i></button>
                <button type="button" title="Highlight" onmousedown={(e) => e.preventDefault()} onclick={() => wrap("==")}>==</button>
                <button type="button" title="Cloze (Ctrl+Shift+C)" onmousedown={(e) => e.preventDefault()} onclick={cloze}>{"{ }"}</button>
                <button type="button" title="Superscript" onmousedown={(e) => e.preventDefault()} onclick={() => wrap("<sup>", "</sup>")}>x²</button>
              </span>
            {/if}
            <button type="button" class="pin" class:on={pinned(f)} aria-pressed={pinned(f)} onclick={() => togglePin(f)}><Icon name="i:pin" size={12} /> {pinned(f) ? "kept" : "keep"}</button>
          </span>
          <textarea id="af-{i}" class="box" rows={i === 0 ? 2 : 2} bind:this={boxes[f]} bind:value={fields[f]} onfocus={() => (focused = f)}
            onkeydown={(e) => {
              if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "b") { e.preventDefault(); wrap("**"); }
              else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "i") { e.preventDefault(); wrap("*"); }
            }}></textarea>
        </div>
      {/each}
    {/if}

    <div class="field">
      <span class="lb"><span>Tags</span><button type="button" class="pin" class:on={tagsPinned} aria-pressed={tagsPinned} onclick={() => (tagsPinned = !tagsPinned)}><Icon name="i:pin" size={12} /> {tagsPinned ? "kept" : "keep"}</button></span>
      <div class="tags">
        {#each tags as tg (tg)}<span class="tag">#{tg}<button type="button" aria-label="Remove #{tg}" onclick={() => (tags = tags.filter((x) => x !== tg))}>×</button></span>{/each}
        <input bind:value={tagDraft} onkeydown={tagKey} onblur={() => tagDraft.trim() && addTag()} placeholder={tags.length ? "" : "add a tag…"} aria-label="Add a tag" />
      </div>
    </div>

    <div class="foot">
      <button type="button" class="btn dark" disabled={!preview.length} onclick={add}>Add <kbd>Ctrl+Enter</kbd></button>
      <a class="btn" href="#/study/cards">Done</a>
      <span class="small muted">Esc closes</span>
    </div>
  </div>

  <aside class="prev">
    <span class="plabel">Preview</span>
    <div class="pcard" style="--t: {tone}">
      <div class="small muted">{kicker}</div>
      {#if first}
        <div class="q">{@html cardHtml(first.front, img)}</div>
        <div class="div">Answer</div>
        <div class="a">{@html cardHtml(first.back, img)}</div>
        {#if preview.length > 1}<div class="small muted">+ {preview.length - 1} more {preview.length - 1 === 1 ? "card" : "cards"}</div>{/if}
      {:else}
        <div class="q empty">{t?.kind === "cloze" ? "{{c1::hidden}} part" : "Front"}</div>
      {/if}
    </div>
    {#if dupes}
      <div class="sticky">Already the front of {dupes} {dupes === 1 ? "card" : "cards"}. <a href="#/study/cards/browse">Show</a></div>
    {/if}
    {#if added.length}
      <span class="plabel">Added just now</span>
      <div class="added">
        {#each added as a (a.id)}<a href="#/study/cards/library/{a.id}"><Icon name="check" size={14} /> {a.text}</a>{/each}
      </div>
    {/if}
  </aside>
</div>

<style>
  .addw {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 420px;
    gap: 20px;
    align-items: start;
    container-type: inline-size;
  }
  @media (max-width: 1100px) {
    .addw {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .form {
    display: grid;
    gap: 14px;
    min-width: 0;
  }
  .types {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .types button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 38px;
    padding: 0 14px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 75%, transparent);
    color: var(--text-muted);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
    transition: transform 0.15s var(--spring, ease);
  }
  .types button:hover {
    transform: translateY(-1px);
  }
  .types button.on {
    background: var(--primary, var(--charcoal));
    color: var(--on-primary, var(--white));
    font-weight: 600;
  }
  .gl {
    font-weight: 700;
  }
  .pick {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .sel {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 6px 0 14px;
    min-height: 42px;
    border-radius: 14px;
    background: var(--surface);
    box-shadow: var(--shadow);
    font-size: 14px;
  }
  .sel small {
    color: var(--text-muted);
    font-size: 12.5px;
  }
  .sel select {
    min-height: 38px;
    padding: 0 8px;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .field {
    display: grid;
    gap: 6px;
  }
  .lb {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 26px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .tb {
    display: flex;
    gap: 4px;
    margin-left: 6px;
  }
  .tb button {
    min-width: 28px;
    height: 24px;
    padding: 0 7px;
    border: 0;
    border-radius: 8px;
    background: color-mix(in srgb, var(--text) 5%, transparent);
    color: var(--text-muted);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
  }
  .tb button:hover {
    background: color-mix(in srgb, var(--lavender) 35%, transparent);
    color: var(--text);
  }
  .pin {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    padding: 2px 9px;
    border: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--text) 5%, transparent);
    color: var(--text-muted);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }
  .pin.on {
    background: color-mix(in srgb, var(--butter) 60%, var(--white));
    color: color-mix(in srgb, var(--butter) 25%, var(--text));
  }
  .box {
    width: 100%;
    box-sizing: border-box;
    min-height: 52px;
    padding: 12px 14px;
    border: 0;
    border-radius: 16px;
    background: var(--surface-float, var(--surface));
    color: var(--text);
    font: inherit;
    font-size: 16px;
    line-height: 1.45;
    resize: vertical;
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--text) 8%, transparent);
    transition: box-shadow 0.15s;
  }
  .box:focus {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--lavender);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-height: 44px;
    padding: 6px 10px;
    box-sizing: border-box;
    border-radius: 14px;
    background: var(--surface-float, var(--surface));
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--text) 8%, transparent);
  }
  .tags:focus-within {
    box-shadow: inset 0 0 0 2px var(--lavender);
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px 4px 3px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--lavender) 30%, var(--white));
    color: color-mix(in srgb, var(--lavender) 30%, var(--text));
    font-size: 13px;
  }
  .tag button {
    width: 20px;
    height: 20px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: inherit;
    font-size: 15px;
    cursor: pointer;
  }
  .tags input {
    flex: 1;
    min-width: 120px;
    border: 0;
    background: none;
    color: var(--text);
    font: inherit;
    font-size: 14px;
    outline: none;
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .btn.dark {
    background: var(--primary, var(--charcoal));
    color: var(--on-primary, var(--white));
  }
  .btn.dark:disabled {
    opacity: 0.45;
  }
  kbd {
    padding: 1px 6px;
    border-radius: 6px;
    background: color-mix(in srgb, currentColor 18%, transparent);
    font-family: inherit;
    font-size: 11.5px;
    font-weight: 500;
    line-height: 1.4;
  }
  .prev {
    display: grid;
    gap: 12px;
    align-content: start;
    min-width: 0;
  }
  .plabel {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-muted);
  }
  .pcard {
    position: relative;
    display: grid;
    gap: 12px;
    padding: 20px 22px 20px 28px;
    border-radius: 24px;
    background:
      radial-gradient(70% 90% at 0% 0%, color-mix(in srgb, var(--t) 18%, transparent), transparent 60%),
      var(--surface-float, var(--surface));
    box-shadow: var(--shadow-lift);
    overflow: hidden;
  }
  .pcard::before {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    width: 6px;
    background: linear-gradient(180deg, var(--t), color-mix(in srgb, var(--t) 40%, var(--white)));
  }
  .q {
    font-size: 22px;
    font-weight: 600;
    line-height: 1.3;
  }
  .q.empty {
    color: var(--text-muted);
    opacity: 0.5;
  }
  .a {
    font-size: 19px;
    font-weight: 500;
    line-height: 1.4;
  }
  .q :global(p),
  .a :global(p) {
    margin: 0;
  }
  .div {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .div::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--hairline);
  }
  .sticky {
    padding: 12px 14px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--butter) 45%, var(--white));
    color: color-mix(in srgb, var(--butter) 20%, var(--text));
    font-size: 13.5px;
    line-height: 1.45;
  }
  .sticky a {
    color: inherit;
    font-weight: 600;
  }
  .added {
    display: grid;
    gap: 4px;
    font-size: 13.5px;
  }
  .added a {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--surface) 70%, transparent);
    color: var(--text);
    text-decoration: none;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .added :global(svg) {
    flex: none;
    color: var(--go-ink);
  }
  .small {
    font-size: 13px;
  }
  .muted {
    color: var(--text-muted);
  }
</style>
