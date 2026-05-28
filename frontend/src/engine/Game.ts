/**
 * Game — lightweight game loop (handles only update + render scheduling)
 * No longer a God Object: state is in GameState, phases are in PhaseStateMachine,
 * Buff flags are explicitly declared in GameState.
 */
import { EventBus } from './EventBus'
import { Renderer } from './Renderer'
import { InputManager } from './InputManager'
import { PhaseStateMachine } from './PhaseStateMachine'
import { ShakeController } from './ShakeController'
import { type GameState, createInitialState } from './GameState'
import { GamePhase, Events, FIXED_DT, type TowerType } from '@/data/constants'
import { mulberry32 } from '@/math/MathUtils'
import { createPrng, prngNextF64, type PrngHandle } from '@/math/WasmBridge'
import type { Tower, Enemy, Projectile, Pet, LimitResult, CalculusState, TargetingMode } from '@/entities/types'
import type { BuffCard } from '@/data/buff-defs'
import type { MontyHallReward } from '@/data/monty-hall-defs'
import type { MontyHallState } from '@/systems/MontyHallSystem'
import type { ActiveBuffEntry } from './GameState'
import type { SegmentedPath } from '@/domain/path/segmented-path'
import type { PathProgressTracker, SegmentChangedPayload } from '@/domain/path/path-progress-tracker'
import type { PlacementRejectionReason } from '@/domain/level/placement-policy'
import type { ChainRuleQuestion } from '@/math/chain-rule-generator'
import type { CalcOp } from '@/math/monomial'
import type { LevelContext } from './level-context'
import { isGeneratedLevelContext, type GeneratedLevelContext } from './generated-level-context'
import type { GeneratedLevel } from '@/math/curve-types'
import type { WaveDef } from '@/domain/wave/wave-generator'
import type { Checkpoint } from '@/domain/level/checkpoint'
import type { BuffSystem } from '@/systems/BuffSystem'
import type { CombatSystem } from '@/systems/CombatSystem'
import type { MovementSystem } from '@/systems/MovementSystem'
import type { WaveSystem } from '@/systems/WaveSystem'
import type { TowerPlacementSystem } from '@/systems/TowerPlacementSystem'
import type { EconomySystem } from '@/systems/EconomySystem'
import type { MagicTowerSystem } from '@/systems/MagicTowerSystem'
import type { TowerInterferenceSystem } from '@/systems/TowerInterferenceSystem'
import type { RadarTowerSystem } from '@/systems/RadarTowerSystem'
import type { MatrixTowerSystem } from '@/systems/MatrixTowerSystem'
import type { LimitTowerSystem } from '@/systems/LimitTowerSystem'
import type { CalculusTowerSystem } from '@/systems/CalculusTowerSystem'
import type { PetCombatSystem } from '@/systems/PetCombatSystem'
import type { TowerUpgradeSystem } from '@/systems/TowerUpgradeSystem'
import type { EnemyAbilitySystem } from '@/systems/EnemyAbilitySystem'
import type { SpellSystem } from '@/systems/SpellSystem'
import type { MontyHallSystem } from '@/systems/MontyHallSystem'
import type { EnemyRenderer } from '@/renderers/EnemyRenderer'
import type { SpellEffectRenderer } from '@/renderers/SpellEffectRenderer'
import type { TowerRenderer } from '@/renderers/TowerRenderer'
import type { ProjectileRenderer } from '@/renderers/ProjectileRenderer'
import type { CombatFeedbackRenderer } from '@/renderers/CombatFeedbackRenderer'

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

/**
 * Payload of DAMAGE_RESOLVED — emitted by `applyDamage` only when a defensive
 * trait changed a discrete hit's number. `raw` is the post-vulnerability
 * incoming amount; `applied` is what landed after evasion / per-hit cap.
 */
export interface DamageResolvedPayload {
  readonly x: number
  readonly y: number
  readonly raw: number
  readonly applied: number
  readonly kind: 'capped' | 'reduced'
}

/**
 * Payload of LIMIT_BURST — emitted once per Limit tower burst tick by
 * LimitTowerSystem after the AoE damage pass. Carries everything the
 * LimitBurstRenderer needs to paint the shockwave ring, per-hit damage
 * popups, and the result-attribution badge ("+∞ → KILL" / "×3" / "chip").
 *
 * `hits` is the per-enemy applied-damage list (post-burstMult). For the
 * `+inf` outcome `killed` is true and `damage` is 0 (instakill bypasses the
 * damage path), so the renderer paints a kill marker instead of a number.
 */
