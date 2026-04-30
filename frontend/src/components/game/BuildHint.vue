<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@/stores/uiStore'
import { useGameStore } from '@/stores/gameStore'
import { GamePhase } from '@/data/constants'

const uiStore = useUiStore()
const gameStore = useGameStore()

const steps = [
  '① Pick a tower from the bar below',
  '② Click a grid cell to place it',
  '③ Hover a tower to open the Build Panel',
  '④ Click "Cast Spell" to confirm',
  '⑤ Click "Start Wave" to begin',
]

const hint = computed(() => steps[uiStore.buildHintStep] ?? '')
const show = computed(() => gameStore.phase === GamePhase.BUILD)
</script>

<template>
  <div v-if="show && hint" class="build-hint">
    {{ hint }}
  </div>
</template>

<style scoped>
.build-hint {
  position: absolute;
  top: calc(var(--hud-height, 48px) + 44px + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: rgba(26,21,32,0.9);
  border: 1px solid var(--gold-dim);
  padding: 6px 16px;
  font-size: 11px;
  color: var(--gold);
  letter-spacing: 1px;
  max-width: calc(100% - 320px);
  text-align: center;
  pointer-events: none;
  z-index: var(--z-hints);
  /* Allow wrap instead of clipping off-screen on mobile (R-4) */
  white-space: normal;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .build-hint {
    max-width: calc(100% - 24px);
    font-size: 10px;
    padding: 5px 10px;
  }
}
</style>
