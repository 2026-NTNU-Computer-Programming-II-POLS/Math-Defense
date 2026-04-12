/**
 * useGameLoop — game loop lifecycle management composable
 * Starts/stops the game engine in Vue component's onMounted/onUnmounted hooks.
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

    // HMR defensive: if a prior Game survived without an unmount (e.g. Vite
    // re-fired onMounted), tear it down before creating a new one. InputManager
    // listeners would otherwise accumulate on the canvas/window.
    if (game.value) {
      game.value.destroy()
      game.value = null
    }

    const g = new Game(canvas)

    // Inject all systems (order: placement → combat → movement → wave → buff → economy → renderers)
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

    // Generate a random path on each level start and sync it to the store.
    // The expression string is presentation-only and lives on gameStore, not GameState.
    unsubs.push(g.eventBus.on(Events.LEVEL_START, (levelNum) => {
      const path = generatePath(levelNum as number)
      g.pathFunction = path.fn
      gameStore.pathExpression = path.expr
    }))

    // Fourier target is a visual cue owned by the UI store — mirror it here
    // rather than keeping a copy on GameState.
    unsubs.push(g.eventBus.on(Events.BOSS_SHIELD_START, ({ target }) => {
      uiStore.bossShieldTarget = target
    }))
    unsubs.push(g.eventBus.on(Events.BOSS_SHIELD_END, () => {
      uiStore.bossShieldTarget = null
    }))

    // Tower selected → open BuildPanel (engine → Vue UI bridge)
    unsubs.push(g.eventBus.on(Events.TOWER_SELECTED, (tower) => {
      if (
        tower
        && typeof tower === 'object'
        && 'id' in tower
        && typeof (tower as { id: unknown }).id === 'string'
      ) {
        uiStore.buildPanelTowerId = (tower as Tower).id
        uiStore.buildPanelVisible = true
      } else {
        uiStore.buildPanelVisible = false
        uiStore.buildPanelTowerId = null
      }
    }))

    // Tower placed successfully → select it and open the panel for parameter setup
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
    unsubs.forEach((fn) => fn())  // 1. Remove composable-level event listeners
    gameStore.unbindEngine()      // 2. Unbind store from engine
    if (game.value) {
      game.value.destroy()        // 3. Stop loop + destroy all systems + clear eventBus + input
      game.value = null           // 4. Release reference to prevent memory leak
    }
  })

  return { game, ready }
}
