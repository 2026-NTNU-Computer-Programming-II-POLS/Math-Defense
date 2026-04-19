/**
 * Unit tests for PlacementPolicy.
 */
import { describe, it, expect } from 'vitest'
import {
  createPlacementPolicy,
  type PlacementContext,
} from './placement-policy'
import type { LevelLayoutService, TileClass } from './level-layout-service'

function fakeLayout(classifier: (gx: number, gy: number) => TileClass): LevelLayoutService {
  return {
    classify: classifier,
    pathCellCount: 0,
    buildableCellCount: 0,
  }
}

function ctx(overrides: Partial<PlacementContext> = {}): PlacementContext {
  return {
    layout: fakeLayout(() => 'buildable'),
    isOccupied: () => false,
    gold: 100,
    cost: 50,
    ...overrides,
  }
}

describe('PlacementPolicy', () => {
  const policy = createPlacementPolicy()

  it('accepts a buildable, unoccupied cell with enough gold', () => {
    expect(policy.canPlace(1, 1, ctx())).toEqual({ ok: true })
  })

  it('rejects a forbidden cell with reason "not-buildable"', () => {
    const decision = policy.canPlace(1, 1, ctx({
      layout: fakeLayout(() => 'forbidden'),
    }))
    expect(decision).toEqual({ ok: false, reason: 'not-buildable' })
  })

  it('rejects a path cell with reason "not-buildable"', () => {
    const decision = policy.canPlace(1, 1, ctx({
      layout: fakeLayout(() => 'path'),
    }))
    expect(decision).toEqual({ ok: false, reason: 'not-buildable' })
  })

  it('rejects an occupied cell with reason "occupied"', () => {
    const decision = policy.canPlace(1, 1, ctx({
      isOccupied: () => true,
    }))
    expect(decision).toEqual({ ok: false, reason: 'occupied' })
  })

  it('rejects when gold is below cost with reason "insufficient-gold"', () => {
    const decision = policy.canPlace(1, 1, ctx({ gold: 10, cost: 50 }))
    expect(decision).toEqual({ ok: false, reason: 'insufficient-gold' })
  })

  it('cheapest check wins: not-buildable + insufficient-gold → "not-buildable"', () => {
    const decision = policy.canPlace(1, 1, ctx({
      layout: fakeLayout(() => 'forbidden'),
      gold: 10,
      cost: 50,
    }))
    expect(decision).toEqual({ ok: false, reason: 'not-buildable' })
  })

  it('occupied wins over insufficient-gold', () => {
    const decision = policy.canPlace(1, 1, ctx({
      isOccupied: () => true,
      gold: 10,
      cost: 50,
    }))
    expect(decision).toEqual({ ok: false, reason: 'occupied' })
  })
})
