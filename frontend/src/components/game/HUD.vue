<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/gameStore'
import { GamePhase } from '@/data/constants'

const g = useGameStore()

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
    <!-- 階段 -->
    <div class="hud-item phase-label">
      <span class="hud-label">Phase</span>
      <span class="hud-value phase">{{ phaseLabel }}</span>
    </div>

    <!-- 波次 -->
    <div class="hud-item">
      <span class="hud-label">Level</span>
      <span class="hud-value">{{ g.level }}</span>
    </div>

    <!-- 金幣 -->
    <div class="hud-item">
      <span class="hud-label">Gold</span>
      <span class="hud-value gold">⬡ {{ goldStr }}</span>
    </div>

    <!-- HP -->
    <div class="hud-item">
      <span class="hud-label">HP</span>
      <span class="hud-value" :class="{ 'hp-low': g.hp <= 5 }">♥ {{ hpStr }}</span>
    </div>

    <!-- 分數 -->
    <div class="hud-item score-item">
      <span class="hud-label">Score</span>
      <span class="hud-value score">{{ g.score.toLocaleString() }}</span>
    </div>

    <!-- 路徑函數 -->
    <div class="hud-item path-item" v-if="g.pathExpression">
      <span class="hud-label">Path</span>
      <span class="hud-value path">{{ g.pathExpression }}</span>
    </div>
  </div>
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

.path-item { margin-left: auto; }
.score-item { margin-left: auto; }
</style>
