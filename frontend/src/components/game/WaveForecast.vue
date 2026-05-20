<script setup lang="ts">
/**
 * WaveForecast — V3 Phase 6 §6.1 pre-wave warning.
 *
 * During the BUILD phase, names every counter-enemy in the upcoming wave and
 * the tower that answers it, so a counter-enemy is never a surprise. Pure
 * presentation: reads the forecast through `gameStore`, never the engine.
 */
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { GamePhase } from '@/data/constants'
import { COUNTER_ENEMY_INFO } from '@/data/counter-enemy-info'

const gameStore = useGameStore()

const show = computed(() => gameStore.phase === GamePhase.BUILD)
const warnings = computed(() =>
  gameStore.upcomingCounterEnemyTypes
    .map((type) => COUNTER_ENEMY_INFO[type])
    .filter((info): info is NonNullable<typeof info> => info != null),
)
</script>

<template>
  <div
    v-if="show && warnings.length"
    class="wave-forecast"
    role="status"
    data-testid="wave-forecast"
  >
    <p v-for="w in warnings" :key="w.name" class="forecast-line">
      <span class="forecast-prefix">Next wave:</span>
      <span class="forecast-enemy">{{ w.name }}</span> — {{ w.warning }}
    </p>
  </div>
</template>

<style scoped>
.wave-forecast {
  position: absolute;
  top: calc(var(--hud-height, 48px) + 44px + 8px + 30px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: calc(100% - 320px);
  padding: 8px 16px;
  background: var(--overlay-panel-bg);
  border: 1px solid var(--hp-red);
  z-index: var(--z-hints);
  pointer-events: none;
}

.forecast-line {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-primary);
  letter-spacing: 0.5px;
  text-align: center;
  white-space: normal;
  overflow-wrap: anywhere;
}

.forecast-prefix {
  color: var(--hp-red);
  font-weight: 700;
}

.forecast-enemy {
  color: var(--gold-deep);
  font-weight: 700;
}

@media (max-width: 640px) {
  .wave-forecast {
    max-width: calc(100% - 24px);
    padding: 6px 10px;
  }
  .forecast-line {
    font-size: var(--text-xs);
  }
}
</style>
