/**
 * TowerPlacementSystem tests.
 *
 * Exercises delegation to `PlacementPolicy`. Rule-level correctness of the
 * policy itself is covered in `domain/level/placement-policy.test.ts`; this
 * file asserts only that the system (a) routes the decision to the policy,
 * (b) emits `PLACEMENT_REJECTED` with the policy's reason on denial, and
 * (c) still performs the post-placement bookkeeping (gold, TOWER_PLACED) on
 * accept.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/entities/TowerFactory', () => ({
  createTower: (type: string, x: number, y: number) => ({
    id: `tower_${Math.random().toString(36).slice(2)}`,
    type, x, y, params: {}, cost: 50,
    active: true, configured: false, disabled: false, level: 1,
    effectiveDamage: 20, effectiveRange: 5, cooldown: 1.5, cooldownTimer: 0,
    damageBonus: 1, rangeBonus: 1, baseDamage: 20, baseRange: 5,
    color: '#4a82c8',
  }),
}))
vi.mock('@/math/MathUtils', () => ({
  degToRad: (deg: number) => (deg * Math.PI) / 180,
}))

import { TowerPlacementSystem } from '../TowerPlacementSystem'
import { GamePhase, Events, TowerType } from '@/data/constants'
import type {
  PlacementContext,
  PlacementDecision,
  PlacementPolicy,
} from '@/domain/level/placement-policy'
import type { LevelContext } from '@/engine/level-context'
import type { LevelLayoutService } from '@/domain/level/level-layout-service'
import { createMockGame } from './helpers'

function fakePolicy(decision: PlacementDecision): {
  policy: PlacementPolicy
  canPlace: ReturnType<typeof vi.fn>
} {
  const canPlace = vi.fn<(gx: number, gy: number, ctx: PlacementContext) => PlacementDecision>(
    () => decision,
  )
  return { policy: { canPlace }, canPlace }
}

function fakeLevelContext(): LevelContext {
  const layout: LevelLayoutService = {
    classify: () => 'buildable',
    pathCellCount: 0,
    buildableCellCount: 0,
  }
  return {
    layout,
    path: { segments: [], startX: 0, targetX: 0, evaluateAt: () => 0, findSegmentAt: () => null },
    tracker: { update: () => {}, dispose: () => {} },
    dispose: () => {},
  }
}

function setup(decision: PlacementDecision) {
  const game = createMockGame({ phase: GamePhase.BUILD, gold: 200 })
  game.phase.forceTransition(GamePhase.BUILD)
  game.levelContext = fakeLevelContext()
  const { policy, canPlace } = fakePolicy(decision)
  const system = new TowerPlacementSystem(policy)
  system.init(game)
  system.getSelectedTowerType = () => TowerType.FUNCTION_CANNON
  system.clearSelectedTowerType = () => { system.getSelectedTowerType = () => null }
  return { game, system, canPlace }
}

describe('TowerPlacementSystem', () => {
  it('delegates to PlacementPolicy with gx, gy, and composed context', () => {
    const { game, canPlace } = setup({ ok: true })
    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 0, y: 0 },
      game: { x: 5, y: 5 },
    })
    expect(canPlace).toHaveBeenCalledTimes(1)
    const [gx, gy, ctx] = canPlace.mock.calls[0]!
    expect(gx).toBe(5)
    expect(gy).toBe(5)
    expect(ctx.gold).toBe(200)
    expect(ctx.cost).toBe(50)
    expect(typeof ctx.isOccupied).toBe('function')
    expect(ctx.layout).toBe(game.levelContext!.layout)
  })

  it('emits PLACEMENT_REJECTED with the policy reason on denial', () => {
    const { game } = setup({ ok: false, reason: 'not-buildable' })
    const rejections: unknown[] = []
    game.eventBus.on(Events.PLACEMENT_REJECTED, (p) => rejections.push(p))

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 0, y: 0 },
      game: { x: 5, y: 5 },
    })

    expect(game.towers.length).toBe(0)
    expect(game.state.gold).toBe(200)
    expect(rejections).toEqual([{ gx: 5, gy: 5, reason: 'not-buildable' }])
  })

  it('emits TOWER_PLACED and deducts gold on acceptance', () => {
    const { game } = setup({ ok: true })
    let placed = false
    game.eventBus.on(Events.TOWER_PLACED, () => { placed = true })

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 0, y: 0 },
      game: { x: 5, y: 5 },
    })

    expect(placed).toBe(true)
    expect(game.towers.length).toBe(1)
    expect(game.state.gold).toBe(150)
  })

  it('surfaces "occupied" rejection from the policy', () => {
    const { game } = setup({ ok: false, reason: 'occupied' })
    const rejections: unknown[] = []
    game.eventBus.on(Events.PLACEMENT_REJECTED, (p) => rejections.push(p))

    game.eventBus.emit(Events.CANVAS_CLICK, {
      pixel: { x: 0, y: 0 },
      game: { x: 3, y: 3 },
    })

    expect(rejections).toEqual([{ gx: 3, gy: 3, reason: 'occupied' }])
  })
})
