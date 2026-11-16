<script lang="ts">
  import Icon from "../../lib/components/Icon.svelte";
  import { route } from "../../lib/router.svelte";

  const tab = $derived(route.page === "labs" ? "labs" : route.rest.startsWith("notes") ? "notes" : "home");
  const TABS = [
    { id: "home", label: "Home", href: "#/study", icon: "dashboard" },
    { id: "notes", label: "Notes", href: "#/study/notes", icon: "pen" },
    { id: "labs", label: "Recall Labs", href: "#/labs", icon: "labs" },
  ];
</script>

<nav class="snav" aria-label="Study">
  {#each TABS as t}
    <a href={t.href} class:on={tab === t.id} aria-current={tab === t.id ? "page" : undefined}><Icon name={t.icon} size={16} /> {t.label}</a>
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
  a.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
</style>
