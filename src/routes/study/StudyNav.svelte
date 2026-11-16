<script lang="ts">
  import Icon from "../../lib/components/Icon.svelte";
  import { route } from "../../lib/router.svelte";

  import { counts } from "../../lib/stores/srs.svelte";
  const tab = $derived(route.page === "labs" ? "labs" : route.rest.startsWith("notes") ? "notes" : route.rest.startsWith("cards") ? "cards" : "home");
  const due = $derived(counts());
  const TABS = [
    { id: "home", label: "Home", href: "#/study", icon: "dashboard" },
    { id: "notes", label: "Notes", href: "#/study/notes", icon: "pen" },
    { id: "cards", label: "Cards", href: "#/study/cards", icon: "star" },
    { id: "labs", label: "Recall Labs", href: "#/labs", icon: "labs" },
  ];
</script>

<nav class="snav" aria-label="Study">
  {#each TABS as t}
    <a href={t.href} class:on={tab === t.id} aria-current={tab === t.id ? "page" : undefined}><Icon name={t.icon} size={16} /> {t.label}{#if t.id === "cards" && due.due + due.newToday}<span class="badge">{due.due + due.newToday}</span>{/if}</a>
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
    color: var(--charcoal);
    font-size: 12px;
    font-weight: 700;
    text-align: center;
  }
  a.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
</style>
