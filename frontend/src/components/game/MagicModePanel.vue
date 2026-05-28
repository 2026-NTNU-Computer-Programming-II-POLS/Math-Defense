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
  // Engine towers are plain objects; depend on towerUpgradeTick so this
  // computed re-runs when magic mode / configured flips (see gameStore). The
  // snapshot spread yields a NEW reference each tick so Vue re-renders the
  // mode toggle's active state — returning the mutated engine object directly
  // would compare equal by identity and the highlight would never move.
  void gameStore.towerUpgradeTick
  const engine = gameStore.getEngine()
  const t = engine?.towers.find((t) => t.id === props.towerId)
  return t ? { ...t } : null
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

// Reset only when the panel switches to a different tower — keyed on towerId,
// not the tower snapshot, so a mode toggle (which bumps towerUpgradeTick and
// produces a fresh snapshot every tick) doesn't wipe an in-progress, not-yet-
// applied expression or the slider coefficients.
watch(() => props.towerId, () => {
  inputExpr.value = tower.value?.magicExpression ?? ''
  error.value = ''
  // The defaults match the identity polynomial f(x) = x², a sensible start.
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
    <!-- MODE — debuff/buff is stored on the tower from creation, so the
         toggle is shown immediately rather than waiting for a curve. -->
    <div v-if="tower" class="mode-card">
      <p class="section-label">Mode</p>
      <div class="mode-btns">
        <button
          class="btn mode-btn mode-btn--debuff"
          :class="{ active: tower.magicMode === 'debuff' }"
          :aria-pressed="tower.magicMode === 'debuff'"
          @click="toggleMode('debuff')"
        >Debuff Zone</button>
        <button
          class="btn mode-btn mode-btn--buff"
          :class="{ active: tower.magicMode === 'buff' }"
          :aria-pressed="tower.magicMode === 'buff'"
          @click="toggleMode('buff')"
        >Buff Zone</button>
      </div>
    </div>

    <!-- FUNCTION — Backlog §20 slider-fallback / practice mode. -->
    <div v-if="sliderFallback" class="fn-card slider-fn-input">
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
    <div v-else class="fn-card">
      <p class="section-label">Function f(x)</p>
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
        allowed: sqrt · abs · exp · pi ·
        <span :class="{ 'fn-locked': !trigUnlocked }">sin · cos · tan</span> ·
        <span :class="{ 'fn-locked': !logUnlocked }">log · ln</span>
        · use * for multiply
      </p>
      <p v-if="error" class="error-msg">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.magic-panel { display: flex; flex-direction: column; gap: 8px; }
.section-label {
  font-family: var(--font-mono);
  font-size: var(--text-2xs);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--charcoal-soft);
  margin: 0;
}
/* MODE / FUNCTION sub-cards — pale rounded surface matching the stats card. */
.mode-card,
.fn-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--card-surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
}
.input-row { display: flex; gap: 4px; }
.fn-field {
  flex: 1;
  font-size: var(--text-xs);
  padding: 8px 10px;
  background: var(--cream-soft);
  color: var(--charcoal);
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  outline: none;
}
.fn-field::placeholder { color: var(--muted); }
.fn-field:focus { border-color: var(--terracotta); box-shadow: 0 0 0 3px rgba(168, 188, 203, 0.28); }
.apply-btn { font-size: var(--text-xs); padding: 6px 10px; }
.hint { font-size: var(--text-2xs); color: var(--charcoal-soft); margin: 0; }
.fn-locked { color: var(--clay-deep); opacity: 0.85; text-decoration: line-through; }
.error-msg { font-size: var(--text-xs); color: var(--clay-deep); margin: 0; }
/* Magic mode toggle — both options share one style; only the hue differs,
   carried by the per-button `--mode-c*` custom properties. A radio-style dot
   (hollow → filled) plus an outline ring is the toggle indicator so the active
   mode is unambiguous. */
.mode-btns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 6px; }
.mode-btn {
  --mode-c: var(--tw-magic-debuff);
  --mode-c-deep: var(--tw-magic-debuff-deep);
  --mode-c-soft: var(--tw-magic-debuff-soft);
  gap: 6px;
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 8px 10px;
  min-height: 0;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  background: #fff;
  color: var(--charcoal);
  box-shadow: none;
  cursor: pointer;
  transition: all 0.14s ease;
  text-transform: none;
  /* `.btn` defaults to `white-space: nowrap`; combined with grid 1fr that
     means the min-content of each label sets the column floor. Allow wrap +
     drop the floor to 0 so the panel never overflows the 320px drawer. */
  white-space: normal;
  min-width: 0;
}
.mode-btn--buff {
  --mode-c: var(--tw-magic-buff);
  --mode-c-deep: var(--tw-magic-buff-deep);
  --mode-c-soft: var(--tw-magic-buff-soft);
}
/* Radio-style toggle indicator. */
.mode-btn::before {
  content: '';
  flex: 0 0 auto;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid var(--mode-c-deep);
  background: transparent;
  transition: background 0.14s ease;
}
.mode-btn:hover {
  border-color: var(--mode-c-deep);
  background: #fff;
  transform: none;
  box-shadow: none;
}
.mode-btn.active {
  border-color: var(--mode-c-deep);
  background: var(--mode-c-soft);
  font-weight: 700;
  box-shadow: 0 0 0 2px var(--mode-c-deep);
}
.mode-btn.active::before {
  background: var(--mode-c-deep);
}
.slider-fn-input { gap: 6px; }
/* Slider label carries the live a·x²+b·x+c formula — keep it readable
   (no uppercasing) unlike the plain MODE / FUNCTION caps labels. */
.slider-fn-input .section-label { text-transform: none; letter-spacing: 0.5px; }
.slider-row { display: flex; flex-direction: column; gap: 4px; }
.slider-cell { display: grid; grid-template-columns: 14px 1fr 28px; align-items: center; gap: 6px; }
.slider-name { font-size: var(--text-xs); color: var(--terracotta-deep); font-style: italic; }
.slider-ctrl { accent-color: var(--terracotta); cursor: pointer; }
.slider-val { font-size: var(--text-xs); color: var(--charcoal); font-family: var(--font-mono); text-align: right; }
.formula-readout {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--terracotta-deep);
  background: rgba(245, 250, 254, 0.85);
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  margin: 0;
}
</style>
