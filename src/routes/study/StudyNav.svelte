<script lang="ts">
  import { route } from "../../lib/router.svelte";

  import { counts } from "../../lib/stores/srs.svelte";
  // The Study tabs (her pick Nov 17: the slim note-page look everywhere). On its own (bar = true)
  // it is a slim strip across the top of the main panel, on the glass, with a hairline under it,
  // exactly where the note page's top bar sits; the note page puts it inside its own bar instead.
  let { bar = true }: { bar?: boolean } = $props();
  const tab = $derived(route.page === "labs" ? "labs" : route.rest.startsWith("notes") ? "notes" : route.rest.startsWith("cards") ? "cards" : route.rest.startsWith("pdfs") ? "pdfs" : "home");
  const due = $derived(counts());
  const TABS = [
    { id: "home", label: "Home", href: "#/study", icon: "dashboard" },
    { id: "notes", label: "Notes", href: "#/study/notes", icon: "pen" },
    { id: "cards", label: "Cards", href: "#/study/cards", icon: "star" },
    { id: "pdfs", label: "PDFs", href: "#/study/pdfs", icon: "file" },
    { id: "labs", label: "Materials", href: "#/labs", icon: "labs" },
  ];
</script>

{#snippet tabs()}
  <nav class="snav" aria-label="Study">
    {#each TABS as t}
      <a href={t.href} class:on={tab === t.id} aria-current={tab === t.id ? "page" : undefined}>{t.label}{#if t.id === "cards" && due.due + due.newToday}<span class="badge">{due.due + due.newToday}</span>{/if}</a>
    {/each}
  </nav>
{/snippet}

{#if bar}
  <div class="sbar">{@render tabs()}</div>
{:else}
  {@render tabs()}
{/if}

<style>
  /* the strip: pulled out to the main panel's edges (cancels main's padding) */
  .sbar {
    display: flex;
    align-items: center;
    min-height: 56px;
    margin: calc(-1 * var(--main-pad-t)) calc(-1 * var(--main-pad-x)) var(--gap);
    padding: 8px 14px;
    box-sizing: border-box;
    border-bottom: 1px solid var(--hairline);
  }
  @media (max-width: 860px) {
    .sbar {
      margin: -20px -18px var(--gap); /* App's narrow main padding */
    }
  }
  .snav {
    display: flex;
    flex: none;
    gap: 2px;
    padding: 3px;
    border-radius: var(--radius-pill);
    background: var(--chip);
    max-width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
  }
  a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 12px;
    border-radius: var(--radius-pill);
    text-decoration: none;
    font-size: 13.5px;
    font-weight: 500;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .badge {
    min-width: 18px;
    padding: 0 5px;
    border-radius: var(--radius-pill);
    background: var(--sage);
    color: var(--ink-on-color);
    font-size: 11px;
    font-weight: 700;
    text-align: center;
  }
  a.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
</style>
