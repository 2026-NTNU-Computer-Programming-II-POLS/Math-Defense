<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { Events } from '@/data/constants'
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

const hasState = computed(() => !!tower.value?.calculusState)

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
        Current: f(x) = {{ tower?.calculusState?.currentExpr }}
      </p>
      <p class="coeff-info">
        C = {{ tower?.calculusState?.coefficient }}, n = {{ tower?.calculusState?.exponent }}
      </p>
      <div class="op-btns">
        <button class="btn" @click="applyOp('derivative')">f'</button>
        <button class="btn" @click="applyOp('derivative2')">f''</button>
        <button class="btn" @click="applyOp('integral')">∫f</button>
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
.op-btns { display: flex; gap: 6px; }
.op-btns .btn { flex: 1; font-size: 11px; padding: 8px; }
</style>
