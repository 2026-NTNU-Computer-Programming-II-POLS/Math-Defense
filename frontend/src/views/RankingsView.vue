<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { rankingService, type ExternalRankingEntry } from '@/services/rankingService'
import { classService, type ClassInfo } from '@/services/classService'
import { territoryService, type ActivityInfo, type RankingEntry } from '@/services/territoryService'
import type { LeaderboardEntry } from '@/services/leaderboardService'
import { formatScore } from '@/domain/formatters'

const router = useRouter()
const route = useRoute()

const TAB_IDS = ['global', 'class', 'internal', 'external'] as const
type TabId = typeof TAB_IDS[number]
const TAB_LABELS: Record<TabId, string> = {
  global: 'Global',
  class: 'Class',
  internal: 'Activity Rankings',
  external: 'External',
}

const activeTab = ref<TabId>('global')
const loading = ref(false)
const error = ref('')

const entries = ref<LeaderboardEntry[]>([])
const total = ref(0)
const page = ref(1)
const perPage = 20

const classes = ref<ClassInfo[]>([])
const selectedClassId = ref<string | null>(null)

const activities = ref<ActivityInfo[]>([])
const selectedActivityId = ref<string | null>(null)
const territoryRankings = ref<RankingEntry[]>([])
const externalRankings = ref<ExternalRankingEntry[]>([])

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage)))

// B-M-12: external rankings only exist for open (non-class-scoped) activities
const filteredActivities = computed(() => {
  if (activeTab.value === 'external') {
    return activities.value.filter(a => a.class_id === null)
  }

  // C-10: internal rankings should only list class-scoped activities
  // and, when selected, only those for the active class context.
  if (activeTab.value === 'internal') {
    return activities.value.filter(
      a => a.class_id !== null && (!selectedClassId.value || a.class_id === selectedClassId.value)
    )
  }

  return activities.value
})

let inflight: AbortController | null = null
let fetchId = 0

function cancelInflight(): void {
  inflight?.abort()
  inflight = null
}

function className(classId: string): string {
  return classes.value.find(c => c.id === classId)?.name ?? 'Unknown Class'
}

async function loadGlobal(): Promise<void> {
  cancelInflight()
  const controller = new AbortController()
  inflight = controller
  const thisId = ++fetchId
  loading.value = true
  error.value = ''
  try {
    const res = await rankingService.getGlobal(page.value, perPage, controller.signal)
    if (thisId !== fetchId) return
    entries.value = res.entries
    total.value = res.total
  } catch (e) {
    if (thisId !== fetchId) return
    if (e instanceof DOMException && e.name === 'AbortError') return
    error.value = e instanceof Error ? e.message : 'Failed'
  } finally {
    if (thisId === fetchId) { loading.value = false; inflight = null }
  }
}

async function loadClass(): Promise<void> {
  if (!selectedClassId.value) return
  cancelInflight()
  const controller = new AbortController()
  inflight = controller
  const thisId = ++fetchId
  loading.value = true
  error.value = ''
  try {
    const res = await rankingService.getByClass(selectedClassId.value, page.value, perPage, controller.signal)
    if (thisId !== fetchId) return
    entries.value = res.entries
    total.value = res.total
  } catch (e) {
    if (thisId !== fetchId) return
    if (e instanceof DOMException && e.name === 'AbortError') return
    error.value = e instanceof Error ? e.message : 'Failed'
  } finally {
    if (thisId === fetchId) { loading.value = false; inflight = null }
  }
}

async function loadInternal(): Promise<void> {
  if (!selectedActivityId.value) return
  cancelInflight()
  const controller = new AbortController()
  inflight = controller
  const thisId = ++fetchId
  loading.value = true
  error.value = ''
  try {
    const res = await rankingService.getInternal(selectedActivityId.value, controller.signal)
    if (thisId !== fetchId) return
    territoryRankings.value = res
  } catch (e) {
    if (thisId !== fetchId) return
    if (e instanceof DOMException && e.name === 'AbortError') return
    error.value = e instanceof Error ? e.message : 'Failed'
  } finally {
    if (thisId === fetchId) { loading.value = false; inflight = null }
  }
}

async function loadExternal(): Promise<void> {
  if (!selectedActivityId.value) return
  cancelInflight()
  const controller = new AbortController()
  inflight = controller
  const thisId = ++fetchId
  loading.value = true
  error.value = ''
  try {
    const res = await rankingService.getExternal(selectedActivityId.value, controller.signal)
    if (thisId !== fetchId) return
    externalRankings.value = res
  } catch (e) {
    if (thisId !== fetchId) return
    if (e instanceof DOMException && e.name === 'AbortError') return
    error.value = e instanceof Error ? e.message : 'Failed'
  } finally {
    if (thisId === fetchId) { loading.value = false; inflight = null }
  }
}

function resetData(): void {
  entries.value = []
  total.value = 0
  territoryRankings.value = []
  externalRankings.value = []
  page.value = 1
  error.value = ''
}

function switchTab(tab: TabId): void {
  activeTab.value = tab
  resetData()
  // B-M-12: clear selection if the currently selected activity is not valid for this tab
  if (tab === 'external' && selectedActivityId.value) {
    const selectedActivity = activities.value.find(activity => activity.id === selectedActivityId.value)
    if (selectedActivity && selectedActivity.class_id !== null) selectedActivityId.value = null
  }
  if (tab === 'global') loadGlobal()
  else if (tab === 'class' && selectedClassId.value) loadClass()
  else if (tab === 'internal' && selectedActivityId.value) loadInternal()
  else if (tab === 'external' && selectedActivityId.value) loadExternal()
}

function goToPage(p: number): void {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  if (activeTab.value === 'global') loadGlobal()
  else if (activeTab.value === 'class') loadClass()
}

