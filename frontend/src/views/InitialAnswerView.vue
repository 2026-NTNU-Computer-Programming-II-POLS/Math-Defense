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
    <div class="card ia-card">
      <div class="ia-head">
        <h1 class="title-main">Find the Intersection</h1>
        <p class="motto">
          A correct answer sharpens your score exponent and unlocks the
          Legendary tier.
        </p>
      </div>

      <div class="section-label">The curves</div>
      <div
        v-for="(eq, i) in equations"
        :key="i"
        class="math-block"
      >
        <MathDisplay :latex="eq" />
      </div>

      <div class="section-label">Region</div>
      <div class="math-block">
        <MathDisplay :latex="regionLatex" />
      </div>

      <div class="section-label">Your answer</div>
      <div class="grid-2">
        <div class="field">
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
        <div class="field">
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

      <div v-if="!answered" class="btn-stack ia-actions">
        <button class="btn btn-primary submit-btn" @click="submitAnswer">
          <span class="icon">✓</span>
          <span class="label">Submit Answer</span>
        </button>
        <button class="btn pay-btn" @click="payToSkip">
          <span class="icon">⌬</span>
          <span class="label">Pay 50 Gold to Skip</span>
          <span class="hint">Star-5 stays locked</span>
        </button>
        <button class="btn btn-ghost ignore-btn" @click="ignoreAndProceed">
          Proceed (Paths Hidden)
        </button>
      </div>
      <p v-if="!answered && validationMsg" class="validation-msg">{{ validationMsg }}</p>

      <div v-if="answered" class="result">
        <p v-if="iaResult === 'correct'" class="result-correct">
          Correct! Paths will be visible.
        </p>
        <p v-else-if="iaResult === 'wrong'" class="result-wrong">
          Wrong! The correct point was <MathDisplay :latex="endpointLatex" />.
          Paths will still be visible.
        </p>
        <p v-else-if="iaResult === 'paid'" class="result-paid">
          Paid 50 gold. Paths will be visible.
        </p>
        <p v-else class="result-ignored">Paths will be hidden during gameplay.</p>
        <button class="btn btn-primary start-btn" @click="startGame">
          <span class="icon">▶</span>
          <span class="label">Start Game</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ia-view {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 48px 20px;
}

/* ── Card ── */
.card {
  background: rgba(220, 229, 237, 0.86);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: var(--shadow);
  padding: 26px;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.ia-card {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

.ia-head {
  text-align: center;
  margin-bottom: 4px;
}

.title-main {
  font-family: var(--font-mono);
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--charcoal);
  letter-spacing: 2px;
  line-height: 1.1;
}

.motto {
  font-size: 0.98rem;
  color: var(--charcoal-soft);
  letter-spacing: 0.5px;
  font-style: italic;
  margin-top: 6px;
}

/* ── Section labels ── */
.section-label {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 4px;
  color: var(--charcoal-soft);
  text-transform: uppercase;
  margin: 22px 0 12px;
}

.section-label::after {
  content: "";
  flex: 1;
  height: 0;
  border-top: 1px dashed var(--line-strong);
}

/* ── Math blocks ── */
.math-block {
  background: rgba(245, 250, 254, 0.9);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 14px 18px;
  font-family: 'Cambria', 'Times New Roman', serif;
  font-size: 1.1rem;
  text-align: center;
  margin: 10px 0;
}

.math-block :deep(em) {
  color: var(--terracotta-deep);
  font-style: italic;
}

/* ── Answer fields ── */
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.field {
  margin-bottom: 14px;
}

.field label {
  display: block;
  font-size: 0.82rem;
  color: var(--charcoal-soft);
  margin-bottom: 6px;
  font-weight: 500;
}

.field input {
  width: 100%;
  padding: 12px 14px;
  font-family: var(--font-main);
  font-size: 0.95rem;
  background: rgba(245, 250, 254, 0.85);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  color: var(--charcoal);
}

.field input:focus {
  outline: none;
  border-color: var(--terracotta);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(168, 188, 203, 0.28);
}

.field input:disabled {
  opacity: 0.6;
}

.parse-error {
  display: inline-block;
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--clay-deep);
}

.validation-msg {
  margin-top: 10px;
  color: var(--clay-deep);
  font-size: 0.85rem;
  text-align: center;
}

/* ── Buttons ── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-family: var(--font-main);
  font-size: 0.95rem;
  font-weight: 600;
  padding: 10px 18px;
  min-height: 44px;
  border: 1px solid rgba(111, 138, 161, 0.4);
  border-radius: 10px;
  background: rgba(245, 250, 254, 0.78);
  color: var(--charcoal);
  cursor: pointer;
  letter-spacing: 0.4px;
  transition: all 0.16s ease;
  box-shadow: var(--shadow-sm);
  white-space: nowrap;
  text-transform: none;
}

.btn:hover {
  background: #fff;
  border-color: var(--terracotta);
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(111, 138, 161, 0.24);
}

.btn:focus-visible {
  outline: 2px solid var(--terracotta-deep);
  outline-offset: 2px;
}

.btn .icon {
  font-family: var(--font-mono);
  font-size: 1.05rem;
  color: var(--terracotta-deep);
  flex-shrink: 0;
}

.btn .label {
  flex: 0 0 auto;
}

.btn .hint {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  letter-spacing: 2px;
  color: var(--muted);
  margin-left: 6px;
}

.btn-primary {
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-soft) 100%);
  color: #fff;
  border: 1px solid var(--gold-deep);
  font-size: 1rem;
  letter-spacing: 1.2px;
  min-height: 50px;
  padding: 12px 22px;
  box-shadow: 0 8px 20px rgba(122, 113, 86, 0.36);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
}

.btn-primary .icon {
  color: #fff;
  font-size: 1.1rem;
}

.btn-primary:hover {
  background: linear-gradient(135deg, var(--gold-soft) 0%, var(--gold) 100%);
  box-shadow: 0 12px 28px rgba(122, 113, 86, 0.44);
}

.btn-ghost {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--charcoal-soft);
  font-size: 0.88rem;
  min-height: 38px;
  padding: 7px 14px;
}

.btn-ghost:hover {
  background: rgba(245, 250, 254, 0.6);
  color: var(--charcoal);
}

.btn-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn-stack > .btn {
  width: 100%;
}

.ia-actions {
  margin-top: 10px;
}

/* ── Result ── */
.result {
  text-align: center;
  margin-top: 18px;
}

.result-correct { color: var(--sage-deep); font-size: 1rem; }
.result-wrong { color: var(--clay-deep); font-size: 1rem; }
.result-paid { color: var(--gold-deep); font-size: 1rem; }
.result-ignored { color: var(--slate-deep); font-size: 1rem; }

.start-btn {
  margin-top: 14px;
}
</style>
