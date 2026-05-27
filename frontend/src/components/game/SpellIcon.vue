<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ spellId: string }>()

// Flat shape glyphs (mockup). The U+FE0E variation selector forces text (not
// emoji) presentation so the snowflake / bolt render monochrome and pick up
// the spell colour via `fill: currentColor`. All stay within the BMP.
const GLYPH: Record<string, string> = {
  fireball: '▲',                // ▲
  slow: '❄︎',              // ❄ + text-presentation selector
  lightning: '⚡︎',         // ⚡ + text-presentation selector
  haste: '↯',                   // ↯
}

const glyph = computed(() => GLYPH[props.spellId] ?? '?')
// Single-shape glyphs sit at a fixed size within the 32-unit viewBox.
// Values are SVG user units (unitless number), not CSS pixels.
const fontSize = computed(() => 20)
</script>

<template>
  <svg class="spell-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
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
  width: 24px;
  height: 24px;
  color: var(--spell-color, #888);
  font-weight: 900;
}

.icon-fill {
  fill: currentColor;
}
</style>
