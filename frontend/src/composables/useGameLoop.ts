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
import { MagicTowerSystem } from '@/systems/MagicTowerSystem'
import { RadarTowerSystem } from '@/systems/RadarTowerSystem'
import { MatrixTowerSystem } from '@/systems/MatrixTowerSystem'
import { LimitTowerSystem } from '@/systems/LimitTowerSystem'
import { CalculusTowerSystem, PetCombatSystem } from '@/systems/CalculusTowerSystem'
import { TowerUpgradeSystem } from '@/systems/TowerUpgradeSystem'
import { EnemyAbilitySystem } from '@/systems/EnemyAbilitySystem'
import { SpellSystem } from '@/systems/SpellSystem'
import { MontyHallSystem } from '@/systems/MontyHallSystem'
import { EnemyRenderer } from '@/renderers/EnemyRenderer'
import { TowerRenderer } from '@/renderers/TowerRenderer'
import { ProjectileRenderer } from '@/renderers/ProjectileRenderer'
import { MagicZoneRenderer } from '@/renderers/MagicZoneRenderer'
import { RadarRangeRenderer } from '@/renderers/RadarRangeRenderer'
import { MatrixLaserRenderer } from '@/renderers/MatrixLaserRenderer'
import { PetRenderer } from '@/renderers/PetRenderer'
import { SpellEffectRenderer } from '@/renderers/SpellEffectRenderer'
import { initWasm } from '@/math/WasmBridge'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { useTalentStore } from '@/stores/talentStore'
import { useSessionSync } from '@/composables/useSessionSync'
import { createGeneratedLevelContext } from '@/engine/generated-level-context'
import { buildWavesForStar } from '@/data/wave-generator'
import { Events, GamePhase, type TowerType } from '@/data/constants'
import type { Tower } from '@/entities/types'
import type { GeneratedLevel } from '@/math/curve-types'

export type IAResult = 'correct' | 'wrong' | 'paid' | 'ignored' | null

export interface GameLoopOptions {
  generatedLevel?: GeneratedLevel | null
  iaResult?: IAResult
}

