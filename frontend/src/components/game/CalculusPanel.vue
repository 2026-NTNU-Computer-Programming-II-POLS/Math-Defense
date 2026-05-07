<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { Events } from '@/data/constants'
import { CALCULUS_OP_COST } from '@/systems/CalculusTowerSystem'
import type { CalculusTowerSystem, MonomialPreset } from '@/systems/CalculusTowerSystem'

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
    const removes = newC === 0 || p.exponent === 0
    const disables = !removes && newN === 0
    const breaks = removes || disables
    const derivExpr = removes ? '0' : fmtMono(newC, newN)
    return { trait, count, derivExpr, derivBreaks: breaks }
  }),
)

interface OpPreview {
  expr: string
  outcome: 'ok' | 'disable' | 'remove'
}

function previewOp(op: 'derivative' | 'derivative2' | 'integral'): OpPreview | null {
  const s = calcState.value
  if (!s) return null
  let nc: number, nn: number
  if (op === 'derivative') { nc = s.coefficient * s.exponent; nn = s.exponent - 1 }
  else if (op === 'derivative2') { nc = s.coefficient * s.exponent * (s.exponent - 1); nn = s.exponent - 2 }
  else { nc = roundUi(s.coefficient / (s.exponent + 1)); nn = s.exponent + 1 }

  if (nc === 0 || (op === 'derivative' && s.exponent === 0)) {
    return { expr: '0', outcome: 'remove' }
  }
  if (nn === 0) return { expr: `${nc}`, outcome: 'disable' }
  return { expr: fmtMono(nc, nn), outcome: 'ok' }
}

const opDeriv = computed(() => previewOp('derivative'))
const opDeriv2 = computed(() => previewOp('derivative2'))
const opInteg = computed(() => previewOp('integral'))

const currentTrait = computed<TraitKey | null>(() => {
  const s = calcState.value
  return s ? traitFromExp(s.exponent) : null
})

function selectPreset(index: number) {
  const engine = gameStore.getEngine()
  if (!engine) return
  engine.eventBus.emit(Events.CALCULUS_OPERATION, { towerId: props.towerId, presetIndex: index })
}

function applyOp(op: 'derivative' | 'derivative2' | 'integral') {
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
      <div class="op-btns">
        <button
          class="btn op-btn"
          :disabled="!canAffordOp"
          :title="opDeriv ? `f' = ${opDeriv.expr}` : ''"
          @click="applyOp('derivative')"
        >
          <span class="op-label">f'</span>
          <span v-if="opDeriv" class="op-preview" :class="`op-preview--${opDeriv.outcome}`">
            → {{ opDeriv.expr }}
            <span v-if="opDeriv.outcome === 'remove'" class="op-tag">removes</span>
            <span v-else-if="opDeriv.outcome === 'disable'" class="op-tag">disables</span>
          </span>
        </button>
        <button
          class="btn op-btn"
          :disabled="!canAffordOp"
          :title="opDeriv2 ? `f'' = ${opDeriv2.expr}` : ''"
          @click="applyOp('derivative2')"
        >
          <span class="op-label">f''</span>
          <span v-if="opDeriv2" class="op-preview" :class="`op-preview--${opDeriv2.outcome}`">
            → {{ opDeriv2.expr }}
            <span v-if="opDeriv2.outcome === 'remove'" class="op-tag">removes</span>
            <span v-else-if="opDeriv2.outcome === 'disable'" class="op-tag">disables</span>
          </span>
        </button>
        <button
          class="btn op-btn"
          :disabled="!canAffordOp"
          :title="opInteg ? `∫f = ${opInteg.expr}` : ''"
          @click="applyOp('integral')"
        >
          <span class="op-label">∫f</span>
          <span v-if="opInteg" class="op-preview" :class="`op-preview--${opInteg.outcome}`">
            → {{ opInteg.expr }}
          </span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.calc-panel { display: flex; flex-direction: column; gap: 8px; }
.section-label { font-size: 11px; color: var(--axis); margin: 0; }

.trait-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 10px;
  color: #c8b894;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.03);
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
.preset-fn { font-size: 13px; }
.preset-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  color: #c8b894;
  font-family: var(--font-sans, inherit);
}
.trait-label { font-weight: 600; }
.preset-deriv {
  margin-left: auto;
  font-family: var(--font-mono);
  color: #8a7a5e;
  font-size: 10px;
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
  font-size: 13px;
  color: var(--gold);
  margin: 0;
  font-family: var(--font-mono);
}
.coeff-info {
  font-size: 11px;
  color: #e8dcc8;
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
  font-size: 10px;
  color: #c8b894;
}

.chain-cost { font-size: 11px; margin: 0; color: var(--gold); }
.chain-cost--free { color: #6ee7b7; }
.chain-cost--broke { color: var(--hp-red); }

.hint { font-size: 10px; color: #8a7a5e; margin: 0; }

.op-btns { display: flex; gap: 6px; }
.op-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  padding: 6px 4px;
}
.op-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.op-label { font-size: 14px; font-family: var(--font-mono); }
.op-preview {
  font-size: 9px;
  font-family: var(--font-mono);
  color: #8a7a5e;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}
.op-preview--disable { color: var(--gold); }
.op-preview--remove { color: var(--hp-red); }
.op-tag {
  font-family: var(--font-sans, inherit);
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
