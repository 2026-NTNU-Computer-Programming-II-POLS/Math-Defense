<script setup lang="ts">
/**
 * PhaseFader — Visual Redesign Phase 4.
 *
 * A thin semi-transparent overlay that blanks the canvas for ~300 ms on
 * BUILD ↔ WAVE transitions, bridging the visual jump between phases.
 * Watches `gameStore.phase` directly (no event-bus subscription, so no
 * registry entry is required).
 *
 * Reduced motion: the CSS animation honours `prefers-reduced-motion` and
 * degrades to a tiny static flash rather than a hard cut.
 */
import { ref, watch, onBeforeUnmount } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { GamePhase } from '@/data/constants'

const FADE_DURATION_MS = 300

const g = useGameStore()
const flashKey = ref(0)
const active = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

function isBuildOrWave(p: GamePhase): boolean {
  return p === GamePhase.BUILD || p === GamePhase.WAVE
}

watch(() => g.phase, (next, prev) => {
  if (prev === undefined) return
  if (isBuildOrWave(next) && isBuildOrWave(prev) && next !== prev) {
    flashKey.value++
    active.value = true
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => { active.value = false; timer = null }, FADE_DURATION_MS)
  }
})

onBeforeUnmount(() => {
  if (timer !== null) { clearTimeout(timer); timer = null }
})
</script>

<template>
  <div
    v-if="active"
    :key="flashKey"
    class="phase-fader"
    aria-hidden="true"
  />
</template>

<style scoped>
.phase-fader {
  position: absolute;
  inset: 0;
  background: #000;
  pointer-events: none;
  z-index: var(--z-overlay);
  animation: phase-fade 300ms ease-out forwards;
}

@keyframes phase-fade {
  0%   { opacity: 0; }
  40%  { opacity: 0.45; }
  100% { opacity: 0; }
}

@keyframes phase-fade-reduced {
  0%   { opacity: 0; }
  50%  { opacity: 0.15; }
  100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .phase-fader { animation-name: phase-fade-reduced; }
}
</style>
