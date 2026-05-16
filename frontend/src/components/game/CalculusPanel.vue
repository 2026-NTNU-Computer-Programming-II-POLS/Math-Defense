<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { Events } from '@/data/constants'
import { CALCULUS_OP_COST } from '@/systems/CalculusTowerSystem'
import type { CalculusTowerSystem, MonomialPreset } from '@/systems/CalculusTowerSystem'

type CalcOp = 'derivative' | 'derivative2' | 'integral'

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
const TRAIT_INFO: Record<TraitKey, { label: string; color: string; desc: string }> = {
  slow:  { label: 'Slow',  color: '#60a5fa', desc: 'Slows enemies in range' },
  fast:  { label: 'Fast',  color: '#facc15', desc: 'Low dmg, fast attack' },
  heavy: { label: 'Heavy', color: '#ef4444', desc: 'High dmg, slow attack' },
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

function fmtMono(c: number, n: number): string {
  if (n === 0) return `${c}`
  if (n === 1) return c === 1 ? 'x' : c === -1 ? '-x' : `${c}x`
  return c === 1 ? `x^${n}` : c === -1 ? `-x^${n}` : `${c}x^${n}`
}

function roundUi(v: number): number {
  return Math.round(v * 1e4) / 1e4
}

interface PresetPreview {
  trait: TraitKey
  count: number
  derivExpr: string
  derivBreaks: boolean
}

const presetPreviews = computed(() =>
  presets.value.map((p): PresetPreview => {
    const trait = traitFromExp(p.exponent)
    const count = petCount(p.coefficient)
    const newC = p.coefficient * p.exponent
    const newN = p.exponent - 1
    const collapses = newC === 0 || p.exponent === 0 || newN === 0
    const derivExpr = newC === 0 ? '0' : fmtMono(newC, newN)
    return { trait, count, derivExpr, derivBreaks: collapses }
  }),
)

interface OpPreview {
  expr: string
  outcome: 'ok' | 'collapse'
}

function previewOp(op: 'derivative' | 'derivative2' | 'integral'): OpPreview | null {
  const s = calcState.value
  if (!s) return null
  let nc: number, nn: number
  if (op === 'derivative') { nc = s.coefficient * s.exponent; nn = s.exponent - 1 }
  else if (op === 'derivative2') { nc = s.coefficient * s.exponent * (s.exponent - 1); nn = s.exponent - 2 }
  else { nc = roundUi(s.coefficient / (s.exponent + 1)); nn = s.exponent + 1 }

  if (nc === 0 || (op === 'derivative' && s.exponent === 0)) {
    return { expr: '0', outcome: 'collapse' }
  }
  if (nn === 0) return { expr: `${nc}`, outcome: 'collapse' }
  return { expr: fmtMono(nc, nn), outcome: 'ok' }
}

const opDeriv = computed(() => previewOp('derivative'))
const opDeriv2 = computed(() => previewOp('derivative2'))
const opInteg = computed(() => previewOp('integral'))

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

// Two-step confirm flow for irreversible ops. f', f'', and ∫f mutate the
// tower's polynomial in-place; once committed, there is no rollback (a chain op
// also costs gold). The first click stages an op; the second commits.
const pendingOp = ref<CalcOp | null>(null)

// Reset confirmation if the calculus state changes (op committed elsewhere,
// preset chosen, etc.) so a stale pending action doesn't fire on next click.
watch(calcState, () => { pendingOp.value = null })

function opPreviewFor(op: CalcOp): OpPreview | null {
  if (op === 'derivative')  return opDeriv.value
  if (op === 'derivative2') return opDeriv2.value
  return opInteg.value
}

function clickOp(op: CalcOp) {
  if (!canAffordOp.value) return
  if (pendingOp.value !== op) {
    pendingOp.value = op
    return
  }
  // Confirmed — commit.
  pendingOp.value = null
  const engine = gameStore.getEngine()
  if (!engine) return
  engine.eventBus.emit(Events.CALCULUS_OPERATION, { towerId: props.towerId, operation: op })
}

function cancelPending() {
  pendingOp.value = null
}

function pendingPreview() {
  return pendingOp.value ? opPreviewFor(pendingOp.value) : null
}

function pendingLabel(op: CalcOp): string {
  if (op === 'derivative')  return "f'"
  if (op === 'derivative2') return "f''"
  return '∫f'
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
            <span class="trait-dot" :style="{ background: TRAIT_INFO[presetPreviews[i].trait].color }"></span>
            <span class="trait-label">
              {{ presetPreviews[i].count }}× {{ TRAIT_INFO[presetPreviews[i].trait].label }}
            </span>
            <span
              class="preset-deriv"
              :class="{ 'preset-deriv--warn': presetPreviews[i].derivBreaks }"
            >
              f' = {{ presetPreviews[i].derivExpr }}<span v-if="presetPreviews[i].derivBreaks"> ⚠</span>
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
      <div class="op-btns">
        <button
          :class="['btn', 'op-btn', { 'op-btn--pending': pendingOp === 'derivative' }]"
          :disabled="!canAffordOp"
          :title="opDeriv ? `f' = ${opDeriv.expr}` : ''"
          @click="clickOp('derivative')"
        >
          <span class="op-label">f'</span>
          <span v-if="opDeriv" class="op-preview" :class="`op-preview--${opDeriv.outcome}`">
            → {{ opDeriv.expr }}
            <span v-if="opDeriv.outcome === 'collapse'" class="op-tag">collapses</span>
          </span>
        </button>
        <button
          :class="['btn', 'op-btn', { 'op-btn--pending': pendingOp === 'derivative2' }]"
          :disabled="!canAffordOp"
          :title="opDeriv2 ? `f'' = ${opDeriv2.expr}` : ''"
          @click="clickOp('derivative2')"
        >
          <span class="op-label">f''</span>
          <span v-if="opDeriv2" class="op-preview" :class="`op-preview--${opDeriv2.outcome}`">
            → {{ opDeriv2.expr }}
            <span v-if="opDeriv2.outcome === 'collapse'" class="op-tag">collapses</span>
          </span>
        </button>
        <button
          :class="['btn', 'op-btn', { 'op-btn--pending': pendingOp === 'integral' }]"
          :disabled="!canAffordOp"
          :title="opInteg ? `∫f = ${opInteg.expr}` : ''"
          @click="clickOp('integral')"
        >
          <span class="op-label">∫f</span>
          <span v-if="opInteg" class="op-preview" :class="`op-preview--${opInteg.outcome}`">
            → {{ opInteg.expr }}
          </span>
        </button>
      </div>

      <!-- Two-step confirm prevents costly mis-clicks. The pending op is
           highlighted above; this banner makes the consequences explicit
           (especially a collapse) and offers a one-click cancel. -->
      <div v-if="pendingOp" class="confirm-banner" :class="{
        'confirm-banner--collapse': pendingPreview()?.outcome === 'collapse',
      }">
        <p class="confirm-text">
          Apply <strong>{{ pendingLabel(pendingOp) }}</strong>
          <span v-if="pendingPreview()"> → <code>{{ pendingPreview()?.expr }}</code></span>
          <span v-if="pendingPreview()?.outcome === 'collapse'" class="confirm-warn">
            — the function collapses; the tower resets to <code>f(x) = x</code>
            (free — pick another operation after).
          </span>
          <span v-else class="confirm-info">— irreversible.</span>
        </p>
        <div class="confirm-actions">
          <!-- Gold can drop between staging and confirming (other costs in
               the BUILD phase). Mirror the op-button gate so a doomed click
               can't stall on a no-op silently. -->
          <button
            class="btn confirm-yes"
            :disabled="!canAffordOp"
            @click="clickOp(pendingOp)"
          >Confirm{{ canAffordOp ? '' : ' (need gold)' }}</button>
          <button class="btn confirm-no" @click="cancelPending">取消</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.calc-panel { display: flex; flex-direction: column; gap: 8px; }
.section-label { font-size: var(--text-xs); color: var(--axis); margin: 0; }

.trait-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: var(--text-2xs);
  color: var(--text-primary);
  opacity: 0.8;
  padding: 4px 6px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
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
  color: var(--text-primary);
  opacity: 0.7;
  font-family: var(--font-sans, inherit);
}
.trait-label { font-weight: 600; }
.preset-deriv {
  margin-left: auto;
  font-family: var(--font-mono);
  color: var(--text-primary);
  opacity: 0.6;
  font-size: var(--text-2xs);
}
.preset-deriv--warn { color: var(--hp-red); }

