<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { GamePhase } from '@/data/constants'
import { formatScore } from '@/domain/formatters'
import { SEGMENTED_PATHS_ENABLED } from '@/config/feature-flags'
import FunctionPanel from './FunctionPanel.vue'

const g = useGameStore()

// Legacy single-line path expression is superseded by <FunctionPanel />
// when SEGMENTED_PATHS_ENABLED is on. The flag and the legacy markup
// both retire in Phase 7 of the Piecewise Paths construction plan.
const showLegacyPath = computed(
  () => !SEGMENTED_PATHS_ENABLED && !!g.pathExpression,
)

const phaseLabel = computed(() => {
  switch (g.phase) {
    case GamePhase.BUILD:       return 'Build Phase'
    case GamePhase.WAVE:        return `Wave ${g.wave}`
    case GamePhase.BUFF_SELECT: return 'Buff Selection'
    case GamePhase.BOSS_SHIELD: return 'Boss Battle!'
    case GamePhase.LEVEL_END:   return 'Victory!'
    case GamePhase.GAME_OVER:   return 'Game Over'
    default:                    return ''
  }
})

const goldStr = computed(() => String(g.gold).padStart(4, '0'))
const hpStr   = computed(() => `${g.hp} / ${g.maxHp}`)
</script>

<template>
  <div class="hud">
    <!-- Phase -->
    <div class="hud-item phase-label">
      <span class="hud-label">Phase</span>
      <span class="hud-value phase">{{ phaseLabel }}</span>
    </div>

    <!-- Wave -->
    <div class="hud-item">
      <span class="hud-label">Level</span>
      <span class="hud-value">{{ g.level }}</span>
    </div>

    <!-- Gold -->
    <div class="hud-item" role="group" :aria-label="`Gold: ${g.gold}`">
      <span class="hud-label">Gold</span>
      <span class="hud-value gold">
        <span aria-hidden="true">⬡</span> {{ goldStr }}
      </span>
    </div>

    <!-- HP -->
    <div class="hud-item" role="group" :aria-label="`Hit points: ${g.hp} of ${g.maxHp}`">
      <span class="hud-label">HP</span>
      <span class="hud-value" :class="{ 'hp-low': g.hp <= 5 }">
        <span aria-hidden="true">♥</span> {{ hpStr }}
      </span>
    </div>

    <!-- Score -->
    <div class="hud-item score-item">
      <span class="hud-label">Score</span>
      <span class="hud-value score">{{ formatScore(g.score) }}</span>
    </div>

    <!-- Path function (legacy; superseded by <FunctionPanel /> when flag is on) -->
    <div class="hud-item path-item" v-if="showLegacyPath">
      <span class="hud-label">Path</span>
      <span class="hud-value path">{{ g.pathExpression }}</span>
    </div>
  </div>

  <FunctionPanel v-if="SEGMENTED_PATHS_ENABLED" />
</template>

<style scoped>
.hud {
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 48px;
  background: linear-gradient(180deg, rgba(26,21,32,0.95), rgba(26,21,32,0.8));
  border-bottom: 1px solid var(--panel-border);
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 24px;
  font-family: var(--font-mono);
  z-index: 20;
}

.hud-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.hud-label {
  font-size: 9px;
  color: var(--axis);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.hud-value {
  font-size: 14px;
  color: var(--gold);
  font-weight: bold;
}

.phase    { color: #e8dcc8; font-size: 12px; }
.gold     { color: var(--gold-bright); }
.hp-low   { color: var(--hp-red); }
.score    { color: var(--gold); }
.path     { font-size: 11px; color: #4a82c8; }

.score-item { margin-left: auto; }
</style>
