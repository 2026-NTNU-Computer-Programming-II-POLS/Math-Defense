/**
 * gameCommandService — bus-emitter for player-initiated engine commands
 * (F-ARCH-1). Extracted from gameStore so the store stays a pure state
 * mirror. Components that need to issue commands import this directly:
 *
 *   import { gameCommands } from '@/services/gameCommandService'
 *   gameCommands.requestTowerUpgrade(towerId)
 *
 * The service binds to a Game instance via setEngine() / clearEngine(),
 * called by useGameLoop alongside the gameStore mirror binding. Commands
 * issued while no engine is bound are silently no-op'd (the player can't
 * have a UI affordance up without a live engine — but defensive checks
 * prevent crashes during teardown races).
 */
import { Events } from '@/data/constants'
import type { Game } from '@/engine/Game'
import type { MontyHallSystem } from '@/systems/MontyHallSystem'

let _engine: Game | null = null

export function setEngine(game: Game): void {
  _engine = game
}

export function clearEngine(): void {
  _engine = null
}

export function getEngine(): Game | null {
  return _engine
}

export const gameCommands = {
  requestTowerUpgrade(towerId: string): void {
    _engine?.eventBus.emit(Events.TOWER_UPGRADE, { towerId })
  },

  requestTowerRefund(towerId: string, onResult: (success: boolean) => void): () => void {
    if (!_engine) return () => {}
    const unsub = _engine.eventBus.once(Events.TOWER_REFUND_RESULT, ({ success }) => {
      onResult(success)
    })
    _engine.eventBus.emit(Events.TOWER_REFUND, { towerId })
    return unsub
  },

  selectBuffCard(cardId: string): void {
    _engine?.eventBus.emit(Events.BUFF_CARD_SELECTED, cardId)
  },

  selectMontyHallDoor(index: number): void {
    _engine?.eventBus.emit(Events.MONTY_HALL_DOOR_SELECTED, index)
  },

  decideMontyHallSwitch(doSwitch: boolean): void {
    _engine?.eventBus.emit(Events.MONTY_HALL_SWITCH_DECISION, doSwitch)
  },

  /**
   * Reaches into MontyHallSystem because the system owns the post-result
   * timer reset that finishEvent() encapsulates. The audit (F-ARCH-1)
   * called this out as a Demeter violation in gameStore; isolating it
   * here keeps the system handle behind one well-named entry point.
   */
  finishMontyHall(): void {
    if (!_engine) return
    const sys = _engine.getSystem('montyHall') as MontyHallSystem | undefined
    sys?.finishEvent(_engine)
  },
}
