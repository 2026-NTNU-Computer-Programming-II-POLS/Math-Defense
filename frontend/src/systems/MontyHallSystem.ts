import { Events, GamePhase } from '@/data/constants'
import {
  MONTY_HALL_THRESHOLDS_BY_STAR,
  MONTY_HALL_REWARD_POOL,
  type MontyHallReward,
} from '@/data/monty-hall-defs'
import type { Game, GameSystem } from '@/engine/Game'
import type { Renderer } from '@/engine/Renderer'

export interface MontyHallState {
  doorCount: number
  prizeIndex: number
  selectedDoor: number | null
  revealedDoors: number[]
  reward: MontyHallReward
  phase: 'select' | 'reveal' | 'switch' | 'result'
  won: boolean
}

export class MontyHallSystem implements GameSystem {
  private _unsubs: (() => void)[] = []
  current: MontyHallState | null = null

  init(game: Game): void {
    this.destroy()

    this._unsubs.push(
      game.eventBus.on(Events.KILL_VALUE_CHANGED, (killValue) => {
        this._checkThreshold(killValue, game)
      }),

      game.eventBus.on(Events.MONTY_HALL_TRIGGER, ({ doorCount, thresholdIndex }) => {
        this._startEvent(doorCount, game)
        game.state.montyHallNextIndex = thresholdIndex + 1
      }),

      game.eventBus.on(Events.MONTY_HALL_DOOR_SELECTED, (doorIndex) => {
        if (!this.current || this.current.phase !== 'select') return
        this.current.selectedDoor = doorIndex
        this._revealDoor(game)
      }),

      game.eventBus.on(Events.MONTY_HALL_SWITCH_DECISION, (doSwitch) => {
        if (!this.current || this.current.phase !== 'switch') return
        this._resolveSwitch(doSwitch, game)
      }),

      game.eventBus.on(Events.LEVEL_START, () => {
        this.current = null
        game.state.montyHallNextIndex = 0
        game.state.montyHallPending = false
      }),
    )
  }

  destroy(): void {
    this._unsubs.forEach((fn) => fn())
    this._unsubs = []
  }

  private _checkThreshold(killValue: number, game: Game): void {
    const star = game.state.starRating
    const thresholds = MONTY_HALL_THRESHOLDS_BY_STAR[star] ?? []
    const idx = game.state.montyHallNextIndex
    if (idx >= thresholds.length) return
    const threshold = thresholds[idx]
    if (killValue >= threshold.killValue) {
      game.state.montyHallPending = true
    }
  }

  triggerPendingEvent(game: Game): boolean {
    if (!game.state.montyHallPending) return false
    const star = game.state.starRating
    const thresholds = MONTY_HALL_THRESHOLDS_BY_STAR[star] ?? []
    const idx = game.state.montyHallNextIndex
    if (idx >= thresholds.length) return false

    game.state.montyHallPending = false
    game.eventBus.emit(Events.MONTY_HALL_TRIGGER, {
      doorCount: thresholds[idx].doorCount,
      thresholdIndex: idx,
    })
    game.setPhase(GamePhase.MONTY_HALL)
    return true
  }

  private _startEvent(_doorCount: number, _game: Game): void {
    const effectiveDoorCount = 3
    const prizeIndex = Math.floor(Math.random() * effectiveDoorCount)
    const reward = MONTY_HALL_REWARD_POOL[
      Math.floor(Math.random() * MONTY_HALL_REWARD_POOL.length)
    ]
    this.current = {
      doorCount: effectiveDoorCount,
      prizeIndex,
      selectedDoor: null,
      revealedDoors: [],
      reward,
      phase: 'select',
      won: false,
    }
  }

  private _revealDoor(_game: Game): void {
    if (!this.current || this.current.selectedDoor === null) return
    const { doorCount, prizeIndex, selectedDoor } = this.current

    const candidates: number[] = []
    for (let i = 0; i < doorCount; i++) {
      if (i !== selectedDoor && i !== prizeIndex) candidates.push(i)
    }
    const revealCount = doorCount - 2
    for (let r = 0; r < revealCount && candidates.length > 0; r++) {
      const idx = Math.floor(Math.random() * candidates.length)
      this.current.revealedDoors.push(candidates[idx])
      candidates.splice(idx, 1)
    }
    this.current.phase = 'switch'
  }

  private _resolveSwitch(doSwitch: boolean, game: Game): void {
    if (!this.current || this.current.selectedDoor === null || this.current.revealedDoors.length === 0) return

    let finalDoor = this.current.selectedDoor
    if (doSwitch) {
      for (let i = 0; i < this.current.doorCount; i++) {
        if (i !== this.current.selectedDoor && !this.current.revealedDoors.includes(i)) {
          finalDoor = i
          break
        }
      }
    }

    const won = finalDoor === this.current.prizeIndex
    this.current.won = won
    this.current.phase = 'result'

    if (won) {
      const buffSys = game.getSystem('buff')
      const reward = this.current.reward
      buffSys?.applyExternalBuff(
        reward.effectId,
        reward.revertId,
        reward.duration,
        reward.name,
        game,
        true,
      )
    }

    game.eventBus.emit(Events.MONTY_HALL_RESULT, {
      won,
      reward: won ? this.current.reward : null,
    })
  }

  finishEvent(game: Game): void {
    this.current = null
    game.setPhase(GamePhase.BUILD)
  }

  update(_dt: number, _game: Game): void {}
  render(_renderer: Renderer, _game: Game): void {}
}
