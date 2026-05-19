<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTerritoryStore } from '@/stores/territoryStore'

const router = useRouter()
const route = useRoute()
const store = useTerritoryStore()

const activityId = computed(() => route.params.id as string)
const slotId = computed(() => route.params.slotId as string)

const submitting = ref(true)
const result = ref<{ seized: boolean; score: number | null } | null>(null)
const noSession = ref(false)

onMounted(async () => {
  const sessionId = history.state?.sessionId as string | undefined
  if (!sessionId) {
    noSession.value = true
    submitting.value = false
    return
  }

  const res = await store.playSlot(activityId.value, slotId.value, sessionId)
  if (res) {
    const rawScore = res.occupation?.score
    const safeScore = typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : null
    result.value = { seized: res.seized, score: safeScore }
  }
  submitting.value = false
})

function goBack(): void {
  router.push({ name: 'territory-detail', params: { id: activityId.value } })
}
</script>

<template>
  <div class="territory-result-view">
    <div class="result-panel rune-panel">
      <h2 class="result-title">Territory Challenge</h2>

      <div v-if="submitting" class="loading">Submitting result…</div>

      <div v-else-if="noSession" class="error-msg">
        No game session found. Please play a territory slot from the activity page.
      </div>

      <div v-else-if="store.errorPlay" class="error-msg">{{ store.errorPlay }}</div>

      <template v-else-if="result">
        <div :class="['result-box', result.seized ? 'success' : 'failure']">
          <div class="result-text">
            {{ result.seized ? 'Territory Seized!' : 'Score Not High Enough' }}
          </div>
          <div v-if="result.score !== null" class="result-score">Score: {{ result.score.toFixed(2) }}</div>
        </div>
      </template>

      <div class="result-actions">
        <button v-if="result && !result.seized" class="btn retry-btn" @click="goBack">Try Again</button>
        <button class="btn" @click="goBack">Back to Activity</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.territory-result-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
}

.result-panel {
  width: 520px;
  max-width: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  background: rgba(220, 229, 237, 0.86);
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 16px;
  box-shadow: var(--shadow);
  padding: 26px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.result-title {
  font-size: 1.6rem;
  font-family: var(--font-mono);
  color: var(--charcoal);
  letter-spacing: 2px;
  font-weight: 800;
}

.error-msg { font-size: var(--text-sm); color: var(--clay-deep); text-align: center; }
.loading { font-size: var(--text-sm); color: var(--charcoal-soft); text-align: center; }

.result-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 12px;
  width: 100%;
}

.result-box.success { border-color: rgba(126, 144, 119, 0.4); background: rgba(126, 144, 119, 0.12); }
.result-box.failure { border-color: rgba(185, 134, 116, 0.4); background: rgba(185, 134, 116, 0.12); }

.result-text { font-size: var(--text-sm); color: var(--sage-deep); letter-spacing: 2px; font-weight: 600; }
.result-score { font-size: var(--text-xs); color: var(--charcoal-soft); }

.result-actions { display: flex; gap: 8px; }
.retry-btn { border-color: var(--terracotta); color: var(--terracotta-deep); }
.retry-btn:hover { background: var(--terracotta); color: #fff; }
</style>
