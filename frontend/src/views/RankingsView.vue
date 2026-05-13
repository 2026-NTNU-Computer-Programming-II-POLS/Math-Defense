<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { rankingService, type ExternalRankingEntry } from '@/services/rankingService'
import { classService, type ClassInfo } from '@/services/classService'
import {
  territoryService,
  type ActivityInfo,
  type RankingEntry,
  type RankingsMeta,
} from '@/services/territoryService'
import {
  sortRankings,
  formatRankChange,
  formatComposition,
  formatRelativeTime,
  type SortMode,
} from '@/services/territory/rankingSort'
import { usePolling } from '@/composables/usePolling'
import {
  leaderboardService,
  type LeaderboardEntry,
  type PersonalHistoryEntry,
} from '@/services/leaderboardService'
import { useAuthStore } from '@/stores/authStore'
import PersonalTimeline from '@/components/leaderboard/PersonalTimeline.vue'
import { formatScore } from '@/utils/formatters'

const router = useRouter()
const route = useRoute()

// Personal-first ordering per analysis §6.2: self-referential framing is the
// healthier default than social ranking. Logged-out visitors fall back to Global.
const TAB_IDS = ['personal', 'global', 'class', 'internal', 'external'] as const
type TabId = typeof TAB_IDS[number]
const TAB_LABELS: Record<TabId, string> = {
  personal: 'Personal',
  global: 'Global',
  class: 'Class',
  internal: 'Activity Rankings',
  external: 'External',
}

const auth = useAuthStore()
const activeTab = ref<TabId>(auth.isLoggedIn ? 'personal' : 'global')
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

// Internal-tab enhancements: hierarchical leaderboard with delta tracking.
const internalMeta = ref<RankingsMeta | null>(null)
const internalScope = ref<'school' | 'class'>('school')
const internalScopeClassId = ref<string | null>(null)
const internalSort = ref<SortMode>('territory_value')
const internalNowMs = ref(Date.now())
const internalPollingEnabled = computed(
  () => activeTab.value === 'internal' && selectedActivityId.value !== null,
)
const sortedInternalEntries = computed(() => {
  const entries = internalMeta.value?.entries ?? []
  return sortRankings(entries, internalSort.value)
})
const selectedActivity = computed(() =>
  activities.value.find(a => a.id === selectedActivityId.value) ?? null,
)
const internalCanScope = computed(() =>
  // Class scope only meaningful for inter-class activities (class_id is null).
  selectedActivity.value?.class_id === null,
)
const sortNullDeltaHint = computed(() => {
  if (internalSort.value !== 'rank_change') return ''
  const entries = internalMeta.value?.entries ?? []
  return entries.some(e => e.rank_change === null)
    ? 'Rank changes appear after the next snapshot is taken.'
    : ''
})

const personalEntries = ref<PersonalHistoryEntry[]>([])
const personalLevel = ref<number | undefined>(undefined)

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

async function loadInternal(opts: { silent?: boolean } = {}): Promise<void> {
  if (!selectedActivityId.value) return
  // Class-scope was selected but no class chosen yet: skip the fetch
  // rather than silently falling back to a school-wide query.
  if (internalScope.value === 'class' && !internalScopeClassId.value) {
    internalMeta.value = null
    territoryRankings.value = []
    return
  }
  // Polling refreshes are silent so they don't flash a loading spinner.
  const silent = opts.silent === true
  if (!silent) {
    cancelInflight()
    loading.value = true
    error.value = ''
  }
  const thisId = ++fetchId
  try {
    const classId = internalScope.value === 'class' ? internalScopeClassId.value : null
    const res = await territoryService.getRankingsWithMeta(selectedActivityId.value, { classId })
    if (thisId !== fetchId) return
    internalMeta.value = res
    internalNowMs.value = Date.now()
    territoryRankings.value = res.entries.map(e => ({
      rank: e.rank,
      student_id: e.student_id,
      player_name: e.player_name,
      territory_value: e.territory_value,
    }))
  } catch (e) {
    if (thisId !== fetchId) return
    if (e instanceof DOMException && e.name === 'AbortError') return
    if (!silent) error.value = e instanceof Error ? e.message : 'Failed'
  } finally {
    if (thisId === fetchId && !silent) { loading.value = false; inflight = null }
  }
}

