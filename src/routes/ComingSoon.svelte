<script lang="ts">
  let { title, phase, text }: { title: string; phase: number; text: string } = $props();
</script>

<section class="card soon">
  <span class="tag c-lemon">Phase {phase}</span>
  <h1 class="display">{title}</h1>
  <p class="muted">{text}</p>
</section>

<style>
  .soon {
    max-width: 560px;
    padding: 28px;
    display: grid;
    gap: 12px;
    justify-items: start;
  }
  h1 {
    font-size: 28px;
  }
</style>
