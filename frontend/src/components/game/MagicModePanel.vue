<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { Events } from '@/data/constants'
import { parseExpression } from '@/math/expressionParser'
import { achievementService } from '@/services/achievementService'
import type { MagicMode } from '@/data/tower-defs'

const props = defineProps<{ towerId: string }>()
const gameStore = useGameStore()
const uiStore = useUiStore()

// Backlog §20 — slider-fallback (practice) mode replaces the free-form
// expression input with three coefficient sliders for `a*x^2 + b*x + c`.
// Reduces math anxiety for dyscalculic learners (Ashcraft & Krause 2007) at
// the cost of making the run leaderboard-ineligible.
const sliderFallback = computed(() => uiStore.sliderFallbackEnabled)
const coeffA = ref(1)
const coeffB = ref(0)
const coeffC = ref(0)
function fmtCoeff(v: number): string {
  // -0 reads weirdly in the live-formula readout; collapse to 0.
  return Object.is(v, -0) ? '0' : String(v)
}
const sliderExpression = computed(() => `${coeffA.value}*x^2 + ${coeffB.value}*x + ${coeffC.value}`)

const tower = computed(() => {
  const engine = gameStore.getEngine()
  return engine?.towers.find((t) => t.id === props.towerId) ?? null
})

const inputExpr = ref('')
const error = ref('')

// Curve-family gating (Pedagogical_Backlog_Spec.md §6) — new players see only
// polynomial expressions; trig and log functions unlock via achievements
// earned on Star-1 and Star-2 clears respectively. Achievement evaluation
// already runs server-side on session completion, so this only needs to read
// the current unlocked set.
const trigUnlocked = ref(false)
const logUnlocked = ref(false)

onMounted(async () => {
  try {
    const ids = await achievementService.unlockedIds()
    trigUnlocked.value = ids.has('unlock_trig_curves')
    logUnlocked.value = ids.has('unlock_log_curves')
  } catch {
    // Treat fetch failure as conservative-locked rather than blocking the panel.
  }
})

// Match the parser's vocabulary exactly (expressionParser.ts uses
// case-sensitive \bsin\b / \blog\b / etc.). A case-insensitive match here
// would surface "locked" for `Sin(x)` even though the parser would have
// already failed the input as invalid — confusing the player.
const TRIG_RE = /\b(?:sin|cos|tan)\b/
const LOG_RE = /\b(?:log|ln)\b/

// F-BUG-17: bound user-supplied expressions before parsing. Anything longer
// or more deeply nested than this isn't a real player input — it's either an
// accidental paste or a stress probe, and the parser/evaluator can spend
// significant CPU on pathological inputs (catastrophic backtracking, deep
// recursion). 256 chars + 16-deep parens easily covers the most elaborate
// curve students compose in practice.
const MAX_EXPRESSION_LENGTH = 256
const MAX_PAREN_DEPTH = 16

function parenDepth(s: string): number {
  let depth = 0
  let max = 0
  for (const ch of s) {
    if (ch === '(') {
      depth++
      if (depth > max) max = depth
    } else if (ch === ')') {
      if (depth > 0) depth--
    }
  }
  return max
}

const placeholder = computed(() => {
  if (trigUnlocked.value) return 'e.g. 2*x^2 + 3*sin(x)  (use * for multiply)'
  return 'e.g. 2*x^2 - x + 5  (use * for multiply)'
})

// Render a parabola translated to pass through the tower position. The world
// origin sits at canvas centre so both coordinates can be negative; emit clean
// math notation rather than literal `(x - -3)^2 + -5`.
const translatedExample = computed(() => {
  const t = tower.value
  if (!t) return ''
  const h = t.x
  const k = t.y
  const inner = h === 0 ? 'x' : h > 0 ? `x - ${h}` : `x + ${-h}`
  const base = h === 0 ? 'x^2' : `(${inner})^2`
  if (k === 0) return base
  return k > 0 ? `${base} + ${k}` : `${base} - ${-k}`
})

watch(tower, (t) => {
  inputExpr.value = t?.magicExpression ?? ''
  error.value = ''
  // Reset sliders when switching towers so a previous tower's coefficients
  // don't bleed into a freshly-opened panel. The defaults match the
  // identity polynomial f(x) = x², which is a sensible starting curve.
  coeffA.value = 1
  coeffB.value = 0
  coeffC.value = 0
}, { immediate: true })

function applyFunction() {
  if (inputExpr.value.length > MAX_EXPRESSION_LENGTH) {
    error.value = `Expression too long (max ${MAX_EXPRESSION_LENGTH} characters)`
    return
  }
  if (parenDepth(inputExpr.value) > MAX_PAREN_DEPTH) {
    error.value = `Expression nested too deeply (max ${MAX_PAREN_DEPTH} levels)`
    return
  }
  if (!trigUnlocked.value && TRIG_RE.test(inputExpr.value)) {
    error.value = 'Trig functions locked — clear a Star-1 level to unlock'
    return
  }
  if (!logUnlocked.value && LOG_RE.test(inputExpr.value)) {
    error.value = 'Log functions locked — clear a Star-2 level to unlock'
    return
  }
  if (!parseExpression(inputExpr.value)) {
    error.value = 'Invalid expression'
    return
  }
  error.value = ''
  const engine = gameStore.getEngine()
  if (!engine) return
  engine.eventBus.emit(Events.MAGIC_FUNCTION_SELECTED, {
    towerId: props.towerId,
    expression: inputExpr.value,
  })
}

