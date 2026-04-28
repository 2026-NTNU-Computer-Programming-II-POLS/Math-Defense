<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { TOWER_DEFS } from '@/data/tower-defs'
import { TowerType, Events } from '@/data/constants'
import type { TowerUpgradeSystem } from '@/systems/TowerUpgradeSystem'
import MagicModePanel from './MagicModePanel.vue'
import RadarConfigPanel from './RadarConfigPanel.vue'
import MatrixPairPanel from './MatrixPairPanel.vue'
import LimitQuestionPanel from './LimitQuestionPanel.vue'
import CalculusPanel from './CalculusPanel.vue'

const gameStore = useGameStore()
const uiStore = useUiStore()

const tower = computed(() => {
  const id = uiStore.buildPanelTowerId
  if (!id) return null
  const engine = gameStore.getEngine()
  return engine?.towers.find((t) => t.id === id) ?? null
})

const towerDef = computed(() =>
  tower.value ? TOWER_DEFS[tower.value.type] : null,
)

const upgradeInfo = computed(() => {
  const t = tower.value
  if (!t) return null
  const engine = gameStore.getEngine()
  const sys = engine?.getSystem('towerUpgrade') as TowerUpgradeSystem | undefined
  if (!sys) return null
  return sys.canUpgrade(t, engine!.state.gold)
})

function upgrade() {
  const engine = gameStore.getEngine()
  const t = tower.value
  if (!engine || !t) return
  engine.eventBus.emit(Events.TOWER_UPGRADE, { towerId: t.id })
}

function close() {
  uiStore.closeBuildPanel()
}

function refundTower() {
  const engine = gameStore.getEngine()
  const t = tower.value
  if (!engine || !t) return
  engine.eventBus.emit(Events.TOWER_REFUND, { towerId: t.id })
  uiStore.closeBuildPanel()
}

const canRefund = computed(() => gameStore.isBuilding)

const isRadar = computed(() => {
  const t = tower.value?.type
  return t === TowerType.RADAR_A || t === TowerType.RADAR_B || t === TowerType.RADAR_C
})
</script>

<template>
  <div v-if="tower && towerDef" class="tower-info-panel rune-panel">
    <header class="panel-header">
      <span class="panel-title" :style="{ color: towerDef.color }">
        {{ towerDef.nameEn }}
      </span>
      <button class="close-btn" aria-label="Close" @click="close">
        <span aria-hidden="true">✕</span>
      </button>
    </header>

    <div class="stats">
      <div class="stat-row"><span>Level</span><span>{{ tower.level }}</span></div>
      <div class="stat-row"><span>Damage</span><span>{{ tower.effectiveDamage.toFixed(1) }}</span></div>
      <div class="stat-row"><span>Range</span><span>{{ tower.effectiveRange.toFixed(1) }}</span></div>
      <div v-if="tower.cooldown > 0" class="stat-row">
        <span>Cooldown</span><span>{{ tower.cooldown.toFixed(2) }}s</span>
      </div>
    </div>

    <p class="math-concept">{{ towerDef.mathConcept }}</p>

    <!-- Type-specific panels -->
    <MagicModePanel v-if="tower.type === TowerType.MAGIC" :tower-id="tower.id" />
    <RadarConfigPanel v-else-if="isRadar" :tower-id="tower.id" />
    <MatrixPairPanel v-else-if="tower.type === TowerType.MATRIX" :tower-id="tower.id" />
    <LimitQuestionPanel v-else-if="tower.type === TowerType.LIMIT" :tower-id="tower.id" />
    <CalculusPanel v-else-if="tower.type === TowerType.CALCULUS" :tower-id="tower.id" />

    <div class="panel-actions">
      <button
        v-if="canRefund"
        class="btn refund-btn"
        @click="refundTower"
      >⟲ Refund</button>

      <button
        v-if="upgradeInfo && upgradeInfo.cost > 0"
        class="btn upgrade-btn"
        :disabled="!upgradeInfo.ok"
        @click="upgrade"
      >
        Upgrade ({{ upgradeInfo.cost }}g)
      </button>
    </div>
  </div>
</template>

<style scoped>
.tower-info-panel {
  position: absolute;
  right: 16px;
  bottom: calc(var(--tower-bar-height, 64px) + 12px);
  width: 280px;
  max-width: calc(100vw - 32px);
  max-height: calc(100% - var(--tower-bar-height, 64px) - 96px);
  overflow-y: auto;
  z-index: var(--z-floating);
  display: flex;
  flex-direction: column;
  gap: 10px;
  animation: panel-pop 0.22s ease-out;
  transform-origin: bottom right;
}

@keyframes panel-pop {
  0%   { opacity: 0; transform: scale(0.92) translateY(8px); }
  60%  { opacity: 1; transform: scale(1.015); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}

.panel-header { display: flex; justify-content: space-between; align-items: center; }
.panel-title { font-size: 12px; letter-spacing: 2px; }
.close-btn {
  background: none; border: none; color: var(--axis); cursor: pointer;
  font-size: 14px; min-width: 44px; min-height: 44px;
  display: inline-flex; align-items: center; justify-content: center;
}

.stats { display: flex; flex-direction: column; gap: 2px; }
.stat-row {
  display: flex; justify-content: space-between;
  font-size: 11px; color: #e8dcc8;
}
.stat-row span:last-child { color: var(--gold); }

.math-concept { font-size: 10px; color: var(--axis); letter-spacing: 1px; margin: 0; }

.panel-actions { display: flex; gap: 8px; }
.refund-btn {
  flex: 0 0 auto; font-size: 11px; padding: 8px 12px;
  border-color: var(--hp-red); color: var(--hp-red);
}
.refund-btn:hover { background: var(--hp-red); color: var(--stone-dark); }
.upgrade-btn { flex: 1; font-size: 11px; padding: 8px 12px; }
.upgrade-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
