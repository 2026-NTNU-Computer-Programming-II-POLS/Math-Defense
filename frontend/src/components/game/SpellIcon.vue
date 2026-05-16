<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ spellId: string }>()

const GLYPH: Record<string, string> = {
  fireball: 'eˣ',
  slow: 'lim→0',
  lightning: 'δ',
  haste: 'd/dt',
}

const glyph = computed(() => GLYPH[props.spellId] ?? '?')
// Multi-character glyphs need a tighter size to fit the 32-unit viewBox.
// Values are SVG user units (unitless number), not CSS pixels.
const fontSize = computed(() => (glyph.value.length > 2 ? 11 : 22))
</script>

<template>
  <svg class="spell-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <!-- Gold-only chromatic fringe — matches the canvas SPELL_FRINGE so the
         button and the cast effect share the "player action" signal. -->
    <text
      class="icon-fringe-a"
      :font-size="fontSize"
      x="14.5"
      y="16"
      text-anchor="middle"
      dominant-baseline="central"
    >{{ glyph }}</text>
    <text
      class="icon-fringe-b"
      :font-size="fontSize"
      x="17.5"
      y="16"
      text-anchor="middle"
      dominant-baseline="central"
    >{{ glyph }}</text>
    <text
      class="icon-fill"
      :font-size="fontSize"
      x="16"
      y="16"
      text-anchor="middle"
      dominant-baseline="central"
    >{{ glyph }}</text>
  </svg>
</template>

<style scoped>
.spell-icon {
  position: relative;
  z-index: 1;
  display: block;
  width: 32px;
  height: 32px;
  margin: 4px auto 0;
  color: var(--spell-color, #888);
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--spell-color, #888) 48%, transparent));
  font-family: 'Cambria Math', 'STIX Two Math', 'Courier New', Courier, monospace, serif;
  font-weight: 900;
}

.icon-fill {
  fill: currentColor;
}

.icon-fringe-a {
  fill: #ffd700;
  opacity: 0.55;
}

.icon-fringe-b {
  fill: #c47206;
  opacity: 0.55;
}
</style>
