<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { classService, type ClassInfo } from '@/services/classService'
import { territoryService, type ActivityInfo } from '@/services/territoryService'

const router = useRouter()

const classes = ref<ClassInfo[]>([])
const activities = ref<ActivityInfo[]>([])
const loading = ref(false)
const error = ref('')

onMounted(async () => {
  loading.value = true
  try {
    const [cls, acts] = await Promise.all([
      classService.listClasses(),
      territoryService.listActivities(),
    ])
    classes.value = cls
    activities.value = acts
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load dashboard'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="teacher-dashboard">
    <div class="dashboard-panel rune-panel">
      <h2 class="dashboard-title">Teacher Dashboard</h2>

      <div v-if="error" class="error-msg">{{ error }}</div>
      <div v-if="loading" class="loading">Loading…</div>

      <template v-else>
        <div class="section">
          <h3 class="section-title">My Classes ({{ classes.length }})</h3>
          <ul v-if="classes.length > 0" class="item-list">
            <li v-for="c in classes" :key="c.id" class="item" @click="router.push(`/classes?select=${c.id}`)">
              <span class="item-name">{{ c.name }}</span>
              <span v-if="c.join_code" class="item-meta">{{ c.join_code }}</span>
            </li>
          </ul>
          <div v-else class="empty">No classes yet</div>
        </div>

        <div class="section">
          <h3 class="section-title">Active GT Activities ({{ activities.filter(a => !a.settled).length }})</h3>
          <ul v-if="activities.length > 0" class="item-list">
            <li
              v-for="a in activities"
              :key="a.id"
              class="item"
              @click="router.push(`/territory/${a.id}`)"
            >
              <span class="item-name">{{ a.title }}</span>
              <span :class="['item-badge', { settled: a.settled }]">
                {{ a.settled ? 'Settled' : 'Active' }}
              </span>
            </li>
          </ul>
          <div v-else class="empty">No activities yet</div>
        </div>

        <div class="dashboard-actions">
          <button class="btn" @click="router.push('/territory/create')">+ New Activity</button>
          <button class="btn" @click="router.push('/classes')">Manage Classes</button>
          <button class="btn" @click="router.push('/rankings')">Rankings</button>
          <button class="btn back-btn" @click="router.push('/')">← Back</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.teacher-dashboard {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 100vh;
  padding-top: 40px;
}

.dashboard-panel {
  width: 480px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dashboard-title {
  font-size: 16px;
  color: var(--gold);
  letter-spacing: 4px;
  text-align: center;
}

.error-msg { font-size: 11px; color: var(--enemy-red); }
.loading, .empty { font-size: 11px; color: var(--axis); opacity: 0.5; }

.section { display: flex; flex-direction: column; gap: 6px; }
.section-title { font-size: 12px; color: var(--gold); margin: 0; }

.item-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }

.item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid var(--axis);
  padding: 8px 10px;
  cursor: pointer;
  font-size: 11px;
}

.item:hover { border-color: var(--gold); }

.item-name { color: var(--gold); }
.item-meta { font-family: monospace; color: var(--axis); font-size: 10px; }

.item-badge {
  padding: 1px 5px;
  border: 1px solid var(--gold);
  color: var(--gold);
  font-size: 9px;
}

.item-badge.settled { border-color: var(--axis); color: var(--axis); }

.dashboard-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.back-btn { border-color: var(--axis); color: var(--axis); }
.back-btn:hover { background: var(--axis); color: var(--stone-dark); }
</style>