.trait-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.current-fn {
  font-size: var(--text-lg);
  color: var(--gold);
  margin: 0;
  font-family: var(--font-mono);
}
.coeff-info {
  font-size: var(--text-xs);
  color: var(--text-primary);
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
  color: var(--text-primary);
  opacity: 0.8;
}

.chain-cost { font-size: var(--text-xs); margin: 0; color: var(--gold); }
.chain-cost--free { color: #6ee7b7; }
.chain-cost--broke { color: var(--hp-red); }

.hint { font-size: var(--text-2xs); color: var(--text-primary); opacity: 0.5; margin: 0; }

.op-btns { display: flex; gap: 6px; }
.op-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: var(--text-xs);
  padding: 6px 4px;
}
.op-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.op-btn--pending {
  border-color: var(--gold-bright);
  background: rgba(255, 215, 0, 0.18);
  box-shadow: inset 0 0 0 1px var(--gold-bright);
  animation: op-btn-pulse 1.2s ease-in-out infinite;
}
@keyframes op-btn-pulse {
  0%, 100% { box-shadow: inset 0 0 0 1px var(--gold-bright); }
  50%      { box-shadow: inset 0 0 0 1px var(--gold-bright), 0 0 8px rgba(255, 215, 0, 0.5); }
}
@media (prefers-reduced-motion: reduce) {
  .op-btn--pending { animation: none; }
}
.op-label { font-size: var(--text-lg); font-family: var(--font-mono); }
.op-preview {
  font-size: var(--text-2xs);
  font-family: var(--font-mono);
  color: var(--text-primary);
  opacity: 0.7;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}
