/**
 * PhaseStateMachine — 顯式遊戲階段狀態機
 * 定義合法的階段轉換，防止非法跳轉。
 */
import { GamePhase } from '@/data/constants'

type Transition = Partial<Record<GamePhase, GamePhase[]>>

const ALLOWED_TRANSITIONS: Transition = {
  [GamePhase.MENU]:        [GamePhase.LEVEL_SELECT],
  [GamePhase.LEVEL_SELECT]:[GamePhase.BUILD, GamePhase.MENU],
  [GamePhase.BUILD]:       [GamePhase.WAVE, GamePhase.GAME_OVER, GamePhase.MENU],
  [GamePhase.WAVE]:        [GamePhase.BUFF_SELECT, GamePhase.LEVEL_END, GamePhase.GAME_OVER, GamePhase.BOSS_SHIELD],
  [GamePhase.BUFF_SELECT]: [GamePhase.BUILD],
  [GamePhase.BOSS_SHIELD]: [GamePhase.WAVE, GamePhase.GAME_OVER],
  [GamePhase.LEVEL_END]:   [GamePhase.LEVEL_SELECT, GamePhase.MENU],
  [GamePhase.GAME_OVER]:   [GamePhase.MENU, GamePhase.LEVEL_SELECT],
}

export class PhaseStateMachine {
  private _current: GamePhase = GamePhase.MENU

  get current(): GamePhase {
    return this._current
  }

  canTransition(to: GamePhase): boolean {
    return ALLOWED_TRANSITIONS[this._current]?.includes(to) ?? false
  }

  transition(to: GamePhase): boolean {
    if (!this.canTransition(to)) {
      console.warn(`[PhaseStateMachine] Invalid transition: ${this._current} → ${to}`)
      return false
    }
    this._current = to
    return true
  }

  /** 強制轉換（用於初始化或緊急情況） */
  forceTransition(to: GamePhase): void {
    this._current = to
  }
}
