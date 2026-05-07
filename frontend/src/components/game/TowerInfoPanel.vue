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
import TargetingModePanel from './TargetingModePanel.vue'

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

// Stat breakdown: separates def → upgrades → talents → magic buff so the
// player can see where each contribution comes from when expanding a stat row.
interface StatBreakdown {
  base: number
  afterUpgrade: number
  afterTalent: number
  total: number
  upgradePct: number   // (afterUpgrade / base - 1) * 100
  talentPct: number    // (damageBonus - 1) * 100  (additive talent percent)
  magicPct: number     // (magicBuff - 1) * 100, 0 if not buffed
}

function buildBreakdown(base: number, afterUpgrade: number, talentMul: number, magicMul: number): StatBreakdown {
  const afterTalent = afterUpgrade * talentMul
  const total = afterTalent * magicMul
  const upgradePct = base > 0 ? (afterUpgrade / base - 1) * 100 : 0
  const talentPct = (talentMul - 1) * 100
  const magicPct = (magicMul - 1) * 100
  return { base, afterUpgrade, afterTalent, total, upgradePct, talentPct, magicPct }
}

const damageBreakdown = computed<StatBreakdown | null>(() => {
  const t = tower.value
  const def = towerDef.value
  if (!t || !def) return null
  return buildBreakdown(def.damage, t.baseDamage, t.damageBonus, t.magicBuff || 1)
})

const rangeBreakdown = computed<StatBreakdown | null>(() => {
  const t = tower.value
  const def = towerDef.value
  if (!t || !def) return null
  // Range is unaffected by magicBuff (buff only multiplies damage); pass 1.
  return buildBreakdown(def.range, t.baseRange, t.rangeBonus, 1)
})

const cooldownBreakdown = computed(() => {
  const t = tower.value
  const def = towerDef.value
  if (!t || !def || def.cooldown <= 0) return null
  // Reproduce the upgrade-tier compounding so we can show the upgrade %
  // contribution without exposing internals to other components.
  let cdAfterTier = def.cooldown
  for (let i = 0; i < t.level - 1; i++) {
    cdAfterTier *= (1 - (def.upgrades[i]?.speedBonus ?? 0))
  }
  const talentSpeed = t.talentMods?.['attack_speed'] ?? 0
  const upgradePct = def.cooldown > 0 ? (1 - cdAfterTier / def.cooldown) * 100 : 0
  const talentPct = talentSpeed * 100
  return {
    base: def.cooldown,
    afterUpgrade: cdAfterTier,
    total: t.cooldown,
    upgradePct,    // attack-speed gain (positive = faster)
    talentPct,
  }
})

function fmtPct(pct: number): string {
  if (Math.abs(pct) < 0.05) return '+0%'
  return `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`
}

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