export interface LimitBurstPayload {
  readonly towerId: string
  readonly x: number
  readonly y: number
  readonly range: number
  readonly color: string
  readonly outcome: '+inf' | '+c' | 'zero' | 'constant' | '-c' | '-inf'
  /** Burst multiplier in effect (BURST_MULTIPLIER + burst_bonus talent). */
  readonly multiplier: number
  /** Player's answer value (|C| for +c / -c, raw value otherwise). */
  readonly answerValue: number
  readonly hits: ReadonlyArray<{
    readonly x: number
    readonly y: number
    readonly damage: number
    readonly killed: boolean
  }>
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
  [Events.ENEMY_DYING]:          Enemy
  [Events.ENEMY_REACHED_ORIGIN]: Enemy
  [Events.TOWER_ATTACK]:         { tower: Tower; target: Enemy }
  [Events.TOWER_FIRED]:          { towerId: string; x: number; y: number; type: TowerType }
  [Events.DAMAGE_RESOLVED]:      DamageResolvedPayload
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
  [Events.TOWER_TARGETING_CHANGED]: { towerId: string; mode: TargetingMode }
  [Events.MATRIX_PAIR_CHANGED]:  { towerId: string; pairId: string }
  [Events.LIMIT_ANSWER]:         { towerId: string; answer: LimitResult }
  [Events.LIMIT_BURST]:          LimitBurstPayload
  [Events.CALCULUS_OPERATION]:    { towerId: string; presetIndex?: number; operation?: CalcOp }
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
  [Events.PERCEIVED_SPEED_CHANGED]: number

  [Events.KILL_VALUE_CHANGED]:   number
  [Events.COST_TOTAL_CHANGED]:   number

  [Events.ACTIVE_BUFFS_CHANGED]: ReadonlyArray<ActiveBuffEntry>
  [Events.BUFF_EXPIRED]:         { id: string; name: string; effectId: string }

  [Events.MONTY_HALL_STATE_CHANGED]: MontyHallState | null

  [Events.PRINCIPLE_SHOW]:           { id: import('@/data/principle-defs').PrincipleId }
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
  towerInterference: TowerInterferenceSystem
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
  combatFeedbackRenderer: CombatFeedbackRenderer
}

// ── HUD / Input state ──

/**
 * Groups the UI-bridge fields that the engine owns but that are read/written
 * by the presentation layer (composables, renderers). Keeping them in one
 * named object makes the cross-layer surface explicit and easy to locate.
 */
export interface HudState {
  /** Path-segment the Function Panel is hovering over; null when none. */
  hoveredSegmentId: string | null
  /** Keyboard placement cursor position; null outside BUILD phase. */
  keyboardCursor: { gx: number; gy: number } | null
}

// ── Game ──

export class Game {
  readonly eventBus: GameEventBus
  readonly renderer: Renderer
  readonly input: InputManager
  readonly phase: PhaseStateMachine
  /**
   * Screen-shake state. Wired in Phase 0 with zero amplitude; Phase 1 will
   * start triggering shakes from combat events. Lives on the engine so
   * `_render` can apply the translate before any system paints.
   */
  readonly shake: ShakeController = new ShakeController()

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

  /** UI-bridge state shared between the engine and the presentation layer. */
  hud: HudState = { hoveredSegmentId: null, keyboardCursor: null }

  towerModifierProvider: ((towerType: TowerType) => Record<string, number>) | null = null

  // Game time in seconds (used for animation)
  time = 0

  /**
   * Per-session deterministic RNG. All non-physics randomness in game logic
   * (buff effects, Monty-Hall door selection, Radar crit roll, chain-rule
   * question generation) MUST go through this rather than `Math.random()`.
   * The Replay/Spectate feature (Pedagogical Backlog §24) relies on this
   * invariant: re-instantiating the engine with the same `seed` and the same
   * input event stream must reproduce the run within ε = 0.0005.
   *
   * Seeded from {@link setSeed}. Defaults to a `Math.random()`-bridged stream
   * so callers that haven't been migrated yet still get *some* RNG; running
   * without a seed forfeits replayability for that session.
   */
  rng: () => number = Math.random

  /**
   * Seed used to initialise {@link rng}. Persisted on the server-side
   * GameSession at create time so a replay can reconstruct the same RNG
   * stream from a stored event log.
   */
  seed: number | null = null

  private _systems = new Map<string, GameSystem>()
  private _running = false
  private _rafId: number | null = null
  private _lastTime = 0
  private _accumulator = 0
  private readonly _boundLoop: () => void
  // PCG handle owned when VITE_DETERMINISTIC_RNG=true. Disposed before
  // re-seeding (replayer reset path) and during destroy() so the WASM heap
  // doesn't leak across game instances within one tab session.
  private _prngHandle: PrngHandle | null = null

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

