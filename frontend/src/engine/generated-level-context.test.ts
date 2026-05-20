/**
 * Regression test for the placement-display bug.
 *
 * The grid's tile fill (`LevelLayoutService.classify`) and the actual
 * placement gate (`computeLegalPositions`, used by `TowerPlacementSystem` and
 * `useKeyboardPlacement`) once ran two unrelated algorithms — and generated
 * levels passed `buildablePositions: []`, so `classify` could never report
 * `buildable` at all. The grid therefore showed the player something other
 * than where a tower could actually be placed.
 *
 * `createGeneratedLevelContext` now feeds `computeLegalPositions` straight
 * into the layout service, so a cell painted `buildable` is exactly a lattice
 * point a click will be accepted on. This test pins that contract.
 */
import { describe, it, expect, vi } from 'vitest'

// `computeSpawnPoints` delegates to the WASM bridge; stub it so this stays a
// fast, deterministic, WASM-free unit test. With no spawns, `buildPathsForCurves`
// falls back to `level.interval` — a perfectly valid path for this contract.
vi.mock('@/domain/path/spawn-calculator', () => ({
  computeSpawnPoints: () => [],
}))

import {
  createGeneratedLevelContext,
  type LevelContextEmitter,
} from './generated-level-context'
import { computeLegalPositions } from '@/domain/placement/legal-positions'
import {
  GRID_MIN_X, GRID_MAX_X, GRID_MIN_Y, GRID_MAX_Y,
} from '@/data/constants'
import type { GeneratedLevel } from '@/math/curve-types'

function makeEmitter(): LevelContextEmitter {
  return { emit: vi.fn() }
}

/** A minimal generated level: one gentle line y = 0.5x across the grid. */
function sampleLevel(): GeneratedLevel {
  return {
    curves: [
      { family: 'polynomial', degree: 1, coefficients: [0.5, 0] },
    ],
    endpoint: { x: 0, y: 0 },
    region: { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
    interval: [-10, 10],
    starRating: 2,
    multisetLabel: 'test-level',
  }
}

describe('createGeneratedLevelContext — placement/display consistency', () => {
  it("classify()==='buildable' agrees with computeLegalPositions point-for-point", () => {
    const ctx = createGeneratedLevelContext(sampleLevel(), makeEmitter())

    // The exact call TowerPlacementSystem / useKeyboardPlacement make at
    // LEVEL_START — identical inputs, so an identical LegalPositionSet.
    const legal = computeLegalPositions({
      paths: ctx.paths,
      decoyCells: ctx.decoyCells,
    })

    let buildableCount = 0
    for (let gx = GRID_MIN_X; gx <= GRID_MAX_X; gx++) {
      for (let gy = GRID_MIN_Y; gy <= GRID_MAX_Y; gy++) {
        const shownBuildable = ctx.layout.classify(gx, gy) === 'buildable'
        // The grid must never paint a placeable point as non-buildable, nor a
        // non-placeable point as buildable.
        expect(shownBuildable).toBe(legal.has(gx, gy))
        if (shownBuildable) buildableCount++
      }
    }

    // Guards specifically against a regression to `buildablePositions: []`,
    // which would make `classify` never return 'buildable' — the original bug.
    expect(buildableCount).toBeGreaterThan(0)
    expect(buildableCount).toBe(legal.positions.length)
  })

  it('classifies decoy cells as path, never as buildable', () => {
    const ctx = createGeneratedLevelContext(sampleLevel(), makeEmitter())
    for (const [gx, gy] of ctx.decoyCells) {
      expect(ctx.layout.classify(gx, gy)).toBe('path')
    }
  })

  it('classifies a lattice point on the curve as path', () => {
    const ctx = createGeneratedLevelContext(sampleLevel(), makeEmitter())
    // y = 0.5x passes through (0, 0); a path point is never buildable.
    expect(ctx.layout.classify(0, 0)).toBe('path')
  })
})
