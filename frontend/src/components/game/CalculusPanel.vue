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
      <p class="section-label">Choose a function:</p>
      <div class="preset-list">
        <button
          v-for="(p, i) in presets"
          :key="i"
          class="btn preset-btn"
          @click="selectPreset(i)"
        >f(x) = {{ p.expr }}</button>
      </div>
    </template>

    <template v-else>
      <p class="current-fn">
        Current: f(x) = {{ calcState?.currentExpr }}
      </p>
      <p class="coeff-info">
        C = {{ calcState?.coefficient }}, n = {{ calcState?.exponent }}
      </p>
      <p v-if="isChainOp" class="chain-cost" :class="{ 'chain-cost--broke': !canAffordOp }">
        Chain op: {{ CALCULUS_OP_COST }}g
      </p>
      <div class="op-btns">
        <button class="btn" :disabled="!canAffordOp" @click="applyOp('derivative')">f'</button>
        <button class="btn" :disabled="!canAffordOp" @click="applyOp('derivative2')">f''</button>
        <button class="btn" :disabled="!canAffordOp" @click="applyOp('integral')">∫f</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.calc-panel { display: flex; flex-direction: column; gap: 8px; }
.section-label { font-size: 11px; color: var(--axis); margin: 0; }
.preset-list { display: flex; flex-direction: column; gap: 4px; }
.preset-btn { font-size: 12px; padding: 8px; font-family: var(--font-mono); }
.current-fn { font-size: 13px; color: var(--gold); margin: 0; font-family: var(--font-mono); }
.coeff-info { font-size: 11px; color: #e8dcc8; margin: 0; }
.chain-cost { font-size: 11px; color: var(--gold); margin: 0; }
.chain-cost--broke { color: var(--hp-red); }
.op-btns { display: flex; gap: 6px; }
.op-btns .btn { flex: 1; font-size: 11px; padding: 8px; }
.op-btns .btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
