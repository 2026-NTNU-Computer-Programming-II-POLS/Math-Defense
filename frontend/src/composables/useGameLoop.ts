/**
 * useGameLoop — game loop lifecycle management composable
 * Starts/stops the game engine in Vue component's onMounted/onUnmounted hooks.
 */
import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue'
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
import { initWasm } from '@/math/WasmBridge'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { useSessionSync } from '@/composables/useSessionSync'
import { createLevelContext } from '@/engine/level-context'
import { projectPathPanel } from '@/engine/projections/project-path-panel'
import { LEVELS } from '@/data/level-defs'
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
    placement.clearSelectedTowerType = () => { uiStore.clearSelectedTower() }
    g.addSystem('placement', placement)
    g.addSystem('combat', new CombatSystem())
    // Inject the lead-enemy-x sink so MovementSystem never imports Pinia
    // directly (P5-T9 / SoC matrix §2). Callback is a no-op when the flag
    // is off since MovementSystem only invokes it on the segmented branch.
    const movement = new MovementSystem()
    movement.setLeadEnemyX = (x: number) => { gameStore.setLeadEnemyX(x) }
    g.addSystem('movement', movement)
    g.addSystem('wave', new WaveSystem())
    g.addSystem('buff', new BuffSystem())
    g.addSystem('economy', new EconomySystem())
    g.addSystem('enemyRenderer', new EnemyRenderer())
    g.addSystem('towerRenderer', new TowerRenderer())
    g.addSystem('projectileRenderer', new ProjectileRenderer())

    // Piecewise-paths LevelContext wiring. Path construction, validation,
    // classification, and store projection live behind `createLevelContext`
    // + `projectPathPanel` so this body stays a thin orchestrator.
    let panelUnsubscribe: (() => void) | null = null
    unsubs.push(g.eventBus.on(Events.LEVEL_START, (levelNum) => {
      panelUnsubscribe?.()
      panelUnsubscribe = null
      g.levelContext?.dispose()
      g.levelContext = null
      gameStore.clearPathPanel()
      const level = LEVELS.find((l) => l.id === (levelNum as number))
      if (!level) return
      g.levelContext = createLevelContext(level, g.eventBus)
      panelUnsubscribe = projectPathPanel(g.levelContext, g.eventBus, gameStore)
    }))

    unsubs.push(g.eventBus.on(Events.LEVEL_END, () => {
      panelUnsubscribe?.()
      panelUnsubscribe = null
      g.levelContext?.dispose()
      g.levelContext = null
      gameStore.clearPathPanel()
    }))

    // Mirror `uiStore.hoveredSegmentId` onto `game.hoveredSegmentId`. The
    // Renderer reads the latter (engine-layer, no Pinia import), and the
    // Function Panel writes the former — the composable is the one place
    // that bridges presentation → engine (§2 SoC matrix).
    unsubs.push(watch(
      () => uiStore.hoveredSegmentId,
      (id) => { g.hoveredSegmentId = id },
      { immediate: true },
    ))

    // Fourier target is a visual cue owned by the UI store — mirror it here
    // rather than keeping a copy on GameState.
    unsubs.push(g.eventBus.on(Events.BOSS_SHIELD_START, ({ target }) => {
      uiStore.setBossShieldTarget(target)
    }))
    unsubs.push(g.eventBus.on(Events.BOSS_SHIELD_END, () => {
      uiStore.setBossShieldTarget(null)
    }))

    // Tower selected → open BuildPanel (engine → Vue UI bridge)
    unsubs.push(g.eventBus.on(Events.TOWER_SELECTED, (tower) => {
      if (
        tower
        && typeof tower === 'object'
        && 'id' in tower
        && typeof (tower as { id: unknown }).id === 'string'
      ) {
        uiStore.openBuildPanel((tower as Tower).id)
      } else {
        uiStore.closeBuildPanel()
      }
    }))

    // Tower placed successfully → select it and open the panel for parameter setup
    unsubs.push(g.eventBus.on(Events.TOWER_PLACED, (tower) => {
      uiStore.openBuildPanel(tower.id)
      uiStore.setBuildHintStep(2)
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

