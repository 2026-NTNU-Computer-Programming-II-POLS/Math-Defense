<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import MathDisplay from '@/components/common/MathDisplay.vue'
import { curveToLatex } from '@/math/curve-evaluator'
import { generateDistractors, type AnswerOption } from '@/domain/level/distractor-generator'
import { mulberry32 } from '@/math/MathUtils'
import type { GeneratedLevel } from '@/math/curve-types'

const router = useRouter()

const level = ref<GeneratedLevel | null>(null)
const options = ref<AnswerOption[]>([])
const selectedIndex = ref<number | null>(null)
const answered = ref(false)
const iaResult = ref<'correct' | 'wrong' | 'paid' | 'ignored' | null>(null)

onMounted(() => {
  const raw = history.state?.level
  if (!raw) {
    router.replace({ name: 'level-select' })
    return
  }
  level.value = JSON.parse(raw) as GeneratedLevel
  const seed = history.state?.seed ?? Date.now()
  const rng = mulberry32(seed + 1)
  options.value = generateDistractors(
    level.value.curves,
    level.value.endpoint,
    level.value.interval,
    rng,
  )
})

const equations = computed(() => {
  if (!level.value) return []
  return level.value.curves.map((c) => curveToLatex(c))
})

const intervalStr = computed(() => {
  if (!level.value) return ''
  const [a, b] = level.value.interval
  return `[${a.toFixed(1)}, ${b.toFixed(1)}]`
})

function selectOption(index: number) {
  if (answered.value) return
  selectedIndex.value = index
}

function submitAnswer() {
  if (selectedIndex.value === null || !level.value) return
  answered.value = true
  const chosen = options.value[selectedIndex.value]
  iaResult.value = chosen.isCorrect ? 'correct' : 'wrong'
}

function payToSkip() {
  answered.value = true
  iaResult.value = 'paid'
}

function ignoreAndProceed() {
  answered.value = true
  iaResult.value = 'ignored'
}

function startGame() {
  router.push({
    name: 'game',
    state: {
      level: JSON.stringify(level.value),
      iaResult: iaResult.value,
    },
  })
}
</script>

<template>
  <div v-if="level" class="ia-view">
    <h1>Find the Intersection Point</h1>
    <p class="subtitle">All paths share exactly one common point in {{ intervalStr }}. Where is it?</p>

    <div class="equations">
      <div v-for="(eq, i) in equations" :key="i" class="equation-row">
        <span class="path-label">Path {{ i + 1 }}:</span>
        <MathDisplay :latex="eq" />
      </div>
    </div>

    <div class="options-grid">
      <button
        v-for="(opt, i) in options"
        :key="i"
        class="option-btn"
        :class="{
          selected: selectedIndex === i,
          correct: answered && opt.isCorrect,
          wrong: answered && selectedIndex === i && !opt.isCorrect,
        }"
        :disabled="answered"
        @click="selectOption(i)"
      >
        ({{ opt.x.toFixed(2) }}, {{ opt.y.toFixed(2) }})
      </button>
    </div>

    <div v-if="!answered" class="actions">
      <button class="submit-btn" :disabled="selectedIndex === null" @click="submitAnswer">
        Submit Answer
      </button>
      <button class="pay-btn" @click="payToSkip">Pay 50 Gold to Skip</button>
      <button class="ignore-btn" @click="ignoreAndProceed">Proceed (Paths Hidden)</button>
    </div>

    <div v-else class="result">
      <p v-if="iaResult === 'correct'" class="result-correct">Correct! Paths will be visible.</p>
      <p v-else-if="iaResult === 'wrong'" class="result-wrong">
        Wrong! The correct point was ({{ level.endpoint.x.toFixed(2) }}, {{ level.endpoint.y.toFixed(2) }}). Paths will still be visible.
      </p>
      <p v-else-if="iaResult === 'paid'" class="result-paid">Paid 50 gold. Paths will be visible.</p>
      <p v-else class="result-ignored">Paths will be hidden during gameplay.</p>
      <button class="start-btn" @click="startGame">Start Game</button>
    </div>
  </div>
</template>

<style scoped>
.ia-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem;
  color: var(--text-primary);
  min-height: 100vh;
  background: var(--stone-dark);
}

h1 {
  font-size: 1.8rem;
  color: var(--gold-bright);
  margin-bottom: 0.5rem;
}

.subtitle {
  color: var(--axis);
  margin-bottom: 1.5rem;
}

.equations {
  background: var(--stone-light);
  border: 1px solid var(--grid-line);
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 2rem;
  min-width: 300px;
}

.equation-row {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 0.6rem;
}

.equation-row:last-child {
  margin-bottom: 0;
}

.path-label {
  font-weight: bold;
  min-width: 60px;
  color: var(--axis);
}

.options-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.8rem;
  margin-bottom: 1.5rem;
  max-width: 500px;
  width: 100%;
}

.option-btn {
  padding: 0.8rem;
  background: var(--stone-light);
  border: 2px solid var(--grid-line);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.option-btn:hover:not(:disabled) {
  border-color: var(--axis);
}

.option-btn.selected {
  border-color: var(--tower-cannon);
  background: var(--option-selected);
}

.option-btn.correct {
  border-color: var(--hp-green);
  background: var(--correct-bg);
}

.option-btn.wrong {
  border-color: var(--hp-red);
  background: var(--wrong-bg);
}

.actions {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: center;
}

.submit-btn {
  padding: 0.7rem 1.5rem;
  background: var(--tower-cannon);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pay-btn {
  padding: 0.7rem 1.5rem;
  background: var(--hp-yellow);
  color: var(--stone-dark);
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.ignore-btn {
  padding: 0.7rem 1.5rem;
  background: transparent;
  color: var(--axis);
  border: 1px solid var(--grid-line);
  border-radius: 6px;
  cursor: pointer;
}

.result {
  text-align: center;
}

.result-correct { color: var(--hp-green); font-size: 1.1rem; }
.result-wrong { color: var(--hp-red); font-size: 1.1rem; }
.result-paid { color: var(--hp-yellow); font-size: 1.1rem; }
.result-ignored { color: var(--axis); font-size: 1.1rem; }

.start-btn {
  margin-top: 1rem;
  padding: 0.8rem 2rem;
  font-size: 1.1rem;
  background: var(--tower-cannon);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
</style>
