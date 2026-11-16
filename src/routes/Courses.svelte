<script lang="ts">
  import { route } from "../lib/router.svelte";
  import CourseHome from "./courses/CourseHome.svelte";
  import CoursePage from "./courses/CoursePage.svelte";
  import CourseSettings from "./courses/CourseSettings.svelte";
</script>

{#if route.rest}
  {#key route.rest}<CoursePage id={route.rest} />{/key}
{:else}
  <CourseHome />
{/if}
<CourseSettings />
