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
const result = ref<{ seized: boolean; score: number } | null>(null)
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
    result.value = { seized: res.seized, score: res.occupation.score }
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
          <div class="result-score">Score: {{ result.score.toFixed(2) }}</div>
        </div>
      </template>

      <div class="result-actions">
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
}

.result-panel {
  width: 360px;
  max-width: calc(100% - 32px);
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

.error-msg { font-size: 11px; color: var(--enemy-red); text-align: center; }
.loading { font-size: 11px; color: var(--axis); text-align: center; }

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
