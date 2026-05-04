<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { TOWER_DEFS } from '@/data/tower-defs'
import { TowerType } from '@/data/constants'
import type { TowerUpgradeSystem } from '@/systems/TowerUpgradeSystem'
import MagicModePanel from './MagicModePanel.vue'
import RadarConfigPanel from './RadarConfigPanel.vue'
import MatrixPairPanel from './MatrixPairPanel.vue'
import LimitQuestionPanel from './LimitQuestionPanel.vue'
import CalculusPanel from './CalculusPanel.vue'

const gameStore = useGameStore()
const uiStore = useUiStore()
const confirmingRefund = ref(false)

let _refundUnsub: (() => void) | null = null
onUnmounted(() => { _refundUnsub?.() })

const tower = computed(() => {
  void gameStore.towerUpgradeTick          // invalidate on upgrade
  const id = uiStore.buildPanelTowerId
  if (!id) return null
  const engine = gameStore.getEngine()
  const t = engine?.towers.find((t) => t.id === id)
  return t ? { ...t } : null               // snapshot ensures Vue sees a new reference
})

watch(() => uiStore.buildPanelTowerId, () => { confirmingRefund.value = false })

const towerDef = computed(() =>
  tower.value ? TOWER_DEFS[tower.value.type] : null,
)

const upgradeInfo = computed(() => {
  const t = tower.value
  if (!t) return null
  const engine = gameStore.getEngine()
  const sys = engine?.getSystem('towerUpgrade') as TowerUpgradeSystem | undefined
  if (!sys) return null
  return sys.canUpgrade(t, gameStore.gold)  // gameStore.gold is reactive; engine.state.gold is not
})

function upgrade() {
  const t = tower.value
  if (!t) return
  gameStore.requestTowerUpgrade(t.id)
}

function close() {
  uiStore.closeBuildPanel()
}

function requestRefund() {
  confirmingRefund.value = true
}

function cancelRefund() {
  confirmingRefund.value = false
}

function confirmRefund() {
  const t = tower.value
  if (!t) return
  _refundUnsub?.()
  _refundUnsub = gameStore.requestTowerRefund(t.id, (success) => {
    _refundUnsub = null
    confirmingRefund.value = false
    if (success) uiStore.closeBuildPanel()
  })
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
      <template v-if="canRefund && !confirmingRefund">
        <button
          class="btn refund-btn"
          :aria-label="`Refund ${towerDef?.nameEn ?? 'tower'} for half cost`"
          @click="requestRefund"
        >⟲ Refund</button>
      </template>
      <template v-if="confirmingRefund">
        <div class="refund-confirm">
          <span class="refund-prompt">Refund for half cost?</span>
          <button class="btn refund-yes" @click="confirmRefund">Yes</button>
          <button class="btn refund-no" @click="cancelRefund">No</button>
        </div>
      </template>

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
.refund-confirm {
  display: flex; align-items: center; gap: 6px; flex: 1;
}
.refund-prompt { font-size: 11px; color: var(--hp-red); white-space: nowrap; }
.refund-yes { font-size: 10px; padding: 6px 10px; min-height: 32px; border-color: var(--hp-red); color: var(--hp-red); }
.refund-yes:hover { background: var(--hp-red); color: var(--stone-dark); }
.refund-no { font-size: 10px; padding: 6px 10px; min-height: 32px; }
.upgrade-btn { flex: 1; font-size: 11px; padding: 8px 12px; }
.upgrade-btn:disabled { opacity: 0.4; cursor: not-allowed; }

@media (prefers-reduced-motion: reduce) {
  .tower-info-panel {
    animation: none;
  }
}
</style>
