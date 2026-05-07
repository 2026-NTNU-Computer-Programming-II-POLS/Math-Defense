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
import { EventRecorder } from '@/engine/replay/EventRecorder'
import { createGeneratedLevelContext } from '@/engine/generated-level-context'
import { buildWavesForStar } from '@/data/wave-generator'
import { Events, GamePhase, type TowerType } from '@/data/constants'
import type { Tower } from '@/entities/types'
import type { GeneratedLevel } from '@/math/curve-types'
import { TOWER_TO_PRINCIPLE, type PrincipleId } from '@/data/principle-defs'
import type { Checkpoint } from '@/domain/level/checkpoint'
import { assetManager } from '@/engine/audio/AssetManager'

export type IAResult = 'correct' | 'wrong' | 'paid' | 'ignored' | null

export interface GameLoopOptions {
  generatedLevel?: GeneratedLevel | null
  iaResult?: IAResult
  /**
   * Pedagogical Backlog §12 — when present, the level boots in "checkpoint
   * retry" mode: gold/hp/costTotal/killValue are pre-seeded from the
   * checkpoint, the wave counter resumes at `waveIndex`, and the run is
   * tagged as practice for the Score Result View.
   */
  restoreCheckpoint?: Checkpoint | null
  /**
   * Pedagogical Backlog §24 — per-session deterministic seed forwarded from
   * LevelSelectView. Applied via {@link Game.setSeed} BEFORE startLevel so
   * the LEVEL_START handlers and the very first system tick use the seeded
   * RNG. Omitting it leaves game.rng on the Math.random fallback (the run
   * still works but is not replayable).
   */
  seed?: number | null
}

