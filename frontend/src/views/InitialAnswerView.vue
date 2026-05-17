<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import MathDisplay from '@/components/common/MathDisplay.vue'
import { curveToLatex } from '@/math/curve-evaluator'
import { parseFraction, rationalEquals, numberToRational, fractionToLatex } from '@/math/rational'
import type { GeneratedLevel } from '@/math/curve-types'
import { parseLevelJson } from '@/utils/parseHistoryState'

const router = useRouter()

const level = ref<GeneratedLevel | null>(null)
const inputX = ref('')
const inputY = ref('')
const validationMsg = ref('')
const answered = ref(false)
const iaResult = ref<'correct' | 'wrong' | 'paid' | 'ignored' | null>(null)
const territoryContext = ref<string | undefined>(undefined)


onMounted(() => {
  const raw = history.state?.level
  if (!raw) {
    router.replace({ name: 'level-select' })
    return
  }
  const parsed = parseLevelJson(raw)
  if (!parsed) {
    router.replace({ name: 'level-select' })
    return
  }
  territoryContext.value = history.state?.territoryContext as string | undefined
  level.value = parsed
})

const equations = computed(() => {
  if (!level.value) return []
  return level.value.curves.map((c) => curveToLatex(c))
})

// The disclosure region is a dyadic rectangle covering P*; render its bounds as
// exact fractions so the player solves against the same numbers they see.
const regionLatex = computed(() => {
  if (!level.value) return ''
  const r = level.value.region
  const xs = `${fractionToLatex(r.xMin)} \\le x \\le ${fractionToLatex(r.xMax)}`
  const ys = `${fractionToLatex(r.yMin)} \\le y \\le ${fractionToLatex(r.yMax)}`
  return `${xs}, \\quad ${ys}`
})

const endpointLatex = computed(() => {
  if (!level.value) return ''
  return `\\left(${fractionToLatex(level.value.endpoint.x)},\\ ${fractionToLatex(level.value.endpoint.y)}\\right)`
})

const parsedX = computed(() => parseFraction(inputX.value))
const parsedY = computed(() => parseFraction(inputY.value))

function submitAnswer() {
  if (!level.value) return
  const px = parsedX.value
  const py = parsedY.value
  if (!px || !py) {
    validationMsg.value = 'Enter both coordinates as fractions (e.g. 3/2), integers, or exact decimals.'
    return
  }
  validationMsg.value = ''
  answered.value = true
  const correct =
    rationalEquals(px, numberToRational(level.value.endpoint.x)) &&
    rationalEquals(py, numberToRational(level.value.endpoint.y))
  iaResult.value = correct ? 'correct' : 'wrong'
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
      territoryContext: territoryContext.value,
      // Forward the per-session deterministic seed so the engine can re-seed
      // its in-game RNG (game.rng) before the first LEVEL_START handler runs.
      // Required by Backlog §24 replay; see Game.setSeed / useGameLoop wiring.
      seed: history.state?.seed,
    },
  })
}
</script>

<template>
  <div v-if="level" class="ia-view">
    <h1>Find the Intersection Point</h1>
    <p class="subtitle">All paths share exactly one common point. It lies in the region:</p>
    <div class="region"><MathDisplay :latex="regionLatex" /></div>

    <div class="equations">
      <div v-for="(eq, i) in equations" :key="i" class="equation-row">
        <span class="path-label">Path {{ i + 1 }}:</span>
        <MathDisplay :latex="eq" />
      </div>
    </div>

    <div class="answer-inputs">
      <div class="input-row">
        <label for="ia-input-x">x =</label>
        <input
          id="ia-input-x"
          v-model="inputX"
          type="text"
          placeholder="e.g. 3/2"
          :disabled="answered"
          @keyup.enter="submitAnswer"
        />
        <span v-if="inputX.trim() && !parsedX" class="parse-error">invalid</span>
      </div>
      <div class="input-row">
        <label for="ia-input-y">y =</label>
        <input
          id="ia-input-y"
          v-model="inputY"
          type="text"
          placeholder="e.g. -5/4"
          :disabled="answered"
          @keyup.enter="submitAnswer"
        />
        <span v-if="inputY.trim() && !parsedY" class="parse-error">invalid</span>
      </div>
    </div>

    <div v-if="!answered" class="actions">
      <button class="submit-btn" @click="submitAnswer">Submit Answer</button>
      <button class="pay-btn" @click="payToSkip">Pay 50 Gold to Skip</button>
      <button class="ignore-btn" @click="ignoreAndProceed">Proceed (Paths Hidden)</button>
    </div>
    <p v-if="!answered && validationMsg" class="validation-msg">{{ validationMsg }}</p>

    <div v-if="answered" class="result">
      <p v-if="iaResult === 'correct'" class="result-correct">Correct! Paths will be visible.</p>
      <p v-else-if="iaResult === 'wrong'" class="result-wrong">
        Wrong! The correct point was <MathDisplay :latex="endpointLatex" />. Paths will still be visible.
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
  min-height: 100dvh;
  background: var(--bg-base);
}

h1 {
  font-size: 1.8rem;
  color: var(--gold);
  text-shadow: var(--gold-shadow);
  margin-bottom: 0.5rem;
}

.subtitle {
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  margin-bottom: 1.5rem;
}

.equations {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
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
  text-shadow: var(--gold-shadow);
}

.region {
  margin-bottom: 1.5rem;
  font-size: 1.1rem;
}

.answer-inputs {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  margin-bottom: 1.5rem;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.input-row label {
  font-weight: bold;
  min-width: 36px;
  color: var(--axis);
  text-shadow: var(--gold-shadow);
}

.input-row input {
  padding: 0.5rem 0.7rem;
  background: rgba(255, 255, 255, 0.85);
  border: 2px solid var(--card-border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 1rem;
  width: 160px;
}

.input-row input:focus {
  outline: none;
  border-color: var(--tower-cannon);
}

.input-row input:disabled {
  opacity: 0.6;
}

.parse-error {
  color: var(--hp-red);
  font-size: 0.85rem;
}

.validation-msg {
  margin-top: 0.8rem;
  color: var(--hp-red);
  font-size: 0.9rem;
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

.pay-btn {
  padding: 0.7rem 1.5rem;
  background: var(--hp-yellow);
  color: var(--text-on-accent);
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.ignore-btn {
  padding: 0.7rem 1.5rem;
  background: transparent;
  color: var(--axis);
  text-shadow: var(--gold-shadow);
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  cursor: pointer;
}

.result {
  text-align: center;
}

.result-correct { color: var(--hp-green); font-size: 1.1rem; }
.result-wrong { color: var(--hp-red); font-size: 1.1rem; }
.result-paid { color: var(--hp-yellow); font-size: 1.1rem; }
.result-ignored { color: var(--axis); text-shadow: var(--gold-shadow); font-size: 1.1rem; }

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