export function useGameLoop(canvasRef: Ref<HTMLCanvasElement | null>, options: GameLoopOptions = {}) {
  const game = ref<Game | null>(null)
  const ready = ref(false)
  const pathsVisible = ref(options.iaResult !== 'ignored')
  const generatedLevel = ref<GeneratedLevel | null>(options.generatedLevel ?? null)
  const loadError = ref<string | null>(null)
  const gameStore = useGameStore()
  const uiStore = useUiStore()
  const { bind: bindSession, newlyUnlockedAchievements } = useSessionSync()
  const unsubs: (() => void)[] = []

  async function boot(): Promise<void> {
    loadError.value = null
    try {
      await Promise.all([initWasm(), useTalentStore().load()])
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
    if (game.value) {
      game.value.destroy()
      game.value = null
    }
    unsubs.splice(0).forEach((fn) => fn())

    const g = new Game(canvas)

    const talentStore = useTalentStore()
    g.towerModifierProvider = (towerType) => talentStore.getTowerModifiers(towerType as any)

    try {
    const placement = new TowerPlacementSystem()
    placement.getSelectedTowerType = () => uiStore.selectedTowerType as TowerType | null
    placement.clearSelectedTowerType = () => { uiStore.clearSelectedTower() }

    const movement = new MovementSystem()
    movement.setLeadEnemyX = (x: number) => { gameStore.setLeadEnemyX(x) }

    const systems: [string, import('@/engine/Game').GameSystem][] = [
      ['placement', placement],
      ['combat', new CombatSystem()],
      ['movement', movement],
      ['wave', new WaveSystem()],
      ['buff', new BuffSystem()],
      ['economy', new EconomySystem()],
      ['magicTower', new MagicTowerSystem()],
      ['radarTower', new RadarTowerSystem()],
      ['matrixTower', new MatrixTowerSystem()],
      ['limitTower', new LimitTowerSystem()],
      ['calculusTower', new CalculusTowerSystem()],
      ['petCombat', new PetCombatSystem()],
      ['towerUpgrade', new TowerUpgradeSystem()],
      ['enemyAbility', new EnemyAbilitySystem()],
      ['spell', new SpellSystem()],
      ['montyHall', new MontyHallSystem()],
      ['enemyRenderer', new EnemyRenderer()],
      ['towerRenderer', new TowerRenderer()],
      ['projectileRenderer', new ProjectileRenderer()],
      ['magicZoneRenderer', new MagicZoneRenderer()],
      ['radarRangeRenderer', new RadarRangeRenderer()],
      ['matrixLaserRenderer', new MatrixLaserRenderer()],
      ['petRenderer', new PetRenderer()],
      ['spellEffectRenderer', new SpellEffectRenderer()],
    ]
    for (const [name, sys] of systems) g.addSystem(name, sys)

    // V2: Generated level context wiring on LEVEL_START.
    // For V1 levels (no generatedLevel), nothing is loaded and the game stays
    // in MENU phase until a level is selected via the legacy LevelCard overlay.
    unsubs.push(g.eventBus.on(Events.LEVEL_START, (_levelNum) => {
      g.levelContext?.dispose()
      g.levelContext = null
      gameStore.clearPathPanel()

      if (g.generatedLevel) {
        g.state.pathsVisible = options.iaResult !== 'ignored'
        g.state.starRating = g.generatedLevel.starRating
        g.state.initialAnswer = options.iaResult === 'correct' ? 1 : 0
        if (options.iaResult === 'paid') {
          g.changeGold(-50)
          g.addCost(50)
        }
        g.levelContext = createGeneratedLevelContext(g.generatedLevel, g.eventBus)
        return
      }

      uiStore.showModal('Level failed to load (K-3)', 'No level configuration available.')
    }))

    unsubs.push(g.eventBus.on(Events.LEVEL_END, () => {
      g.levelContext?.dispose()
      g.levelContext = null
      gameStore.clearPathPanel()
    }))

    unsubs.push(watch(
      () => uiStore.hoveredSegmentId,
      (id) => { g.hoveredSegmentId = id },
      { immediate: true },
    ))

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

    unsubs.push(g.eventBus.on(Events.TOWER_PLACED, (tower) => {
      uiStore.openBuildPanel(tower.id)
      uiStore.setBuildHintStep(2)
    }))

    unsubs.push(g.eventBus.on(Events.PHASE_CHANGED, ({ from, to }) => {
      if (to === GamePhase.BUILD && g.state.wave > 0) {
        g.state.prepPhaseStart = g.time
      }
      if (from === GamePhase.BUILD && g.state.prepPhaseStart > 0) {
        const duration = g.time - g.state.prepPhaseStart
        g.state.timeExcludePrepare.push(duration)
        g.state.prepPhaseStart = 0
      }
    }))

    unsubs.push(...bindSession(g))

    gameStore.bindEngine(g)
    game.value = g
    ready.value = true
    g.start()

    // V2: auto-start the generated level immediately after the engine boots.
    if (generatedLevel.value) {
      g.generatedLevel = generatedLevel.value
      g.currentWaves = buildWavesForStar(generatedLevel.value.starRating)
      g.startLevel(-1)
    }
    } catch (err) {
      try { g.destroy() } catch { /* ignore cascading teardown failures */ }
      unsubs.splice(0).forEach((fn) => { try { fn() } catch { /* ignore */ } })
      throw err
    }
  }

  let dprMql: MediaQueryList | null = null
  let dprMqlListener: ((ev: MediaQueryListEvent) => void) | null = null
  function resyncDpr(): void {
    game.value?.renderer.resyncDpr()
  }
  function armDprWatch(): void {
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
    unsubs.forEach((fn) => fn())
    gameStore.unbindEngine()
    if (game.value) {
      game.value.destroy()
      game.value = null
    }
  })

  return { game, ready, loadError, retry, pathsVisible, generatedLevel, newlyUnlockedAchievements }
}
