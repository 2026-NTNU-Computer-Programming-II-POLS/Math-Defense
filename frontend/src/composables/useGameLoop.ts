/**
 * useGameLoop — game-engine lifecycle composable for GameView (F-ARCH-5).
 *
 * Decomposed from the previous 470-line god-composable into focused pieces:
 *
 *   - registerSystems(game)            engine/  pure system list
 *   - bindEngineUiBridges              uiStore↔engine plumbing
 *   - bindEngineAudio                  AssetManager wiring
 *   - createPrincipleOverlay           pedagogy overlay state machine
 *
 * What stays here is the lifecycle-coordinator role: WASM init, talent load,
 * canvas mount, retry/checkpoint, DPR re-sync, the per-frame timing mirror,
 * session-sync wiring, and the recorder lifetime tied to the engine.
 */
import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import { Game } from '@/engine/Game'
import { registerSystems } from '@/engine/register-systems'
import { initWasm } from '@/math/WasmBridge'
import { useGameStore } from '@/stores/gameStore'
import { useUiStore } from '@/stores/uiStore'
import { useTalentStore } from '@/stores/talentStore'
import { useSessionSync } from '@/composables/useSessionSync'
import { bindEngineUiBridges } from '@/composables/useEngineUiBridges'
import { bindEngineAudio } from '@/composables/useEngineAudio'
import { createPrincipleOverlay } from '@/composables/usePrincipleOverlay'
import { setEngine as setCommandEngine, clearEngine as clearCommandEngine } from '@/services/gameCommandService'
import { EventRecorder } from '@/engine/replay/EventRecorder'
import { createGeneratedLevelContext } from '@/engine/generated-level-context'
import { buildWavesForStar } from '@/domain/wave/wave-generator'
import { Events, type TowerType } from '@/data/constants'
import type { GeneratedLevel } from '@/math/curve-types'
import type { Checkpoint } from '@/domain/level/checkpoint'

