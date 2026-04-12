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
import {
  GamePhase, Events, FIXED_DT,
  GRID_MIN_X, GRID_MAX_X,
} from '@/data/constants'
import type { Tower, Enemy, Projectile } from '@/entities/types'
import type { BuffDef } from '@/data/buff-defs'

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
}

export type GameEventBus = EventBus<GameEvents>

// ── System interface ──

export interface GameSystem {
  init?(game: Game): void
  update?(dt: number, game: Game): void
  render?(renderer: Renderer, game: Game): void
  destroy?(): void
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

  // Current path function
  pathFunction: ((x: number) => number) | null = null

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

  addSystem(name: string, system: GameSystem): void {
    this._systems.set(name, system)
    system.init?.(this)
  }

  getSystem<T extends GameSystem>(name: string): T | undefined {
    return this._systems.get(name) as T | undefined
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
    this.state = createInitialState()
    this.state.level = levelIndex
    this.towers = []
    this.enemies = []
    this.projectiles = []
    this.pathFunction = null
    // Reset to MENU first so terminal phases (GAME_OVER) and any in-progress phase
    // can legally transition into BUILD on retry/replay.
    this.phase.forceTransition(GamePhase.MENU)
    this.setPhase(GamePhase.BUILD)
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
    this.input.destroy()
    this.eventBus.clear()
  }

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
    renderer.drawGrid()
    renderer.drawOrigin(this.time)

    if (this.pathFunction && this.state.phase !== GamePhase.MENU) {
      renderer.drawFunction(
        this.pathFunction,
        GRID_MIN_X, GRID_MAX_X,
        'rgba(184, 64, 64, 0.4)', 2,
      )
    }

    for (const system of this._systems.values()) {
      system.render?.(renderer, this)
    }
  }

}