// Poll internal rankings every ~30s with ±5s jitter; gated to the active tab + selected activity.
usePolling(() => loadInternal({ silent: true }), 30_000, internalPollingEnabled, 5_000)

async function loadPersonal(): Promise<void> {
  cancelInflight()
  const controller = new AbortController()
  inflight = controller
  const thisId = ++fetchId
  loading.value = true
  error.value = ''
  try {
    const res = await leaderboardService.getMyHistory(personalLevel.value, controller.signal)
    if (thisId !== fetchId) return
    personalEntries.value = res.entries
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
  internalMeta.value = null
  externalRankings.value = []
  personalEntries.value = []
  page.value = 1
  error.value = ''
}

watch([internalScope, internalScopeClassId], () => {
  if (activeTab.value === 'internal') loadInternal()
})

watch(internalSort, () => {
  // Sorting is local; nothing to refetch.
})

function switchTab(tab: TabId): void {
  activeTab.value = tab
  resetData()
  // B-M-12: clear selection if the currently selected activity is not valid for this tab
  if (tab === 'external' && selectedActivityId.value) {
    const selectedActivity = activities.value.find(activity => activity.id === selectedActivityId.value)
    if (selectedActivity && selectedActivity.class_id !== null) selectedActivityId.value = null
  }
  if (tab === 'personal') loadPersonal()
  else if (tab === 'global') loadGlobal()
  else if (tab === 'class' && selectedClassId.value) loadClass()
  else if (tab === 'internal' && selectedActivityId.value) loadInternal()
  else if (tab === 'external' && selectedActivityId.value) loadExternal()
}

watch(personalLevel, () => {
  if (activeTab.value === 'personal') loadPersonal()
})

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
  } else if (activeTab.value === 'personal') {
    loadPersonal()
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
        :disabled="tab === 'personal' && !auth.isLoggedIn"
        :title="tab === 'personal' && !auth.isLoggedIn ? 'Log in to view your personal history' : ''"
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

    <!-- Personal-tab star-rating filter -->
    <div v-if="activeTab === 'personal'" class="rk-filters">
      <span class="filter-label">Star rating:</span>
      <button
        v-for="lv in [undefined, 1, 2, 3, 4]"
        :key="lv ?? 'all'"
        :class="['btn', 'tab-btn', { active: personalLevel === lv }]"
        @click="personalLevel = lv"
      >
        {{ lv === undefined ? 'All' : `Lv.${lv}` }}
      </button>
    </div>

    <div v-if="loading" class="rk-loading">Loading…</div>
    <div v-else-if="error" class="rk-error">{{ error }}</div>

    <div v-else class="rk-table-wrap">
      <!-- Personal-best timeline -->
      <PersonalTimeline v-if="activeTab === 'personal'" :entries="personalEntries" />

      <!-- Standard leaderboard table (global / class) -->
      <table v-else-if="activeTab === 'global' || activeTab === 'class'" class="rk-table">
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

      <!-- Internal rankings: per-student territory value with delta + composition -->
      <div v-else-if="activeTab === 'internal'" class="rk-internal">
        <div v-if="internalMeta" class="rk-internal-controls">
          <div v-if="internalCanScope" class="rk-control-group">
            <span class="filter-label">Scope:</span>
            <button
              :class="['btn', 'tab-btn', { active: internalScope === 'school' }]"
              @click="internalScope = 'school'"
            >School</button>
            <button
              :class="['btn', 'tab-btn', { active: internalScope === 'class' }]"
              :disabled="classes.length === 0"
              @click="internalScope = 'class'"
            >Class</button>
            <select
              v-if="internalScope === 'class'"
              v-model="internalScopeClassId"
              class="rune-input rk-scope-class"
            >
              <option :value="null" disabled>Choose class</option>
              <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div class="rk-control-group">
            <span class="filter-label">Sort:</span>
            <button
              :class="['btn', 'tab-btn', { active: internalSort === 'territory_value' }]"
              @click="internalSort = 'territory_value'"
            >Value</button>
            <button
              :class="['btn', 'tab-btn', { active: internalSort === 'rank_change' }]"
              @click="internalSort = 'rank_change'"
            >Δ Rank</button>
            <button
              :class="['btn', 'tab-btn', { active: internalSort === 'last_occupation_at' }]"
              @click="internalSort = 'last_occupation_at'"
            >Recent</button>
          </div>
          <div v-if="internalMeta.user_rank !== null" class="user-rank-pill">
            Your rank: <strong>#{{ internalMeta.user_rank }}</strong>
          </div>
        </div>
        <div v-if="sortNullDeltaHint" class="rk-hint">{{ sortNullDeltaHint }}</div>
        <table class="rk-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Δ</th>
              <th>Student</th>
              <th>Territory</th>
              <th>Composition</th>
              <th>Last play</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in sortedInternalEntries"
              :key="r.student_id"
              :class="{ 'is-user': internalMeta && r.student_id === auth.user?.id }"
            >
              <td class="rank">{{ r.rank }}</td>
              <td :class="['delta', r.rank_change === null ? '' : r.rank_change > 0 ? 'up' : r.rank_change < 0 ? 'down' : '']">
                {{ formatRankChange(r.rank_change) }}
              </td>
              <td class="player-name">{{ r.player_name ?? '—' }}</td>
              <td class="score">{{ r.territory_value }}</td>
              <td class="composition">{{ formatComposition(r.composition) }}</td>
              <td class="last-occ">{{ formatRelativeTime(r.last_occupation_at, internalNowMs) }}</td>
            </tr>
            <tr v-if="sortedInternalEntries.length === 0">
              <td colspan="6" class="empty">No records</td>
            </tr>
          </tbody>
        </table>
      </div>

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
  background: var(--bg-base);
  min-height: 100vh;
  overflow-y: auto;
}