// Re-export so the existing pickPrincipleForWave.test.ts location keeps working.
export { pickPrincipleForWave } from '@/composables/usePrincipleOverlay'

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
  let pendingCheckpoint: Checkpoint | null = options.restoreCheckpoint ?? null

  const gameStore = useGameStore()
  const uiStore = useUiStore()
  const sessionSync = useSessionSync()
  const {
    bind: bindSession,
    newlyUnlockedAchievements,
    lastCompletedSessionId,
    isPracticeMode,
    abandonRun,
  } = sessionSync
  const principleOverlay = createPrincipleOverlay()

  const unsubs: (() => void)[] = []
  let recorder: EventRecorder | null = null

  // F-BUG-13: composable disposal flag. Set in onUnmounted; checked after
  // every await in boot/wireEngine so a fast back-button (route teardown
  // before initWasm() / talentStore.load() resolve) doesn't go on to mount
  // a Game on a now-detached canvas.
  let disposed = false
  // F-BUG-15: monotonic boot generation. retry() bumps it; any in-flight
  // boot whose generation is stale at an await boundary bails out.
  let bootGeneration = 0

  // Per-frame timing mirror (was gameStore._startTimingSync; F-ARCH-1 moved
  // it here so the store stays a pure mirror without owning a RAF loop).
  let _timingMirrorRaf: number | null = null
  function _startTimingMirror(): void {
    _stopTimingMirror()
    let frameCount = 0
    const tick = () => {
      frameCount++
      const g = game.value
      if (g && frameCount % 30 === 0) {
        gameStore.pushTimingTick(g.state.timeTotal, g.state.spellCooldowns)
      }
      _timingMirrorRaf = requestAnimationFrame(tick)
    }
    _timingMirrorRaf = requestAnimationFrame(tick)
  }
  function _stopTimingMirror(): void {
    if (_timingMirrorRaf !== null) {
      cancelAnimationFrame(_timingMirrorRaf)
      _timingMirrorRaf = null
    }
  }

  async function boot(): Promise<void> {
    loadError.value = null
    const myGen = ++bootGeneration
    try {
      await Promise.all([initWasm(), useTalentStore().load()])
      if (disposed || myGen !== bootGeneration) return
      const canvas = canvasRef.value
      if (!canvas) {
        loadError.value = 'Canvas element not mounted'
        return
      }
      await wireEngine(canvas, myGen)
    } catch (err) {
      if (disposed || myGen !== bootGeneration) return
      console.error('[useGameLoop] Init failed:', err)
      loadError.value = err instanceof Error ? err.message : String(err)
    }
  }

  function retry(): void {
    // F-BUG-15: bump generation FIRST so any boot already past its first
    // await sees the stale generation and bails before touching the canvas.
    bootGeneration++
    ready.value = false
    teardownEngine()
    void boot()
  }

  function restoreFromCheckpoint(checkpoint: Checkpoint): void {
    pendingCheckpoint = checkpoint
    retry()
  }

  function teardownEngine(): void {
    _stopTimingMirror()
    unsubs.splice(0).forEach((fn) => { try { fn() } catch { /* ignore */ } })
    if (game.value) {
      try { game.value.destroy() } catch { /* ignore */ }
      game.value = null
    }
    clearCommandEngine()
  }

  async function wireEngine(canvas: HTMLCanvasElement, myGen: number = bootGeneration): Promise<void> {
    if (disposed || myGen !== bootGeneration) return
    teardownEngine()

    const g = new Game(canvas)

    const talentStore = useTalentStore()
    g.towerModifierProvider = (towerType) => talentStore.getTowerModifiers(towerType)

    try {
      // Register LEVEL_START/END handlers BEFORE registerSystems so the
      // level context is created before TowerPlacementSystem (and other
      // systems) read it.
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
            g.economy.changeGold(-50)
            g.economy.addCost(50)
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

      registerSystems(g, {
        getSelectedTowerType: () => uiStore.selectedTowerType as TowerType | null,
        clearSelectedTowerType: () => { uiStore.clearSelectedTower() },
        setLeadEnemyX: (x: number) => { gameStore.setLeadEnemyX(x) },
      })

      unsubs.push(...bindEngineUiBridges(g))
      unsubs.push(...principleOverlay.bind(g))
      unsubs.push(...bindEngineAudio(g, { newlyUnlockedAchievements }))
      unsubs.push(...bindSession(g))

      // Backlog §24 — start the event recorder AFTER bindSession so the LEVEL_START
      // listener inside useSessionSync has already fired createSession by the
      // time the first event posts.
      recorder = new EventRecorder(g, () => sessionSync.sessionId.value)
      recorder.start()
      unsubs.push(() => {
        recorder?.destroy()
        recorder = null
      })

      gameStore.bindEngine(g)
      setCommandEngine(g)
      _startTimingMirror()
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
        // LEVEL_START listener tick observes the seeded stream.
        if (typeof options.seed === 'number') g.setSeed(options.seed)
        g.startLevel(generatedLevel.value.starRating)

        if (pendingCheckpoint) {
          const cp = pendingCheckpoint
          g.restoreFromCheckpoint(cp)
          gameStore.syncFromEngine(g)
          gameStore.markCheckpointRun()
          // Re-arm the store: bindEngine called unbindEngine() during the
          // rebind dance which cleared lastCheckpoint. Preserving it lets
          // the player retry from the same point if they die again before
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

  // ── DPR resync (high-DPI screen-zoom changes) ──
  let dprMql: MediaQueryList | null = null
  let dprMqlListener: ((ev: MediaQueryListEvent) => void) | null = null
  function resyncDpr(): void {
    game.value?.renderer.resyncDpr()
  }
  function armDprWatch(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return
    if (dprMql && dprMqlListener) dprMql.removeEventListener?.('change', dprMqlListener)
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
    disposed = true
    bootGeneration++
    window.removeEventListener('resize', onWindowResize)
    if (dprMql && dprMqlListener) dprMql.removeEventListener?.('change', dprMqlListener)
    dprMql = null
    dprMqlListener = null
    teardownEngine()
    gameStore.unbindEngine()
  })

  return {
    game, ready, loadError, retry, pathsVisible, generatedLevel,
    newlyUnlockedAchievements, lastCompletedSessionId,
    currentPrincipleId: principleOverlay.currentPrincipleId,
    clearPrinciple: principleOverlay.clearPrinciple,
    restoreFromCheckpoint,
    isPracticeMode,
    abandonRun,
  }
}
