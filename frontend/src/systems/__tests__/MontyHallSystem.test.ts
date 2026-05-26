/**
 * Q18: MontyHallSystem._startEvent filters MONTY_HALL_REWARD_POOL by
 * `(reward.minStar ?? 1) <= game.state.starRating` before random selection.
 * These tests pin the gating contract — they iterate every reward in the pool
 * for each star tier so adding a new reward without setting minStar is caught
 * by a failing star-1 test, not by playtest.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { MontyHallSystem } from '../MontyHallSystem'
import { MONTY_HALL_REWARD_POOL } from '@/data/monty-hall-defs'
import { Events } from '@/data/constants'
import { createMockGame } from './helpers'
import type { Game } from '@/engine/Game'

/**
 * Force the rng to a chosen door + reward index pair, then trigger the event
 * and return the resolved reward. The implementation calls `this._rng()` twice
 * inside `_startEvent` (prize door first, then reward selection), so we feed
 * the two values in order via a pop-front queue.
 */
function rollReward(system: MontyHallSystem, game: Game, doorCount: number, rewardPickRatio: number) {
  // rng #1 → prizeIndex = floor(0.0 * doorCount) = 0 (always door 0 — irrelevant)
  // rng #2 → reward index within the *filtered* pool
  const stream = [0.0, rewardPickRatio]
  game.rng = () => stream.shift() ?? 0
  // Re-init so the captured `_rng` arrow closes over the new stream.
  system.init(game)
  game.eventBus.emit(Events.MONTY_HALL_TRIGGER, { doorCount, thresholdIndex: 0 })
  return system.current?.reward
}

describe('MontyHallSystem — Q18 per-star reward gating', () => {
  let game: ReturnType<typeof createMockGame>
  let system: MontyHallSystem

  beforeEach(() => {
    game = createMockGame()
    system = new MontyHallSystem()
    system.init(game)
  })

  it('1★ only surfaces rewards with minStar ≤ 1', () => {
    game.state.starRating = 1
    const allowedIds = MONTY_HALL_REWARD_POOL
      .filter((r) => (r.minStar ?? 1) <= 1)
      .map((r) => r.id)

    // Sample several rng values across the full [0,1) range to make sure no
    // out-of-tier reward leaks through.
    const samples = [0, 0.17, 0.34, 0.5, 0.67, 0.83, 0.99]
    const seenIds = new Set<string>()
    for (const ratio of samples) {
      const reward = rollReward(system, game, 3, ratio)
      expect(reward).toBeDefined()
      expect(allowedIds).toContain(reward!.id)
      seenIds.add(reward!.id)
    }
    // Sanity: with this many samples we should have visited every allowed id.
    expect(seenIds.size).toBe(allowedIds.length)
  })

  it('2★ surfaces minStar ≤ 2 rewards but no minStar 3 rewards', () => {
    game.state.starRating = 2
    const allowedIds = MONTY_HALL_REWARD_POOL
      .filter((r) => (r.minStar ?? 1) <= 2)
      .map((r) => r.id)
    const blockedIds = MONTY_HALL_REWARD_POOL
      .filter((r) => (r.minStar ?? 1) > 2)
      .map((r) => r.id)

    const samples = [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.99]
    for (const ratio of samples) {
      const reward = rollReward(system, game, 3, ratio)
      expect(reward).toBeDefined()
      expect(allowedIds).toContain(reward!.id)
      expect(blockedIds).not.toContain(reward!.id)
    }
  })

  it('5★ surfaces the full reward pool', () => {
    game.state.starRating = 5
    const allIds = MONTY_HALL_REWARD_POOL.map((r) => r.id)

    const seenIds = new Set<string>()
    // Step finely enough to hit every index of the unfiltered pool.
    const step = 1 / MONTY_HALL_REWARD_POOL.length
    for (let i = 0; i < MONTY_HALL_REWARD_POOL.length; i++) {
      const ratio = step * i + step / 2
      const reward = rollReward(system, game, 3, ratio)
      expect(reward).toBeDefined()
      seenIds.add(reward!.id)
    }
    expect([...seenIds].sort()).toEqual([...allIds].sort())
  })

  it('1★ player can win the heal and free-tower rewards (the curated minStar:1 tier)', () => {
    // Concrete regression guard: if we ever drop the minStar:1 tag on either
    // of these utility rewards, this test should fail before the player notices.
    game.state.starRating = 1
    const tier1Ids = ['mh_heal_full', 'mh_free_towers']
    const seen = new Set<string>()
    const samples = [0, 0.25, 0.5, 0.75, 0.99]
    for (const ratio of samples) {
      const reward = rollReward(system, game, 3, ratio)
      if (reward) seen.add(reward.id)
    }
    for (const id of tier1Ids) {
      expect(seen.has(id)).toBe(true)
    }
  })
})
