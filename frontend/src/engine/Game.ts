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
import { GamePhase, Events, FIXED_DT, type TowerType } from '@/data/constants'
import type { Tower, Enemy, Projectile, Pet, LimitResult, CalculusState } from '@/entities/types'
import type { BuffCard } from '@/data/buff-defs'
import type { MontyHallReward } from '@/data/monty-hall-defs'
import type { MontyHallState } from '@/systems/MontyHallSystem'
import type { ActiveBuffEntry } from './GameState'
import type { SegmentedPath } from '@/domain/path/segmented-path'
import type { PathProgressTracker, SegmentChangedPayload } from '@/domain/path/path-progress-tracker'
import type { PlacementRejectionReason } from '@/domain/level/placement-policy'
import type { ChainRuleQuestion } from '@/math/chain-rule-generator'
import type { LevelContext } from './level-context'
import { isGeneratedLevelContext, type GeneratedLevelContext } from './generated-level-context'
import type { GeneratedLevel } from '@/math/curve-types'
import type { WaveDef } from '@/data/level-defs'
import type { BuffSystem } from '@/systems/BuffSystem'
import type { CombatSystem } from '@/systems/CombatSystem'
import type { MovementSystem } from '@/systems/MovementSystem'
import type { WaveSystem } from '@/systems/WaveSystem'
import type { TowerPlacementSystem } from '@/systems/TowerPlacementSystem'
import type { EconomySystem } from '@/systems/EconomySystem'
import type { MagicTowerSystem } from '@/systems/MagicTowerSystem'
import type { RadarTowerSystem } from '@/systems/RadarTowerSystem'
import type { MatrixTowerSystem } from '@/systems/MatrixTowerSystem'
import type { LimitTowerSystem } from '@/systems/LimitTowerSystem'
import type { CalculusTowerSystem, PetCombatSystem } from '@/systems/CalculusTowerSystem'
import type { TowerUpgradeSystem } from '@/systems/TowerUpgradeSystem'
import type { EnemyAbilitySystem } from '@/systems/EnemyAbilitySystem'
import type { SpellSystem } from '@/systems/SpellSystem'
import type { MontyHallSystem } from '@/systems/MontyHallSystem'
import type { EnemyRenderer } from '@/renderers/EnemyRenderer'
import type { SpellEffectRenderer } from '@/renderers/SpellEffectRenderer'
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
  readonly killValue: number
  readonly costTotal: number
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
  [Events.BUFF_CARDS_UPDATED]:   ReadonlyArray<BuffCard>
  [Events.BUFF_CARD_SELECTED]:   string
  [Events.BUFF_RESULT]:          { success: boolean; cardId: string; skipped: boolean; insufficientGold?: boolean }
  [Events.BUFF_PHASE_END]:       void
  [Events.GOLD_CHANGED]:         number
  [Events.HP_CHANGED]:           number
  [Events.SCORE_CHANGED]:        number
  [Events.CANVAS_CLICK]:         CoordPayload
  [Events.CANVAS_HOVER]:         CoordPayload
  [Events.SEGMENT_CHANGED]:      SegmentChangedPayload
  [Events.PLACEMENT_REJECTED]:   { gx: number; gy: number; reason: PlacementRejectionReason }

  [Events.MAGIC_FUNCTION_SELECTED]: { towerId: string; expression: string }
  [Events.MAGIC_MODE_CHANGED]:   { towerId: string; mode: 'debuff' | 'buff' }
  [Events.RADAR_ARC_CHANGED]:    { towerId: string; arcStart: number; arcEnd: number; restrict: boolean }
  [Events.MATRIX_PAIR_CHANGED]:  { towerId: string; pairId: string }
  [Events.LIMIT_ANSWER]:         { towerId: string; answer: LimitResult }
  [Events.CALCULUS_OPERATION]:    { towerId: string; presetIndex?: number; operation?: 'derivative' | 'derivative2' | 'integral' }
  [Events.CALCULUS_STATE_CHANGED]:{ towerId: string; state: CalculusState | null }
  [Events.TOWER_UPGRADE]:        { towerId: string }
  [Events.TOWER_UPGRADED]:       { towerId: string }
  [Events.TOWER_REFUND]:         { towerId: string }
  [Events.TOWER_REFUND_RESULT]:  { success: boolean; towerId?: string }
  [Events.TOWER_REMOVED]:        { towerId: string }
  [Events.PET_SPAWNED]:          Pet
  [Events.PET_KILLED]:           Pet

  [Events.CHAIN_RULE_START]:     ChainRuleQuestion
  [Events.CHAIN_RULE_ANSWER]:    { correct: boolean }
  [Events.CHAIN_RULE_END]:       { correct: boolean; bossId: string }
  [Events.BOSS_SPLIT]:           { bossId: string; children: string[]; fPrimeOfG: string; gPrime: string }

  // V2 Phase 4
  [Events.SPELL_CAST]:           { spellId: string; x: number; y: number; targetId?: string }
  [Events.SPELL_EFFECT]:         { spellId: string; x: number; y: number; radius?: number }
  [Events.SPELL_COOLDOWN_READY]: string

  [Events.MONTY_HALL_TRIGGER]:        { doorCount: number; thresholdIndex: number }
  [Events.MONTY_HALL_DOOR_SELECTED]:  number
  [Events.MONTY_HALL_SWITCH_DECISION]:boolean
  [Events.MONTY_HALL_RESULT]:         { won: boolean; reward: MontyHallReward | null }

  [Events.SHOP_PURCHASE]:        { itemId: string; cost: number }

  [Events.KILL_VALUE_CHANGED]:   number
  [Events.COST_TOTAL_CHANGED]:   number

  [Events.ACTIVE_BUFFS_CHANGED]: ReadonlyArray<ActiveBuffEntry>

  [Events.MONTY_HALL_STATE_CHANGED]: MontyHallState | null
}

