<script setup lang="ts">
import { useGameStore } from '@/stores/gameStore'
import { gameCommands } from '@/services/gameCommandService'
import { PERCEIVED_SPEED_OPTIONS } from '@/data/constants'

const g = useGameStore()

// The perceived-speed multiplier only drives the loop during WAVE. In BUILD
// the chip row still works — it pre-arms the setting for the next wave — so
// the panel stays visible but shows a hint that the change isn't live yet.

function setSpeed(value: number): void {
  gameCommands.setPerceivedSpeedMultiplier(value)
}

function label(value: number): string {
  // Keep "0.5x" / "1x" / "2x" / "3x" — short enough for a 32 px cell at
  // --text-xs and the active state still reads as a multiplier badge.
  return `${value}x`
}
</script>

<template>
  <div class="speed-panel" role="group" aria-label="Game speed; score timing is unchanged">
    <div class="speed-row">
      <button
        v-for="value in PERCEIVED_SPEED_OPTIONS"
        :key="value"
        type="button"
        class="speed-cell"
        :class="{ active: g.perceivedSpeedMultiplier === value }"
        :aria-pressed="g.perceivedSpeedMultiplier === value"
        :title="g.isWave
          ? `Set game pace to ${label(value)}; score timing is unchanged`
          : `Speed applies once the wave starts (${label(value)}); score timing is unchanged`"
        @click="setSpeed(value)"
      >
        {{ label(value) }}
      </button>
    </div>
    <span v-if="!g.isWave" class="speed-hint">wave only</span>
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
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
  font-family: var(--font-mono);
}

.speed-row {
  display: flex;
  gap: 4px;
}

.speed-cell {
  width: 40px;
  height: 36px;
  padding: 0;
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
