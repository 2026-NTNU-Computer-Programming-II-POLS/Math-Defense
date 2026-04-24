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
  // K-3: surface a user-facing error when init throws so GameView can render a
  // retry Modal. `initWasm` itself never rejects (it falls back to JS), but the
  // rest of the boot path (canvas 2D ctx acquisition, system wiring) can.
  const loadError = ref<string | null>(null)
  const gameStore = useGameStore()
  const uiStore = useUiStore()
  const { bind: bindSession } = useSessionSync()
  const unsubs: (() => void)[] = []

  async function boot(): Promise<void> {
    loadError.value = null
    try {
      await initWasm()
      const canvas = canvasRef.value
      if (!canvas) {
        loadError.value = 'Canvas element not mounted'
        return
      }
      await wireEngine(canvas)
    } catch (err) {
      console.error('[useGameLoop] Init failed:', err)
      loadError.value = err instanceof Error ? err.message : String(err)
    }
  }

  function retry(): void {
    ready.value = false
    if (game.value) {
      try { game.value.destroy() } catch { /* ignore */ }
      game.value = null
    }
    unsubs.splice(0).forEach((fn) => { try { fn() } catch { /* ignore */ } })
    void boot()
  }

  async function wireEngine(canvas: HTMLCanvasElement): Promise<void> {

    // HMR defensive + K-3 retry: if a prior Game survived without an unmount
    // (Vite re-fired onMounted) or a previous wireEngine threw after
    // constructing Game but before `game.value = g`, tear it down before
    // creating a new one. InputManager listeners would otherwise accumulate
    // on the canvas/window. Also flush stale `unsubs` from the failed pass —
    // their handlers target a destroyed eventBus (no-op), but the array
    // itself must start empty so onUnmounted only drops live subscriptions.
    if (game.value) {
      game.value.destroy()
      game.value = null
    }
    unsubs.splice(0).forEach((fn) => fn())

    const g = new Game(canvas)

    // K-3: everything after `new Game(canvas)` runs inside a try/catch so a
    // system-wiring failure can't leave the canvas holding InputManager
    // listeners on an orphaned Game (game.value is only assigned at the very
    // end). On throw: destroy the in-flight engine, drop any unsubs that
    // were already pushed, then rethrow so boot()'s catch records loadError.
    try {
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
      if (!level) {
        uiStore.showModal('Level failed to load (K-3)', `Unknown level id: ${levelNum}`)
        return
      }
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
        && 'type' in tower
        && typeof (tower as { type: unknown }).type === 'string'
        && 'params' in tower
        && typeof (tower as { params: unknown }).params === 'object'
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
    } catch (err) {
      // Tear down the in-flight Game (destroy removes InputManager listeners
      // and clears the eventBus) before surfacing the error to boot().
      try { g.destroy() } catch { /* ignore cascading teardown failures */ }
      unsubs.splice(0).forEach((fn) => { try { fn() } catch { /* ignore */ } })
      throw err
    }
  }

  // K-1: re-sync the canvas backing store when DPR changes (monitor switch)
  // or the window is resized. The CSS size stays pinned to 1280×720 — only
  // the pixel buffer + ctx transform are rebuilt so pixel art stays crisp
  // on hi-DPR displays without redoing layout math.
  let dprMql: MediaQueryList | null = null
  let dprMqlListener: ((ev: MediaQueryListEvent) => void) | null = null
  function resyncDpr(): void {
    game.value?.renderer.resyncDpr()
  }
  function armDprWatch(): void {
    // matchMedia with resolution:<dpr>dppx fires when DPR actually changes
    // (e.g., drag to another monitor). The listener is re-armed because
    // each change produces a brand-new DPR value.
    if (typeof window === 'undefined' || !window.matchMedia) return
    dprMql?.removeEventListener?.('change', dprMqlListener!)
    dprMql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    dprMqlListener = () => { resyncDpr(); armDprWatch() }
    dprMql.addEventListener?.('change', dprMqlListener)
  }
  function onWindowResize(): void {
    resyncDpr()
  }

  onMounted(() => {
    void boot()
    armDprWatch()
    window.addEventListener('resize', onWindowResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', onWindowResize)
    if (dprMql && dprMqlListener) dprMql.removeEventListener?.('change', dprMqlListener)
    dprMql = null
    dprMqlListener = null
    unsubs.forEach((fn) => fn())  // 1. Remove composable-level event listeners
    gameStore.unbindEngine()      // 2. Unbind store from engine
    if (game.value) {
      game.value.destroy()        // 3. Stop loop + destroy all systems + clear eventBus + input
      game.value = null           // 4. Release reference to prevent memory leak
    }
  })

  return { game, ready, loadError, retry }
}

