<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { gameCommands } from '@/services/gameCommandService'
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
  gameCommands.requestTowerUpgrade(t.id)
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
  _refundUnsub = gameCommands.requestTowerRefund(t.id, (success) => {
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
      <span class="panel-icon" :style="{ background: towerDef.cardColor }" aria-hidden="true">
        <!-- Visual Redesign Phase 5a/5b: preview chip mirrors the in-canvas
             instrument silhouette per tower type. -->
        <svg
          v-if="tower.type === TowerType.MAGIC"
          class="instrument-preview"
          viewBox="0 0 24 16"
          aria-hidden="true"
        >
          <path
            d="M2 8 Q 5 2 8 8 T 14 8 T 20 8 T 22 8"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        </svg>
        <svg
          v-else-if="tower.type === TowerType.RADAR_A"
          class="instrument-preview"
          viewBox="0 0 24 16"
          aria-hidden="true"
        >
          <path d="M3 13 A 10 10 0 0 1 21 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M12 13 L 19 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
          <circle cx="12" cy="13" r="1.4" fill="currentColor"/>
        </svg>
        <svg
          v-else-if="tower.type === TowerType.RADAR_B"
          class="instrument-preview"
          viewBox="0 0 24 16"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/>
          <circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.75"/>
          <circle cx="12" cy="8" r="1.6" fill="currentColor"/>
        </svg>
        <svg
          v-else-if="tower.type === TowerType.MATRIX"
          class="instrument-preview"
          viewBox="0 0 24 16"
          aria-hidden="true"
        >
          <path d="M5 3 L 3 3 L 3 13 L 5 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M19 3 L 21 3 L 21 13 L 19 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          <text x="8" y="8.5" font-family="monospace" font-size="5" font-weight="bold" fill="currentColor">3</text>
          <text x="14" y="8.5" font-family="monospace" font-size="5" font-weight="bold" fill="currentColor">7</text>
          <text x="8" y="13" font-family="monospace" font-size="5" font-weight="bold" fill="currentColor">1</text>
          <text x="14" y="13" font-family="monospace" font-size="5" font-weight="bold" fill="currentColor">4</text>
        </svg>
        <svg
          v-else-if="tower.type === TowerType.RADAR_C"
          class="instrument-preview"
          viewBox="0 0 24 16"
          aria-hidden="true"
        >
          <line x1="6" y1="14" x2="12" y2="9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>
          <line x1="12" y1="14" x2="12" y2="9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>
          <line x1="18" y1="14" x2="12" y2="9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>
          <line x1="4" y1="6" x2="20" y2="3" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
          <circle cx="20.5" cy="2.8" r="2" fill="currentColor"/>
        </svg>
        <svg
          v-else-if="tower.type === TowerType.LIMIT"
          class="instrument-preview"
          viewBox="0 0 24 16"
          aria-hidden="true"
        >
          <line x1="6" y1="14" x2="6" y2="3" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/>
          <line x1="18" y1="14" x2="18" y2="3" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2"/>
          <line x1="6" y1="4" x2="18" y2="4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          <circle cx="12" cy="6.5" r="1.8" fill="currentColor"/>
        </svg>
        <svg
          v-else-if="tower.type === TowerType.CALCULUS"
          class="instrument-preview"
          viewBox="0 0 24 16"
          aria-hidden="true"
        >
          <path d="M3 14 Q 12 4 21 14" fill="currentColor" opacity="0.25" stroke="currentColor" stroke-width="1" stroke-linecap="round"/>
          <text x="12" y="12" font-family="serif" font-size="14" font-weight="bold" text-anchor="middle" fill="currentColor">∫</text>
        </svg>
      </span>
      <span class="panel-titles">
        <span class="panel-title" :style="{ color: towerDef.cardColor }">{{ towerDef.nameEn }}</span>
        <span class="panel-coords">({{ tower.x }}, {{ tower.y }})</span>
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
    <p class="exam-relevance">
      <span class="exam-label">On the exam —</span>
      {{ towerDef.examRelevance }}
    </p>

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
        >↺ Refund</button>
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
        Upgrade · {{ upgradeInfo.cost }}g
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Build Panel drawer — single light-blue surface for every tower type
   (mockup .gh-drawer / §4.5). Floating position kept (conservative: the
   app's overlay model, not the mockup's side-rail). */
.tower-info-panel {
  position: absolute;
  right: 16px;
  bottom: calc(var(--tower-bar-height, 64px) + 12px);
  width: 320px;
  max-width: calc(100vw - 32px);
  /* Reserve room for the full top HUD (base bar + spells/MH sub-row) and the
     bottom tower bar so the drawer never overlaps either; content scrolls if
     it still doesn't fit. */
  max-height: calc(100% - var(--tower-bar-height, 64px) - 128px);
  overflow-y: auto;
  z-index: var(--z-floating);
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--rail-surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  box-shadow: var(--shadow-lg);
  padding: 14px;
  animation: panel-pop 0.22s ease-out;
  transform-origin: bottom right;
}

@keyframes panel-pop {
  0%   { opacity: 0; transform: scale(0.92) translateY(8px); }
  60%  { opacity: 1; transform: scale(1.015); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}

/* Drawer header — coloured icon chip + name/coords stack + close (mockup) */
.panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  background: transparent;
  border: none;
  padding: 2px 2px 6px;
}
.panel-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: var(--shadow-sm);
}
.panel-titles {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
}
.panel-title {
  font-size: var(--text-base);
  font-weight: 700;
  letter-spacing: 0.5px;
  line-height: 1.15;
  /* Keep every tower name (e.g. "Radar C — Sniper") on a single line. */
  white-space: nowrap;
}
.panel-coords {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--charcoal-soft);
  letter-spacing: 1px;
}
.instrument-preview {
  width: 26px;
  height: 16px;
  flex-shrink: 0;
}
.close-btn {
  align-self: flex-start;
  background: none; border: none; color: var(--charcoal-soft); cursor: pointer;
  font-size: var(--text-sm); min-width: 44px; min-height: 44px;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 8px;
}
.close-btn:hover { background: rgba(79, 74, 72, 0.08); color: var(--charcoal); }

