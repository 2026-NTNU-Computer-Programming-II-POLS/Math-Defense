/**
 * PhaseStateMachine — explicit game-phase state machine
 * Defines valid phase transitions and rejects illegal ones.
 */
import { GamePhase } from '@/data/constants'

type Transition = Readonly<Partial<Record<GamePhase, readonly GamePhase[]>>>

// Deep-frozen: transitions are a security-ish invariant — mutating them at
// runtime would let buggy code bypass phase sequencing. Freezing both the outer
// record and each inner array makes tampering throw in strict mode.
const ALLOWED_TRANSITIONS: Transition = Object.freeze({
  [GamePhase.MENU]:        Object.freeze([GamePhase.LEVEL_SELECT, GamePhase.BUILD]),
  [GamePhase.LEVEL_SELECT]:Object.freeze([GamePhase.BUILD, GamePhase.MENU]),
  [GamePhase.BUILD]:       Object.freeze([GamePhase.WAVE, GamePhase.GAME_OVER, GamePhase.MENU]),
  [GamePhase.WAVE]:        Object.freeze([GamePhase.BUFF_SELECT, GamePhase.MONTY_HALL, GamePhase.BUILD, GamePhase.LEVEL_END, GamePhase.GAME_OVER, GamePhase.CHAIN_RULE]),
  [GamePhase.BUFF_SELECT]: Object.freeze([GamePhase.BUILD]),
  [GamePhase.MONTY_HALL]:  Object.freeze([GamePhase.BUILD, GamePhase.GAME_OVER]),
  [GamePhase.CHAIN_RULE]:  Object.freeze([GamePhase.WAVE, GamePhase.GAME_OVER]),
  [GamePhase.LEVEL_END]:   Object.freeze([GamePhase.LEVEL_SELECT, GamePhase.MENU, GamePhase.BUILD]),
  [GamePhase.GAME_OVER]:   Object.freeze([GamePhase.MENU, GamePhase.LEVEL_SELECT, GamePhase.BUILD]),
})

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

  /** Force a transition (for initialization or emergency recovery) */
  forceTransition(to: GamePhase): void {
    this._current = to
  }
}
