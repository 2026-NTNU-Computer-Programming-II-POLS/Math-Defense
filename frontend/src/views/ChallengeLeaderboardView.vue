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
  width: 640px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: rgba(220, 229, 237, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: var(--shadow);
  padding: 26px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.header { text-align: center; }
.setup-title { font-size: 1.35rem; font-family: var(--font-mono); color: var(--charcoal); letter-spacing: 2px; margin: 0; }
.ch-name { font-size: var(--text-xs); color: var(--charcoal-soft); margin-top: 4px; }

.loading, .empty-msg { color: var(--charcoal-soft); font-size: var(--text-xs); text-align: center; padding: 16px 0; font-style: italic; }
.error-msg { color: var(--clay-deep); font-size: var(--text-xs); }

.ranking-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.92rem;
}
.ranking-table th, .ranking-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  text-align: left;
}
.ranking-table th { color: var(--charcoal-soft); font-family: var(--font-mono); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 2px; }
.ranking-table td { color: var(--charcoal); }
.rank-col { width: 36px; text-align: center; color: var(--gold-deep); font-family: var(--font-mono); font-weight: 700; }
.score-col { width: 80px; text-align: right; color: var(--teal-deep); font-family: var(--font-mono); font-weight: 700; }
.meta-col { width: 70px; text-align: right; }

.form-actions { display: flex; gap: 8px; justify-content: flex-start; margin-top: 12px; }
.back-btn { border-color: var(--line); color: var(--charcoal-soft); }
.back-btn:hover { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); }
</style>
