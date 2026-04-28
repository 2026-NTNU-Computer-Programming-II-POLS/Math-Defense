<script setup lang="ts">
import { computed } from 'vue'
import type { SlotInfo } from '@/services/territoryService'

const props = defineProps<{
  slot: SlotInfo
  currentUserId?: string
}>()

defineEmits<{
  play: [slotId: string]
}>()

const state = computed(() => {
  if (!props.slot.occupation) return 'unoccupied'
  if (props.slot.occupation.student_id === props.currentUserId) return 'mine'
  return 'occupied'
})

const stars = computed(() => '★'.repeat(props.slot.star_rating) + '☆'.repeat(5 - props.slot.star_rating))
</script>

<template>
  <div :class="['slot-card', state]">
    <div class="slot-stars">{{ stars }}</div>
    <div class="slot-index">#{{ slot.slot_index + 1 }}</div>
    <div v-if="slot.occupation" class="slot-occupant">
      <span class="occupant-id" :title="slot.occupation.student_id">
        {{ slot.occupation.player_name ?? slot.occupation.student_id.slice(0, 8) + '…' }}
      </span>
      <span class="occupant-score">{{ slot.occupation.score.toFixed(0) }}</span>
    </div>
    <div v-else class="slot-empty">Unoccupied</div>
    <button class="btn slot-play-btn" @click="$emit('play', slot.id)">
      {{ state === 'mine' ? 'Improve' : state === 'occupied' ? 'Challenge' : 'Seize' }}
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

.slot-stars { color: var(--gold); font-size: 14px; letter-spacing: 2px; }
.slot-index { font-size: 10px; color: var(--axis); }

.slot-occupant { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.occupant-id { font-size: 10px; color: var(--axis); }
.occupant-score { font-size: 14px; color: var(--gold-bright); font-weight: bold; }

.slot-empty { font-size: 11px; color: var(--axis); opacity: 0.5; }

.slot-play-btn { font-size: 10px; padding: 4px 10px; }
</style>
