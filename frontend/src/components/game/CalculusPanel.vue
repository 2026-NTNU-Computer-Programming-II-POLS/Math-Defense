<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { Events } from '@/data/constants'
import { CALCULUS_OP_COST } from '@/systems/CalculusTowerSystem'
import type { CalculusTowerSystem, MonomialPreset } from '@/systems/CalculusTowerSystem'
import { applyCalcOp, checkMonomialAnswer } from '@/math/monomial'
import type { CalcOp } from '@/math/monomial'
import { TOWER_DEFS } from '@/data/tower-defs'
import { TowerType } from '@/data/constants'

const props = defineProps<{ towerId: string }>()
const gameStore = useGameStore()

const tower = computed(() => {
  const engine = gameStore.getEngine()
  return engine?.towers.find((t) => t.id === props.towerId) ?? null
})

const presets = computed((): MonomialPreset[] => {
  const t = tower.value
  if (!t) return []
  const engine = gameStore.getEngine()
  const sys = engine?.getSystem('calculusTower') as CalculusTowerSystem | undefined
  return sys?.generatePresets(t) ?? []
})

const calcState = computed(() => gameStore.calculusStates[props.towerId] ?? null)
const hasState = computed(() => !!calcState.value)
const isChainOp = computed(() => !!calcState.value?.opApplied)
const canAffordOp = computed(() => !isChainOp.value || gameStore.gold >= CALCULUS_OP_COST)

type TraitKey = 'slow' | 'fast' | 'heavy' | 'basic'
// Trait dot colours mirror the identity colour of the tower each trait evokes
// (n=1 → Radar B, n=2 → Matrix, n=3 → Limit); sourced from TOWER_DEFS so the
// panel and the on-canvas pet (PetRenderer) stay in sync from one palette.
const TRAIT_INFO: Record<TraitKey, { label: string; color: string; desc: string }> = {
  slow:  { label: 'Slow',  color: TOWER_DEFS[TowerType.RADAR_B].color, desc: 'Slows enemies in range' },
  fast:  { label: 'Fast',  color: TOWER_DEFS[TowerType.MATRIX].color, desc: 'Low dmg, fast attack' },
  heavy: { label: 'Heavy', color: TOWER_DEFS[TowerType.LIMIT].color, desc: 'High dmg, slow attack' },
  basic: { label: 'Basic', color: '#a3a3a3', desc: 'Standard pet' },
}

function traitFromExp(n: number): TraitKey {
  if (n === 1) return 'slow'
  if (n === 2) return 'fast'
  if (n === 3) return 'heavy'
  return 'basic'
}

function petCount(c: number): number {
  return Number.isInteger(c) && c > 0 ? c : 1
}

// Preset display surfaces only the strategic facts — pet trait (from n) and pet
// count (from C). The derivative result is deliberately NOT pre-computed here:
// that is the math the student solves at the operation step.
const presetMeta = computed(() =>
  presets.value.map((p) => ({
    trait: traitFromExp(p.exponent),
    count: petCount(p.coefficient),
  })),
)

// The minimal f(x) = x fallback — a fresh tower or the state a collapsed
// operation lands in. Surfaced so the student knows to grow it again.
const isMinimalState = computed(() => {
  const s = calcState.value
  return !!s && s.coefficient === 1 && s.exponent === 1 && s.currentExpr === 'x'
})

const currentTrait = computed<TraitKey | null>(() => {
  const s = calcState.value
  return s ? traitFromExp(s.exponent) : null
})

function selectPreset(index: number) {
  const engine = gameStore.getEngine()
  if (!engine) return
  engine.eventBus.emit(Events.CALCULUS_OPERATION, { towerId: props.towerId, presetIndex: index })
}

// ── Operation quiz ──
// f', f'', and ∫f mutate the tower's monomial in-place and are irreversible.
// The student must compute the result themselves: pick an operation, type the
// resulting monomial, and only a correct answer commits the op. For a chain op
// the gold is spent on commit, so a wrong answer costs nothing — see the
// CalculusTowerSystem charge logic.
const OP_ORDER = ['derivative', 'derivative2', 'integral'] as const
const OP_LABEL: Record<CalcOp, string> = {
  derivative: "f'",
  derivative2: "f''",
  integral: '∫f',
}

const selectedOp = ref<CalcOp | null>(null)
const typedAnswer = ref('')
const errorMsg = ref('')

// A committed op (or any external state change) clears the in-progress quiz so
// a stale answer can't be submitted against the new function.
watch(calcState, () => {
  selectedOp.value = null
  typedAnswer.value = ''
  errorMsg.value = ''
})

function selectOp(op: CalcOp) {
  if (!canAffordOp.value) return
  // Clicking the active operation again cancels it.
  selectedOp.value = selectedOp.value === op ? null : op
  typedAnswer.value = ''
  errorMsg.value = ''
}

