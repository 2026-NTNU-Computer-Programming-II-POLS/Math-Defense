<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@/stores/uiStore'
import { useGameStore } from '@/stores/gameStore'
import { GamePhase } from '@/data/constants'

const uiStore = useUiStore()
const gameStore = useGameStore()

const steps = [
  '① 從下方塔列選擇魔法塔',
  '② 點擊格線放置塔',
  '③ 滑鼠懸停塔，開啟 Build Panel 設定參數',
  '④ 點擊「Cast Spell」確認',
  '⑤ 點擊「Start Wave」開始波次',
]

const hint = computed(() => steps[uiStore.buildHintStep] ?? '')
const show = computed(() => gameStore.phase === GamePhase.BUILD)
</script>

<template>
  <div v-if="show && hint" class="build-hint">
    {{ hint }}
  </div>
</template>

<style scoped>
.build-hint {
  position: absolute;
  top: 56px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(26,21,32,0.9);
  border: 1px solid var(--gold-dim);
  padding: 6px 16px;
  font-size: 11px;
  color: var(--gold);
  letter-spacing: 1px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 15;
}
</style>
