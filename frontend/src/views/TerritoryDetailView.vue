<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTerritoryStore } from '@/stores/territoryStore'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { stringHash } from '@/math/MathUtils'
import { useStartRun } from '@/composables/useStartRun'
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
const { startRun } = useStartRun()

const activityId = computed(() => route.params.id as string)
const detail = computed(() => store.currentDetail)
const isOwner = computed(() => detail.value?.activity.teacher_id === auth.user?.id)
const canSettle = computed(() => {
  if (!detail.value || detail.value.activity.settled) return false
  // Admins are read-only for territory — the API rejects an admin settle with
  // 403 (require_role(TEACHER)), so don't offer the action in the UI.
  if (auth.isTeacher) {
    // C-5: any teacher may settle an inter-class activity
    return detail.value.activity.class_id === null || isOwner.value
  }
  return false
})
// Only students may capture territory (play requires Role.STUDENT server-side);
// hide the Play affordances from teachers/admins so they don't play a whole
// game only to be rejected at submit.
const canPlay = computed(() => auth.isStudent)
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
  // Reactive on the ticking countdown so Play disables the instant the deadline
  // passes while the page is open. A bare `new Date()` here is non-reactive and
  // would leave Play enabled, wasting a full game on a guaranteed rejection.
  if (countdown.value.isExpired) return 'Activity deadline has passed'
  return undefined
})

// Practice-mode (slider-fallback) runs CAN still capture territory, but they
// stay excluded from the leaderboard — surface a non-blocking notice so the
// student knows the trade-off before playing. Only shown to players (students).
const showPracticeNotice = computed(() => canPlay.value && ui.sliderFallbackEnabled)

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
  if (!canPlay.value) return
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
  // Stable seed derived from the slot id so every student faces the same level.
  const seed = stringHash(slotId)
  await startRun(slot.star_rating, seed, { activityId: activityId.value, slotId })
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
  store.clearDetail()
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

        <div v-if="showPracticeNotice" class="practice-notice">
          Practice mode (slider fallback) is on — you can still capture territory,
          but this run won't count toward the leaderboard.
        </div>

        <div
          v-if="recommendationData && !slotDisabledReason && canPlay"
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
            :can-play="canPlay"
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
  min-height: 100dvh;
  padding-top: 40px;
}

.detail-panel {
  width: 680px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: rgba(220, 229, 237, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: var(--shadow);
  padding: 26px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.detail-title {
  font-size: var(--text-lg);
  font-family: var(--font-mono);
  color: var(--charcoal);
  letter-spacing: 2px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(126, 144, 119, 0.32);
  background: rgba(126, 144, 119, 0.18);
  color: var(--sage-deep);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
}

.status-badge.settled { border-color: rgba(79, 74, 72, 0.16); background: rgba(79, 74, 72, 0.07); color: var(--charcoal-soft); }

.detail-meta { font-size: var(--text-sm); color: var(--charcoal-soft); display: flex; gap: 12px; align-items: center; }
.scope-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(107, 127, 148, 0.32);
  background: rgba(107, 127, 148, 0.18);
  color: var(--slate-deep);
  font-size: var(--text-2xs);
  letter-spacing: 1px;
}

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

.settle-btn { border-color: rgba(185, 134, 116, 0.5); color: var(--clay-deep); }
.settle-btn:hover { background: var(--clay); color: #fff; }

.back-btn { border-color: var(--line); color: var(--charcoal-soft); }
.back-btn:hover { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); }

.loading, .error-msg { text-align: center; padding: 20px; font-size: var(--text-sm); }
.loading { color: var(--charcoal-soft); }
.error-msg { color: var(--clay-deep); }

.practice-notice {
  padding: 10px 14px;
  border: 1px solid var(--gold-deep);
  border-radius: 10px;
  background: rgba(212, 175, 55, 0.12);
  font-size: var(--text-xs);
  color: var(--charcoal-soft);
}

.recommendation-bar {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px;
  border: 1px solid var(--terracotta);
  border-radius: 10px;
  background: rgba(168, 188, 203, 0.2);
  font-size: var(--text-sm);
  color: var(--charcoal-soft);
}
.rec-icon { color: var(--terracotta-deep); font-size: var(--text-sm); }
.rec-text { flex: 1; }
.rec-text strong { color: var(--terracotta-deep); }
.rec-btn { border-color: var(--terracotta); color: var(--terracotta-deep); padding: 4px 10px; font-size: var(--text-xs); }
.rec-btn:hover { background: var(--terracotta); color: #fff; }
</style>
