<script setup lang="ts">
import { computed } from 'vue'
import { getSpellIconDef } from './spell-icon-defs'

const props = defineProps<{ spellId: string }>()

// Math-symbol glyph matching the in-canvas SpellEffectRenderer body and the
// manual's glyph column. Fill colour inherits via `currentColor`, which the
// parent button sets through `--spell-color`.
const def = computed(() => getSpellIconDef(props.spellId))
</script>

<template>
  <svg class="spell-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <text
      class="spell-icon-glyph"
      x="16"
      y="16"
      text-anchor="middle"
      dominant-baseline="central"
      :font-size="def.fontSize"
    >{{ def.glyph }}</text>
  </svg>
</template>

<style scoped>
.spell-icon {
  position: relative;
  z-index: 1;
  display: block;
  width: 28px;
  height: 28px;
  /* Let the widest glyph (`dv/dt`) spill past the 28px viewport rather than
     clip; the 44px button's own `overflow: hidden` is the real bound. */
  overflow: visible;
  color: var(--spell-color, #6f6a65);
}

/* Same math-capable font fallback chain as the canvas glyph bodies
   (`GLYPH_BODY_FONT_STACK` in renderers/primitives.ts) so the HUD symbol and
   the cast-time VFX render the same shapes across platforms. */
.spell-icon-glyph {
  fill: currentColor;
  font-family: 'Cambria Math', 'STIX Two Math', 'Courier New', Courier, monospace, serif;
  font-weight: 700;
}
</style>
