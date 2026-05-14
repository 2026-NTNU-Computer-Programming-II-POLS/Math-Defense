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
const TAB_LABELS: Record<Tab, string> = { personal: '個人歷程', global: '全球排行' }
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
    personalError.value = e instanceof Error ? e.message : '無法載入個人歷程'
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
      <h1 class="lb-title">英雄排行榜</h1>
      <button class="btn" @click="router.push('/')">← 返回</button>
    </header>

    <div class="lb-tabs">
      <button
        v-for="tab in TAB_ORDER"
        :key="tab"
        :class="['btn', 'tab-btn', { active: activeTab === tab }]"
        :disabled="tab === 'personal' && !auth.isLoggedIn"
        :title="tab === 'personal' && !auth.isLoggedIn ? '登入後可查看個人歷程' : ''"
        @click="switchTab(tab)"
      >
        {{ TAB_LABELS[tab] }}
      </button>
    </div>

    <div class="lb-filters">
      <span class="filter-label">關卡篩選：</span>
      <button
        v-for="lv in [undefined, 1, 2, 3, 4]"
        :key="lv ?? 'all'"
        :class="['btn', 'filter-btn', { active: selectedLevel === lv }]"
        @click="selectLevel(lv)"
      >
        {{ lv === undefined ? '全部' : `Level ${lv}` }}
      </button>
    </div>

    <!-- Personal tab -->
    <template v-if="activeTab === 'personal'">
      <div v-if="personalLoading" class="lb-loading">載入中…</div>
      <div v-else-if="personalError" class="lb-error">{{ personalError }}</div>
      <PersonalTimeline v-else :entries="personalEntries" />
    </template>

    <!-- Global tab -->
    <template v-else>
      <div v-if="loading" class="lb-loading">載入中…</div>
      <div v-else-if="error" class="lb-error">{{ error }}</div>
      <div v-else class="lb-table-wrap">
        <table class="lb-table">
          <thead>
            <tr>
              <th>#</th>
              <th>玩家</th>
              <th>關卡</th>
              <th>分數</th>
              <th>擊殺</th>
              <th>存活波數</th>
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
              <td colspan="6" class="empty">尚無紀錄</td>
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
.leaderboard-view {
  width: 800px;
  max-width: 100%;
  margin: 0 auto;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  background: var(--bg-base);
  min-height: 100vh;
  min-height: 100dvh;
  overflow-y: auto;
}

.lb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lb-title {
  font-size: 20px;
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  letter-spacing: 4px;
}

.lb-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
.tab-btn.active { background: var(--gold); color: var(--text-on-accent); font-weight: bold; }
.tab-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.lb-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-label { font-size: 11px; color: var(--axis); text-shadow: var(--gold-shadow); }

.filter-btn.active {
  background: var(--gold);
  color: var(--text-on-accent);
  font-weight: bold;
}

.lb-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.lb-table { width: 100%; border-collapse: collapse; font-size: 12px; }

th, td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--grid-line);
}

th { color: var(--axis); text-shadow: var(--gold-shadow); font-size: 10px; letter-spacing: 2px; text-transform: uppercase; }

.rank     { color: var(--gold); text-shadow: var(--gold-shadow); font-size: 14px; }
.player-name { color: var(--text-primary); }
.score    { color: var(--gold-bright); font-weight: bold; }
.lb-loading, .lb-error, .empty { text-align: center; color: var(--axis); text-shadow: var(--gold-shadow); padding: 32px; }
.lb-error { color: var(--enemy-red); }

.lb-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.page-info { font-size: 12px; color: var(--axis); text-shadow: var(--gold-shadow); }
.page-btn:disabled { opacity: 0.3; cursor: default; }
</style>
