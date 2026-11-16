<script lang="ts">
  import { route } from "../lib/router.svelte";
  import NotesView from "./study/NotesView.svelte";
  import StudyHome from "./study/StudyHome.svelte";
  import StudyNav from "./study/StudyNav.svelte";
  import CardsView from "./study/CardsView.svelte";
  import ReviewSession from "./study/ReviewSession.svelte";
  import type { Scope } from "../lib/stores/srs.svelte";

  const noteRel = $derived(route.rest.startsWith("notes/") ? route.rest.slice(6) : null);
  // #/study/cards/review/all | course:<name> | note:<rel>
  const scope = $derived.by((): Scope | null => {
    if (!route.rest.startsWith("cards/review")) return null;
    const s = route.rest.slice("cards/review/".length);
    if (s.startsWith("course:")) return { kind: "course", name: s.slice(7) };
    if (s.startsWith("note:")) return { kind: "note", rel: s.slice(5) };
    return { kind: "all" };
  });
</script>

<div class="study">
  {#if !scope}<StudyNav />{/if}
  {#if scope}
    {#key route.rest}<ReviewSession {scope} />{/key}
  {:else if route.rest.startsWith("cards")}
    <CardsView />
  {:else if route.rest.startsWith("notes")}
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
