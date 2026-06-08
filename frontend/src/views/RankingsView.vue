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
import { STAR_MIN, STAR_MAX } from '@/data/difficulty-defs'

const router = useRouter()
const route = useRoute()

// BUG-009: derive the star-rating filter from the shared range (1..STAR_MAX)
// instead of a hard-coded [1,2,3,4] that silently omitted Star 5 (Legendary),
// which the backend (`level` ge=1 le=5) and LevelSelectView both support.
const levelFilters: (number | undefined)[] = [
  undefined,
  ...Array.from({ length: STAR_MAX - STAR_MIN + 1 }, (_, i) => STAR_MIN + i),
]

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
// Shared star-rating (difficulty level) filter for the personal, global and
// class tabs. The backend leaderboard endpoint accepts `level` for all three.
const levelFilter = ref<number | undefined>(undefined)

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
// Swallows the one levelFilter watcher tick caused by switchTab() resetting the
// filter to "All": switchTab already issues the load for the new tab, so letting
// the watcher fire too would double the request on every tab change.
let suppressLevelWatch = false

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
    const res = await rankingService.getGlobal(levelFilter.value, page.value, perPage, controller.signal)
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
    const res = await rankingService.getByClass(selectedClassId.value, levelFilter.value, page.value, perPage, controller.signal)
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
    const res = await leaderboardService.getMyHistory(levelFilter.value, controller.signal)
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
  // Reset the star-rating filter to "All" on every tab change. Guard the
  // watcher so this reset does not trigger a second fetch on top of the load
  // issued at the end of this function.
  if (levelFilter.value !== undefined) {
    suppressLevelWatch = true
    levelFilter.value = undefined
  }
  resetData()
  // B-M-12: clear a class-scoped selection when entering the External tab (inter-class only).
  if (tab === 'external' && selectedActivityId.value) {
    const selectedActivity = activities.value.find(activity => activity.id === selectedActivityId.value)
    if (selectedActivity && selectedActivity.class_id !== null) selectedActivityId.value = null
  }
  // C-10: clear an inter-class selection when entering the Internal tab (class-scoped only).
  // Symmetrical to B-M-12. Navigation deep-links bypass switchTab to preserve their selection.
  if (tab === 'internal' && selectedActivityId.value) {
    const selectedActivity = activities.value.find(activity => activity.id === selectedActivityId.value)
    if (selectedActivity && selectedActivity.class_id === null) selectedActivityId.value = null
  }
  if (tab === 'personal') loadPersonal()
  else if (tab === 'global') loadGlobal()
  else if (tab === 'class' && selectedClassId.value) loadClass()
  else if (tab === 'internal' && selectedActivityId.value) loadInternal()
  else if (tab === 'external' && selectedActivityId.value) loadExternal()
}

watch(levelFilter, () => {
  // A switchTab()-driven reset already loads the new tab; skip the redundant fetch.
  if (suppressLevelWatch) {
    suppressLevelWatch = false
    return
  }
  // Star filtering applies to the personal, global and class leaderboards.
  // Reset to the first page so the filtered result set starts from the top.
  page.value = 1
  if (activeTab.value === 'personal') loadPersonal()
  else if (activeTab.value === 'global') loadGlobal()
  else if (activeTab.value === 'class' && selectedClassId.value) loadClass()
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
  // Bypass switchTab so the C-10 inter-class clearing does not drop the deep-linked selection.
  const paramId = route.params.id as string | undefined
  if (paramId) {
    selectedActivityId.value = paramId
    activeTab.value = 'internal'
    resetData()
    loadInternal()
  } else if (activeTab.value === 'personal') {
    loadPersonal()
  } else {
    loadGlobal()
  }
})

onBeforeUnmount(cancelInflight)
</script>

