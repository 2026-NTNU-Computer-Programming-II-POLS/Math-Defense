<script setup lang="ts">
// ChallengeLeaderboardView.vue — challenge-scoped rankings (spec §23.5).
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { challengeService, type Challenge } from '@/services/challengeService'
import { leaderboardService, type LeaderboardEntry } from '@/services/leaderboardService'

const route = useRoute()
const router = useRouter()

const challenge = ref<Challenge | null>(null)
const entries = ref<LeaderboardEntry[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref('')

async function load(): Promise<void> {
  const id = route.params.id as string
  loading.value = true
  try {
    const [c, lb] = await Promise.all([
      challengeService.get(id),
      leaderboardService.getForChallenge(id, 1, 50),
    ])
    challenge.value = c
    entries.value = lb.entries
    total.value = lb.total
  } catch (e: unknown) {
    error.value = (e instanceof Error ? e.message : 'Failed to load')
  } finally {
    loading.value = false
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString()
}

onMounted(load)
</script>

<template>
  <div class="setup-view">
    <div class="setup-panel rune-panel">
      <div class="header">
        <h2 class="setup-title">Challenge Rankings</h2>
        <div v-if="challenge" class="ch-name">{{ challenge.title }}</div>
      </div>

      <div v-if="loading" class="loading">Loading…</div>
      <div v-else-if="error" class="error-msg">{{ error }}</div>

      <div v-else>
        <div v-if="!entries.length" class="empty-msg">
          No entries yet — be the first to complete this challenge.
        </div>
        <table v-else class="ranking-table">
          <thead>
            <tr>
              <th class="rank-col">#</th>
              <th>Player</th>
              <th class="score-col">Score</th>
              <th class="meta-col">Waves</th>
              <th class="meta-col">Date</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in entries" :key="e.id">
              <td class="rank-col">{{ e.rank }}</td>
              <td>{{ e.player_name }}</td>
              <td class="score-col">{{ e.score }}</td>
              <td class="meta-col">{{ e.waves_survived }}</td>
              <td class="meta-col">{{ formatDate(e.created_at) }}</td>
            </tr>
          </tbody>
        </table>

        <div class="form-actions">
          <button class="btn back-btn" type="button" @click="router.push(`/challenge/${challenge?.id ?? ''}`)">
            ← Back to challenge
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.setup-view {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding-top: 40px;
}

.setup-panel {
  width: 560px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header { text-align: center; }
.setup-title { font-size: 16px; color: var(--gold); text-shadow: var(--gold-shadow); letter-spacing: 3px; margin: 0; }
.ch-name { font-size: 12px; color: var(--axis); text-shadow: var(--gold-shadow); margin-top: 4px; }

.loading, .empty-msg { color: var(--axis); text-shadow: var(--gold-shadow); font-size: 12px; text-align: center; padding: 16px 0; }
.error-msg { color: var(--enemy-red); font-size: 11px; }

.ranking-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.ranking-table th, .ranking-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--axis);
  text-align: left;
}
.ranking-table th { color: var(--gold); text-shadow: var(--gold-shadow); font-weight: normal; letter-spacing: 1px; }
.ranking-table td { color: var(--axis); text-shadow: var(--gold-shadow); }
.rank-col { width: 36px; text-align: center; }
.score-col { width: 80px; text-align: right; color: var(--gold); text-shadow: var(--gold-shadow); }
.meta-col { width: 70px; text-align: right; }

.form-actions { display: flex; gap: 8px; justify-content: flex-start; margin-top: 12px; }
.back-btn { border-color: var(--axis); color: var(--axis); text-shadow: var(--gold-shadow); }
.back-btn:hover { background: var(--axis); color: var(--stone-dark); }
</style>
