<script lang="ts">
  // One icon picker for everything that takes an icon (Nov 19, her ask: Notion-like clean icons in
  // colours first, then every emoji). Values are the strings described in icons.ts.
  import { ICONS, ICON_GROUPS } from "../iconSet";
  import { ICON_COLOURS, colourCss, lineIcon, parseIcon, recolour } from "../icons";
  import Icon from "./Icon.svelte";
  import { untrack } from "svelte";

  let {
    value,
    onpick,
    colours = true,
    remove = true,
  }: {
    value?: string;
    /** a new value, or undefined to remove the icon; `recoloured` = only the colour changed,
        so a popup can stay open (like Notion) */
    onpick: (v: string | undefined, recoloured?: boolean) => void;
    /** show the colour row (off where the colour comes from elsewhere, like a tag's tile) */
    colours?: boolean;
    remove?: boolean;
  } = $props();

  const cur = $derived(parseIcon(value));
  // opens on the tab and colour of the current icon (Icons first when there is none)
  const start = untrack(() => parseIcon(value));
  let tab = $state<"icons" | "emoji">(start.kind === "text" ? "emoji" : "icons");
  let q = $state("");
  let colour = $state(start.kind === "line" ? start.colour : "");

  const words = (s: string) => s.toLowerCase().replace(/-/g, " ");
  const query = $derived(q.trim().toLowerCase());
  const iconGroups = $derived(
    ICON_GROUPS.map((g) => ({ g, items: ICONS.filter((i) => i.group === g && (!query || words(i.name).includes(query))) })).filter((x) => x.items.length),
  );

  function pickColour(id: string) {
    colour = id;
    if (cur.kind === "line") onpick(recolour(value!, id), true);
  }

  // ---- emoji: loaded only when the tab opens -----------------------------------------------------
  type Emo = { emoji: string; name: string };
  let groups = $state<{ name: string; emojis: Emo[] }[] | null>(null);
  $effect(() => {
    if (tab !== "emoji" || groups) return;
    void import("unicode-emoji-json/data-by-group.json").then((m) => {
      const data = (m.default ?? m) as unknown as { name: string; emojis: Emo[] }[];
      groups = data.filter((g) => g.name !== "Component").map((g) => ({ name: g.name, emojis: g.emojis.map((e) => ({ emoji: e.emoji, name: e.name })) }));
    });
  });
  const RECENT = "mosaic.recentEmoji";
  let recent = $state<string[]>(read());
  function read(): string[] {
    try {
      const v = JSON.parse(localStorage.getItem(RECENT) ?? "[]");
      return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 24) : [];
    } catch {
      return [];
    }
  }
  function pickEmoji(e: string) {
    recent = [e, ...recent.filter((x) => x !== e)].slice(0, 24);
    try {
      localStorage.setItem(RECENT, JSON.stringify(recent));
    } catch {}
    onpick(e);
  }
  const emojiGroups = $derived(
    (groups ?? []).map((g) => ({ name: g.name, emojis: query ? g.emojis.filter((e) => e.name.includes(query)) : g.emojis })).filter((g) => g.emojis.length),
  );
  let typed = $state("");
</script>