export type GameEventBus = EventBus<GameEvents>

/**
 * Narrow view of the per-level runtime that `MovementSystem` needs.
 * Phase 3's `LevelContext` supersets this; typed here as its own name so
 * the Phase-2 surface stays minimal and the Phase-3 widening is a single-
 * line replacement (see P3-T7 in the Piecewise Paths construction plan).
 *
 * `endpoint` is optional: V2 generated levels expose the curves' shared
 * intersection point P*; V1 piecewise levels omit it and the system falls
 * back to the origin (0, 0). MovementSystem reads the field structurally
 * so it never has to discriminate context flavors.
 */
export interface MovementLevelContext {
  readonly path: SegmentedPath
  readonly tracker: PathProgressTracker
  readonly endpoint?: { readonly x: number; readonly y: number }
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
  magicTower: MagicTowerSystem
  radarTower: RadarTowerSystem
  matrixTower: MatrixTowerSystem
  limitTower: LimitTowerSystem
  calculusTower: CalculusTowerSystem
  petCombat: PetCombatSystem
  towerUpgrade: TowerUpgradeSystem
  enemyAbility: EnemyAbilitySystem
  spell: SpellSystem
  montyHall: MontyHallSystem
  enemyRenderer: EnemyRenderer
  towerRenderer: TowerRenderer
  projectileRenderer: ProjectileRenderer
  spellEffectRenderer: SpellEffectRenderer
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
  pets: Pet[] = []

  /**
   * Per-level runtime holder. `null` between levels and during MENU.
   * May be a V1 `LevelContext` (piecewise) or V2 `GeneratedLevelContext` (curves).
   */
  levelContext: LevelContext | GeneratedLevelContext | null = null

  /** Active generated level data; non-null during V2 generated levels. */
  generatedLevel: GeneratedLevel | null = null

  /** Wave definitions for the active level. Set by useGameLoop before startLevel(). */
  currentWaves: ReadonlyArray<WaveDef> | null = null

  /**
   * Id of the path segment the HUD Function Panel is currently hovering
   * over. The Renderer reads this in `drawSegmentBoundaries` to tint the
   * matching `xRange`; Phase 5's Function Panel writes it (indirectly,
   * through the UI store / a composable sync). Kept on `Game` to avoid an
   * engine → presentation import, per the SoC matrix in §2 of the plan.
   */
  hoveredSegmentId: string | null = null

  towerModifierProvider: ((towerType: TowerType) => Record<string, number>) | null = null

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
    if (import.meta.env.DEV && amount < 0 && this.state.gold + amount < 0) {
      console.warn(`[Game] gold underflow: attempted ${amount} from ${this.state.gold}`)
    }
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

  addCost(amount: number): void {
    this.state.costTotal = Math.round(this.state.costTotal + amount)
    this.eventBus.emit(Events.COST_TOTAL_CHANGED, this.state.costTotal)
  }

  addKillValue(value: number): void {
    this.state.cumulativeKillValue += value
    this.eventBus.emit(Events.KILL_VALUE_CHANGED, this.state.cumulativeKillValue)
  }

  assignEnemyPath(enemyId: string, path: SegmentedPath): void {
    this.getSystem('movement')?.registerEnemyPath(enemyId, path)
  }

  setPhase(to: GamePhase): void {
    const from = this.state.phase
    // Self-heal: forceTransition can move _current without touching state.phase.
    // Re-sync before attempting the transition so the machine always validates
    // from the state the rest of the engine actually observes.
    if (this.phase.current !== from) this.phase.forceTransition(from)
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
    this.pets = []
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
    if (this.state.phase === GamePhase.WAVE) return
    if (this.state.phase !== GamePhase.BUILD) return
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
      const genCtx = isGeneratedLevelContext(this.levelContext) ? this.levelContext : null

      if (genCtx) {
        renderer.drawDisclosureRegion(genCtx.region)
        if (this.state.pathsVisible) {
          for (const path of genCtx.paths) {
            for (const seg of path.segments) {
              const [lo, hi] = seg.xRange
              renderer.drawFunction(seg.evaluate, lo, hi, 'rgba(184, 64, 64, 0.4)', 2)
            }
          }
        }
      } else {
        renderer.drawSegmentBoundaries(this.levelContext.path, this.hoveredSegmentId)
        for (const seg of this.levelContext.path.segments) {
          const [lo, hi] = seg.xRange
          if (lo !== hi) {
            renderer.drawFunction(seg.evaluate, lo, hi, 'rgba(184, 64, 64, 0.4)', 2)
          }
        }
      }
    }

    for (const system of this._systems.values()) {
      system.render?.(renderer, this)
    }
  }

}