/* Stats block — pale rounded card (mockup .stats-block) */
.stats {
  display: flex; flex-direction: column;
  width: 100%; box-sizing: border-box;
  background: rgba(245, 250, 254, 0.6);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 8px 12px;
}
.stat-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 9px 0;
  font-size: var(--text-xs); color: var(--charcoal-soft);
  border-bottom: 1px dashed var(--line);
}
.stat-row:last-of-type { border-bottom: none; }
.stat-row > span:last-child { color: var(--charcoal); font-weight: 700; font-family: var(--font-mono); }

/* Click-to-expand breakdown for Damage / Range / Cooldown rows. Using
   <details>/<summary> instead of an absolute-positioned tooltip avoids
   clipping by the panel's overflow-y:auto and gives screen readers and
   keyboard users a built-in disclosure widget. */
details.stat-row--breakdown {
  display: flex;
  flex-direction: column;
  font-size: var(--text-xs);
  color: var(--charcoal-soft);
  padding: 9px 0;
  border-bottom: 1px dashed var(--line);
}
details.stat-row--breakdown:last-of-type { border-bottom: none; }
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
  outline: 2px solid var(--terracotta-deep);
  outline-offset: 2px;
  border-radius: 2px;
}
details.stat-row--breakdown > summary > .stat-value {
  color: var(--charcoal);
  font-family: var(--font-mono);
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.bd-chevron {
  font-size: var(--text-2xs);
  color: var(--charcoal-soft);
  transition: transform 0.15s;
}
details.stat-row--breakdown[open] > summary > .stat-value > .bd-chevron {
  transform: rotate(180deg);
}

.breakdown-body {
  margin-top: 6px;
  padding: 8px 10px;
  background: rgba(245, 250, 254, 0.85);
  border-left: 2px solid var(--terracotta);
  border-radius: 0 6px 6px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--text-xs);
}
.bd-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  letter-spacing: 0.5px;
}
.bd-row > span:first-child { color: var(--charcoal-soft); }
.bd-row > span:last-child { color: var(--charcoal); }
/* Specificity must beat ".bd-row > span:last-child" (0,2,1); use a chained
   class on the same element so this wins by source order at (0,2,1). */
.bd-row > span.bd-zero { color: var(--muted); }
.bd-row--magic > span:last-child { color: var(--plum-deep); }
.bd-total {
  margin-top: 3px;
  padding-top: 3px;
  border-top: 1px solid var(--line-strong);
}
.bd-total > span:first-child { color: var(--charcoal); }
.bd-total > span:last-child { color: var(--terracotta-deep); font-weight: 700; }

.math-concept { font-size: var(--text-xs); color: var(--charcoal-soft); letter-spacing: 1px; margin: 0; }

/* Exam tip — slate left-border callout (mockup .exam-tip) */
.exam-relevance {
  font-size: var(--text-xs);
  color: var(--slate-deep);
  line-height: 1.45;
  margin: 0;
  padding: 8px 10px;
  background: rgba(107, 127, 148, 0.1);
  border-left: 3px solid var(--slate);
  border-radius: 6px;
}
.exam-label {
  display: inline-block;
  margin-right: 6px;
  font-size: var(--text-2xs);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--slate-deep);
  font-weight: 700;
}

/* Drawer actions — Refund (ghost) + Upgrade (gold primary) */
.panel-actions { display: flex; gap: 8px; margin-top: 4px; }
.refund-btn {
  flex: 0 0 auto; font-size: var(--text-xs); padding: 8px 14px;
  border-radius: 10px; background: transparent;
  border: 1px solid var(--line); color: var(--charcoal-soft);
  text-transform: none; font-family: var(--font-main); font-weight: 600;
}
.refund-btn:hover { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); }
.refund-confirm {
  display: flex; align-items: center; gap: 6px; flex: 1;
}
.refund-prompt { font-size: var(--text-xs); color: var(--clay-deep); white-space: nowrap; }
.refund-yes {
  font-size: var(--text-xs); padding: 6px 10px; min-height: 32px;
  border-radius: 10px; background: var(--clay);
  border: 1px solid var(--clay-deep); color: #fff; text-transform: none;
}
.refund-yes:hover { filter: brightness(1.06); }
.refund-no {
  font-size: var(--text-xs); padding: 6px 10px; min-height: 32px;
  border-radius: 10px; text-transform: none; background: transparent;
  border: 1px solid var(--line); color: var(--charcoal-soft);
}
.refund-no:hover { background: rgba(245, 250, 254, 0.6); color: var(--charcoal); }
.upgrade-btn {
  flex: 1; font-size: var(--text-xs); padding: 8px 12px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--gold) 0%, var(--gold-soft) 100%);
  border: 1px solid var(--gold-deep); color: #fff;
  font-weight: 700; text-transform: none;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.14);
}
.upgrade-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--gold-soft) 0%, var(--gold) 100%);
}
.upgrade-btn:disabled { opacity: 0.4; cursor: not-allowed; }

@media (prefers-reduced-motion: reduce) {
  .tower-info-panel {
    animation: none;
  }
}
</style>
