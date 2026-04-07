<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useUiStore } from '@/stores/uiStore'
import { useGameStore } from '@/stores/gameStore'
import { TOWER_PARAM_FIELDS, FUNCTION_CANNON_UPGRADED_FIELDS } from '@/data/ui-defs'
import { TOWER_DEFS } from '@/data/tower-defs'
import { TowerType, Events } from '@/data/constants'
import MatrixInputPanel from './MatrixInputPanel.vue'
import IntegralPanel from './IntegralPanel.vue'
import FourierPanel from './FourierPanel.vue'

const uiStore = useUiStore()
const gameStore = useGameStore()

const tower = computed(() => {
  const id = uiStore.buildPanelTowerId
  if (!id) return null
  return gameStore.getEngine()?.towers.find((t) => t.id === id) ?? null
})

const towerDef = computed(() =>
  tower.value ? TOWER_DEFS[tower.value.type as TowerType] : null,
)

/** Whether this tower type has a specialized panel */
const hasSpecialPanel = computed(() => {
  const type = tower.value?.type
  return type === TowerType.MATRIX_LINK
    || type === TowerType.INTEGRAL_CANNON
    || type === TowerType.FOURIER_SHIELD
})

const fields = computed(() => {
  const t = tower.value
  if (!t) return []
  // Specialized panels handle their own fields
  if (hasSpecialPanel.value) return []
  if (t.type === TowerType.FUNCTION_CANNON && t.level >= 2) {
    return FUNCTION_CANNON_UPGRADED_FIELDS
  }
  return TOWER_PARAM_FIELDS[t.type as TowerType] ?? []
})

const localParams = ref<Record<string, number>>({})

watch(tower, (t) => {
  if (!t) return
  // For specialized panels, load ALL param fields from ui-defs
  const paramDefs = hasSpecialPanel.value
    ? (TOWER_PARAM_FIELDS[t.type as TowerType] ?? [])
    : fields.value
  const result: Record<string, number> = {}
  for (const field of paramDefs) {
    result[field.key] = (t.params[field.key] as number) ?? field.default
  }
  localParams.value = result
}, { immediate: true })

function updateParam(key: string, value: number): void {
  localParams.value[key] = value
}

function castSpell(): void {
  const game = gameStore.getEngine()
  const t = tower.value
  if (!game || !t) return
  for (const [k, v] of Object.entries(localParams.value)) {
    t.params[k] = v
  }
  game.eventBus.emit(Events.CAST_SPELL, t)
  uiStore.buildPanelVisible = false
}

function close(): void {
  uiStore.buildPanelVisible = false
  uiStore.buildPanelTowerId = null
}
</script>

<template>
  <div v-if="tower && towerDef" class="build-panel rune-panel">
    <header class="panel-header">
      <span class="panel-title" :style="{ color: towerDef.color }">
        {{ towerDef.nameEn }}
      </span>
      <button class="close-btn" @click="close">✕</button>
    </header>

    <p class="math-concept">{{ towerDef.mathConcept }}</p>

    <!-- Specialized panels for advanced towers -->
    <MatrixInputPanel
      v-if="tower.type === TowerType.MATRIX_LINK"
      :params="localParams"
      @update="updateParam"
    />
    <IntegralPanel
      v-else-if="tower.type === TowerType.INTEGRAL_CANNON"
      :params="localParams"
      @update="updateParam"
    />
    <FourierPanel
      v-else-if="tower.type === TowerType.FOURIER_SHIELD"
      :params="localParams"
      @update="updateParam"
    />

    <!-- Generic param fields for simpler towers -->
    <div v-else-if="fields.length > 0" class="param-list">
      <label v-for="field in fields" :key="field.key" class="param-row">
        <span class="param-label">{{ field.label }}</span>
        <input
          v-model.number="localParams[field.key]"
          class="rune-input"
          type="number"
          :min="field.min"
          :max="field.max"
          :step="field.step"
        />
        <span class="param-math">{{ field.mathLabel }}</span>
      </label>
    </div>
    <p v-else class="no-params">此塔無需設定參數</p>

    <button class="btn cast-btn" @click="castSpell">✦ Cast Spell</button>
  </div>
</template>

<style scoped>
.build-panel {
  position: absolute;
  right: 16px;
  bottom: 64px;
  width: 270px;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title { font-size: 12px; letter-spacing: 2px; }

.close-btn {
  background: none;
  border: none;
  color: var(--axis);
  cursor: pointer;
  font-size: 14px;
}

.math-concept { font-size: 10px; color: var(--axis); letter-spacing: 1px; }

.param-list { display: flex; flex-direction: column; gap: 8px; }

.param-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.param-label { flex: 1; color: #e8dcc8; font-size: 10px; }
.rune-input  { width: 70px; }
.param-math  { width: 24px; text-align: center; color: var(--gold); font-style: italic; font-size: 13px; }
.no-params   { font-size: 10px; color: var(--axis); }

.cast-btn { width: 100%; letter-spacing: 4px; font-size: 12px; }
</style>
