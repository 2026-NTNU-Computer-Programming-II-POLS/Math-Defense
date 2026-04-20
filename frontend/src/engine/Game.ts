/**
 * Game — lightweight game loop (handles only update + render scheduling)
 * No longer a God Object: state is in GameState, phases are in PhaseStateMachine,
 * Buff flags are explicitly declared in GameState.
 */
import { EventBus } from './EventBus'
import { Renderer } from './Renderer'
import { InputManager } from './InputManager'
import { PhaseStateMachine } from './PhaseStateMachine'
import { type GameState, createInitialState } from './GameState'
import { GamePhase, Events, FIXED_DT } from '@/data/constants'
import type { Tower, Enemy, Projectile } from '@/entities/types'
import type { BuffDef } from '@/data/buff-defs'
import type { SegmentedPath } from '@/domain/path/segmented-path'
import type { PathProgressTracker, SegmentChangedPayload } from '@/domain/path/path-progress-tracker'
import type { PlacementRejectionReason } from '@/domain/level/placement-policy'
import type { LevelContext } from './level-context'
import type { BuffSystem } from '@/systems/BuffSystem'
import type { CombatSystem } from '@/systems/CombatSystem'
import type { MovementSystem } from '@/systems/MovementSystem'
import type { WaveSystem } from '@/systems/WaveSystem'
import type { TowerPlacementSystem } from '@/systems/TowerPlacementSystem'
import type { EconomySystem } from '@/systems/EconomySystem'
import type { EnemyRenderer } from '@/renderers/EnemyRenderer'
import type { TowerRenderer } from '@/renderers/TowerRenderer'
import type { ProjectileRenderer } from '@/renderers/ProjectileRenderer'

// ── Type-safe event map ──

export interface CoordPayload {
  pixel: { x: number; y: number }
  game: { x: number; y: number }
}

/**
 * Immutable snapshot published alongside WAVE_END.
 * Consumers must read from the payload, not from `game.state`, so that a
 * listener running earlier in the dispatch chain cannot bias a later
 * listener's view of resources at wave-end.
 */
export interface WaveEndSnapshot {
  readonly wave: number
  readonly gold: number
  readonly hp: number
  readonly score: number
}

export interface GameEvents {
  [Events.PHASE_CHANGED]:        { from: GamePhase; to: GamePhase }
  [Events.LEVEL_START]:          number
  [Events.LEVEL_END]:            void
  [Events.GAME_OVER]:            void
  [Events.BUILD_PHASE_START]:    void
  [Events.BUILD_PHASE_END]:      void
  [Events.TOWER_PLACED]:         Tower
  [Events.TOWER_SELECTED]:       Tower | null
  [Events.TOWER_PARAMS_SET]:     { towerId: string; params: Tower['params'] }
  [Events.CAST_SPELL]:           Tower
  [Events.WAVE_START]:           number
  [Events.WAVE_END]:             WaveEndSnapshot
  [Events.ENEMY_SPAWNED]:        Enemy
  [Events.ENEMY_KILLED]:         Enemy
  [Events.ENEMY_REACHED_ORIGIN]: Enemy
  [Events.TOWER_ATTACK]:         { tower: Tower; target: Enemy }
  [Events.BUFF_PHASE_START]:     void
  [Events.BUFF_CARDS_UPDATED]:   ReadonlyArray<BuffDef & { isCurse: boolean }>
  [Events.BUFF_CARD_SELECTED]:   string
  [Events.BUFF_RESULT]:          { success: boolean; cardId: string; skipped: boolean; insufficientGold?: boolean }
  [Events.BUFF_PHASE_END]:       void
  [Events.BOSS_SHIELD_START]:    { target: { freqs: number[]; amps: number[] } }
  [Events.BOSS_SHIELD_ATTEMPT]:  { match: number }
  [Events.BOSS_SHIELD_END]:      void
  [Events.GOLD_CHANGED]:         number
  [Events.HP_CHANGED]:           number
  [Events.SCORE_CHANGED]:        number
  [Events.CANVAS_CLICK]:         CoordPayload
  [Events.CANVAS_HOVER]:         CoordPayload
  [Events.SEGMENT_CHANGED]:      SegmentChangedPayload
  [Events.PLACEMENT_REJECTED]:   { gx: number; gy: number; reason: PlacementRejectionReason }
}

export type GameEventBus = EventBus<GameEvents>

/**
 * Narrow view of the per-level runtime that `MovementSystem` needs.
 * Phase 3's `LevelContext` supersets this; typed here as its own name so
 * the Phase-2 surface stays minimal and the Phase-3 widening is a single-
 * line replacement (see P3-T7 in the Piecewise Paths construction plan).
 */
