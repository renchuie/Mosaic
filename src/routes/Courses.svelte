<script lang="ts">
  import { route } from "../lib/router.svelte";
  import CourseHome from "./courses/CourseHome.svelte";
  import CoursePage from "./courses/CoursePage.svelte";
  import CourseSettings from "./courses/CourseSettings.svelte";
  import LecturePage from "./courses/LecturePage.svelte";
  // #/courses/<id> = a course, #/courses/<id>/l/<lecture> = one of its lectures
  const parts = $derived(route.rest.split("/"));
</script>

{#if parts[0] && parts[1] === "l" && parts[2]}
  {#key route.rest}<LecturePage courseId={parts[0]} id={parts[2]} />{/key}
{:else if route.rest}
  {#key route.rest}<CoursePage id={parts[0]} />{/key}
{:else}
  <CourseHome />
{/if}
<CourseSettings />
