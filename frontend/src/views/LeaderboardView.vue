<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useLeaderboard } from '@/composables/useLeaderboard'

const router = useRouter()
const { entries, total, loading, error, fetch: fetchLb } = useLeaderboard()
const selectedLevel = ref<number | undefined>(undefined)
const currentPage = ref(1)
const perPage = 20
const DEBOUNCE_MS = 250

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / perPage)))

// Debounce rapid filter/page clicks so only the last intent hits the network.
// useLeaderboard already drops stale responses via fetchId; this stops the
// requests from being fired in the first place.
let debounceTimer: ReturnType<typeof setTimeout> | null = null
function scheduleFetch(lv: number | undefined, page: number): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    fetchLb(lv, page)
  }, DEBOUNCE_MS)
}

function selectLevel(lv: number | undefined): void {
  selectedLevel.value = lv
  currentPage.value = 1
  scheduleFetch(lv, 1)
}

function goToPage(page: number): void {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
  scheduleFetch(selectedLevel.value, page)
}

onMounted(() => fetchLb())
onBeforeUnmount(() => {
  if (debounceTimer !== null) clearTimeout(debounceTimer)
})
</script>

<template>
  <div class="leaderboard-view">
    <header class="lb-header">
      <h1 class="lb-title">英雄排行榜</h1>
      <button class="btn" @click="router.push('/')">← 返回</button>
    </header>

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

    <div v-if="loading" class="lb-loading">載入中…</div>
    <div v-else-if="error" class="lb-error">{{ error }}</div>
    <table v-else class="lb-table">
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
        <tr v-for="(e, idx) in entries" :key="`${e.rank}-${idx}`">
          <td class="rank">{{ e.rank }}</td>
          <td class="username">{{ e.username }}</td>
          <td>Lv.{{ e.level }}</td>
          <td class="score">{{ e.score.toLocaleString() }}</td>
          <td>{{ e.kills }}</td>
          <td>{{ e.waves_survived }}</td>
        </tr>
        <tr v-if="entries.length === 0">
          <td colspan="6" class="empty">尚無紀錄</td>
        </tr>
      </tbody>
    </table>

    <div v-if="totalPages > 1" class="lb-pagination">
      <button class="btn page-btn" :disabled="currentPage <= 1" @click="goToPage(currentPage - 1)">←</button>
      <span class="page-info">{{ currentPage }} / {{ totalPages }}</span>
      <button class="btn page-btn" :disabled="currentPage >= totalPages" @click="goToPage(currentPage + 1)">→</button>
    </div>
  </div>
</template>

<style scoped>
.leaderboard-view {
  width: 800px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  background: radial-gradient(ellipse at center, #1e1828 0%, #0d0a12 70%);
  min-height: 100vh;
}

.lb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lb-title {
  font-size: 20px;
  color: var(--gold);
  letter-spacing: 4px;
}

.lb-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-label { font-size: 11px; color: var(--axis); }

.filter-btn.active {
  background: var(--gold);
  color: var(--stone-dark);
}

.lb-table { width: 100%; border-collapse: collapse; font-size: 12px; }

th, td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--grid-line);
}

th { color: var(--axis); font-size: 10px; letter-spacing: 2px; text-transform: uppercase; }

.rank     { color: var(--gold); font-size: 14px; }
.username { color: #e8dcc8; }
.score    { color: var(--gold-bright); font-weight: bold; }
.lb-loading, .lb-error, .empty { text-align: center; color: var(--axis); padding: 32px; }
.lb-error { color: var(--enemy-red); }

.lb-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.page-info { font-size: 12px; color: var(--axis); }
.page-btn:disabled { opacity: 0.3; cursor: default; }
</style>