export interface MovementLevelContext {
  readonly path: SegmentedPath
  readonly tracker: PathProgressTracker
}

// ── System interface ──

export interface GameSystem {
  init?(game: Game): void
  update?(dt: number, game: Game): void
  render?(renderer: Renderer, game: Game): void
  destroy?(): void
}

/**
 * Static key→type map for `addSystem`/`getSystem`. Every system registered
 * in {@link useGameLoop.wireEngine} has an entry here so `getSystem('buff')`
 * returns a `BuffSystem | undefined` without a caller-supplied cast. Extend
 * this map (not each call site) when a new system is introduced.
 */
export interface SystemMap {
  placement: TowerPlacementSystem
  combat: CombatSystem
  movement: MovementSystem
  wave: WaveSystem
  buff: BuffSystem
  economy: EconomySystem
  enemyRenderer: EnemyRenderer
  towerRenderer: TowerRenderer
  projectileRenderer: ProjectileRenderer
}

// ── Game ──

export class Game {
  readonly eventBus: GameEventBus
  readonly renderer: Renderer
  readonly input: InputManager
  readonly phase: PhaseStateMachine

  state: GameState

  // Entity containers
  towers: Tower[] = []
  enemies: Enemy[] = []
  projectiles: Projectile[] = []

  /**
   * Per-level piecewise-path runtime holder. `null` between levels and
   * during MENU. MovementSystem reads it through the narrower
   * `MovementLevelContext` view (`path` + `tracker`).
   */
  levelContext: LevelContext | null = null

  /**
   * Id of the path segment the HUD Function Panel is currently hovering
   * over. The Renderer reads this in `drawSegmentBoundaries` to tint the
   * matching `xRange`; Phase 5's Function Panel writes it (indirectly,
   * through the UI store / a composable sync). Kept on `Game` to avoid an
   * engine → presentation import, per the SoC matrix in §2 of the plan.
   */
  hoveredSegmentId: string | null = null

  // Game time in seconds (used for animation)
  time = 0

  private _systems = new Map<string, GameSystem>()
  private _running = false
  private _rafId: number | null = null
  private _lastTime = 0
  private _accumulator = 0
  private readonly _boundLoop: () => void

  constructor(canvas: HTMLCanvasElement) {
    this.eventBus = new EventBus<GameEvents>()
    this.renderer = new Renderer(canvas)
    this.input = new InputManager(canvas, this.eventBus)
    this.phase = new PhaseStateMachine()
    this.state = createInitialState()
    this._boundLoop = this._loop.bind(this)
  }

  // ── Event shorthand (backward compatibility) ──

  on<K extends keyof GameEvents>(event: K, cb: (p: GameEvents[K]) => void) {
    return this.eventBus.on(event, cb)
  }

  // ── System management ──

  addSystem<K extends keyof SystemMap>(name: K, system: SystemMap[K]): void
  addSystem(name: string, system: GameSystem): void
  addSystem(name: string, system: GameSystem): void {
    this._systems.set(name, system)
    system.init?.(this)
  }

  getSystem<K extends keyof SystemMap>(name: K): SystemMap[K] | undefined
  getSystem<T extends GameSystem>(name: string): T | undefined
  getSystem(name: string): GameSystem | undefined {
    return this._systems.get(name)
  }

  // ── State operations ──

  changeGold(amount: number): void {
    this.state.gold = Math.max(0, this.state.gold + amount)
    this.eventBus.emit(Events.GOLD_CHANGED, this.state.gold)
  }

  changeHp(amount: number): void {
    this.state.hp = Math.max(0, Math.min(this.state.maxHp, this.state.hp + amount))
    this.eventBus.emit(Events.HP_CHANGED, this.state.hp)
    if (this.state.hp <= 0) this.setPhase(GamePhase.GAME_OVER)
  }

  addScore(points: number): void {
    this.state.score += points
    this.eventBus.emit(Events.SCORE_CHANGED, this.state.score)
  }

  setPhase(to: GamePhase): void {
    const from = this.state.phase
    if (!this.phase.transition(to)) return
    this.state.phase = to
    this.eventBus.emit(Events.PHASE_CHANGED, { from, to })
  }

  // ── Game flow ──

