<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { calculateScore, type ScoreInput } from '@/domain/scoring/score-calculator'

const g = useGameStore()
const continueRef = ref<HTMLButtonElement | null>(null)

const breakdown = computed(() => {
  const input: ScoreInput = {
    killValue: g.cumulativeKillValue,
    timeTotal: g.timeTotal,
    timeExcludePrepare: [...g.timeExcludePrepare],
    costTotal: g.costTotal,
    healthOrigin: g.healthOrigin,
    healthFinal: g.hp,
    initialAnswer: g.initialAnswer,
  }
  return calculateScore(input)
})

function fmt(v: number): string {
  return v.toFixed(2)
}

const emit = defineEmits<{ (e: 'close'): void }>()

function handleKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopImmediatePropagation()
    emit('close')
  }
  if (e.key === 'Tab' && continueRef.value) {
    e.preventDefault()
    continueRef.value.focus()
  }
}

onMounted(() => {
  nextTick(() => continueRef.value?.focus())
  window.addEventListener('keydown', handleKey)
})

onUnmounted(() => window.removeEventListener('keydown', handleKey))
</script>

<template>
  <div class="score-overlay">
    <div
      class="score-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="score-title"
    >
      <h2 id="score-title" class="score-title">Level Complete!</h2>

      <div class="star-display">
        <span v-for="i in g.starRating" :key="i" class="star filled">&#9733;</span>
        <span v-for="i in (5 - g.starRating)" :key="'e' + i" class="star empty">&#9734;</span>
      </div>

      <table class="breakdown">
        <tbody>
          <tr>
            <td class="label">Kill Value</td>
            <td class="value">{{ g.cumulativeKillValue }}</td>
          </tr>
          <tr>
            <td class="label">Active Time</td>
            <td class="value">{{ fmt(breakdown.activeTime) }}s</td>
          </tr>
          <tr>
            <td class="label">Cost Total</td>
            <td class="value">{{ g.costTotal }}</td>
          </tr>
          <tr class="formula">
            <td class="label">S1 (kill/time)</td>
            <td class="value">{{ fmt(breakdown.s1) }}</td>
          </tr>
          <tr class="formula">
            <td class="label">S2 (kill/cost)</td>
            <td class="value">{{ fmt(breakdown.s2) }}</td>
          </tr>
          <tr class="formula">
            <td class="label">K (m={{ breakdown.mUsed }})</td>
            <td class="value">{{ fmt(breakdown.k) }}</td>
          </tr>
          <tr>
            <td class="label">Exponent</td>
            <td class="value">{{ fmt(breakdown.exponent) }}</td>
          </tr>
          <tr>
            <td class="label">HP {{ g.healthOrigin }} → {{ g.hp }}</td>
            <td class="value">-{{ g.healthOrigin - g.hp }}</td>
          </tr>
          <tr>
            <td class="label">IA</td>
            <td class="value">{{ g.initialAnswer }}</td>
          </tr>
        </tbody>
      </table>

      <div class="total-score">
        <span class="total-label">Total Score</span>
        <span class="total-value">{{ fmt(breakdown.totalScore) }}</span>
      </div>

      <button ref="continueRef" class="btn-continue" @click="emit('close')">Continue</button>
    </div>
  </div>
</template>

<style scoped>
.score-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

.score-panel {
  background: linear-gradient(135deg, #1a1520, #252030);
  border: 2px solid var(--gold);
  border-radius: 12px;
  padding: 24px 40px;
  text-align: center;
  min-width: 340px;
  font-family: var(--font-mono);
}

.score-title {
  color: var(--gold-bright);
  font-size: 20px;
  margin: 0 0 8px;
}

.star-display {
  margin-bottom: 16px;
}

.star { font-size: 24px; }
.star.filled { color: var(--gold-bright); }
.star.empty { color: var(--panel-border); }

.breakdown {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
}

.breakdown td {
  padding: 3px 8px;
  font-size: 12px;
}

.breakdown .label {
  text-align: left;
  color: var(--axis);
}

.breakdown .value {
  text-align: right;
  color: #e8dcc8;
  font-weight: bold;
}

.breakdown tr.formula .label { color: #60c0ff; }
.breakdown tr.formula .value { color: #60c0ff; }

.total-score {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 8px;
  border-top: 1px solid var(--gold);
  margin-bottom: 16px;
}

.total-label {
  color: var(--gold);
  font-size: 14px;
  font-weight: bold;
}

.total-value {
  color: var(--gold-bright);
  font-size: 22px;
  font-weight: bold;
}

.btn-continue {
  padding: 10px 32px;
  border: 1px solid var(--gold);
  border-radius: 6px;
  background: rgba(212, 168, 64, 0.2);
  color: var(--gold);
  font-family: var(--font-mono);
  font-size: 14px;
  cursor: pointer;
  transition: background 120ms;
}

.btn-continue:hover {
  background: rgba(212, 168, 64, 0.4);
}
</style>
