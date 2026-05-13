<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { calculateScore, type ScoreInput } from '@/domain/scoring/score-calculator'
import { sessionService } from '@/services/sessionService'

const props = defineProps<{ sessionId?: string | null; practiceMode?: boolean }>()
const uiStore = useUiStore()
// Backlog §20: any opt-in slider-fallback toggle implies the run is practice
// (the server flagged it as such). Fallback to the local toggle when the flag
// hasn't yet propagated from the session sync layer (e.g. legacy callers).
const isPractice = computed(() => props.practiceMode || uiStore.sliderFallbackEnabled)

const g = useGameStore()
const continueRef = ref<HTMLButtonElement | null>(null)
const reflectionText = ref('')
const reflectionStatus = ref<'idle' | 'submitting' | 'saved' | 'error'>('idle')
const reflectionError = ref('')
const REFLECTION_MAX = 2000

async function submitReflection() {
  if (!props.sessionId || reflectionStatus.value === 'submitting') return
  reflectionStatus.value = 'submitting'
  reflectionError.value = ''
  try {
    await sessionService.submitReflection(props.sessionId, reflectionText.value)
    reflectionStatus.value = 'saved'
  } catch (e) {
    reflectionStatus.value = 'error'
    reflectionError.value = e instanceof Error ? e.message : 'Failed to submit'
  }
}

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
            <td class="label">Enemies Defeated</td>
            <td class="value">{{ g.cumulativeKillValue }}</td>
          </tr>
          <tr>
            <td class="label">Active Time</td>
            <td class="value">{{ fmt(breakdown.activeTime) }}s</td>
          </tr>
          <tr>
            <td class="label">Gold Spent</td>
            <td class="value">{{ g.costTotal }}</td>
          </tr>
          <tr class="formula">
            <td class="label">Speed Bonus</td>
            <td class="value">{{ fmt(breakdown.s1) }}</td>
          </tr>
          <tr class="formula">
            <td class="label">Efficiency Bonus</td>
            <td class="value">{{ fmt(breakdown.s2) }}</td>
          </tr>
          <tr class="formula">
            <td class="label">Combo Multiplier</td>
            <td class="value">{{ fmt(breakdown.k) }}</td>
          </tr>
          <tr>
            <td class="label">HP Remaining</td>
            <td class="value">{{ g.hp }} / {{ g.healthOrigin }}</td>
          </tr>
          <tr>
            <td class="label">Initial Answer</td>
            <td class="value">{{ g.initialAnswer === 1 ? 'Correct' : 'Wrong' }}</td>
          </tr>
        </tbody>
      </table>

      <div class="total-score">
        <span class="total-label">Total Score</span>
        <span class="total-value">{{ fmt(breakdown.totalScore) }}</span>
      </div>

      <!-- §12.6: Checkpoint runs are tagged as practice on personal-best,
           and not eligible for class leaderboards. -->
      <p v-if="g.isCheckpointRun" class="practice-notice">
        Practice run (resumed from a checkpoint) — not eligible for class
        leaderboards.
      </p>
      <!-- Backlog §20.4: Score-Result view shows a notice when slider-fallback
           was enabled, so the player isn't surprised that the run is missing
           from the global leaderboard. -->
      <p v-else-if="isPractice" class="practice-notice">
        This run is in practice mode and not on the leaderboard.
      </p>

      <div v-if="sessionId" class="reflection">
        <label for="reflection-text" class="reflection-label">
          What strategy worked? (optional)
        </label>
        <textarea
          id="reflection-text"
          v-model="reflectionText"
          class="reflection-input"
          :maxlength="REFLECTION_MAX"
          :disabled="reflectionStatus === 'submitting' || reflectionStatus === 'saved'"
          rows="3"
          placeholder="Describe the approach that helped you win this round."
        />
        <div class="reflection-row">
          <span class="reflection-meta">{{ reflectionText.length }} / {{ REFLECTION_MAX }}</span>
          <span v-if="reflectionStatus === 'saved'" class="reflection-meta saved">Saved</span>
          <span v-if="reflectionStatus === 'error'" class="reflection-meta error">{{ reflectionError }}</span>
          <button
            class="btn-submit"
            type="button"
            :disabled="reflectionStatus === 'submitting' || reflectionStatus === 'saved'"
            @click="submitReflection"
          >
            {{ reflectionStatus === 'submitting' ? 'Saving…' : 'Submit' }}
          </button>
        </div>
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
  background: var(--panel-bg);
  border: 2px solid var(--gold);
  border-radius: 8px;
  padding: 24px 40px;
  text-align: center;
  min-width: 340px;
  font-family: var(--font-mono);
  box-shadow: 0 15px 45px rgba(0, 0, 0, 0.4);
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
  color: var(--text-primary);
}

.breakdown .value {
  text-align: right;
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  font-weight: bold;
}

.breakdown tr.formula .label { color: var(--formula-blue); }
.breakdown tr.formula .value { color: var(--formula-blue); }

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
  text-shadow: var(--gold-shadow);
  font-size: 14px;
  font-weight: bold;
}

.total-value {
  color: var(--gold-bright);
  font-size: 22px;
  font-weight: bold;
}

.practice-notice {
  margin: 0 0 14px;
  padding: 8px 12px;
  border: 1px dashed var(--gold-dim);
  border-radius: 4px;
  font-size: 11px;
  color: var(--gold-dim);
  font-style: italic;
  text-align: center;
}

.btn-continue {
  padding: 10px 32px;
  border: 1px solid var(--gold);
  border-radius: 6px;
  background: var(--gold);
  color: var(--text-on-accent);
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: transform 0.1s, background 0.1s;
}

.btn-continue:hover {
  background: var(--gold-bright);
  transform: translateY(-1px);
}

.reflection {
  margin-bottom: 14px;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.reflection-label {
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  font-size: 11px;
}

.reflection-input {
  width: 100%;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--stone-selected);
  color: var(--text-primary);
  border: 1px solid var(--panel-border);
  border-radius: 4px;
  padding: 6px 8px;
  box-sizing: border-box;
}

.reflection-input:focus {
  outline: none;
  border-color: var(--gold);
}

.reflection-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.reflection-meta {
  font-size: 10px;
  color: var(--axis);
  text-shadow: var(--gold-shadow);
}

.reflection-meta.saved { color: var(--gold-bright); }
.reflection-meta.error { color: var(--enemy-red); }

.btn-submit {
  margin-left: auto;
  padding: 4px 14px;
  border: 1px solid var(--gold);
  background: rgba(212, 160, 23, 0.15);
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: default;
}

.btn-submit:not(:disabled):hover {
  background: rgba(212, 160, 23, 0.35);
}
</style>
