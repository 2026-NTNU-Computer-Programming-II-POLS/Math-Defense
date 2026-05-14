<script setup lang="ts">
import { useGameStore } from '@/stores/gameStore'
import { gameCommands } from '@/services/gameCommandService'

const g = useGameStore()

function toggleSpeed(): void {
  gameCommands.setPerceivedSpeedMultiplier(g.perceivedSpeedMultiplier >= 2 ? 1 : 2)
}
</script>

<template>
  <div class="speed-panel" role="group" aria-label="Game speed; score timing is unchanged">
    <button
      type="button"
      class="speed-cell"
      :class="{ active: g.perceivedSpeedMultiplier >= 2 }"
      :aria-pressed="g.perceivedSpeedMultiplier >= 2"
      title="Toggle faster pace; score timing is unchanged"
      @click="toggleSpeed"
    >
      {{ g.perceivedSpeedMultiplier >= 2 ? '2x' : '1x' }}
    </button>
  </div>
</template>

<style scoped>
.speed-panel {
  width: auto;
  padding: 4px;
  background: rgba(26, 21, 32, 0.95);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  font-family: var(--font-mono);
}

.speed-cell {
  width: 40px;
  height: 40px;
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  color: #e8dcc8;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 120ms,
    border-color 120ms,
    color 120ms;
}

.speed-cell:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--gold);
}

.speed-cell:focus-visible {
  outline: 2px solid var(--gold-bright);
  outline-offset: 2px;
}

.speed-cell.active {
  border-color: var(--gold-bright);
  background: rgba(255, 215, 0, 0.16);
  color: var(--gold-bright);
}
</style>
