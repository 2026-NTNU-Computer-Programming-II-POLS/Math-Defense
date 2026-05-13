<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { GamePhase } from '@/data/constants'

const gameStore = useGameStore()

const nextWaveLabel = computed(() => `Start Wave ${gameStore.wave + 1}`)
const disabled = computed(() => gameStore.phase !== GamePhase.BUILD)

function onClick(): void {
  gameStore.getEngine()?.startWave()
}
</script>

<template>
  <button
    class="btn start-wave-btn"
    :disabled="disabled"
    :aria-label="nextWaveLabel"
    @click="onClick"
  >
    ▶ {{ nextWaveLabel }}
  </button>
</template>

<style scoped>
.start-wave-btn {
  position: absolute;
  bottom: calc(var(--tower-bar-height, 64px) + 12px);
  left: 16px;
  font-size: 12px;
  letter-spacing: 3px;
  padding: 10px 20px;
  z-index: var(--z-action);
}
</style>
