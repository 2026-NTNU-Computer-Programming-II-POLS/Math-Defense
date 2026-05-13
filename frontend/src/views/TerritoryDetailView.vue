<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTerritoryStore } from '@/stores/territoryStore'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { stringHash } from '@/math/MathUtils'
import {
  generate as generateLevelForRun,
  LevelGenerationFailedError,
} from '@/services/levelGenerationService'
import { sessionService } from '@/services/sessionService'
import TerritorySlotCard from '@/components/territory/TerritorySlotCard.vue'
import DeadlineProgressBar from '@/components/territory/DeadlineProgressBar.vue'
import SlotChallengePreview from '@/components/territory/SlotChallengePreview.vue'
import { useCountdown } from '@/composables/useCountdown'
import { useChallengePreviewPreference } from '@/composables/useChallengePreviewPreference'
import {
  useTerritoryRecommendation,
  RECOMMENDATION_RATIONALE_COPY,
} from '@/composables/useTerritoryRecommendation'

const router = useRouter()
const route = useRoute()
const store = useTerritoryStore()
const auth = useAuthStore()
const ui = useUiStore()

const activityId = computed(() => route.params.id as string)
const detail = computed(() => store.currentDetail)
const isOwner = computed(() => detail.value?.activity.teacher_id === auth.user?.id)
const canSettle = computed(() => {
  if (!detail.value || detail.value.activity.settled) return false
  if (auth.isAdmin) return true
  if (auth.isTeacher) {
    // C-5: any teacher may settle an inter-class activity
    return detail.value.activity.class_id === null || isOwner.value
  }
  return false
})
const settling = ref(false)

const deadlineRef = computed(() => detail.value?.activity.deadline ?? null)
const countdown = useCountdown(deadlineRef)
const totalDurationMs = computed(() => {
  const a = detail.value?.activity
  if (!a) return 0
  const end = new Date(a.deadline).getTime()
  const start = new Date(a.created_at).getTime()
  return Number.isFinite(end - start) ? Math.max(0, end - start) : 0
})

// B-H-12: propagate activity state so slot cards can disable the Play button
const slotDisabledReason = computed((): string | undefined => {
  const a = detail.value?.activity
  if (!a) return undefined
  if (a.settled) return 'Activity is settled'
  if (new Date(a.deadline) <= new Date()) return 'Activity deadline has passed'
  return undefined
})

// Pre-challenge preview state
const previewSlotId = ref<string | null>(null)
const previewSlot = computed(() =>
  previewSlotId.value ? detail.value?.slots.find(s => s.id === previewSlotId.value) ?? null : null,
)
const { skipChallengePreview } = useChallengePreviewPreference()
const { data: recommendationData } = useTerritoryRecommendation(activityId)
const recommendedSlotId = computed(() => recommendationData.value?.slot_id ?? null)
const recommendationCopy = computed(() => {
  const code = recommendationData.value?.rationale_code
  return code ? RECOMMENDATION_RATIONALE_COPY[code] ?? '' : ''
})
// Only surface the recommendation's avg-at-target when the previewed
// slot is actually at that level — otherwise the "Your avg at this
// level" line in the modal would silently mislabel a different level.
const previewUserAvg = computed<number | null>(() => {
  const rec = recommendationData.value
  const slot = previewSlot.value
  if (!rec || !slot || rec.user_avg_at_target == null) return null
  return slot.star_rating === rec.star_rating ? rec.user_avg_at_target : null
})

function onSlotClick(slotId: string): void {
  if (slotDisabledReason.value) return
  if (skipChallengePreview.value) {
    void handlePlay(slotId)
  } else {
    previewSlotId.value = slotId
  }
}

function onPreviewConfirm(slotId: string): void {
  previewSlotId.value = null
  void handlePlay(slotId)
}

function onPreviewCancel(): void {
  previewSlotId.value = null
}

async function handlePlay(slotId: string): Promise<void> {
  const slot = detail.value?.slots.find(s => s.id === slotId)
  if (!slot) return

  // B-M-6: warn before silently abandoning an in-progress game session
  try {
    const active = await sessionService.getActive()
    if (active) {
      const ok = await ui.showConfirm(
        'Active session in progress',
        'You have an active game session in progress. Starting a territory game will abandon it. Continue?',
        { confirmLabel: 'Continue', cancelLabel: 'Cancel' },
      )
      if (!ok) return
    }
  } catch (error) {
    // non-critical — proceed if the check fails
    console.error('Failed to check active session:', error)
  }

  // Stable seed derived from the slot id so every student faces the same level
  const seed = stringHash(slotId)
  let level
  try {
    ({ level } = await generateLevelForRun(slot.star_rating, seed))
  } catch (e) {
    if (e instanceof LevelGenerationFailedError) {
      console.error('[TerritoryDetail] Level generation failed via WASM v2 path', { slotId, seed })
      ui.showModal('Level generation failed', 'Please try a different territory slot.')
      return
    }
    throw e
  }
  const territoryContext = { activityId: activityId.value, slotId }

  // F-BUG-14: pass via history.state to match LevelSelectView; cap the
  // serialized size so a malformed level can't bloat the history entry.
  const levelJson = JSON.stringify(level)
  const MAX_LEVEL_JSON_BYTES = 64 * 1024
  if (levelJson.length > MAX_LEVEL_JSON_BYTES) {
    console.error('[TerritoryDetail] Generated level JSON exceeds size cap', { bytes: levelJson.length })
    ui.showModal('Level too large', 'Generated level payload is unexpectedly large; please try a different slot.')
    return
  }
  router.push({
    name: 'initial-answer',
    state: { level: levelJson, seed, territoryContext: JSON.stringify(territoryContext) },
  })
}

