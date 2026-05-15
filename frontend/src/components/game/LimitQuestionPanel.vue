<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { Events } from '@/data/constants'
import { outcomeLabel, parseLimitAnswer } from '@/math/limit-evaluator'
import type { LimitTowerSystem } from '@/systems/LimitTowerSystem'
import type { LimitResult } from '@/entities/types'

const props = defineProps<{ towerId: string }>()
const gameStore = useGameStore()

const answered = ref(false)
const typedInput = ref('')
const errorMsg = ref('')
// Re-answer affordance: an answered tower can reopen its (deterministic)
// question so a wrong choice costs tempo, not the tower.
const editing = ref(false)

const tower = computed(() => {
  void gameStore.level
  const engine = gameStore.getEngine()
  return engine?.towers.find((t) => t.id === props.towerId) ?? null
})

watch(() => props.towerId, () => {
  answered.value = false
  typedInput.value = ''
  errorMsg.value = ''
  editing.value = false
})
watch(tower, (t) => {
  if (!t) {
    answered.value = false
    typedInput.value = ''
    errorMsg.value = ''
    editing.value = false
  }
})

const question = computed(() => {
  const t = tower.value
  if (!t) return null
  const engine = gameStore.getEngine()
  const sys = engine?.getSystem('limitTower') as LimitTowerSystem | undefined
  return sys?.generateQuestion(t) ?? null
})

// Star ≥ 4 swaps MCQ for typed entry (retrieval-practice diversification).
const useTypedEntry = computed(() => gameStore.starRating >= 4)

function commit(choice: LimitResult): void {
  const engine = gameStore.getEngine()
  if (!engine) return
  engine.eventBus.emit(Events.LIMIT_ANSWER, { towerId: props.towerId, answer: choice })
  answered.value = true
  editing.value = false
}

function resultsMatch(a: LimitResult, b: LimitResult): boolean {
  if (a.outcome !== b.outcome) return false
  // Categorical outcomes have no user-typed magnitude — outcome match is sufficient.
  if (a.outcome === '+inf' || a.outcome === '-inf' || a.outcome === 'zero' || a.outcome === 'constant') {
    return true
  }
  return Math.abs(a.value - b.value) < 1e-9
}

function submitTyped(): void {
  errorMsg.value = ''
  const q = question.value
  if (!q) return
  const parsed = parseLimitAnswer(typedInput.value)
  if (!parsed) {
    errorMsg.value = 'Could not parse. Try +inf, -inf, DNE, or a number (e.g. 3, -2).'
    return
  }
  if (!resultsMatch(parsed, q.correctAnswer)) {
    errorMsg.value = 'Incorrect. Re-evaluate the limit and try again.'
    return
  }
  commit(q.correctAnswer)
}
</script>

<template>
  <div class="limit-panel">
    <template v-if="question && ((!answered && !tower?.limitResult) || editing)">
      <p class="question-text">
        Given: {{ question.fExpr }}
      </p>
      <p class="question-text">
        Evaluate: lim [f(x) / (x - {{ question.a }})] as x → {{ question.a }}
      </p>

      <template v-if="useTypedEntry">
        <form class="typed-entry" @submit.prevent="submitTyped">
          <input
            v-model="typedInput"
            class="typed-input"
            type="text"
            placeholder="e.g. +inf, -2, 0, DNE"
            data-testid="limit-typed-input"
            @input="errorMsg = ''"
          />
          <button class="btn submit-btn" type="submit" data-testid="limit-typed-submit">Submit</button>
        </form>
        <p v-if="errorMsg" class="error-text" data-testid="limit-typed-error">{{ errorMsg }}</p>
        <p class="hint-text">Type the limit value (number, +inf, -inf, or DNE).</p>
      </template>
      <template v-else>
        <div class="choices">
          <button
            v-for="(choice, i) in question.choices"
            :key="i"
            class="btn choice-btn"
            @click="commit(choice)"
          >{{ outcomeLabel(choice) }}</button>
        </div>
      </template>
    </template>
    <template v-else-if="tower?.limitResult">
      <p class="result-text">
        Result: {{ outcomeLabel(tower.limitResult) }}
      </p>
      <button
        class="btn change-btn"
        data-testid="limit-change-answer"
        @click="editing = true"
      >Change answer</button>
    </template>
  </div>
</template>

<style scoped>
.limit-panel { display: flex; flex-direction: column; gap: 8px; }
.question-text { font-size: 12px; color: var(--text-primary); margin: 0; line-height: 1.5; }
.choices { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.choice-btn { font-size: 11px; padding: 8px; }
.result-text { font-size: 12px; color: var(--gold); margin: 0; }
.change-btn { font-size: 11px; padding: 6px 12px; align-self: flex-start; }
.typed-entry { display: flex; gap: 6px; }
.typed-input {
  flex: 1; padding: 6px; font-size: 12px;
  background: var(--stone-dark); color: #ffffff;
  border: 1px solid var(--gold); border-radius: 4px;
}
.submit-btn { font-size: 11px; padding: 6px 12px; }
.error-text { font-size: 11px; color: #ff7a7a; margin: 0; }
.hint-text { font-size: 10px; color: var(--text-primary); opacity: 0.5; margin: 0; font-style: italic; }
</style>
