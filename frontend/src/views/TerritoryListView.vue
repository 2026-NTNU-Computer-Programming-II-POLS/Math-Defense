<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTerritoryStore } from '@/stores/territoryStore'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const store = useTerritoryStore()
const auth = useAuthStore()

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString()
}

onMounted(() => store.loadActivities())
</script>

<template>
  <div class="territory-list-view">
    <div class="territory-panel rune-panel">
      <header class="panel-header">
        <h2 class="panel-title">Grabbing Territory</h2>
        <div class="header-actions">
          <button
            v-if="auth.isTeacher || auth.isAdmin"
            class="btn"
            @click="router.push('/territory/create')"
          >
            + New Activity
          </button>
          <button class="btn back-btn" @click="router.push('/')">← Back</button>
        </div>
      </header>

      <div v-if="store.error" class="error-msg">{{ store.error }}</div>
      <div v-if="store.loading" class="loading">Loading…</div>

      <div v-else-if="store.activities.length === 0" class="empty">No activities available</div>

      <ul v-else class="activity-list">
        <li
          v-for="a in store.activities"
          :key="a.id"
          class="activity-item"
          @click="router.push(`/territory/${a.id}`)"
        >
          <div class="activity-title">{{ a.title }}</div>
          <div class="activity-meta">
            <span :class="['status-badge', { settled: a.settled, expired: !a.settled && new Date(a.deadline) < new Date() }]">
              {{ a.settled ? 'Settled' : new Date(a.deadline) < new Date() ? 'Expired' : 'Active' }}
            </span>
            <span class="deadline">Deadline: {{ formatDeadline(a.deadline) }}</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.territory-list-view {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 100vh;
  padding-top: 40px;
}

.territory-panel {
  width: 500px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  font-size: 16px;
  color: var(--gold);
  letter-spacing: 4px;
}

.header-actions { display: flex; gap: 8px; }

.error-msg { font-size: 11px; color: var(--enemy-red); }
.loading, .empty { font-size: 11px; color: var(--axis); opacity: 0.5; text-align: center; padding: 20px; }

.activity-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }

.activity-item {
  border: 1px solid var(--axis);
  padding: 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.activity-item:hover { border-color: var(--gold); }

.activity-title { color: var(--gold); font-size: 13px; }

.activity-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: var(--axis);
}

.status-badge {
  padding: 2px 6px;
  border: 1px solid var(--gold);
  color: var(--gold);
  font-size: 9px;
  letter-spacing: 1px;
}

.status-badge.settled { border-color: var(--axis); color: var(--axis); }
.status-badge.expired { border-color: var(--enemy-red); color: var(--enemy-red); }

.deadline { font-size: 10px; }

.back-btn {
  font-size: 11px;
  border-color: var(--axis);
  color: var(--axis);
}

.back-btn:hover { background: var(--axis); color: var(--stone-dark); }
</style>
