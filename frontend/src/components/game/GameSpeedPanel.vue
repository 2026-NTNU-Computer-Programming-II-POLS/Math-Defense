<script setup lang="ts">
import { useGameStore } from '@/stores/gameStore'
import { gameCommands } from '@/services/gameCommandService'
import { PERCEIVED_SPEED_OPTIONS } from '@/data/constants'

const g = useGameStore()

// The perceived-speed multiplier only drives the loop during WAVE, so this
// panel is rendered only in WAVE (see GameView). No BUILD pre-arm hint here.
const isFast = computed(() => g.perceivedSpeedMultiplier >= 2)

function toggleSpeed(): void {
  gameCommands.setPerceivedSpeedMultiplier(isFast.value ? 1 : 2)
}
</script>

<template>
  <button
    type="button"
    class="speed-btn"
    :class="{ active: isFast }"
    :aria-pressed="isFast"
    aria-label="Game speed; score timing is unchanged"
    title="Toggle faster pace; score timing is unchanged"
    @click="toggleSpeed"
  >
    <span class="speed-mult">{{ isFast ? '2x' : '1x' }}</span>
    <span class="speed-label">Speed</span>
  </button>
</template>

<style scoped>
/* Speed tool — full-width left-bar toggle styled to match the Shop trigger
   (mockup .ptool.speed, teal accent). Width fills the rail like .shop-icon-btn. */
.speed-btn {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--card-surface);
  color: var(--charcoal);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  box-shadow: var(--shadow-sm);
  font-family: var(--font-mono);
  transition:
    background 120ms,
    border-color 120ms,
    color 120ms;
}

.speed-btn:hover {
  background: #fff;
  border-color: var(--terracotta);
}

.speed-btn:focus-visible {
  outline: 2px solid var(--terracotta-deep);
  outline-offset: 2px;
}

.speed-btn.active {
  border-color: var(--teal-deep);
  background: var(--teal-tint);
  color: var(--teal-deep);
}

.speed-mult {
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 1px;
  line-height: 1.15;
}

.speed-label {
  font-size: var(--text-2xs);
  letter-spacing: 1px;
  color: var(--charcoal-soft);
  line-height: 1.15;
}
</style>
