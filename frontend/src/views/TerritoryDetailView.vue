<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTerritoryStore } from '@/stores/territoryStore'
import { useAuthStore } from '@/stores/authStore'
import TerritorySlotCard from '@/components/territory/TerritorySlotCard.vue'

const router = useRouter()
const route = useRoute()
const store = useTerritoryStore()
const auth = useAuthStore()

const activityId = computed(() => route.params.id as string)
const detail = computed(() => store.currentDetail)
const isOwner = computed(() => detail.value?.activity.teacher_id === auth.user?.id)
const canSettle = computed(() => {
  if (!detail.value) return false
  return (isOwner.value || auth.isAdmin) && !detail.value.activity.settled
})
const settling = ref(false)

function handlePlay(slotId: string): void {
  router.push({ name: 'territory-play', params: { id: activityId.value, slotId } })
}

async function handleSettle(): Promise<void> {
  if (!confirm('Settle this activity? This action is permanent and cannot be undone.')) return
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
        </div>

        <div class="slot-grid">
          <TerritorySlotCard
            v-for="s in detail.slots"
            :key="s.id"
            :slot="s"
            :current-user-id="auth.user?.id"
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

.detail-meta { font-size: 11px; color: var(--axis); }

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
