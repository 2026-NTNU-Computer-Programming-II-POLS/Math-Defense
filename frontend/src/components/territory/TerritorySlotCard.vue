<script setup lang="ts">
import { computed } from 'vue'
import type { SlotInfo } from '@/services/territoryService'
import { getChallengeMode, CHALLENGE_MODE_LABEL } from '@/services/territory/challengeMode'

const props = withDefaults(defineProps<{
  slot: SlotInfo
  disabledReason?: string
  userId?: string | null
  highlighted?: boolean
  // Only students can capture territory; non-students get the read-only card
  // without a Play button (the API would 403 their play anyway).
  canPlay?: boolean
}>(), {
  canPlay: true,
})

defineEmits<{
  play: [slotId: string]
}>()

const mode = computed(() => getChallengeMode(props.slot, props.userId ?? null))
const state = computed(() => {
  if (mode.value === 'seize') return 'unoccupied'
  if (mode.value === 'improve') return 'mine'
  return 'occupied'
})
const buttonLabel = computed(() => CHALLENGE_MODE_LABEL[mode.value])

const stars = computed(() => '★'.repeat(props.slot.star_rating) + '☆'.repeat(5 - props.slot.star_rating))
</script>

<template>
  <div :class="['slot-card', state, { highlighted }]">
    <div v-if="highlighted" class="slot-recommend-badge" aria-label="Recommended">★ Recommended</div>
    <div class="slot-stars">{{ stars }}</div>
    <div class="slot-index">#{{ slot.slot_index + 1 }}</div>
    <div v-if="slot.occupation" class="slot-occupant">
      <span class="occupant-id">{{ slot.occupation.player_name ?? '—' }}</span>
      <span class="occupant-score">{{ slot.occupation.score.toFixed(0) }}</span>
    </div>
    <div v-else class="slot-empty">Unoccupied</div>
    <button
      v-if="canPlay"
      class="btn slot-play-btn"
      :disabled="!!disabledReason"
      :title="disabledReason"
      :aria-label="`${buttonLabel} slot #${slot.slot_index + 1}`"
      @click="$emit('play', slot.id)"
    >
      {{ disabledReason ? 'Closed' : buttonLabel }}
    </button>
  </div>
</template>

<style scoped>
.slot-card {
  border: 1px solid var(--axis);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
  min-width: 120px;
}

.slot-card.mine { border-color: var(--gold); background: rgba(255, 215, 0, 0.05); }
.slot-card.occupied { border-color: var(--enemy-red); }
.slot-card.unoccupied { border-color: var(--axis); opacity: 0.8; }
.slot-card.highlighted { box-shadow: 0 0 8px rgba(255, 215, 0, 0.4); position: relative; }
.slot-recommend-badge {
  position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
  background: var(--gold); color: var(--stone-dark);
  padding: 2px 8px; font-size: var(--text-xs); letter-spacing: 1px; white-space: nowrap;
}

.slot-stars { color: var(--gold); text-shadow: var(--gold-shadow); font-size: var(--text-sm); letter-spacing: 2px; }
.slot-index { font-size: var(--text-xs); color: var(--axis); text-shadow: var(--gold-shadow); }

.slot-occupant { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.occupant-id { font-size: var(--text-xs); color: var(--axis); text-shadow: var(--gold-shadow); }
.occupant-score { font-size: var(--text-sm); color: var(--gold-bright); font-weight: bold; }

.slot-empty { font-size: var(--text-xs); color: var(--axis); text-shadow: var(--gold-shadow); opacity: 0.5; }

.slot-play-btn { font-size: var(--text-xs); padding: 4px 10px; min-height: 44px; display: inline-flex; align-items: center; justify-content: center; }
</style>