.rk-header { display: flex; justify-content: space-between; align-items: center; }
.rk-title { font-size: 20px; color: var(--gold); letter-spacing: 4px; }

.rk-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.rk-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-label { font-size: 11px; color: var(--axis); }
.tab-btn.active { background: var(--gold); color: #1a2a3a; font-weight: bold; }
.tab-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.rk-selector { max-width: 300px; }

.rk-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.rk-table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid var(--grid-line); }
th { color: var(--axis); font-size: 10px; letter-spacing: 2px; text-transform: uppercase; }
.rank { color: var(--gold); font-size: 14px; }
.player-name { color: var(--text-primary); }
.score { color: var(--gold-bright); font-weight: bold; }
.rk-loading, .rk-error, .empty { text-align: center; color: var(--axis); padding: 32px; }
.rk-error { color: var(--enemy-red); }

.rk-pagination { display: flex; align-items: center; justify-content: center; gap: 12px; }
.page-info { font-size: 12px; color: var(--axis); }
.page-btn:disabled { opacity: 0.3; cursor: default; }

.rk-internal { display: flex; flex-direction: column; gap: 10px; }
.rk-internal-controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.rk-control-group { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.rk-scope-class { font-size: 11px; padding: 2px 6px; }
.user-rank-pill { margin-left: auto; padding: 4px 10px; border: 1px solid var(--gold); color: var(--gold); font-size: 11px; }
.user-rank-pill strong { color: var(--gold-bright); }
.rk-hint { font-size: 10px; color: var(--axis); opacity: 0.8; }

.rk-table tr.is-user { background: rgba(255, 215, 0, 0.06); }
.delta { font-size: 12px; color: var(--axis); }
.delta.up { color: #6abf85; }
.delta.down { color: #d05050; }
.composition, .last-occ { font-size: 10px; color: var(--axis); }
</style>