<template>
  <div class="rankings-view rune-panel">
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

    <!-- Star-rating filter — shared by the personal, global and class tabs -->
    <div
      v-if="activeTab === 'personal' || activeTab === 'global' || activeTab === 'class'"
      class="rk-filters"
    >
      <span class="filter-label">Star rating:</span>
      <button
        v-for="lv in levelFilters"
        :key="lv ?? 'all'"
        :class="['btn', 'filter-btn', { active: levelFilter === lv }]"
        @click="levelFilter = lv"
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
              :key="r.student_id ?? r.rank"
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
          <tr v-if="externalRankings.length === 0">
            <td colspan="3" class="empty">
              {{ selectedActivityId ? 'No records' : 'Select an activity to view rankings.' }}
            </td>
          </tr>
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
/* Morandi card surface for the whole view (mockup .card) */
.rankings-view {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 800px;
  margin: 40px auto;
  padding: 26px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  background: rgba(220, 229, 237, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: var(--shadow);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

/* Buttons (templates use bare .btn + modifier classes) */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: var(--font-main);
  font-size: var(--text-sm);
  font-weight: 600;
  padding: 8px 14px;
  min-height: 38px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: transparent;
  color: var(--charcoal-soft);
  cursor: pointer;
  letter-spacing: 0.4px;
  text-transform: none;
  transition: all 0.16s ease;
}
.btn:hover { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); border-color: var(--terracotta); }
.btn:focus-visible { outline: 2px solid var(--terracotta-deep); outline-offset: 2px; }

.rk-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.rk-title { font-size: var(--text-lg); font-family: var(--font-mono); color: var(--charcoal); letter-spacing: 2px; }

/* Tabs (mockup .tabs / .tab) */
.rk-tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--line); }
.rk-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-label { font-size: var(--text-xs); color: var(--charcoal-soft); }
.tab-btn {
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--charcoal-soft);
  min-height: 40px;
}
.tab-btn:hover { background: transparent; color: var(--terracotta-deep); border-color: transparent; }
.tab-btn.active { color: var(--terracotta-deep); border-bottom-color: var(--terracotta); font-weight: 600; }
.tab-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Star-rating filter pills — kept scoped (not promoted to global.css) so
   the change has no spillover onto other filter rows. Mirrors the leaderboard's
   level-filter style; the duplication is contained to these two views. */
.filter-btn {
  border-radius: 999px;
  padding: 4px 12px;
  min-height: 30px;
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  letter-spacing: 1px;
  background: rgba(79, 74, 72, 0.07);
  color: var(--charcoal-soft);
  border: 1px solid rgba(79, 74, 72, 0.16);
}
.filter-btn.active {
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-soft) 100%);
  color: #fff;
  border-color: var(--gold-deep);
  font-weight: 700;
}

.rk-selector { max-width: 300px; }

/* Table (mockup .tbl) */
.rk-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.rk-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--text-sm); }
th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--line); }
th {
  color: var(--charcoal-soft);
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  letter-spacing: 2px;
  text-transform: uppercase;
  background: rgba(245, 250, 254, 0.4);
}
.rk-table tbody tr:hover td { background: rgba(245, 250, 254, 0.5); }
.rank { color: var(--gold-deep); font-family: var(--font-mono); font-weight: 700; }
.player-name { color: var(--charcoal); }
.score { color: var(--teal-deep); font-weight: 700; font-family: var(--font-mono); }
.rk-loading, .rk-error, .empty { text-align: center; color: var(--charcoal-soft); padding: 32px; }
.rk-error { color: var(--clay-deep); }

.rk-pagination { display: flex; align-items: center; justify-content: center; gap: 12px; }
.page-info { font-size: var(--text-xs); color: var(--charcoal-soft); font-family: var(--font-mono); }
.page-btn { border-radius: 10px; }
.page-btn:disabled { opacity: 0.3; cursor: default; }

.rk-internal { display: flex; flex-direction: column; gap: 10px; }
.rk-internal-controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.rk-control-group { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.rk-scope-class { font-size: var(--text-xs); padding: 2px 6px; }
.user-rank-pill {
  margin-left: auto;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(111, 138, 161, 0.35);
  background: rgba(111, 138, 161, 0.18);
  color: var(--terracotta-deep);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
.user-rank-pill strong { color: var(--terracotta-deep); }
.rk-hint { font-size: var(--text-2xs); color: var(--charcoal-soft); }

.rk-table tr.is-user td { background: rgba(173, 162, 132, 0.18); }
.delta { font-size: var(--text-xs); color: var(--charcoal-soft); font-family: var(--font-mono); }
.delta.up { color: var(--sage-deep); }
.delta.down { color: var(--clay-deep); }
.composition, .last-occ { font-size: var(--text-2xs); color: var(--charcoal-soft); }
</style>
