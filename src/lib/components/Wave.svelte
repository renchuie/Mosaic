<script lang="ts">
  // Layered soft waves used as card decoration.
  let { a = "var(--sage)", b = "var(--butter)" }: { a?: string; b?: string } = $props();
</script>

<svg class="wave" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 70 C 60 30, 110 30, 170 62 S 290 100, 400 40 V120 H0 Z" fill={a} opacity="0.55" />
  <path d="M0 96 C 70 62, 140 70, 210 90 S 330 96, 400 70 V120 H0 Z" fill={b} opacity="0.8" />
</svg>

<style>
  .wave {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 62%;
    pointer-events: none;
  }
</style>
