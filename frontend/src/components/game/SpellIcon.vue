<script setup lang="ts">
import { computed } from 'vue'
import { getSpellIconDef } from './spell-icon-defs'

const props = defineProps<{ spellId: string }>()

// Stroke-only path glyphs. Stroke colour inherits via `currentColor`, which the
// parent button sets through `--spell-color`. Fill ramps up via the
// `--spell-icon-fill-opacity` cascade so hover / casting can ignite the glyph
// without the icon needing to know about button state.
const path = computed(() => getSpellIconDef(props.spellId).path)
</script>

<template>
  <svg class="spell-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <path class="spell-icon-path" :d="path" />
  </svg>
</template>

<style scoped>
.spell-icon {
  position: relative;
  z-index: 1;
  display: block;
  width: 28px;
  height: 28px;
  color: var(--spell-color, #6f6a65);
}

.spell-icon-path {
  fill: currentColor;
  fill-opacity: var(--spell-icon-fill-opacity, 0);
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: fill-opacity 140ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .spell-icon-path { transition: none; }
}
</style>
