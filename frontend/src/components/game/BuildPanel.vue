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
  const engine = gameStore.getEngine()
  if (!engine) return null
  return engine.towers.find((t) => t.id === id) ?? null
})

const bossTarget = computed(() => uiStore.bossShieldTarget)

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
  // Defensive: TowerFactory always sets level=1, but a hand-crafted or legacy
  // tower could still land here without it — fall back to level 1 rather than
  // blowing up on `undefined >= 2`.
  if (t.type === TowerType.FUNCTION_CANNON && (t.level ?? 1) >= 2) {
    return FUNCTION_CANNON_UPGRADED_FIELDS
  }
  return TOWER_PARAM_FIELDS[t.type as TowerType] ?? []
})

const localParams = ref<Record<string, number>>({})

watch(tower, (t) => {
  // Reset first so a stale key from the previous tower can't leak into the
  // new panel between the null-check and the final assignment (F-11). This
  // also covers the case where tower.value briefly becomes null during a
  // close-then-reopen from a different placement click.
  localParams.value = {}
  if (!t) return
  // Determine specialPanel from the new tower's type directly (not from the computed,
  // which may still reflect the previous tower in the same microtask).
  const type = t.type as TowerType
  const isSpecial = type === TowerType.MATRIX_LINK
    || type === TowerType.INTEGRAL_CANNON
    || type === TowerType.FOURIER_SHIELD
  const paramDefs = isSpecial
    ? (TOWER_PARAM_FIELDS[type] ?? [])
    : fields.value
  const result: Record<string, number> = {}
  for (const field of paramDefs) {
    const v = t.params[field.key]
    result[field.key] = typeof v === 'number' && Number.isFinite(v) ? v : field.default
  }
  localParams.value = result
}, { immediate: true })

function updateParam(key: string, value: number): void {
  localParams.value[key] = value
}

// Fourier Shield: as the player tunes sliders, push the live match score to CombatSystem.
// CombatSystem queues the attempt if the boss shield isn't active yet, then breaks it
// the moment the shield triggers if match >= 70.
function onFourierMatch(score: number): void {
  const game = gameStore.getEngine()
  if (!game) return
  game.eventBus.emit(Events.BOSS_SHIELD_ATTEMPT, { match: score })
}

function castSpell(): void {
  const game = gameStore.getEngine()
  const t = tower.value
  if (!game || !t) return
  // Dispatch intent only; CombatSystem owns the param apply + configured flip
  // so simulation state stays the single responsibility of the Systems layer.
  game.eventBus.emit(Events.TOWER_PARAMS_SET, {
    towerId: t.id,
    params: { ...localParams.value },
  })
  // Hide the panel but keep the towerId so a re-open (e.g. clicking the
  // same tower again) still finds the previous selection in place.
  uiStore.hideBuildPanel()
}

function close(): void {
  uiStore.closeBuildPanel()
}

// U-2: refund a misclicked tower. Removes from game.towers, refunds cost,
// and asks BuffSystem to drop any active buffs tagged to the id so they
// can't silently hit a recycled slot. Gated to BUILD so a stale open panel
// can't be exploited for mid-wave refunds.
const canRefund = computed(() => gameStore.isBuilding)

function refundTower(): void {
  if (!canRefund.value) return
  const game = gameStore.getEngine()
  const t = tower.value
  if (!game || !t) return
  const idx = game.towers.findIndex((x) => x.id === t.id)
  if (idx < 0) return
  game.towers.splice(idx, 1)
  game.changeGold(t.cost)
  game.getSystem('buff')?.onTowerRemoved(game, t.id)
  uiStore.closeBuildPanel()
}
</script>