  /**
   * Replace the per-session RNG with a stream derived from `seed`.
   *
   * Call this BEFORE {@link startLevel} so the LEVEL_START handlers and the
   * very first system tick see the seeded stream. Re-calling mid-level is
   * legal but resets the stream — replayers do exactly that to put the
   * engine back in lockstep with a stored event log.
   */
  setSeed(seed: number): void {
    this.seed = seed >>> 0
    // Phase 1 (construction plan): when the deterministic-RNG flag is set, route
    // through the PCG-in-WASM stream. createPrng transparently falls back to
    // a mulberry32-backed JsPrngHandle if the WASM module is not loaded, so
    // sessions that miss the WASM load still get *some* RNG — they just
    // forfeit the bit-exact replay guarantee for that session.
    if (import.meta.env.VITE_DETERMINISTIC_RNG === 'true') {
      this._prngHandle?.dispose()
      this._prngHandle = createPrng(this.seed, /* stream */ 0)
      const h = this._prngHandle
      this.rng = () => prngNextF64(h)
      return
    }
    this._prngHandle?.dispose()
    this._prngHandle = null
    this.rng = mulberry32(this.seed)
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
  //
  // Audit F-ARCH-7: gold/hp/score/cost mutations have moved to EconomySystem
  // (`game.economy.changeGold(...)` etc.) — the engine layer no longer owns
  // economy-domain logic. The `economy` accessor below is the typed shortcut.

  /** Typed accessor for the EconomySystem instance registered on this Game. */
  get economy(): EconomySystem {
    const s = this.getSystem('economy')
    if (!s) throw new Error('[Game] EconomySystem is not registered')
    return s as EconomySystem
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

  /**
   * Patch live engine state from a §12 Star-5 checkpoint AFTER {@link startLevel}
   * has reset everything. Centralizes the pre-seed dance previously inlined in
   * useGameLoop.wireEngine (F-ARCH-5):
   *
   *   - gold / hp restored to the post-clear snapshot
   *   - healthOrigin scoped to the resumed run so the score formula's HP-bonus
   *     baseline isn't penalised by the abandoned session
   *   - costTotal / cumulativeKillValue restored so the Score Result View
   *     reports the cumulative figures
   *   - wave pre-seeded so the next startWave() emits the correct number
   *
   * Callers that want the gameStore mirror to reflect the patched values must
   * call store.syncFromEngine(this) afterwards (the LEVEL_START handler that
   * already ran would have mirrored the post-reset values).
   */
  restoreFromCheckpoint(cp: Checkpoint): void {
    this.state.gold = cp.gold
    this.state.hp = cp.hp
    this.state.healthOrigin = cp.hp
    this.state.costTotal = cp.costTotal
    this.state.cumulativeKillValue = cp.killValue
    this.state.wave = cp.waveIndex - 1
  }

  startWave(): void {
    if (this.state.phase === GamePhase.WAVE) return
    if (this.state.phase !== GamePhase.BUILD) return
    this.state.wave++
    // Transition phase first so listeners see correct phase on WAVE_START
    this.setPhase(GamePhase.WAVE)
    this.eventBus.emit(Events.WAVE_START, this.state.wave)
  }

  setPerceivedSpeedMultiplier(multiplier: number): void {
    const next = multiplier >= 2 ? 2 : 1
    if (this.state.perceivedSpeedMultiplier === next) return
    this.state.perceivedSpeedMultiplier = next
    this.eventBus.emit(Events.PERCEIVED_SPEED_CHANGED, next)
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
    this._prngHandle?.dispose()
    this._prngHandle = null
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
      const speedSteps = this.state.phase === GamePhase.WAVE
        ? Math.max(1, Math.round(this.state.perceivedSpeedMultiplier))
        : 1
      for (let step = 0; step < speedSteps; step++) {
        this._update(FIXED_DT)
        this.time += FIXED_DT
        // A sub-step can end the wave (e.g. the last enemy is cleared). Stop
        // the remaining perceived-speed sub-steps so a non-WAVE phase never
        // receives a doubled tick: the extra _update would advance `time` —
        // and so the scored `timeTotal` — by a FIXED_DT that belongs to no
        // wave and that timeExcludePrepare never subtracts back out.
        if (this.state.phase !== GamePhase.WAVE) break
      }
      this._accumulator -= FIXED_DT
    }

    this._render()
    // Re-check _running after update/render: a system (e.g. session sync error)
    // or WAVE_END listener could have stopped the game mid-frame.
    if (!this._running) return
    this._rafId = requestAnimationFrame(this._boundLoop)
  }

  private _update(dt: number): void {
    // Advance screen-shake age via the simulation dt so pause / wave-clear
    // freezes the shake. The translate that consumes the offset is applied
    // in _render below.
    this.shake.update(dt)
    for (const system of this._systems.values()) {
      system.update?.(dt, this)
    }
  }

  private _render(): void {
    const { renderer } = this
    renderer.clear()
    // Screen-shake transform: apply once before any system renders so every
    // layer (grid, paths, towers, enemies, effects) translates together.
    // Restored at the end of the frame to keep the next clear() aligned.
    const { dx, dy } = this.shake.getOffset()
    const shaking = dx !== 0 || dy !== 0
    if (shaking) {
      renderer.ctx.save()
      renderer.ctx.translate(dx, dy)
    }
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
        renderer.drawSegmentBoundaries(this.levelContext.path, this.hud.hoveredSegmentId)
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

    if (shaking) {
      renderer.ctx.restore()
    }
  }

}
