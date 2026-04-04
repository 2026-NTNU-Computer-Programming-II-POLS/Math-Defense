/**
 * Game — 精簡遊戲迴圈（只做 update + render 調度）
 * 不再是 God Object：狀態在 GameState，階段在 PhaseStateMachine，
 * Buff flags 在 GameState 中明確宣告。
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

// ── 型別安全的事件 Map ──

export interface CoordPayload {
  pixel: { x: number; y: number }
  game: { x: number; y: number }
}

export interface GameEvents {
  [key: string]: unknown
  [Events.PHASE_CHANGED]:        { from: GamePhase; to: GamePhase }
  [Events.LEVEL_START]:          number
  [Events.LEVEL_END]:            void
  [Events.GAME_OVER]:            void
  [Events.BUILD_PHASE_START]:    void
  [Events.BUILD_PHASE_END]:      void
  [Events.TOWER_PLACED]:         Tower
  [Events.TOWER_SELECTED]:       Tower | null
  [Events.TOWER_PARAMS_SET]:     { tower: Tower; params: Tower['params'] }
  [Events.CAST_SPELL]:           Tower
  [Events.WAVE_START]:           number
  [Events.WAVE_END]:             number
  [Events.ENEMY_SPAWNED]:        Enemy
  [Events.ENEMY_KILLED]:         Enemy
  [Events.ENEMY_REACHED_ORIGIN]: Enemy
  [Events.TOWER_ATTACK]:         { tower: Tower; target: Enemy }
  [Events.BUFF_PHASE_START]:     void
  [Events.BUFF_CARD_SELECTED]:   string
  [Events.BUFF_RESULT]:          { success: boolean; cardId: string; skipped: boolean }
  [Events.BUFF_PHASE_END]:       void
  [Events.BOSS_SHIELD_START]:    void
  [Events.BOSS_SHIELD_ATTEMPT]:  { match: number }
  [Events.BOSS_SHIELD_END]:      void
  [Events.GOLD_CHANGED]:         number
  [Events.HP_CHANGED]:           number
  [Events.SCORE_CHANGED]:        number
  [Events.CANVAS_CLICK]:         CoordPayload
  [Events.CANVAS_HOVER]:         CoordPayload
}

export type GameEventBus = EventBus<GameEvents>

// ── System 介面 ──

export interface GameSystem {
  init?(game: Game): void
  update?(dt: number, game: Game): void
  render?(renderer: Renderer, game: Game): void
}

// ── Game ──

export class Game {
  readonly eventBus: GameEventBus
  readonly renderer: Renderer
  readonly input: InputManager
  readonly phase: PhaseStateMachine

  state: GameState

  // 實體容器
  towers: Tower[] = []
  enemies: Enemy[] = []
  projectiles: Projectile[] = []

  // 當前路徑函數
  pathFunction: ((x: number) => number) | null = null

  // 遊戲時間（秒，用於動畫）
  time = 0

  private _systems = new Map<string, GameSystem>()
  private _running = false
  private _rafId: number | null = null
  private _lastTime = 0
  private _accumulator = 0

  constructor(canvas: HTMLCanvasElement) {
    this.eventBus = new EventBus<GameEvents>()
    this.renderer = new Renderer(canvas)
    this.input = new InputManager(canvas, this.eventBus)
    this.phase = new PhaseStateMachine()
    this.state = createInitialState()

    this._setupEventHandlers()
  }

  // ── 事件捷徑（向後相容） ──

  on<K extends keyof GameEvents>(event: K, cb: (p: GameEvents[K]) => void) {
    return this.eventBus.on(event, cb)
  }

  // ── 系統管理 ──

  addSystem(name: string, system: GameSystem): void {
    this._systems.set(name, system)
    system.init?.(this)
  }

  getSystem<T extends GameSystem>(name: string): T | undefined {
    return this._systems.get(name) as T | undefined
  }

  // ── 狀態操作 ──

  changeGold(amount: number): void {
    this.state.gold += amount
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

  // ── 遊戲流程 ──

  startLevel(levelIndex: number): void {
    const oldPhase = this.state.phase
    this.state = createInitialState()
    this.state.level = levelIndex
    this.state.phase = GamePhase.BUILD
    this.towers = []
    this.enemies = []
    this.projectiles = []
    this.pathFunction = null
    this.phase.forceTransition(GamePhase.BUILD)
    this.eventBus.emit(Events.PHASE_CHANGED, { from: oldPhase, to: GamePhase.BUILD })
    this.eventBus.emit(Events.LEVEL_START, levelIndex)
  }

  startWave(): void {
    const ok = this.phase.canTransition(GamePhase.WAVE)
    if (!ok) return
    this.state.wave++
    // WAVE_START 必須在 setPhase 之前，讓 WaveSystem 先建立生成佇列
    this.eventBus.emit(Events.WAVE_START, this.state.wave)
    this.setPhase(GamePhase.WAVE)
  }

  // ── 遊戲迴圈 ──

  start(): void {
    if (this._running) return
    this._running = true
    this._lastTime = performance.now()
    this._accumulator = 0
    this._loop()
  }

  stop(): void {
    this._running = false
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
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
    this._rafId = requestAnimationFrame(() => this._loop())
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

  // ── 內部事件 ──

  private _setupEventHandlers(): void {
    this.eventBus.on(Events.ENEMY_REACHED_ORIGIN, () => {
      if (!this.state.shieldActive) {
        this.changeHp(-1)
      }
    })

    this.eventBus.on(Events.ENEMY_KILLED, (enemy) => {
      this.state.kills++
      this.addScore(10)
      const reward = (enemy.reward || 15) * this.state.goldMultiplier
      this.changeGold(reward)
    })
  }
}