function cancelOp() {
  selectedOp.value = null
  typedAnswer.value = ''
  errorMsg.value = ''
}

const activeOpLabel = computed(() => (selectedOp.value ? OP_LABEL[selectedOp.value] : ''))

const activePrompt = computed(() => {
  const op = selectedOp.value
  if (!op) return ''
  const expr = calcState.value?.currentExpr ?? 'x'
  if (op === 'derivative') return `d/dx ( ${expr} )`
  if (op === 'derivative2') return `d²/dx² ( ${expr} )`
  return `∫ ( ${expr} ) dx`
})

// The indefinite integral's answer omits the constant of integration. A typed
// "+ C" is unparseable (C is not a known symbol), so the integral prompt says
// so up-front rather than rejecting a mathematically-rigorous student.
const quizSubLabel = computed(() =>
  selectedOp.value === 'integral'
    ? 'Type the resulting monomial (omit the + C):'
    : 'Type the resulting monomial:',
)

function submitAnswer() {
  errorMsg.value = ''
  const op = selectedOp.value
  const s = calcState.value
  if (!op || !s) return
  if (!canAffordOp.value) {
    errorMsg.value = `Not enough gold — a chain operation costs ${CALCULUS_OP_COST}g.`
    return
  }
  const expected = applyCalcOp({ coefficient: s.coefficient, exponent: s.exponent }, op)
  const verdict = checkMonomialAnswer(typedAnswer.value, expected)
  if (verdict === 'unparseable') {
    errorMsg.value = 'Could not read that. Use forms like 6x, 6x^2, -x, or 12.'
    return
  }
  if (verdict === 'incorrect') {
    errorMsg.value = 'Incorrect — re-apply the power rule and try again.'
    return
  }
  // Correct: commit. The system applies the op, charges a chain op, and emits
  // CALCULUS_STATE_CHANGED — the watcher above then resets the quiz.
  const engine = gameStore.getEngine()
  if (!engine) return
  engine.eventBus.emit(Events.CALCULUS_OPERATION, { towerId: props.towerId, operation: op })
}
</script>

<template>
  <div class="calc-panel">
    <template v-if="!hasState">
      <p class="section-label">Choose f(x) — coefficient = pet count, exponent = pet type</p>
      <div class="trait-legend">
        <span v-for="key in (['slow','fast','heavy'] as const)" :key="key" class="legend-item">
          <span class="trait-dot" :style="{ background: TRAIT_INFO[key].color }"></span>
          n={{ key === 'slow' ? 1 : key === 'fast' ? 2 : 3 }} {{ TRAIT_INFO[key].label }}
        </span>
      </div>
      <div class="preset-list">
        <button
          v-for="(p, i) in presets"
          :key="i"
          class="btn preset-btn"
          @click="selectPreset(i)"
        >
          <span class="preset-fn">f(x) = {{ p.expr }}</span>
          <span class="preset-meta">
            <span class="trait-dot" :style="{ background: TRAIT_INFO[presetMeta[i].trait].color }"></span>
            <span class="trait-label">
              {{ presetMeta[i].count }}× {{ TRAIT_INFO[presetMeta[i].trait].label }}
            </span>
          </span>
        </button>
      </div>
      <p class="hint">
        First operation is <strong>free</strong>; each chain op costs {{ CALCULUS_OP_COST }}g.
      </p>
    </template>

    <template v-else>
      <p class="current-fn">
        f(x) = {{ calcState?.currentExpr }}
      </p>
      <p class="coeff-info">
        C = {{ calcState?.coefficient }}, n = {{ calcState?.exponent }}
        <span v-if="currentTrait" class="trait-inline">
          <span class="trait-dot" :style="{ background: TRAIT_INFO[currentTrait].color }"></span>
          {{ TRAIT_INFO[currentTrait].label }} — {{ TRAIT_INFO[currentTrait].desc }}
        </span>
      </p>
      <p v-if="isChainOp" class="chain-cost" :class="{ 'chain-cost--broke': !canAffordOp }">
        Next op: {{ CALCULUS_OP_COST }}g{{ canAffordOp ? '' : ' (insufficient)' }}
      </p>
      <p v-else class="chain-cost chain-cost--free">
        Next op: free (first operation)
      </p>
      <p v-if="isMinimalState" class="minimal-hint" data-testid="calc-minimal-hint">
        Function is at the minimal <code>f(x) = x</code> — pick an operation to grow it again.
      </p>

      <p class="section-label">Pick an operation, then solve it to apply:</p>
      <div class="op-btns">
        <button
          v-for="op in OP_ORDER"
          :key="op"
          :class="['btn', 'op-btn', { 'op-btn--active': selectedOp === op }]"
          :disabled="!canAffordOp"
          :data-testid="`calc-op-${op}`"
          @click="selectOp(op)"
        >
          <span class="op-label">{{ OP_LABEL[op] }}</span>
        </button>
      </div>

      <!-- The quiz: the student types the operation's result. The panel never
           shows the answer — it only grades what is entered. A wrong answer is
           rejected with no cost; a correct answer commits the operation. -->
      <form v-if="selectedOp" class="op-quiz" @submit.prevent="submitAnswer">
        <p class="quiz-prompt" data-testid="calc-quiz-prompt">{{ activePrompt }} = ?</p>
        <p class="quiz-sub">{{ quizSubLabel }}</p>
        <div class="quiz-entry">
          <input
            v-model="typedAnswer"
            class="quiz-input"
            type="text"
            placeholder="e.g. 6x^2, -x, (5/2)x^3, 12"
            data-testid="calc-answer-input"
            @input="errorMsg = ''"
          />
          <button class="btn quiz-submit" type="submit" data-testid="calc-answer-submit">Apply</button>
        </div>
        <p v-if="errorMsg" class="quiz-error" data-testid="calc-answer-error">{{ errorMsg }}</p>
        <p class="quiz-hint">
          A correct answer applies <strong>{{ activeOpLabel }}</strong><span v-if="isChainOp"> and spends {{ CALCULUS_OP_COST }}g</span>.
          A wrong answer costs nothing — try again.
        </p>
        <button type="button" class="quiz-cancel" @click="cancelOp">Cancel</button>
      </form>
    </template>
  </div>