.op-preview--collapse { color: var(--gold); }
.op-tag {
  font-family: var(--font-sans, inherit);
  font-size: var(--text-2xs);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.confirm-banner {
  margin-top: 4px;
  padding: 8px 10px;
  border-radius: 4px;
  background: rgba(212, 168, 64, 0.1);
  border: 1px solid var(--gold);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.confirm-banner--collapse {
  background: rgba(212, 168, 64, 0.15);
  border-color: var(--gold-bright);
}
.confirm-text {
  font-size: var(--text-xs);
  margin: 0;
  color: var(--text-primary);
  line-height: 1.4;
}
.confirm-text code {
  background: rgba(0, 0, 0, 0.3);
  padding: 1px 4px;
  border-radius: 3px;
  color: var(--gold-bright);
  font-family: var(--font-mono);
}
.confirm-warn { color: var(--gold); }
.confirm-info { color: var(--gold); }
.confirm-actions { display: flex; gap: 6px; justify-content: flex-end; }
.confirm-yes,
.confirm-no {
  font-size: var(--text-xs);
  padding: 6px 12px;
  min-height: 32px;
}

.minimal-hint {
  font-size: var(--text-2xs);
  margin: 0;
  color: var(--text-primary);
  opacity: 0.7;
  line-height: 1.4;
}
.minimal-hint code {
  background: rgba(0, 0, 0, 0.3);
  padding: 1px 4px;
  border-radius: 3px;
  color: var(--gold-bright);
  font-family: var(--font-mono);
}
</style>
