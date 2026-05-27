<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { GamePhase } from '@/data/constants'

const gameStore = useGameStore()

const nextWaveNumber = computed(() => gameStore.wave + 1)
const nextWaveLabel = computed(() => `Start Wave ${nextWaveNumber.value}`)
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
    <span class="sw-play" aria-hidden="true">▶</span>
    <span class="sw-text">
      <span class="sw-eyebrow">Begin</span>
      <span class="sw-main">Start Wave {{ nextWaveNumber }}</span>
    </span>
  </button>
</template>

<style scoped>
/* Prominent gold call-to-action at the right of the sub-HUD row (mockup
   .gh-startwave): circular play icon + BEGIN eyebrow + START WAVE label. */
.start-wave-btn {
  position: absolute;
  top: calc(var(--hud-height, 56px) + 10px);
  right: 18px;
  z-index: var(--z-action);
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-soft) 100%);
  border: 1px solid var(--gold-deep);
  color: #fff;
  box-shadow: var(--shadow);
  cursor: pointer;
}
.start-wave-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--gold-soft) 0%, var(--gold) 100%);
}
.start-wave-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sw-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.28);
  font-size: var(--text-sm);
  flex-shrink: 0;
}

.sw-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  line-height: 1.05;
}
.sw-eyebrow {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  letter-spacing: 3px;
  text-transform: uppercase;
  opacity: 0.85;
}
.sw-main {
  font-size: var(--text-base);
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}
</style>