async function handleSettle(): Promise<void> {
  const deadline = detail.value?.activity.deadline
  const isBeforeDeadline = deadline && new Date(deadline) > new Date()
  const msg = isBeforeDeadline
    ? 'The deadline has not passed yet. Settle this activity early? This action is permanent and cannot be undone.'
    : 'Settle this activity? This action is permanent and cannot be undone.'
  const confirmed = await ui.showConfirm('Settle activity', msg, { confirmLabel: 'Settle' })
  if (!confirmed) return
  settling.value = true
  const settled = await store.settleActivity(activityId.value)
  settling.value = false
  if (settled) await store.loadDetail(activityId.value)
}

function viewRankings(): void {
  router.push({ name: 'territory-rankings', params: { id: activityId.value } })
}

watch(activityId, (id) => {
  store.currentDetail = null
  store.loadDetail(id)
}, { immediate: true })
</script>

<template>
  <div class="territory-detail-view">
    <div class="detail-panel rune-panel">
      <div v-if="store.loadingDetail" class="loading">Loading…</div>
      <div v-else-if="store.errorDetail || store.errorSettle" class="error-msg">
        {{ store.errorDetail || store.errorSettle }}
      </div>

      <template v-else-if="detail">
        <header class="detail-header">
          <h2 class="detail-title">{{ detail.activity.title }}</h2>
          <span :class="['status-badge', { settled: detail.activity.settled }]">
            {{ detail.activity.settled ? 'Settled' : 'Active' }}
          </span>
        </header>

        <div class="detail-meta">
          <span>Deadline: {{ new Date(detail.activity.deadline).toLocaleString() }}</span>
          <span v-if="detail.activity.class_id === null" class="scope-tag">All Classes</span>
        </div>

        <DeadlineProgressBar
          :readout="countdown"
          :total-duration-ms="totalDurationMs"
          :settled="detail.activity.settled"
        />

        <div
          v-if="recommendationData && !slotDisabledReason"
          class="recommendation-bar"
        >
          <span class="rec-icon" aria-hidden="true">★</span>
          <span class="rec-text">
            <strong>Slot #{{ recommendationData.slot_index + 1 }}</strong>
            ({{ '★'.repeat(recommendationData.star_rating) }})
            — {{ recommendationCopy }}
          </span>
          <button class="btn rec-btn" @click="onSlotClick(recommendationData.slot_id)">
            Try it
          </button>
        </div>

        <div class="slot-grid">
          <TerritorySlotCard
            v-for="s in detail.slots"
            :key="s.id"
            :slot="s"
            :disabled-reason="slotDisabledReason"
            :user-id="auth.user?.id ?? null"
            :highlighted="s.id === recommendedSlotId"
            @play="onSlotClick"
          />
        </div>

        <div class="detail-actions">
          <button class="btn" @click="viewRankings">Rankings</button>
          <button v-if="canSettle" class="btn settle-btn" :disabled="settling" @click="handleSettle">
            {{ settling ? 'Settling…' : 'Settle Activity' }}
          </button>
          <button class="btn back-btn" @click="router.push('/territory')">← Back</button>
        </div>
      </template>
    </div>

    <SlotChallengePreview
      v-if="previewSlot"
      :slot="previewSlot"
      :user-id="auth.user?.id ?? null"
      :user-avg-at-level="previewUserAvg"
      @confirm="onPreviewConfirm"
      @cancel="onPreviewCancel"
    />
  </div>
</template>

<style scoped>
.territory-detail-view {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 100vh;
  padding-top: 40px;
}

.detail-panel {
  width: 600px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-title {
  font-size: 16px;
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  letter-spacing: 3px;
}

.status-badge {
  padding: 2px 8px;
  border: 1px solid var(--gold);
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  font-size: 10px;
}

.status-badge.settled { border-color: var(--axis); color: var(--axis); text-shadow: var(--gold-shadow); }

.detail-meta { font-size: 11px; color: var(--axis); text-shadow: var(--gold-shadow); display: flex; gap: 12px; align-items: center; }
.scope-tag { padding: 2px 6px; border: 1px solid var(--scope-border); color: var(--scope-text); font-size: 9px; letter-spacing: 1px; }

.slot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 10px;
}

.detail-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.settle-btn { border-color: var(--enemy-red); color: var(--enemy-red); }
.settle-btn:hover { background: var(--enemy-red); color: var(--stone-dark); }

.back-btn { border-color: var(--axis); color: var(--axis); text-shadow: var(--gold-shadow); }
.back-btn:hover { background: var(--axis); color: var(--stone-dark); }

.loading, .error-msg { text-align: center; padding: 20px; font-size: 11px; }
.loading { color: var(--axis); text-shadow: var(--gold-shadow); }
.error-msg { color: var(--enemy-red); }

.recommendation-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px;
  border: 1px dashed var(--gold);
  background: var(--gold-tint-faint);
  font-size: 11px;
  color: var(--text-secondary);
}
.rec-icon { color: var(--gold); text-shadow: var(--gold-shadow); font-size: 14px; }
.rec-text { flex: 1; }
.rec-text strong { color: var(--gold); text-shadow: var(--gold-shadow); }
.rec-btn { border-color: var(--gold); color: var(--gold); text-shadow: var(--gold-shadow); padding: 4px 10px; font-size: 10px; }
.rec-btn:hover { background: var(--gold); color: var(--stone-dark); }
</style>