<template>
  <!-- Unknown tower type: surface an explicit error so a legacy/renamed type
       can't silently swallow the panel on click. -->
  <div v-if="tower && !towerDef" class="build-panel rune-panel">
    <header class="panel-header">
      <span class="panel-title unknown-title">Unknown Tower</span>
      <button class="close-btn" aria-label="Close panel" @click="close">
        <span aria-hidden="true">✕</span>
      </button>
    </header>
    <p class="unknown-body">
      No definition for tower type <code>{{ tower.type }}</code>.
      This is a bug — refund to remove it.
    </p>
    <div class="panel-actions">
      <button
        v-if="canRefund"
        class="btn refund-btn"
        aria-label="Refund Tower"
        @click="refundTower"
      >⟲ Refund</button>
    </div>
  </div>

  <div v-else-if="tower && towerDef" class="build-panel rune-panel">
    <header class="panel-header">
      <span class="panel-title" :style="{ color: towerDef.color }">
        {{ towerDef.nameEn }}
      </span>
      <button class="close-btn" aria-label="Close panel" @click="close">
        <span aria-hidden="true">✕</span>
      </button>
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
      :target-freqs="bossTarget?.freqs"
      :target-amps="bossTarget?.amps"
      @update="updateParam"
      @match="onFourierMatch"
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
    <p v-else class="no-params">No parameters required</p>

    <div class="panel-actions">
      <button
        v-if="canRefund"
        class="btn refund-btn"
        aria-label="Refund Tower"
        @click="refundTower"
      >
        ⟲ Refund
      </button>
      <button class="btn cast-btn" aria-label="Cast Spell" @click="castSpell">
        <span aria-hidden="true">✦</span> Cast Spell
      </button>
    </div>
  </div>
</template>

<style scoped>
.build-panel {
  position: absolute;
  right: 16px;
  bottom: calc(var(--tower-bar-height, 64px) + 12px);
  width: 270px;
  max-width: calc(100vw - 32px);
  max-height: calc(100% - var(--tower-bar-height, 64px) - 96px);
  overflow-y: auto;
  z-index: var(--z-floating);
  display: flex;
  flex-direction: column;
  gap: 12px;
  /* U-5: placement confirmation cue — pop the panel in so the player sees
     the state change after a silent click. Respect reduced-motion. */
  animation: build-panel-pop 0.22s ease-out;
  transform-origin: bottom right;
}

@keyframes build-panel-pop {
  0%   { opacity: 0; transform: scale(0.92) translateY(8px); }
  60%  { opacity: 1; transform: scale(1.015); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}

@media (prefers-reduced-motion: reduce) {
  .build-panel { animation: none; }
}

/* Narrow viewports (R-1): pin to both edges so the panel never clips
   off the right side on phones. */
@media (max-width: 360px) {
  .build-panel {
    right: 12px;
    left: 12px;
    width: auto;
    max-width: none;
  }
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title { font-size: 12px; letter-spacing: 2px; }
.unknown-title { color: var(--hp-red); }
.unknown-body {
  font-size: 11px;
  color: #e8dcc8;
  line-height: 1.5;
}
.unknown-body code {
  color: var(--hp-red);
  font-family: var(--font-mono);
}

.close-btn {
  background: none;
  border: none;
  color: var(--axis);
  cursor: pointer;
  font-size: 14px;
  /* ≥44px hit target for touch (A-3) */
  min-width: 44px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* Visible focus indicator for keyboard users (A-2) */
.close-btn:focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
}

.math-concept { font-size: 11px; color: var(--axis); letter-spacing: 1px; }

.param-list { display: flex; flex-direction: column; gap: 8px; }

.param-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.param-label { flex: 1; color: #e8dcc8; font-size: 11px; }
/* T-5: width is defined once in global.css (.rune-input); no scoped override. */
.param-math  { width: 24px; text-align: center; color: var(--gold); font-style: italic; font-size: 13px; }
.no-params   { font-size: 11px; color: var(--axis); }

.panel-actions { display: flex; gap: 8px; }
.refund-btn {
  flex: 0 0 auto;
  letter-spacing: 2px;
  font-size: 11px;
  padding: 8px 12px;
  min-height: 36px;
  border-color: var(--hp-red);
  color: var(--hp-red);
}
.refund-btn:hover { background: var(--hp-red); color: var(--stone-dark); }
.cast-btn { flex: 1; letter-spacing: 4px; font-size: 12px; }
</style>
