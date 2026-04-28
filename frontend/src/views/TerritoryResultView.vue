<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTerritoryStore } from '@/stores/territoryStore'

const router = useRouter()
const route = useRoute()
const store = useTerritoryStore()

const activityId = computed(() => route.params.id as string)
const slotId = computed(() => route.params.slotId as string)

const score = ref(0)
const result = ref<{ seized: boolean; score: number } | null>(null)
const submitting = ref(false)

function resetState(): void {
  result.value = null
  submitting.value = false
  store.error = ''
  const q = route.query.score
  score.value = q ? Number(q) : 0
}

async function submitPlay(): Promise<void> {
  if (score.value <= 0 || submitting.value) return
  submitting.value = true
  store.error = ''
  const res = await store.playSlot(activityId.value, slotId.value, score.value)
  if (res) {
    result.value = { seized: res.seized, score: res.occupation.score }
  }
  submitting.value = false
}

watch(() => route.params.slotId, resetState, { immediate: true })
</script>

<template>
  <div class="territory-result-view">
    <div class="result-panel rune-panel">
      <h2 class="result-title">Territory Challenge</h2>

      <div v-if="store.error" class="error-msg">{{ store.error }}</div>

      <template v-if="!result">
        <div class="score-input-section">
          <label class="score-label">Your Score</label>
          <input v-model.number="score" type="number" class="rune-input score-input" min="1" step="1" />
          <button class="btn" :disabled="submitting || score <= 0" @click="submitPlay">
            {{ submitting ? 'Submitting…' : 'Submit Score' }}
          </button>
        </div>
      </template>

      <template v-else>
        <div :class="['result-box', result.seized ? 'success' : 'failure']">
          <div class="result-text">
            {{ result.seized ? 'Territory Seized!' : 'Score Not High Enough' }}
          </div>
          <div class="result-score">Score: {{ result.score.toFixed(0) }}</div>
        </div>
        <div class="result-actions">
          <button class="btn" @click="router.push(`/territory/${activityId}`)">Back to Activity</button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.territory-result-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

.result-panel {
  width: 360px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.result-title {
  font-size: 16px;
  color: var(--gold);
  letter-spacing: 3px;
}

.error-msg { font-size: 11px; color: var(--enemy-red); }

.score-input-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.score-label { font-size: 11px; color: var(--axis); }
.score-input { width: 100%; text-align: center; font-size: 18px; }

.result-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px;
  border: 1px solid var(--axis);
  width: 100%;
}

.result-box.success { border-color: var(--gold); }
.result-box.failure { border-color: var(--enemy-red); }

.result-text { font-size: 14px; color: var(--gold); letter-spacing: 2px; }
.result-score { font-size: 12px; color: var(--axis); }

.result-actions { display: flex; gap: 8px; }
</style>
