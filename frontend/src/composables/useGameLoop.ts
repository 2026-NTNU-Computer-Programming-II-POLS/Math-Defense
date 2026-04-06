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
import { EnemyRenderer } from '@/renderers/EnemyRenderer'
import { TowerRenderer } from '@/renderers/TowerRenderer'
import { ProjectileRenderer } from '@/renderers/ProjectileRenderer'
import { generatePath } from '@/math/PathEvaluator'
import { initWasm } from '@/math/WasmBridge'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { Events } from '@/data/constants'
import type { Tower } from '@/entities/types'

export function useGameLoop(canvasRef: Ref<HTMLCanvasElement | null>) {
  const game = ref<Game | null>(null)
  const ready = ref(false)
  const gameStore = useGameStore()
  const uiStore = useUiStore()

  onMounted(async () => {
    await initWasm()

    const canvas = canvasRef.value
    if (!canvas) return

    const g = new Game(canvas)

    // 注入所有系統（順序：placement → combat → movement → wave → buff → renderers）
    g.addSystem('placement', new TowerPlacementSystem())
    g.addSystem('combat', new CombatSystem())
    g.addSystem('movement', new MovementSystem())
    g.addSystem('wave', new WaveSystem())
    g.addSystem('buff', new BuffSystem())
    g.addSystem('enemyRenderer', new EnemyRenderer())
    g.addSystem('towerRenderer', new TowerRenderer())
    g.addSystem('projectileRenderer', new ProjectileRenderer())

    // 每次關卡開始時生成隨機路徑，並同步到 store
    g.eventBus.on(Events.LEVEL_START, (levelNum) => {
      const path = generatePath(levelNum as number)
      g.pathFunction = path.fn
      g.state.pathExpression = path.expr
      gameStore.pathExpression = path.expr
    })

    // 塔被點選 → 開啟 BuildPanel（引擎 → Vue UI 橋接）
    g.eventBus.on(Events.TOWER_SELECTED, (tower) => {
      if (tower && typeof tower === 'object' && 'id' in tower) {
        uiStore.buildPanelTowerId = (tower as Tower).id
        uiStore.buildPanelVisible = true
      } else {
        uiStore.buildPanelVisible = false
        uiStore.buildPanelTowerId = null
      }
    })

    // 塔放置成功 → 選中它，開啟面板設定參數
    g.eventBus.on(Events.TOWER_PLACED, (tower) => {
      uiStore.buildPanelTowerId = tower.id
      uiStore.buildPanelVisible = true
      uiStore.buildHintStep = 2
    })

    gameStore.bindEngine(g)
    game.value = g
    ready.value = true
    g.start()
  })

  onUnmounted(() => {
    gameStore.unbindEngine()
    if (game.value) {
      game.value.stop()
      game.value.input.destroy()
      game.value.eventBus.clear()
    }
  })

  return { game, ready }
}
