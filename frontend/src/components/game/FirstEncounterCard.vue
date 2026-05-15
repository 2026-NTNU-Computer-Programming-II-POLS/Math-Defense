<script setup lang="ts">
/**
 * FirstEncounterCard — V3 Phase 6 §6.2 first-encounter card.
 *
 * A one-time explanatory card shown the first time a counter-enemy type is
 * ever seen. Pure presentation: the parent owns the queue, the soft-pause,
 * and the "seen" bookkeeping (see useFirstEncounterCards); this component
 * only renders the copy for `type` and emits `dismiss` on the button.
 */
import { computed } from 'vue'
import type { EnemyType } from '@/data/constants'
import { COUNTER_ENEMY_INFO } from '@/data/counter-enemy-info'

const props = defineProps<{ type: EnemyType | null }>()
const emit = defineEmits<{ dismiss: [] }>()

const info = computed(() => (props.type ? COUNTER_ENEMY_INFO[props.type] ?? null : null))
</script>

<template>
  <div
    v-if="info"
    class="first-encounter-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="first-encounter-title"
    data-testid="first-encounter-card"
  >
    <div class="first-encounter-card">
      <p class="fe-kicker">New enemy</p>
      <h3 id="first-encounter-title" class="fe-title">{{ info.name }}</h3>
      <p class="fe-body">{{ info.explanation }}</p>
      <p class="fe-counter">
        Counter — <strong>{{ info.counterTower }}</strong>
      </p>
      <button
        type="button"
        class="fe-dismiss"
        data-testid="first-encounter-dismiss"
        @click="emit('dismiss')"
      >
        Got it
      </button>
    </div>
  </div>
</template>

<style scoped>
.first-encounter-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.72);
  z-index: var(--z-modal);
  font-family: var(--font-mono);
}

.first-encounter-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 460px;
  padding: 28px 36px;
  background: var(--panel-bg);
  border: 1px solid var(--gold);
  box-shadow: var(--panel-shadow);
  text-align: center;
}

.fe-kicker {
  margin: 0;
  font-size: 11px;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--hp-red);
}

.fe-title {
  margin: 0;
  font-size: 20px;
  letter-spacing: 3px;
  color: var(--gold-bright);
  text-shadow: var(--gold-shadow);
}

.fe-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
}

.fe-counter {
  margin: 0;
  font-size: 12px;
  color: var(--axis);
}

.fe-counter strong {
  color: var(--gold-bright);
}

.fe-dismiss {
  margin-top: 4px;
  padding: 8px 24px;
  border: 1px solid var(--gold);
  border-radius: 4px;
  background: rgba(212, 160, 23, 0.3);
  color: var(--text-on-accent);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background 120ms;
}

.fe-dismiss:hover {
  background: rgba(212, 160, 23, 0.5);
}

.fe-dismiss:focus-visible {
  outline: 2px solid var(--gold-bright);
  outline-offset: 2px;
}
</style>
