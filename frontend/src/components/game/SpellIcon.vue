<script setup lang="ts">
defineProps<{ spellId: string }>()
</script>

<template>
  <svg class="spell-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <g v-if="spellId === 'fireball'">
      <path class="icon-glow" d="M20.6 3.4c.4 4.2-2.7 5.5-1 9.2 1.1-1.2 2-2.7 2.3-4.5 3.4 2.5 5.4 5.5 5.4 9.3 0 6.1-4.9 11-11 11s-11-4.9-11-11c0-4.8 3.4-8.2 7.9-12.1-.4 3.4.5 5.5 2.5 6.6.5-3.1 2-5.9 4.9-8.5Z" />
      <path class="icon-fill" d="M16.3 27.2c-4.9 0-8.7-3.8-8.7-8.6 0-3 1.5-5.4 4.2-7.8.1 2.8 1.4 4.7 3.9 5.6.1-2.9.9-5.4 3-7.8.6 2.8-.1 4.9.9 7.1 1.3-.6 2.2-1.7 2.8-3.2 1.6 1.7 2.6 3.5 2.6 6.1 0 4.8-3.8 8.6-8.7 8.6Z" />
      <circle class="icon-accent" cx="16.2" cy="20.2" r="3.9" />
    </g>
    <g v-else-if="spellId === 'slow'">
      <circle class="icon-glow" cx="16" cy="16" r="10.8" />
      <path class="icon-line" d="M16 5.5v21M8.6 8.6l14.8 14.8M5.5 16h21M8.6 23.4 23.4 8.6" />
      <path class="icon-line thin" d="m12.2 7.7 3.8 3.1 3.8-3.1M12.2 24.3l3.8-3.1 3.8 3.1M7.7 12.2l3.1 3.8-3.1 3.8M24.3 12.2 21.2 16l3.1 3.8" />
      <circle class="icon-accent" cx="16" cy="16" r="2.8" />
    </g>
    <g v-else-if="spellId === 'lightning'">
      <path class="icon-glow" d="M19.4 2.8 7.7 17.4h7l-2.1 11.8 11.7-15h-7.1l2.2-11.4Z" />
      <path class="icon-fill" d="M18.2 4.8 9.6 16.2h7.1l-2.4 10.9 8.2-11.9h-7.1l2.8-10.4Z" />
      <path class="icon-accent" d="M17.1 8.4 12 15.2h5.1l-1.2 6.2 4.1-6.8h-4.7l1.8-6.2Z" />
    </g>
    <g v-else-if="spellId === 'haste'">
      <circle class="icon-glow" cx="16" cy="16" r="11.2" />
      <path class="icon-line" d="M16 7.2v17.6M7.2 16h17.6" />
      <path class="icon-fill" d="M11.3 7.4c-2.9 1-5.1 3.6-5.7 7 3.4.2 6.1-1 8-3.6-1.1-.7-1.9-1.8-2.3-3.4ZM20.7 24.6c2.9-1 5.1-3.6 5.7-7-3.4-.2-6.1 1-8 3.6 1.1.7 1.9 1.8 2.3 3.4Z" />
      <circle class="icon-accent" cx="16" cy="16" r="3.2" />
    </g>
  </svg>
</template>

<style scoped>
.spell-icon {
  position: relative;
  z-index: 1;
  display: block;
  width: 26px;
  height: 26px;
  margin: 7px auto 0;
  color: var(--spell-color, #888);
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--spell-color, #888) 48%, transparent));
}

.icon-fill {
  fill: currentColor;
}

.icon-glow {
  fill: currentColor;
  opacity: 0.22;
}

.icon-accent {
  fill: #fff6d6;
  opacity: 0.86;
}

.icon-line {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.icon-line.thin {
  stroke-width: 1.7;
}
</style>
