<script lang="ts">
  import { route } from "../../lib/router.svelte";

  import { counts } from "../../lib/stores/srs.svelte";
  import { ui } from "../../lib/stores/ui.svelte";
  import { getNote, noteHref } from "../../lib/stores/notes.svelte";
  // The Study tabs (her pick Nov 17: the slim note-page look everywhere). On its own (bar = true)
  // it is a slim strip across the top of the main panel, on the glass, with a hairline under it,
  // exactly where the note page's top bar sits; the note page puts it inside its own bar instead.
  let { bar = true }: { bar?: boolean } = $props();
  const tab = $derived(route.page === "labs" ? "labs" : route.rest.startsWith("notes") ? "notes" : route.rest.startsWith("cards") ? "cards" : route.rest.startsWith("pdfs") ? "pdfs" : route.rest.startsWith("files") ? "files" : "home");
  const due = $derived(counts());
  const sub = $derived(route.rest.startsWith("cards/browse") ? "browse" : route.rest.startsWith("cards/stats") ? "stats" : "decks");
  // Notes picks up the note she had open; clicked while already on Notes it goes to the home (folders)
  const notesHref = $derived(tab !== "notes" && ui.lastNote && getNote(ui.lastNote) ? noteHref(ui.lastNote) : "#/study/notes");
  const TABS = $derived([
    { id: "home", label: "Home", href: "#/study", icon: "dashboard" },
    { id: "files", label: "Files", href: "#/study/files", icon: "folder" },
    { id: "notes", label: "Notes", href: notesHref, icon: "pen" },
    { id: "cards", label: "Flashcards", href: "#/study/cards", icon: "star" },
    { id: "pdfs", label: "PDFs", href: "#/study/pdfs", icon: "file" },
    { id: "labs", label: "Materials", href: "#/labs", icon: "labs" },
  ]);
</script>

{#snippet tabs()}
  <nav class="snav" aria-label="Study">
    {#each TABS as t}
      <a href={t.href} class:on={tab === t.id} aria-current={tab === t.id ? "page" : undefined}>{t.label}{#if t.id === "cards" && due.due + due.newToday}<span class="badge">{due.due + due.newToday}</span>{/if}</a>
    {/each}
  </nav>
{/snippet}

{#if bar}
  <div class="sbar">
    {@render tabs()}
    {#if tab === "cards"}
      <span class="grow"></span>
      <nav class="sub" aria-label="Flashcards">
        {#each [["decks", "Decks", "#/study/cards"], ["browse", "Browse", "#/study/cards/browse"], ["stats", "Stats", "#/study/cards/stats"]] as [id, label, href]}
          <a {href} class:on={sub === id} aria-current={sub === id ? "page" : undefined}>{label}</a>
        {/each}
      </nav>
    {/if}
  </div>
{:else}
  {@render tabs()}
{/if}

<style>
  .grow {
    flex: 1;
  }
  .sub {
    display: flex;
    gap: 4px;
  }
  .sub a {
    min-height: 32px;
    padding: 0 12px;
  }
  .sub a.on {
    background: color-mix(in srgb, var(--text) 7%, transparent);
    color: var(--text);
    font-weight: 600;
  }
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