watch(selectedClassId, () => {
  if (activeTab.value === 'class') { page.value = 1; loadClass() }
})

watch(selectedActivityId, () => {
  if (activeTab.value === 'internal') loadInternal()
  else if (activeTab.value === 'external') loadExternal()
})

onMounted(async () => {
  try { classes.value = await classService.listClasses() } catch { /* dropdown only */ }
  try { activities.value = await territoryService.listActivities() } catch { /* dropdown only */ }

  // When navigated from a territory detail page, pre-select that activity's internal rankings.
  const paramId = route.params.id as string | undefined
  if (paramId) {
    selectedActivityId.value = paramId
    switchTab('internal')
  } else {
    loadGlobal()
  }
})

onBeforeUnmount(cancelInflight)
</script>

<template>
  <div class="rankings-view">
    <header class="rk-header">
      <h1 class="rk-title">Rankings</h1>
      <button class="btn" @click="router.push('/')">← Back</button>
    </header>

    <div class="rk-tabs">
      <button
        v-for="tab in TAB_IDS"
        :key="tab"
        :class="['btn', 'tab-btn', { active: activeTab === tab }]"
        @click="switchTab(tab)"
      >
        {{ TAB_LABELS[tab] }}
      </button>
    </div>

    <!-- Class selector -->
    <div v-if="activeTab === 'class'" class="rk-selector">
      <select v-model="selectedClassId" class="rune-input">
        <option :value="null" disabled>Select a class</option>
        <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </div>

    <!-- Activity selector (shared by internal and external tabs) -->
    <div v-if="activeTab === 'internal' || activeTab === 'external'" class="rk-selector">
      <select v-model="selectedActivityId" class="rune-input">
        <option :value="null" disabled>Select an activity</option>
        <option v-for="a in filteredActivities" :key="a.id" :value="a.id">{{ a.title }}</option>
      </select>
    </div>

    <div v-if="loading" class="rk-loading">Loading…</div>
    <div v-else-if="error" class="rk-error">{{ error }}</div>

    <div v-else class="rk-table-wrap">
      <!-- Standard leaderboard table (global / class) -->
      <table v-if="activeTab === 'global' || activeTab === 'class'" class="rk-table">
        <thead>
          <tr>
            <th>#</th><th>Player</th><th>Level</th><th>Score</th><th>Kills</th><th>Waves</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in entries" :key="e.id">
            <td class="rank">{{ e.rank }}</td>
            <td class="player-name">{{ e.player_name }}</td>
            <td>Lv.{{ e.level }}</td>
            <td class="score">{{ formatScore(e.score) }}</td>
            <td>{{ e.kills }}</td>
            <td>{{ e.waves_survived }}</td>
          </tr>
          <tr v-if="entries.length === 0"><td colspan="6" class="empty">No records</td></tr>
        </tbody>
      </table>

      <!-- Internal rankings: per-student territory value -->
      <table v-else-if="activeTab === 'internal'" class="rk-table">
        <thead>
          <tr>
            <th>#</th><th>Student</th><th>Territory Value</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in territoryRankings" :key="r.student_id">
            <td class="rank">{{ r.rank }}</td>
            <td class="player-name">{{ r.player_name ?? '—' }}</td>
            <td class="score">{{ r.territory_value }}</td>
          </tr>
          <tr v-if="territoryRankings.length === 0"><td colspan="3" class="empty">No records</td></tr>
        </tbody>
      </table>

      <!-- External rankings: per-class average territory value -->
      <table v-else-if="activeTab === 'external'" class="rk-table">
        <thead>
          <tr>
            <th>#</th><th>Class</th><th>Avg Territory Value</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in externalRankings" :key="r.class_id">
            <td class="rank">{{ r.rank }}</td>
            <td class="player-name">{{ r.class_name ?? className(r.class_id) }}</td>
            <td class="score">{{ r.avg_territory_value.toFixed(2) }}</td>
          </tr>
          <tr v-if="externalRankings.length === 0"><td colspan="3" class="empty">No records</td></tr>
        </tbody>
      </table>
    </div>

    <div v-if="(activeTab === 'global' || activeTab === 'class') && totalPages > 1" class="rk-pagination">
      <button class="btn page-btn" :disabled="page <= 1" @click="goToPage(page - 1)">←</button>
      <span class="page-info">{{ page }} / {{ totalPages }}</span>
      <button class="btn page-btn" :disabled="page >= totalPages" @click="goToPage(page + 1)">→</button>
    </div>
  </div>
</template>

<style scoped>
.rankings-view {
  width: 800px;
  max-width: 100%;
  margin: 0 auto;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: radial-gradient(ellipse at center, #1e1828 0%, #0d0a12 70%);
  min-height: 100vh;
  overflow-y: auto;
}

.rk-header { display: flex; justify-content: space-between; align-items: center; }
.rk-title { font-size: 20px; color: var(--gold); letter-spacing: 4px; }

.rk-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.tab-btn.active { background: var(--gold); color: var(--stone-dark); }

.rk-selector { max-width: 300px; }

.rk-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.rk-table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--grid-line); }
th { color: var(--axis); font-size: 10px; letter-spacing: 2px; text-transform: uppercase; }
.rank { color: var(--gold); font-size: 14px; }
.player-name { color: #e8dcc8; }
.score { color: var(--gold-bright); font-weight: bold; }
.rk-loading, .rk-error, .empty { text-align: center; color: var(--axis); padding: 32px; }
.rk-error { color: var(--enemy-red); }

.rk-pagination { display: flex; align-items: center; justify-content: center; gap: 12px; }
.page-info { font-size: 12px; color: var(--axis); }
.page-btn:disabled { opacity: 0.3; cursor: default; }
</style>
