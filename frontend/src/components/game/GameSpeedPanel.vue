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
    <span class="speed-hint">wave only</span>
  </div>
</template>

<style scoped>
.speed-panel {
  box-sizing: border-box;
  width: 50px;
  height: 50px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: var(--overlay-panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  font-family: var(--font-mono);
}

.speed-cell {
  width: 40px;
  height: 30px;
  align-self: flex-start;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  background: var(--overlay-cell-bg);
  color: var(--overlay-text);
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
  background: var(--overlay-cell-hover);
  border-color: var(--gold);
}

.speed-cell:focus-visible {
  outline: 2px solid var(--gold-bright);
  outline-offset: 2px;
}

.speed-cell.active {
  border-color: var(--gold-bright);
  background: var(--overlay-cell-active);
  color: var(--gold-bright);
}

.speed-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 6px;
  font-size: 8px;
  line-height: 1;
  color: var(--overlay-text);
  opacity: 0.75;
  text-align: center;
  white-space: nowrap;
  pointer-events: none;
}
</style>
