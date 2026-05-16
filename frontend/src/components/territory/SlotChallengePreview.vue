<script setup lang="ts">
import { computed } from 'vue'
import type { SlotInfo } from '@/services/territoryService'
import {
  getChallengeMode,
  CHALLENGE_MODE_LABEL,
  CHALLENGE_MODE_TITLE,
} from '@/services/territory/challengeMode'
import { useChallengePreviewPreference } from '@/composables/useChallengePreviewPreference'

const props = defineProps<{
  slot: SlotInfo
  userId: string | null
  userAvgAtLevel?: number | null
}>()

const emit = defineEmits<{
  confirm: [slotId: string]
  cancel: []
}>()

const { skipChallengePreview } = useChallengePreviewPreference()

const mode = computed(() => getChallengeMode(props.slot, props.userId))
const title = computed(() => CHALLENGE_MODE_TITLE[mode.value])
const ctaLabel = computed(() => CHALLENGE_MODE_LABEL[mode.value])

const targetScore = computed(() => {
  if (!props.slot.occupation) return null
  return props.slot.occupation.score
})

const scoreGap = computed(() => {
  const target = targetScore.value
  const avg = props.userAvgAtLevel
  if (target === null || avg == null) return null
  return target - avg
})

const stars = computed(() =>
  '★'.repeat(props.slot.star_rating) + '☆'.repeat(5 - props.slot.star_rating),
)
</script>

<template>
  <div class="preview-overlay" role="dialog" aria-modal="true" :aria-label="title" @click.self="emit('cancel')">
    <div class="preview-panel rune-panel">
      <header class="preview-header">
        <h3 class="preview-title">{{ title }}</h3>
        <span class="preview-stars">{{ stars }}</span>
      </header>

      <dl class="preview-stats">
        <template v-if="slot.occupation">
          <dt>Current holder</dt>
          <dd>{{ slot.occupation.player_name ?? '—' }}</dd>
          <dt>Target score to beat</dt>
          <dd class="score">{{ slot.occupation.score.toFixed(0) }}</dd>
        </template>
        <template v-else>
          <dt>Status</dt>
          <dd>Unoccupied — first to seize takes it.</dd>
        </template>
        <template v-if="userAvgAtLevel != null">
          <dt>Your avg at this level</dt>
          <dd>{{ userAvgAtLevel.toFixed(0) }}</dd>
        </template>
        <template v-if="scoreGap !== null">
          <dt>Gap</dt>
          <dd :class="{ negative: scoreGap > 0 }">
            {{ scoreGap > 0 ? `+${scoreGap.toFixed(0)} above your avg` : `${scoreGap.toFixed(0)} below your avg` }}
          </dd>
        </template>
      </dl>

      <label class="skip-pref">
        <input type="checkbox" v-model="skipChallengePreview" />
        Don't show this preview again
      </label>

      <div class="preview-actions">
        <button class="btn cancel-btn" @click="emit('cancel')">Cancel</button>
        <button class="btn confirm-btn" @click="emit('confirm', slot.id)">{{ ctaLabel }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
  padding: 16px;
}
.preview-panel { width: 420px; max-width: 100%; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
.preview-header { display: flex; justify-content: space-between; align-items: center; }
.preview-title { font-size: var(--text-sm); font-family: var(--font-mono); color: var(--gold); text-shadow: var(--gold-shadow); letter-spacing: 3px; }
.preview-stars { color: var(--gold); text-shadow: var(--gold-shadow); font-size: var(--text-sm); letter-spacing: 2px; }

.preview-stats { display: grid; grid-template-columns: max-content 1fr; column-gap: 14px; row-gap: 6px; font-size: var(--text-sm); margin: 0; }
.preview-stats dt { color: var(--axis); text-shadow: var(--gold-shadow); }
.preview-stats dd { margin: 0; color: #e8dcc8; }
.preview-stats dd.score { color: var(--gold-bright); font-weight: bold; }
.preview-stats dd.negative { color: #d05050; }

.skip-pref { font-size: var(--text-xs); color: var(--axis); text-shadow: var(--gold-shadow); display: flex; gap: 6px; align-items: center; }

.preview-actions { display: flex; gap: 10px; justify-content: flex-end; }
.cancel-btn { border-color: var(--axis); color: var(--axis); text-shadow: var(--gold-shadow); }
.confirm-btn { border-color: var(--gold); color: var(--gold); text-shadow: var(--gold-shadow); }
.confirm-btn:hover { background: var(--gold); color: var(--stone-dark); }
</style>
