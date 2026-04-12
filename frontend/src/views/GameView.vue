<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { useGameLoop } from '@/composables/useGameLoop'
import { GamePhase } from '@/data/constants'

import HUD from '@/components/game/HUD.vue'
import TowerBar from '@/components/game/TowerBar.vue'
import BuildPanel from '@/components/game/BuildPanel.vue'
import BuildHint from '@/components/game/BuildHint.vue'
import BuffCardPanel from '@/components/game/BuffCardPanel.vue'
import LevelSelect from '@/components/common/LevelCard.vue'
import Modal from '@/components/common/Modal.vue'

const router = useRouter()
const gameStore = useGameStore()
const uiStore = useUiStore()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const { game, ready } = useGameLoop(canvasRef)

// listen for level-end / GAME_OVER → show modal
function navigateHome(): void {
  router.push('/').catch((err) => {
    console.warn('[GameView] Navigation failed:', err)
  })
}

watch(() => gameStore.phase, (phase) => {
  if (phase === GamePhase.LEVEL_END) {
    uiStore.showModal(
      '關卡通關！',
      `Score: ${gameStore.score.toLocaleString()}  Kills: ${gameStore.kills}`,
      navigateHome,
    )
  } else if (phase === GamePhase.GAME_OVER) {
    uiStore.showModal(
      'Game Over',
      `已存活 ${gameStore.wave} 波  Score: ${gameStore.score.toLocaleString()}`,
      navigateHome,
    )
  }
})

function startWave(): void {
  game.value?.startWave()
}

function selectLevel(levelId: number): void {
  game.value?.startLevel(levelId)
}
</script>

<template>
  <div class="game-view">
    <canvas ref="canvasRef" class="game-canvas" />

    <div v-if="ready" class="game-overlay">
      <HUD />
      <BuildHint />

      <!-- Level select -->
      <LevelSelect
        v-if="gameStore.phase === GamePhase.MENU || gameStore.phase === GamePhase.LEVEL_SELECT"
        @select="selectLevel"
      />

      <!-- Build Phase -->
      <template v-if="gameStore.isBuilding">
        <TowerBar />
        <BuildPanel v-if="uiStore.buildPanelVisible" />
        <button
          class="btn start-wave-btn"
          :disabled="gameStore.phase !== GamePhase.BUILD"
          @click="startWave"
        >
          ▶ Start Wave {{ gameStore.wave + 1 }}
        </button>
      </template>

      <!-- Buff Select -->
      <BuffCardPanel v-if="gameStore.isBuff" />

      <!-- Modal -->
      <Modal v-if="uiStore.modalVisible" />
    </div>
  </div>
</template>

<style scoped>
.game-view {
  position: relative;
  width: 1280px;
  height: 720px;
}

.game-canvas {
  display: block;
  width: 1280px;
  height: 720px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  border: 2px solid #5a4a2a;
}

.game-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.game-overlay > * {
  pointer-events: auto;
}

.start-wave-btn {
  position: absolute;
  top: 56px;
  right: 16px;
  font-size: 12px;
  letter-spacing: 3px;
  padding: 10px 20px;
  z-index: 20;
}
</style>