</template>

<style scoped>
.calc-panel { display: flex; flex-direction: column; gap: 8px; }
.section-label { font-size: var(--text-xs); color: var(--charcoal-soft); margin: 0; }

.trait-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  padding: 4px 6px;
  background: rgba(79, 74, 72, 0.05);
  border-radius: 6px;
}
.legend-item { display: inline-flex; align-items: center; gap: 4px; }

.preset-list { display: flex; flex-direction: column; gap: 4px; }
.preset-btn {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
  padding: 8px;
  font-family: var(--font-mono);
  text-align: left;
}
.preset-fn { font-size: var(--text-lg); }
.preset-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  font-family: var(--font-sans, inherit);
}
.trait-label { font-weight: 600; }

.trait-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
}

.current-fn {
  font-size: var(--text-lg);
  color: var(--terracotta-deep);
  margin: 0;
  font-family: var(--font-mono);
}
.coeff-info {
  font-size: var(--text-xs);
  color: var(--charcoal);
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.trait-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
}

.chain-cost { font-size: var(--text-xs); margin: 0; color: var(--gold-deep); }
.chain-cost--free { color: var(--sage-deep); }
.chain-cost--broke { color: var(--clay-deep); }

.hint { font-size: var(--text-2xs); color: var(--charcoal-soft); margin: 0; }

.op-btns { display: flex; gap: 6px; }
.op-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 4px;
}
.op-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.op-btn--active {
  border-color: var(--gold-bright);
  background: rgba(255, 215, 0, 0.18);
  box-shadow: inset 0 0 0 1px var(--gold-bright);
}
.op-label { font-size: var(--text-lg); font-family: var(--font-mono); }

.op-quiz {
  margin-top: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(173, 162, 132, 0.12);
  border: 1px solid var(--gold-deep);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.quiz-prompt {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--gold-bright);
  margin: 0;
  line-height: 1.4;
}
.quiz-sub {
  font-size: var(--text-2xs);
  color: var(--text-primary);
  opacity: 0.7;
  margin: 0;
}
.quiz-entry { display: flex; gap: 6px; }
.quiz-input {
  flex: 1;
  padding: 6px;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  background: var(--cream-soft);
  color: #ffffff;
  border: 1px solid var(--gold);
  border-radius: 4px;
}
.quiz-submit { font-size: var(--text-xs); padding: 6px 12px; }
.quiz-error { font-size: var(--text-xs); color: #ff7a7a; margin: 0; }
.quiz-hint {
  font-size: var(--text-2xs);
  color: var(--text-primary);
  opacity: 0.6;
  margin: 0;
  line-height: 1.4;
}
.quiz-cancel {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 2px 0;
  font-size: var(--text-xs);
  color: var(--axis);
  cursor: pointer;
  text-decoration: underline;
}

.minimal-hint {
  font-size: var(--text-2xs);
  margin: 0;
  color: var(--charcoal-soft);
  line-height: 1.4;
}
.minimal-hint code {
  background: rgba(111, 138, 161, 0.14);
  padding: 1px 4px;
  border-radius: 3px;
  color: var(--terracotta-deep);
  font-family: var(--font-mono);
}
</style>
