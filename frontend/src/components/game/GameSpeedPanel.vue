<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { gameCommands } from '@/services/gameCommandService'

const g = useGameStore()

// The perceived-speed multiplier only drives the loop during WAVE. In BUILD
// the toggle still works — it pre-arms the setting for the next wave — so the
// panel stays visible but shows a hint that the change isn't live yet.
const isLive = computed(() => g.isWave)
const isFast = computed(() => g.perceivedSpeedMultiplier >= 2)

function toggleSpeed(): void {
  gameCommands.setPerceivedSpeedMultiplier(isFast.value ? 1 : 2)
}
</script>

<template>
  <div class="speed-panel" role="group" aria-label="Game speed; score timing is unchanged">
    <button
      type="button"
      class="speed-cell"
      :class="{ active: isFast }"
      :aria-pressed="isFast"
      :title="isLive
        ? 'Toggle faster pace; score timing is unchanged'
        : 'Speed applies once the wave starts; score timing is unchanged'"
      @click="toggleSpeed"
    >
      {{ isFast ? '2x' : '1x' }}
    </button>
    <span v-if="!isLive" class="speed-hint">wave only</span>
  </div>
</template>

<style scoped>
/* Speed tool — Morandi left-bar button (mockup .ptool.speed, teal accent) */
.speed-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 5px;
  background: rgba(245, 250, 254, 0.86);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
  font-family: var(--font-mono);
}

.speed-cell {
  width: 40px;
  height: 40px;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: rgba(245, 250, 254, 0.94);
  color: var(--charcoal);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 700;
  cursor: pointer;
  transition:
    background 120ms,
    border-color 120ms,
    color 120ms;
}

.speed-cell:hover {
  background: #fff;
  border-color: var(--terracotta);
}

.speed-cell:focus-visible {
  outline: 2px solid var(--terracotta-deep);
  outline-offset: 2px;
}

.speed-cell.active {
  border-color: var(--teal-deep);
  background: rgba(143, 168, 163, 0.24);
  color: var(--teal-deep);
}

.speed-hint {
  font-size: var(--text-2xs);
  line-height: 1;
  color: var(--charcoal-soft);
  white-space: nowrap;
}
</style>