  startLevel(levelIndex: number): void {
    // startLevel is a "begin from scratch" operation and overrides phase
    // sequencing. Callers typically fire it from menu / retry / level-end.
    // A call from the middle of a wave or buff-select is legal (early
    // restart) but worth surfacing in dev so a stray event-driven call
    // doesn't quietly reset a game in progress.
    const expected = new Set<GamePhase>([
      GamePhase.MENU, GamePhase.LEVEL_SELECT, GamePhase.LEVEL_END,
      GamePhase.GAME_OVER, GamePhase.BUILD,
    ])
    if (!expected.has(this.state.phase) && import.meta.env.DEV) {
      console.warn(`[Game] startLevel called from unexpected phase: ${this.state.phase}`)
    }

    this.state = createInitialState()
    this.state.level = levelIndex
    this.towers = []
    this.enemies = []
    this.projectiles = []
    this.levelContext = null
    // Reset to MENU first so terminal phases (GAME_OVER) and any in-progress phase
    // can legally transition into BUILD on retry/replay.
    this.phase.forceTransition(GamePhase.MENU)
    this.setPhase(GamePhase.BUILD)
    // State and entity lists are fully reset above, so any buff revertId
    // that targets towers/enemies has nothing to revert — BuffSystem's
    // LEVEL_START handler only needs to drop its own tracking.
    this.eventBus.emit(Events.LEVEL_START, levelIndex)
  }

  startWave(): void {
    const ok = this.phase.canTransition(GamePhase.WAVE)
    if (!ok) return
    this.state.wave++
    // Transition phase first so listeners see correct phase on WAVE_START
    this.setPhase(GamePhase.WAVE)
    this.eventBus.emit(Events.WAVE_START, this.state.wave)
  }

  // ── Game loop ──

  start(): void {
    if (this._running) return
    this._running = true
    this._lastTime = performance.now()
    this._accumulator = 0
    this._loop()
  }

  stop(): void {
    // Cancel the pending RAF *before* flipping _running. If we flipped first, a
    // frame that fires between the two statements would still enter _loop() with
    // _running=false and early-return — fine — but requestAnimationFrame
    // might have already been scheduled inside that frame for the *next* one.
    // Cancelling up front guarantees no further frames enter _loop after stop().
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
    this._running = false
  }

  destroy(): void {
    this.stop()
    for (const system of this._systems.values()) {
      system.destroy?.()
    }
    this._systems.clear()
    // Detach the per-level tracker before clearing the event bus so the
    // tracker's sink doesn't fire a final emission into a cleared bus.
    this.levelContext?.dispose()
    this.levelContext = null
    this.input.destroy()
    this.eventBus.clear()
  }

  /**
   * Fixed-timestep game loop.
   *
   * The 0.1 s clamp on `frameTime` caps the maximum simulation time any one
   * RAF frame can advance. When the browser tab is backgrounded, throttled,
   * or the main thread stalls, `performance.now() - _lastTime` can grow
   * arbitrarily large; without the clamp, the `while` loop below would run
   * hundreds of `_update` ticks back-to-back on resume (a "spiral of death")
   * and enemies would visibly teleport across the map. Trade-off: the sim
   * silently loses time beyond 100 ms per frame, so a 500 ms stall resumes
   * 400 ms behind wall-clock — acceptable for a casual game where
   * consistency trumps real-time fidelity.
   */
  private _loop(): void {
    if (!this._running) return
    const now = performance.now()
    const frameTime = Math.min((now - this._lastTime) / 1000, 0.1)
    this._lastTime = now
    this._accumulator += frameTime

    while (this._accumulator >= FIXED_DT) {
      this._update(FIXED_DT)
      this._accumulator -= FIXED_DT
      this.time += FIXED_DT
    }

    this._render()
    // Re-check _running after update/render: a system (e.g. session sync error)
    // or WAVE_END listener could have stopped the game mid-frame.
    if (!this._running) return
    this._rafId = requestAnimationFrame(this._boundLoop)
  }

  private _update(dt: number): void {
    for (const system of this._systems.values()) {
      system.update?.(dt, this)
    }
  }

  private _render(): void {
    const { renderer } = this
    renderer.clear()
    // Pass the layout so the renderer paints each cell by its classified
    // TileClass instead of the legacy stone checkerboard. When no level is
    // active (MENU, or flag-off legacy path) drawGrid falls back to the
    // checkerboard itself — we do not branch on phase here.
    renderer.drawGrid(this.levelContext?.layout ?? null)
    renderer.drawOrigin(this.time)

    if (this.levelContext && this.state.phase !== GamePhase.MENU) {
      renderer.drawSegmentBoundaries(this.levelContext.path, this.hoveredSegmentId)
      for (const seg of this.levelContext.path.segments) {
        const [lo, hi] = seg.xRange
        if (lo !== hi) {
          renderer.drawFunction(seg.evaluate, lo, hi, 'rgba(184, 64, 64, 0.4)', 2)
        }
      }
    }

    for (const system of this._systems.values()) {
      system.render?.(renderer, this)
    }
  }

}