// RADAR_A is a passive sweep that hits everything in its arc, so a targeting
// preference would be meaningless. Only single-target shooters get the picker.
const showTargetingMode = computed(() => {
  const t = tower.value?.type
  return t === TowerType.RADAR_B || t === TowerType.RADAR_C
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

      <details v-if="damageBreakdown" class="stat-row stat-row--breakdown">
        <summary>
          <span class="stat-label">Damage</span>
          <span class="stat-value">
            {{ damageBreakdown.total.toFixed(1) }}
            <span class="bd-chevron" aria-hidden="true">▾</span>
          </span>
        </summary>
        <div class="breakdown-body">
          <span class="bd-row"><span>Base</span><span>{{ damageBreakdown.base.toFixed(1) }}</span></span>
          <span class="bd-row"><span>Upgrades</span><span :class="{ 'bd-zero': damageBreakdown.upgradePct === 0 }">{{ fmtPct(damageBreakdown.upgradePct) }}</span></span>
          <span class="bd-row"><span>Talents</span><span :class="{ 'bd-zero': damageBreakdown.talentPct === 0 }">{{ fmtPct(damageBreakdown.talentPct) }}</span></span>
          <span v-if="damageBreakdown.magicPct !== 0" class="bd-row bd-row--magic">
            <span>Magic Buff</span><span>{{ fmtPct(damageBreakdown.magicPct) }}</span>
          </span>
          <span class="bd-row bd-total"><span>Total</span><span>{{ damageBreakdown.total.toFixed(1) }}</span></span>
        </div>
      </details>

      <details v-if="rangeBreakdown" class="stat-row stat-row--breakdown">
        <summary>
          <span class="stat-label">Range</span>
          <span class="stat-value">
            {{ rangeBreakdown.total.toFixed(1) }}
            <span class="bd-chevron" aria-hidden="true">▾</span>
          </span>
        </summary>
        <div class="breakdown-body">
          <span class="bd-row"><span>Base</span><span>{{ rangeBreakdown.base.toFixed(1) }}</span></span>
          <span class="bd-row"><span>Upgrades</span><span :class="{ 'bd-zero': rangeBreakdown.upgradePct === 0 }">{{ fmtPct(rangeBreakdown.upgradePct) }}</span></span>
          <span class="bd-row"><span>Talents</span><span :class="{ 'bd-zero': rangeBreakdown.talentPct === 0 }">{{ fmtPct(rangeBreakdown.talentPct) }}</span></span>
          <span class="bd-row bd-total"><span>Total</span><span>{{ rangeBreakdown.total.toFixed(1) }}</span></span>
        </div>
      </details>

      <details v-if="cooldownBreakdown" class="stat-row stat-row--breakdown">
        <summary>
          <span class="stat-label">Cooldown</span>
          <span class="stat-value">
            {{ cooldownBreakdown.total.toFixed(2) }}s
            <span class="bd-chevron" aria-hidden="true">▾</span>
          </span>
        </summary>
        <div class="breakdown-body">
          <span class="bd-row"><span>Base</span><span>{{ cooldownBreakdown.base.toFixed(2) }}s</span></span>
          <span class="bd-row"><span>Upgrade Speed</span><span :class="{ 'bd-zero': cooldownBreakdown.upgradePct === 0 }">{{ fmtPct(cooldownBreakdown.upgradePct) }}</span></span>
          <span class="bd-row"><span>Talent Speed</span><span :class="{ 'bd-zero': cooldownBreakdown.talentPct === 0 }">{{ fmtPct(cooldownBreakdown.talentPct) }}</span></span>
          <span class="bd-row bd-total"><span>Total</span><span>{{ cooldownBreakdown.total.toFixed(2) }}s</span></span>
        </div>
      </details>
    </div>

    <p class="math-concept">{{ towerDef.mathConcept }}</p>

    <!-- Type-specific panels -->
    <MagicModePanel v-if="tower.type === TowerType.MAGIC" :tower-id="tower.id" />
    <template v-else-if="isRadar">
      <RadarConfigPanel :tower-id="tower.id" />
      <TargetingModePanel v-if="showTargetingMode" :tower-id="tower.id" />
    </template>
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
.stat-row > span:last-child { color: var(--gold); }

/* Click-to-expand breakdown for Damage / Range / Cooldown rows. Using
   <details>/<summary> instead of an absolute-positioned tooltip avoids
   clipping by the panel's overflow-y:auto and gives screen readers and
   keyboard users a built-in disclosure widget. */
details.stat-row--breakdown {
  display: flex;
  flex-direction: column;
  font-size: 11px;
  color: #e8dcc8;
}
details.stat-row--breakdown > summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  list-style: none;
  outline: none;
}
details.stat-row--breakdown > summary::-webkit-details-marker { display: none; }
details.stat-row--breakdown > summary:focus-visible {
  outline: 2px solid var(--gold-bright);
  outline-offset: 2px;
  border-radius: 2px;
}
details.stat-row--breakdown > summary > .stat-value {
  color: var(--gold);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.bd-chevron {
  font-size: 9px;
  color: var(--axis);
  transition: transform 0.15s;
}
details.stat-row--breakdown[open] > summary > .stat-value > .bd-chevron {
  transform: rotate(180deg);
}

.breakdown-body {
  margin-top: 4px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.25);
  border-left: 2px solid rgba(139, 115, 66, 0.4);
  border-radius: 0 4px 4px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
}
.bd-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  letter-spacing: 0.5px;
}
.bd-row > span:first-child { color: #c8b894; }
.bd-row > span:last-child { color: var(--gold); }
/* Specificity must beat ".bd-row > span:last-child" (0,2,1); use a chained
   class on the same element so this wins by source order at (0,2,1). */
.bd-row > span.bd-zero { color: #6a6052; }
.bd-row--magic > span:last-child { color: #c8a4ff; }
.bd-total {
  margin-top: 3px;
  padding-top: 3px;
  border-top: 1px solid rgba(139, 115, 66, 0.3);
}
.bd-total > span:first-child { color: #e8dcc8; }
.bd-total > span:last-child { color: var(--gold-bright); font-weight: bold; }

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
