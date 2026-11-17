<script lang="ts">
  import Icon from "../../lib/components/Icon.svelte";
  import { route } from "../../lib/router.svelte";

  import { counts } from "../../lib/stores/srs.svelte";
  // compact: the smaller version that sits in the note page's top bar
  let { compact = false }: { compact?: boolean } = $props();
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

<nav class="snav" class:compact aria-label="Study">
  {#each TABS as t}
    <a href={t.href} class:on={tab === t.id} aria-current={tab === t.id ? "page" : undefined}>{#if !compact}<Icon name={t.icon} size={16} /> {/if}{t.label}{#if t.id === "cards" && due.due + due.newToday}<span class="badge">{due.due + due.newToday}</span>{/if}</a>
  {/each}
</nav>

<style>
  .snav {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-pill);
    background: var(--chip);
    justify-self: start;
    align-self: start;
    max-width: 100%;
    overflow-x: auto;
    margin-bottom: var(--gap);
  }
  a {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 18px;
    border-radius: var(--radius-pill);
    text-decoration: none;
    font-weight: 500;
    color: var(--text-muted);
    white-space: nowrap;
  }
  .badge {
    min-width: 22px;
    padding: 1px 7px;
    border-radius: var(--radius-pill);
    background: var(--sage);
    color: var(--ink-on-color);
    font-size: 12px;
    font-weight: 700;
    text-align: center;
  }
  .compact {
    margin: 0;
    flex: none;
    gap: 2px;
    padding: 3px;
  }
  .compact a {
    min-height: 32px;
    padding: 0 12px;
    font-size: 13.5px;
    gap: 6px;
  }
  .compact .badge {
    min-width: 18px;
    padding: 0 5px;
    font-size: 11px;
  }
  a.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
</style>
