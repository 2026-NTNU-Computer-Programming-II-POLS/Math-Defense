/**
 * useGameLoop — 遊戲迴圈生命週期管理 Composable
 * 在 Vue 元件 onMounted/onUnmounted 中啟動/停止遊戲引擎。
 */
import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import { Game } from '@/engine/Game'
import { BuffSystem } from '@/systems/BuffSystem'
import { WaveSystem } from '@/systems/WaveSystem'
import { MovementSystem } from '@/systems/MovementSystem'
import { CombatSystem } from '@/systems/CombatSystem'
import { TowerPlacementSystem } from '@/systems/TowerPlacementSystem'
import { EconomySystem } from '@/systems/EconomySystem'
import { EnemyRenderer } from '@/renderers/EnemyRenderer'
import { TowerRenderer } from '@/renderers/TowerRenderer'
import { ProjectileRenderer } from '@/renderers/ProjectileRenderer'
import { generatePath } from '@/math/PathEvaluator'
import { initWasm } from '@/math/WasmBridge'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { useSessionSync } from '@/composables/useSessionSync'
import { Events, type TowerType } from '@/data/constants'
import type { Tower } from '@/entities/types'

export function useGameLoop(canvasRef: Ref<HTMLCanvasElement | null>) {
  const game = ref<Game | null>(null)
  const ready = ref(false)
  const gameStore = useGameStore()
  const uiStore = useUiStore()
  const { bind: bindSession } = useSessionSync()
  const unsubs: (() => void)[] = []

  onMounted(async () => {
    await initWasm()

    const canvas = canvasRef.value
    if (!canvas) return

    const g = new Game(canvas)

    // 注入所有系統（順序：placement → combat → movement → wave → buff → economy → renderers）
    const placement = new TowerPlacementSystem()
    placement.getSelectedTowerType = () => uiStore.selectedTowerType as TowerType | null
    placement.clearSelectedTowerType = () => { uiStore.selectedTowerType = null }
    g.addSystem('placement', placement)
    g.addSystem('combat', new CombatSystem())
    g.addSystem('movement', new MovementSystem())
    g.addSystem('wave', new WaveSystem())
    g.addSystem('buff', new BuffSystem())
    g.addSystem('economy', new EconomySystem())
    g.addSystem('enemyRenderer', new EnemyRenderer())
    g.addSystem('towerRenderer', new TowerRenderer())
    g.addSystem('projectileRenderer', new ProjectileRenderer())

    // 每次關卡開始時生成隨機路徑，並同步到 store
    unsubs.push(g.eventBus.on(Events.LEVEL_START, (levelNum) => {
      const path = generatePath(levelNum as number)
      g.pathFunction = path.fn
      g.state.pathExpression = path.expr
      gameStore.pathExpression = path.expr
    }))

    // 塔被點選 → 開啟 BuildPanel（引擎 → Vue UI 橋接）
    unsubs.push(g.eventBus.on(Events.TOWER_SELECTED, (tower) => {
      if (tower && typeof tower === 'object' && 'id' in tower) {
        uiStore.buildPanelTowerId = (tower as Tower).id
        uiStore.buildPanelVisible = true
      } else {
        uiStore.buildPanelVisible = false
        uiStore.buildPanelTowerId = null
      }
    }))

    // 塔放置成功 → 選中它，開啟面板設定參數
    unsubs.push(g.eventBus.on(Events.TOWER_PLACED, (tower) => {
      uiStore.buildPanelTowerId = tower.id
      uiStore.buildPanelVisible = true
      uiStore.buildHintStep = 2
    }))

    // Session lifecycle sync (only active when logged in)
    unsubs.push(...bindSession(g))

    gameStore.bindEngine(g)
    game.value = g
    ready.value = true
    g.start()
  })

  onUnmounted(() => {
    unsubs.forEach((fn) => fn())  // 1. 移除 composable 層的事件監聽
    gameStore.unbindEngine()      // 2. 解除 store 綁定
    if (game.value) {
      game.value.destroy()        // 3. 停止迴圈 + destroy 所有 system + 清除 eventBus + input
    }
  })

  return { game, ready }
}