export function useGameLoop(canvasRef: Ref<HTMLCanvasElement | null>, options: GameLoopOptions = {}) {
  const game = ref<Game | null>(null)
  const ready = ref(false)
  const pathsVisible = ref(options.iaResult !== 'ignored')
  const generatedLevel = ref<GeneratedLevel | null>(options.generatedLevel ?? null)
  const loadError = ref<string | null>(null)
  // Pending checkpoint to apply on the next wireEngine pass. Refreshed by
  // restoreFromCheckpoint() so a single composable can rebuild the engine
  // in place rather than requiring a route remount.
  let pendingCheckpoint: Checkpoint | null = options.restoreCheckpoint ?? null
  const gameStore = useGameStore()
  const uiStore = useUiStore()
  const sessionSync = useSessionSync()
  const { bind: bindSession, newlyUnlockedAchievements, lastCompletedSessionId, isPracticeMode } = sessionSync
  const unsubs: (() => void)[] = []
  // Backlog §24 Phase B — recorder lifetime is tied to the engine. Started
  // after addSystem so it sees system-emitted events; destroyed in the same
  // teardown pass as the engine. Holds a ref into useSessionSync.sessionId
  // so the recorder posts to the correct session even if a retry() triggers
  // a new server-side session id mid-flow.
  let recorder: EventRecorder | null = null

  // Pedagogy: principle-overlay state (Backlog item #1). Updated by PRINCIPLE_SHOW
  // subscription below; consumed by <PrincipleOverlay> in GameView.
  const currentPrincipleId = ref<PrincipleId | null>(null)
  // Track principles already shown this level to bias toward novelty (per §1.6:
  // "rotate among the towers used, prefer the rarest").
  const shownPrincipleIdsThisLevel = new Set<PrincipleId>()
  function clearPrinciple(): void { currentPrincipleId.value = null }

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

  /**
   * Tear down the active engine and re-boot with a checkpoint pre-applied.
   * Used by the §12 Star-5 GAME_OVER affordance — produces a fresh server
   * session (via the LEVEL_START → useSessionSync hook) so the score
   * formula's anti-cheat invariants are preserved.
   */
  function restoreFromCheckpoint(checkpoint: Checkpoint): void {
    pendingCheckpoint = checkpoint
    retry()
  }

  async function wireEngine(canvas: HTMLCanvasElement): Promise<void> {
    if (game.value) {
      game.value.destroy()
      game.value = null
    }
    unsubs.splice(0).forEach((fn) => fn())

    const g = new Game(canvas)

    const talentStore = useTalentStore()
    g.towerModifierProvider = (towerType) => talentStore.getTowerModifiers(towerType)

    try {
    const placement = new TowerPlacementSystem()
    placement.getSelectedTowerType = () => uiStore.selectedTowerType as TowerType | null
    placement.clearSelectedTowerType = () => { uiStore.clearSelectedTower() }

    const movement = new MovementSystem()
    movement.setLeadEnemyX = (x: number) => { gameStore.setLeadEnemyX(x) }

    // Register LEVEL_START/END handlers BEFORE addSystem so the level context
    // is created before TowerPlacementSystem (and other systems) read it.
    unsubs.push(g.eventBus.on(Events.LEVEL_START, (_levelNum) => {
      g.levelContext?.dispose()
      g.levelContext = null
      gameStore.clearPathPanel()

      if (g.generatedLevel) {
        g.state.pathsVisible = options.iaResult !== 'ignored'
        g.state.starRating = g.generatedLevel.starRating
        g.renderer.setStarPalette(g.generatedLevel.starRating)
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

    const systems: [string, import('@/engine/Game').GameSystem][] = [
      ['placement', placement],
      ['enemyAbility', new EnemyAbilitySystem()],
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

    unsubs.push(g.eventBus.on(Events.TOWER_REMOVED, ({ towerId }) => {
      if (uiStore.buildPanelTowerId === towerId) uiStore.closeBuildPanel()
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
      // Track MONTY_HALL and CHAIN_RULE as UI-pause phases so their duration is
      // excluded from activeTime = timeTotal - sum(timeExcludePrepare).
      if (to === GamePhase.MONTY_HALL || to === GamePhase.CHAIN_RULE) {
        g.state.pausePhaseStart = g.time
      }
      if ((from === GamePhase.MONTY_HALL || from === GamePhase.CHAIN_RULE) && g.state.pausePhaseStart > 0) {
        g.state.timeExcludePrepare.push(g.time - g.state.pausePhaseStart)
        g.state.pausePhaseStart = 0
      }
    }))

    // Pedagogy: principle-overlay event wiring (Backlog item #1). The selector
    // picks the dominant tower archetype on the field at WAVE_END and emits
    // PRINCIPLE_SHOW with the matching principle id. Chain-rule and Monty-Hall
    // events emit their fixed principles directly. The overlay component
    // ultimately decides whether to render based on uiStore preference.
    unsubs.push(g.eventBus.on(Events.LEVEL_START, () => {
      shownPrincipleIdsThisLevel.clear()
      currentPrincipleId.value = null
    }))

    unsubs.push(g.eventBus.on(Events.WAVE_END, () => {
      const id = pickPrincipleForWave(g, shownPrincipleIdsThisLevel)
      if (id !== null) g.eventBus.emit(Events.PRINCIPLE_SHOW, { id })
    }))

    unsubs.push(g.eventBus.on(Events.CHAIN_RULE_END, ({ correct }) => {
      if (correct) g.eventBus.emit(Events.PRINCIPLE_SHOW, { id: 'chain-rule' })
    }))

    unsubs.push(g.eventBus.on(Events.MONTY_HALL_RESULT, () => {
      g.eventBus.emit(Events.PRINCIPLE_SHOW, { id: 'monty-hall' })
    }))

    unsubs.push(g.eventBus.on(Events.PRINCIPLE_SHOW, ({ id }) => {
      if (!uiStore.principleOverlayEnabled) return
      shownPrincipleIdsThisLevel.add(id)
      currentPrincipleId.value = id
    }))

    // Pedagogical Backlog §15.4 — wire SFX triggers. Loaded lazily so the
    // first wireEngine pass kicks off network requests for `/audio/*.mp3`,
    // and subsequent retries reuse the cached element pool.
    void assetManager.load()
    // Player-facing spell trigger lives on SPELL_CAST (emitted from SpellBar).
    // CAST_SPELL is an internal tower-cast event with much higher fire rate.
    unsubs.push(g.eventBus.on(Events.SPELL_CAST, () => assetManager.play('cast-spell')))
    unsubs.push(g.eventBus.on(Events.ENEMY_KILLED, () => assetManager.play('kill')))
    unsubs.push(g.eventBus.on(Events.WAVE_END, () => assetManager.play('wave-end')))
    unsubs.push(g.eventBus.on(Events.MONTY_HALL_RESULT, () => assetManager.play('mh-reveal')))
    unsubs.push(g.eventBus.on(Events.PHASE_CHANGED, ({ from, to }) => {
      if (to === GamePhase.BUILD) assetManager.play('ambient-build')
      else if (from === GamePhase.BUILD) assetManager.stop('ambient-build')
    }))
    // Singleton ambient survives engine teardown — without this cleanup the
    // BUILD-phase loop keeps playing after the player leaves GameView, and
    // also persists across retry() between unsubs-splice and the next phase
    // transition that would have stopped it organically.
    unsubs.push(() => assetManager.stop('ambient-build'))

    unsubs.push(...bindSession(g))

    // Backlog §24 — start the event recorder AFTER bindSession so the LEVEL_START
    // listener inside useSessionSync has already fired createSession by the
    // time the first event posts. The recorder calls getSessionId() lazily,
    // so an event captured before the session exists is buffered and
    // re-tried on the next flush.
    recorder = new EventRecorder(g, () => sessionSync.sessionId.value)
    recorder.start()
    unsubs.push(() => {
      recorder?.destroy()
      recorder = null
    })

    // Achievement-unlock SFX: piggy-back on the ref that AchievementToast
    // already watches so we don't need a parallel event channel.
    unsubs.push(watch(newlyUnlockedAchievements, (list) => {
      if (list && list.length > 0) assetManager.play('achievement')
    }))

    // Bridge uiStore audio prefs → AssetManager. immediate:true seeds the
    // initial state so a muted/volume value persisted from a previous
    // session is honoured before any SFX fires.
    unsubs.push(watch(() => uiStore.audioVolume, (v) => assetManager.setVolume(v), { immediate: true }))
    unsubs.push(watch(() => uiStore.audioMuted, (m) => assetManager.mute(m), { immediate: true }))

    gameStore.bindEngine(g)
    game.value = g
    ready.value = true
    g.start()

    // V2: auto-start the generated level immediately after the engine boots.
    if (generatedLevel.value) {
      g.generatedLevel = generatedLevel.value
      const waves = buildWavesForStar(generatedLevel.value.starRating)
      if (waves.length === 0) {
        throw new Error(`[useGameLoop] buildWavesForStar(${generatedLevel.value.starRating}) returned no waves`)
      }
      g.currentWaves = waves
      // Backlog §24: apply the seeded RNG BEFORE startLevel so the very first
      // LEVEL_START listener tick and any system init() that consumes randomness
      // observe the seeded stream. Re-seeding here on retry() rebuilds the same
      // stream, which is what we want for "retry the same level the same way".
      if (typeof options.seed === 'number') g.setSeed(options.seed)
      g.startLevel(generatedLevel.value.starRating)

      // Apply checkpoint AFTER startLevel — startLevel resets state via
      // createInitialState, and the gameStore LEVEL_START handler mirrors
      // the post-reset values. Patching state then re-syncing the store
      // gives a single source of truth without racing the event order.
      if (pendingCheckpoint) {
        const cp = pendingCheckpoint
        g.state.gold = cp.gold
        g.state.hp = cp.hp
        // healthOrigin scopes the score formula's HP-bonus baseline to this
        // practice run so the player isn't penalised for HP they lost in
        // the abandoned session (see calculateScore in score-calculator.ts).
        g.state.healthOrigin = cp.hp
        g.state.costTotal = cp.costTotal
        g.state.cumulativeKillValue = cp.killValue
        // Pre-seed wave so the next startWave() emits the correct number.
        g.state.wave = cp.waveIndex - 1
        gameStore.syncFromEngine(g)
        gameStore.markCheckpointRun()
        // Re-arm the store: bindEngine called unbindEngine() during the
        // rebind dance which cleared lastCheckpoint. Preserving it lets the
        // player retry from the same point if they die again before
        // clearing a new wave.
        gameStore.setCheckpoint(cp)
        pendingCheckpoint = null
      }
    }
    } catch (err) {
      gameStore.unbindEngine()
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

  return {
    game, ready, loadError, retry, pathsVisible, generatedLevel,
    newlyUnlockedAchievements, lastCompletedSessionId,
    currentPrincipleId, clearPrinciple,
    restoreFromCheckpoint,
    isPracticeMode,
  }
}

/**
 * Pick a principle id for a wave just ended. Counts towers on the field by
 * archetype. Defaults to the dominant tower's principle (per §1.4 acceptance:
 * a Magic-dominated wave surfaces the magic-curve-zone principle). When the
 * dominant principle has already been shown this level, falls back to the
 * rarest unshown principle (per §1.6 risk mitigation: "rotate among the
 * towers used, prefer the rarest"). When everything has been shown, cycles
 * back to the dominant. Returns null when no towers are placed.
 */
export function pickPrincipleForWave(
  g: Pick<Game, 'towers'>,
  alreadyShown: ReadonlySet<PrincipleId>,
): PrincipleId | null {
  const counts = new Map<PrincipleId, number>()
  for (const tower of g.towers) {
    const principleId = TOWER_TO_PRINCIPLE[tower.type]
    if (principleId === undefined) continue
    counts.set(principleId, (counts.get(principleId) ?? 0) + 1)
  }
  if (counts.size === 0) return null

  let dominant: { id: PrincipleId; count: number } | null = null
  let rarestUnshown: { id: PrincipleId; count: number } | null = null
  for (const [id, count] of counts) {
    if (dominant === null || count > dominant.count) dominant = { id, count }
    if (!alreadyShown.has(id) && (rarestUnshown === null || count < rarestUnshown.count)) {
      rarestUnshown = { id, count }
    }
  }

  // Prefer the dominant principle if the player hasn't seen it yet this level
  // (preserves the §1.4 acceptance criterion). If the dominant has already
  // been shown, surface a less-seen principle so consecutive waves rotate.
  if (dominant !== null && !alreadyShown.has(dominant.id)) return dominant.id
  if (rarestUnshown !== null) return rarestUnshown.id
  return dominant!.id
}