function applySliderFunction() {
  // Slider mode emits a known-good polynomial straight to the engine; no
  // parser-error surface needed because the values are bounded by the inputs.
  error.value = ''
  const engine = gameStore.getEngine()
  if (!engine) return
  engine.eventBus.emit(Events.MAGIC_FUNCTION_SELECTED, {
    towerId: props.towerId,
    expression: sliderExpression.value,
  })
}

function toggleMode(mode: MagicMode) {
  const engine = gameStore.getEngine()
  if (!engine) return
  engine.eventBus.emit(Events.MAGIC_MODE_CHANGED, { towerId: props.towerId, mode })
}
</script>

<template>
  <div class="magic-panel">
    <!-- Backlog §20 — slider-fallback / practice mode. -->
    <div v-if="sliderFallback" class="fn-input slider-fn-input">
      <p class="section-label">Function f(x): a · x² + b · x + c</p>
      <div class="slider-row">
        <label class="slider-cell">
          <span class="slider-name">a</span>
          <input v-model.number="coeffA" type="range" min="-3" max="3" step="1" class="slider-ctrl" />
          <span class="slider-val">{{ fmtCoeff(coeffA) }}</span>
        </label>
        <label class="slider-cell">
          <span class="slider-name">b</span>
          <input v-model.number="coeffB" type="range" min="-5" max="5" step="1" class="slider-ctrl" />
          <span class="slider-val">{{ fmtCoeff(coeffB) }}</span>
        </label>
        <label class="slider-cell">
          <span class="slider-name">c</span>
          <input v-model.number="coeffC" type="range" min="-5" max="5" step="1" class="slider-ctrl" />
          <span class="slider-val">{{ fmtCoeff(coeffC) }}</span>
        </label>
      </div>
      <p class="formula-readout">f(x) = {{ sliderExpression }}</p>
      <button class="btn apply-btn" @click="applySliderFunction">Apply</button>
      <p class="hint">Practice mode — runs do not appear on the global leaderboard.</p>
    </div>
    <div v-else class="fn-input">
      <p class="section-label">Function f(x):</p>
      <p v-if="tower" class="hint origin-hint" data-testid="magic-origin-hint">
        Curve is plotted in world coordinates (origin = (0, 0)).
        This tower sits at ({{ tower.x }}, {{ tower.y }}) — to pass the curve
        through it, translate manually, e.g. <code>{{ translatedExample }}</code>.
      </p>
      <div class="input-row">
        <input
          v-model="inputExpr"
          class="fn-field"
          :placeholder="placeholder"
          :maxlength="MAX_EXPRESSION_LENGTH"
          @keydown.enter="applyFunction"
        />
        <button class="btn apply-btn" @click="applyFunction">Apply</button>
      </div>
      <p class="hint">
        sqrt, abs, exp, pi ·
        <span :class="{ 'fn-locked': !trigUnlocked }">sin, cos, tan{{ trigUnlocked ? '' : ' (locked)' }}</span> ·
        <span :class="{ 'fn-locked': !logUnlocked }">log, ln{{ logUnlocked ? '' : ' (locked)' }}</span>
        · use * for multiply (2*x not 2x)
      </p>
      <p v-if="error" class="error-msg">{{ error }}</p>
    </div>

    <div v-if="tower?.configured" class="mode-select">
      <p class="section-label">Zone Mode:</p>
      <div class="mode-btns">
        <button
          class="btn"
          :class="{ active: tower.magicMode === 'debuff' }"
          @click="toggleMode('debuff')"
        >Debuff Enemies</button>
        <button
          class="btn"
          :class="{ active: tower.magicMode === 'buff' }"
          @click="toggleMode('buff')"
        >Buff Towers</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.magic-panel { display: flex; flex-direction: column; gap: 8px; }
.section-label { font-size: 11px; color: var(--axis); margin: 0; }
.fn-input { display: flex; flex-direction: column; gap: 4px; }
.input-row { display: flex; gap: 4px; }
.fn-field {
  flex: 1;
  font-size: 11px;
  padding: 6px 8px;
  background: var(--stone-dark);
  color: #ffffff;
  border: 1px solid var(--gold);
  border-radius: 4px;
  outline: none;
}
.fn-field::placeholder {color: rgba(255, 255, 255, 0.5); }
.fn-field:focus { border-color: #ffffff; box-shadow: 0 0 5px rgba(255, 215, 0, 0.4); }
.apply-btn { font-size: 11px; padding: 6px 10px; }
.hint { font-size: 10px; color: var(--text-primary); margin: 0; opacity: 0.7; }
.origin-hint code {
  font-family: var(--font-mono, monospace);
  color: var(--gold, #d4a840);
  background: rgba(0, 0, 0, 0.25);
  padding: 0 3px;
  border-radius: 2px;
}
.fn-locked { color: var(--hp-red); opacity: 0.85; text-decoration: line-through; }
.error-msg { font-size: 10px; color: #ff8888; margin: 0; }
.mode-btns { display: flex; gap: 6px; }
.mode-btns .btn { flex: 1; font-size: 10px; padding: 6px; }
.mode-btns .btn.active { background: var(--gold); color: var(--stone-dark); }
.slider-fn-input { gap: 6px; }
.slider-row { display: flex; flex-direction: column; gap: 4px; }
.slider-cell { display: grid; grid-template-columns: 14px 1fr 28px; align-items: center; gap: 6px; }
.slider-name { font-size: 11px; color: var(--gold); font-style: italic; }
.slider-ctrl { accent-color: var(--gold); cursor: pointer; }
.slider-val { font-size: 11px; color: #ffffff; font-family: var(--font-mono); text-align: right; }
.formula-readout {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--gold);
  background: var(--stone-dark);
  padding: 4px 6px;
  border: 1px solid var(--axis);
  border-radius: 3px;
  margin: 0;
}
</style>
