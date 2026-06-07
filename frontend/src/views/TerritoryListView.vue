<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTerritoryStore } from '@/stores/territoryStore'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const store = useTerritoryStore()
const auth = useAuthStore()

const PAGE_SIZE = 20
const page = ref(1)

// Reactive clock so the Expired badge flips when a deadline passes while the
// list is open, instead of staying frozen at the value captured on first render.
const nowMs = ref(Date.now())
let expiryTimer: ReturnType<typeof setInterval> | null = null

const totalPages = computed(() => Math.max(1, Math.ceil(store.activities.length / PAGE_SIZE)))

const pagedActivities = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return store.activities.slice(start, start + PAGE_SIZE)
})

const pagedActivitiesWithStatus = computed(() => {
  const now = nowMs.value
  return pagedActivities.value.map((a) => ({
    ...a,
    isExpired: !a.settled && new Date(a.deadline).getTime() < now
  }))
})

function goToPage(p: number): void {
  if (p < 1 || p > totalPages.value) return
  page.value = p
}

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString()
}

onMounted(() => {
  store.loadActivities()
  expiryTimer = setInterval(() => { nowMs.value = Date.now() }, 30_000)
})
onUnmounted(() => {
  if (expiryTimer !== null) {
    clearInterval(expiryTimer)
    expiryTimer = null
  }
})
</script>

<template>
  <div class="territory-list-view">
    <div class="territory-panel rune-panel">
      <header class="panel-header">
        <h2 class="panel-title">Grabbing Territory</h2>
        <div class="header-actions">
          <button
            v-if="auth.isTeacher"
            class="btn"
            @click="router.push({ name: 'territory-create' })"
          >
            + New Activity
          </button>
          <button class="btn back-btn" @click="router.push({ name: 'menu' })">← Back</button>
        </div>
      </header>

      <div v-if="store.errorActivities" class="error-msg">{{ store.errorActivities }}</div>
      <div v-if="store.loadingActivities" class="loading">Loading…</div>

      <div v-else-if="store.activities.length === 0" class="empty">No activities available</div>

      <ul v-else class="activity-list">
        <li
          v-for="a in pagedActivitiesWithStatus"
          :key="a.id"
          class="activity-item"
          @click="router.push({ name: 'territory-detail', params: { id: a.id } })"
        >
          <div class="activity-title">{{ a.title }}</div>
          <div class="activity-meta">
            <span :class="['status-badge', { settled: a.settled, expired: a.isExpired }]">
              {{ a.settled ? 'Settled' : a.isExpired ? 'Expired' : 'Active' }}
            </span>
            <span v-if="a.class_id === null" class="scope-badge">All Classes</span>
            <span class="deadline">Deadline: {{ formatDeadline(a.deadline) }}</span>
          </div>
        </li>
      </ul>

      <div v-if="totalPages > 1" class="pagination">
        <button class="btn page-btn" :disabled="page <= 1" @click="goToPage(page - 1)">←</button>
        <span class="page-info">{{ page }} / {{ totalPages }}</span>
        <button class="btn page-btn" :disabled="page >= totalPages" @click="goToPage(page + 1)">→</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.territory-list-view {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding-top: 40px;
}

.territory-panel {
  width: 620px;
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

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.panel-title {
  font-size: var(--text-lg);
  font-family: var(--font-mono);
  color: var(--charcoal);
  letter-spacing: 2px;
}

.header-actions { display: flex; gap: 8px; }

.error-msg { font-size: var(--text-sm); color: var(--clay-deep); }
.loading, .empty { font-size: var(--text-sm); color: var(--charcoal-soft); text-align: center; padding: 20px; font-style: italic; }

.activity-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }

.activity-item {
  background: rgba(245, 250, 254, 0.78);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.16s ease, transform 0.16s ease;
}

.activity-item:hover { border-color: var(--terracotta); transform: translateY(-2px); }

.activity-title { color: var(--charcoal); font-weight: 700; font-size: var(--text-base); }

.activity-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--text-xs);
  color: var(--charcoal-soft);
  font-family: var(--font-mono);
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
  letter-spacing: 1px;
}

.status-badge.settled { border-color: rgba(79, 74, 72, 0.16); background: rgba(79, 74, 72, 0.07); color: var(--charcoal-soft); }
.status-badge.expired { border-color: rgba(185, 134, 116, 0.35); background: rgba(185, 134, 116, 0.2); color: var(--clay-deep); }

.scope-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(107, 127, 148, 0.32);
  background: rgba(107, 127, 148, 0.18);
  color: var(--slate-deep);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  letter-spacing: 1px;
}

.deadline { font-size: var(--text-xs); }

.back-btn {
  font-size: var(--text-xs);
  border-color: var(--line);
  color: var(--charcoal-soft);
}

.back-btn:hover { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); }

.pagination { display: flex; align-items: center; justify-content: center; gap: 12px; }
.page-info { font-size: var(--text-xs); color: var(--charcoal-soft); font-family: var(--font-mono); }
.page-btn:disabled { opacity: 0.3; cursor: default; }
</style>