<div class="ip" role="dialog" aria-label="Choose an icon">
  <div class="top">
    <div class="tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === "icons"} class:on={tab === "icons"} onclick={() => (tab = "icons")}>Icons</button>
      <button type="button" role="tab" aria-selected={tab === "emoji"} class:on={tab === "emoji"} onclick={() => (tab = "emoji")}>Emoji</button>
    </div>
    {#if remove && cur.kind !== "none"}<button type="button" class="rm" onclick={() => onpick(undefined)}>Remove</button>{/if}
  </div>
  <!-- svelte-ignore a11y_autofocus -->
  <input class="q" type="search" placeholder={tab === "icons" ? "Search icons (pill, heart, book…)" : "Search emoji"} bind:value={q} autofocus />

  {#if tab === "icons"}
    {#if colours}
      <div class="cols" role="radiogroup" aria-label="Icon colour">
        {#each ICON_COLOURS as c}
          <button type="button" role="radio" aria-checked={colour === c.id} aria-label={c.label} title={c.label} class:on={colour === c.id}
            style="--c: {c.css}" onclick={() => pickColour(c.id)}></button>
        {/each}
      </div>
    {/if}
    <div class="grid-wrap" style={colours ? `color: ${colourCss(colour)}` : undefined}>
      {#each iconGroups as g (g.g)}
        <p class="gh">{g.g}</p>
        <div class="grid">
          {#each g.items as it (it.name)}
            <button type="button" class:on={cur.kind === "line" && cur.name === it.name} title={it.name.replace(/-/g, " ")} aria-label={it.name.replace(/-/g, " ")}
              onclick={() => onpick(lineIcon(it.name, colours ? colour : ""))}>
              <Icon name={lineIcon(it.name)} size={20} colour={false} />
            </button>
          {/each}
        </div>
      {:else}
        <p class="none">No icon called "{q}". Try the Emoji tab.</p>
      {/each}
    </div>
  {:else}
    <div class="grid-wrap emo">
      {#if !query && recent.length}
        <p class="gh">Recent</p>
        <div class="grid">{#each recent as e}<button type="button" class:on={value === e} onclick={() => pickEmoji(e)}>{e}</button>{/each}</div>
      {/if}
      {#if !groups}
        <p class="none">Loading…</p>
      {:else}
        {#each emojiGroups as g (g.name)}
          <p class="gh">{g.name}</p>
          <div class="grid">
            {#each g.emojis as e (e.emoji)}<button type="button" class:on={value === e.emoji} title={e.name} onclick={() => pickEmoji(e.emoji)}>{e.emoji}</button>{/each}
          </div>
        {:else}
          <p class="none">No emoji called "{q}".</p>
        {/each}
      {/if}
    </div>
    <input class="typed" placeholder="Or type / paste one, then Enter" bind:value={typed}
      onkeydown={(e) => { if (e.key === "Enter" && typed.trim()) { pickEmoji(typed.trim()); typed = ""; } }} />
  {/if}
</div>

<style>
  .ip {
    display: grid;
    gap: 8px;
    width: 340px;
    max-width: calc(100vw - 24px);
  }
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tabs {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--chip);
  }
  .tabs button {
    padding: 5px 14px;
    border: 0;
    border-radius: 999px;
    background: none;
    color: var(--text-muted);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .tabs button.on {
    background: var(--surface-float, var(--white));
    color: var(--text);
    box-shadow: 0 2px 6px -3px rgba(40, 44, 80, 0.35);
  }
  .rm {
    margin-left: auto;
    padding: 5px 10px;
    border: 0;
    border-radius: 999px;
    background: none;
    color: var(--text-muted);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
  }
  .rm:hover {
    background: var(--chip);
    color: var(--alert-ink);
  }
  .q,
  .typed {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
    border: 0;
    border-radius: 12px;
    background: var(--field);
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
  }
  .cols {
    display: flex;
    gap: 6px;
    padding: 0 2px;
  }
  .cols button {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 0;
    background: var(--c);
    cursor: pointer;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--white) 30%, transparent);
  }
  .cols button.on {
    box-shadow: 0 0 0 2px var(--surface-float, var(--white)), 0 0 0 4px var(--c);
  }
  .grid-wrap {
    max-height: 300px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 2px;
  }
  .gh {
    margin: 6px 2px 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
    gap: 2px;
    content-visibility: auto;
    contain-intrinsic-size: auto 160px;
  }
  .grid button {
    display: grid;
    place-items: center;
    height: 36px;
    border: 0;
    border-radius: 9px;
    background: none;
    color: inherit;
    font-size: 21px;
    line-height: 1;
    cursor: pointer;
  }
  .grid button:hover {
    background: var(--chip);
  }
  .grid button.on {
    background: color-mix(in srgb, var(--accent) 22%, var(--white));
  }
  .none {
    margin: 12px 4px;
    font-size: 13px;
    color: var(--text-muted);
  }
</style>
