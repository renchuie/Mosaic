<script lang="ts">
  import { route } from "../lib/router.svelte";
  import NotesView from "./study/NotesView.svelte";
  import StudyHome from "./study/StudyHome.svelte";
  import StudyNav from "./study/StudyNav.svelte";

  const noteRel = $derived(route.rest.startsWith("notes/") ? route.rest.slice(6) : null);
</script>

<div class="study">
  <StudyNav />
  {#if route.rest.startsWith("notes")}
    <NotesView rel={noteRel} />
  {:else}
    <StudyHome />
  {/if}
</div>

<style>
  .study {
    display: grid;
    min-width: 0;
  }
</style>
