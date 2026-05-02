<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTerritoryStore } from '@/stores/territoryStore'
import { useAuthStore } from '@/stores/authStore'
import { generateLevel } from '@/domain/level/level-generator'
import { mulberry32, stringHash } from '@/math/MathUtils'
import { sessionService } from '@/services/sessionService'
import TerritorySlotCard from '@/components/territory/TerritorySlotCard.vue'

const router = useRouter()
const route = useRoute()
const store = useTerritoryStore()
const auth = useAuthStore()

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

// B-H-12: propagate activity state so slot cards can disable the Play button
const slotDisabledReason = computed((): string | undefined => {
  const a = detail.value?.activity
  if (!a) return undefined
  if (a.settled) return 'Activity is settled'
  if (new Date(a.deadline) <= new Date()) return 'Activity deadline has passed'
  return undefined
})

async function handlePlay(slotId: string): Promise<void> {
  const slot = detail.value?.slots.find(s => s.id === slotId)
  if (!slot) return

  // B-M-6: warn before silently abandoning an in-progress game session
  try {
    const active = await sessionService.getActive()
    if (active) {
      const ok = confirm(
        'You have an active game session in progress. Starting a territory game will abandon it. Continue?'
      )
      if (!ok) return
    }
  } catch { /* non-critical — proceed if the check fails */ }

  // Stable seed derived from the slot id so every student faces the same level
  const seed = stringHash(slotId)
  const rng = mulberry32(seed)
  const level = generateLevel(slot.star_rating, rng)
  const territoryContext = { activityId: activityId.value, slotId }

  sessionStorage.setItem(
    'initial-answer-context',
    JSON.stringify({
      level,
      seed,
      territoryContext,
    })
  )

  router.push({
    name: 'initial-answer',
  })
}

async function handleSettle(): Promise<void> {
  const deadline = detail.value?.activity.deadline
  const isBeforeDeadline = deadline && new Date(deadline) > new Date()
  const msg = isBeforeDeadline
    ? 'The deadline has not passed yet. Settle this activity early? This action is permanent and cannot be undone.'
    : 'Settle this activity? This action is permanent and cannot be undone.'
  if (!confirm(msg)) return
  settling.value = true
  const ok = await store.settleActivity(activityId.value)
  settling.value = false
  if (ok) await store.loadDetail(activityId.value)
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

        <div class="slot-grid">
          <TerritorySlotCard
            v-for="s in detail.slots"
            :key="s.id"
            :slot="s"
            :disabled-reason="slotDisabledReason"
            @play="handlePlay"
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
  letter-spacing: 3px;
}

.status-badge {
  padding: 2px 8px;
  border: 1px solid var(--gold);
  color: var(--gold);
  font-size: 10px;
}

.status-badge.settled { border-color: var(--axis); color: var(--axis); }

.detail-meta { font-size: 11px; color: var(--axis); display: flex; gap: 12px; align-items: center; }
.scope-tag { padding: 2px 6px; border: 1px solid #7a6fa0; color: #a08fc0; font-size: 9px; letter-spacing: 1px; }

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

.back-btn { border-color: var(--axis); color: var(--axis); }
.back-btn:hover { background: var(--axis); color: var(--stone-dark); }

.loading, .error-msg { text-align: center; padding: 20px; font-size: 11px; }
.loading { color: var(--axis); }
.error-msg { color: var(--enemy-red); }
</style>
