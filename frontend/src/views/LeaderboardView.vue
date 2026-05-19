<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useLeaderboard } from '@/composables/useLeaderboard'
import { leaderboardService, type PersonalHistoryEntry } from '@/services/leaderboardService'
import { useAuthStore } from '@/stores/authStore'
import PersonalTimeline from '@/components/leaderboard/PersonalTimeline.vue'
import { formatScore } from '@/utils/formatters'

const router = useRouter()
const auth = useAuthStore()

// Tabs are ordered Personal-first per analysis §6.2: self-referential framing
// (mastery goals) is the healthier default for novice / anxious learners than
// social ranking. Logged-out visitors fall back to Global.
type Tab = 'personal' | 'global'
const TAB_LABELS: Record<Tab, string> = { personal: 'Personal History', global: 'Global Ranking' }
const TAB_ORDER: Tab[] = ['personal', 'global']

const activeTab = ref<Tab>(auth.isLoggedIn ? 'personal' : 'global')
const selectedLevel = ref<number | undefined>(undefined)
const currentPage = ref(1)
const perPage = 20
const DEBOUNCE_MS = 250

// Global tab state
const { entries, total, loading, error, load: loadLb } = useLeaderboard()
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage)))

// Personal tab state
const personalEntries = ref<PersonalHistoryEntry[]>([])
const personalLoading = ref(false)
const personalError = ref('')
let personalFetchId = 0
let personalInflight: AbortController | null = null

async function fetchPersonal(level: number | undefined): Promise<void> {
  personalInflight?.abort()
  const controller = new AbortController()
  personalInflight = controller
  const thisId = ++personalFetchId
  personalLoading.value = true
  personalError.value = ''
  try {
    const res = await leaderboardService.getMyHistory(level, controller.signal)
    if (thisId !== personalFetchId) return
    personalEntries.value = res.entries
  } catch (e) {
    if (thisId !== personalFetchId) return
    if (e instanceof DOMException && e.name === 'AbortError') return
    personalError.value = e instanceof Error ? e.message : 'Unable to load personal history'
  } finally {
    if (thisId === personalFetchId) {
      personalLoading.value = false
      personalInflight = null
    }
  }
}

// Debounce rapid filter/page clicks so only the last intent hits the network.
let debounceTimer: ReturnType<typeof setTimeout> | null = null
function scheduleFetch(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    if (activeTab.value === 'global') loadLb(selectedLevel.value, currentPage.value)
    else fetchPersonal(selectedLevel.value)
  }, DEBOUNCE_MS)
}

function selectLevel(lv: number | undefined): void {
  selectedLevel.value = lv
  currentPage.value = 1
  scheduleFetch()
}

function goToPage(page: number): void {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  scheduleFetch()
}

function switchTab(tab: Tab): void {
  if (activeTab.value === tab) return
  activeTab.value = tab
  currentPage.value = 1
  scheduleFetch()
}

watch(() => auth.isLoggedIn, (loggedIn) => {
  // If a user logs out while on the Personal tab, slide back to Global so
  // the view doesn't sit on a 401-producing fetch.
  if (!loggedIn && activeTab.value === 'personal') switchTab('global')
})

onMounted(() => {
  if (activeTab.value === 'personal') fetchPersonal(selectedLevel.value)
  else loadLb()
})
onBeforeUnmount(() => {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  personalInflight?.abort()
})
</script>

<template>
  <div class="leaderboard-view">
    <header class="lb-header">
      <h1 class="lb-title">Heroes Ranking</h1>
      <button class="btn" @click="router.push('/')">← Back to Menu</button>
    </header>

    <div class="lb-tabs">
      <button
        v-for="tab in TAB_ORDER"
        :key="tab"
        :class="['btn', 'tab-btn', { active: activeTab === tab }]"
        :disabled="tab === 'personal' && !auth.isLoggedIn"
        :title="tab === 'personal' && !auth.isLoggedIn ? 'Please log in to view personal history' : ''"
        @click="switchTab(tab)"
      >
        {{ TAB_LABELS[tab] }}
      </button>
    </div>

    <div class="lb-filters">
      <span class="filter-label">Level filter:</span>
      <button
        v-for="lv in [undefined, 1, 2, 3, 4]"
        :key="lv ?? 'all'"
        :class="['btn', 'filter-btn', { active: selectedLevel === lv }]"
        @click="selectLevel(lv)"
      >
        {{ lv === undefined ? 'All' : `Level ${lv}` }}
      </button>
    </div>

    <!-- Personal tab -->
    <template v-if="activeTab === 'personal'">
      <div v-if="personalLoading" class="lb-loading">Loading…</div>
      <div v-else-if="personalError" class="lb-error">{{ personalError }}</div>
      <PersonalTimeline v-else :entries="personalEntries" />
    </template>

    <!-- Global tab -->
    <template v-else>
      <div v-if="loading" class="lb-loading">Loading…</div>
      <div v-else-if="error" class="lb-error">{{ error }}</div>
      <div v-else class="lb-table-wrap">
        <table class="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Level</th>
              <th>Score</th>
              <th>Kills</th>
              <th>Waves Survived</th>
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
            <tr v-if="entries.length === 0">
              <td colspan="6" class="empty">No records</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="totalPages > 1" class="lb-pagination">
        <button class="btn page-btn" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">←</button>
        <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
        <button class="btn page-btn" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">→</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Morandi card surface for the whole view (mockup .card) */
.leaderboard-view {
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
  font-size: 0.88rem;
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

.lb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.lb-title {
  font-size: 1.35rem;
  font-family: var(--font-mono);
  color: var(--charcoal);
  letter-spacing: 2px;
}

/* Tabs (mockup .tabs / .tab) */
.lb-tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--line); }
.tab-btn {
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--charcoal-soft);
  min-height: 40px;
}
.tab-btn:hover { background: transparent; color: var(--terracotta-deep); border-color: transparent; }
.tab-btn.active { color: var(--terracotta-deep); border-bottom-color: var(--terracotta); font-weight: 600; }
.tab-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.lb-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-label { font-size: var(--text-xs); color: var(--charcoal-soft); }

/* Level filter pills (mockup .pill) */
.filter-btn {
  border-radius: 999px;
  padding: 4px 12px;
  min-height: 30px;
  font-family: var(--font-mono);
  font-size: 0.68rem;
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

/* Table (mockup .tbl) */
.lb-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.lb-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.92rem; }

th, td {
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--line);
}

th {
  color: var(--charcoal-soft);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 2px;
  text-transform: uppercase;
  background: rgba(245, 250, 254, 0.4);
}
.lb-table tbody tr:hover td { background: rgba(245, 250, 254, 0.5); }

.rank     { color: var(--gold-deep); font-family: var(--font-mono); font-weight: 700; }
.player-name { color: var(--charcoal); }
.score    { color: var(--teal-deep); font-weight: 700; font-family: var(--font-mono); }
.lb-loading, .lb-error, .empty { text-align: center; color: var(--charcoal-soft); padding: 32px; }
.lb-error { color: var(--clay-deep); }

.lb-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.page-info { font-size: var(--text-xs); color: var(--charcoal-soft); font-family: var(--font-mono); }
.page-btn { border-radius: 10px; }
.page-btn:disabled { opacity: 0.3; cursor: default; }
</style>
