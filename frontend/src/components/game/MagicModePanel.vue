<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { Events } from '@/data/constants'
import { parseExpression } from '@/math/expressionParser'
import type { MagicMode } from '@/data/tower-defs'

const props = defineProps<{ towerId: string }>()
const gameStore = useGameStore()

const tower = computed(() => {
  const engine = gameStore.getEngine()
  return engine?.towers.find((t) => t.id === props.towerId) ?? null
})

const inputExpr = ref('')
const error = ref('')

watch(tower, (t) => {
  inputExpr.value = t?.magicExpression ?? ''
  error.value = ''
}, { immediate: true })

function applyFunction() {
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

function toggleMode(mode: MagicMode) {
  const engine = gameStore.getEngine()
  if (!engine) return
  engine.eventBus.emit(Events.MAGIC_MODE_CHANGED, { towerId: props.towerId, mode })
}
</script>

<template>
  <div class="magic-panel">
    <div class="fn-input">
      <p class="section-label">Function f(x):</p>
      <div class="input-row">
        <input
          v-model="inputExpr"
          class="fn-field"
          placeholder="e.g. 2*x^2 + 3*sin(x)  (use * for multiply)"
          @keydown.enter="applyFunction"
        />
        <button class="btn apply-btn" @click="applyFunction">Apply</button>
      </div>
      <p class="hint">sin, cos, tan, log, ln, sqrt, abs, exp, pi · use * for multiply (2*x not 2x)</p>
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
  color: var(--text);
  border: 1px solid var(--axis);
  border-radius: 4px;
  outline: none;
}
.fn-field:focus { border-color: var(--gold); }
.apply-btn { font-size: 11px; padding: 6px 10px; }
.hint { font-size: 10px; color: var(--axis); margin: 0; opacity: 0.7; }
.error-msg { font-size: 10px; color: #f87171; margin: 0; }
.mode-btns { display: flex; gap: 6px; }
.mode-btns .btn { flex: 1; font-size: 10px; padding: 6px; }
.mode-btns .btn.active { background: var(--gold); color: var(--stone-dark); }
</style>
