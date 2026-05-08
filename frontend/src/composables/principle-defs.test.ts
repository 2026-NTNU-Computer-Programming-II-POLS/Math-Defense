/**
 * Tests for principle-defs.ts (data layer) and pickPrincipleForWave (composable).
 *
 * Lives under composables/ rather than data/ because pickPrincipleForWave
 * comes from useGameLoop — and arch-check enforces that the data layer
 * cannot import from presentation. Co-locating both halves of the test in
 * the presentation layer keeps the layering rule clean without splitting
 * the file into two thinly-related halves.
 */
import { describe, it, expect } from 'vitest'
import {
  PRINCIPLE_DEFS,
  PRINCIPLE_IDS,
  TOWER_TO_PRINCIPLE,
  type PrincipleId,
} from '@/data/principle-defs'
import { TowerType, type TowerType as TowerTypeT } from '@/data/constants'
import { pickPrincipleForWave } from './useGameLoop'

function towersFromTypes(types: TowerTypeT[]): { towers: Array<{ type: TowerTypeT }> } {
  return { towers: types.map((type) => ({ type })) }
}

describe('PRINCIPLE_DEFS', () => {
  it('has every id resolve to a non-empty title, latex, and prose', () => {
    for (const id of PRINCIPLE_IDS) {
      const def = PRINCIPLE_DEFS[id]
      expect(def, `missing def for ${id}`).toBeDefined()
      expect(def.title.trim().length, `empty title for ${id}`).toBeGreaterThan(0)
      expect(def.latex.trim().length, `empty latex for ${id}`).toBeGreaterThan(0)
      expect(def.prose.trim().length, `empty prose for ${id}`).toBeGreaterThan(0)
    }
  })

  it('declares all expected ids from the spec', () => {
    const expected: PrincipleId[] = [
      'chain-rule',
      'monty-hall',
      'derivative-as-rate',
      'limit-piecewise',
      'matrix-dot',
      'magic-curve-zone',
      'radar-arc',
    ]
    expect([...PRINCIPLE_IDS].sort()).toEqual(expected.sort())
  })

  it('maps every TowerType to a registered principle id', () => {
    for (const type of Object.values(TowerType)) {
      const id = TOWER_TO_PRINCIPLE[type]
      expect(id, `missing principle for tower ${type}`).toBeDefined()
      expect(PRINCIPLE_DEFS[id]).toBeDefined()
    }
  })
})

describe('pickPrincipleForWave', () => {
  // Use a structural cast — pickPrincipleForWave only reads g.towers.
  function call(types: TowerTypeT[], shown: PrincipleId[] = []): PrincipleId | null {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return pickPrincipleForWave(towersFromTypes(types) as any, new Set(shown))
  }

  it('returns null when no towers are placed', () => {
    expect(call([])).toBeNull()
  })

  it('picks the dominant tower principle on a Magic-dominated wave (acceptance §1.4)', () => {
    const ids: TowerTypeT[] = [
      TowerType.MAGIC, TowerType.MAGIC, TowerType.MAGIC,
      TowerType.LIMIT,
    ]
    expect(call(ids)).toBe('magic-curve-zone')
  })

  it('falls back to a rarer unshown principle when the dominant has been seen', () => {
    const ids: TowerTypeT[] = [
      TowerType.MAGIC, TowerType.MAGIC, TowerType.MAGIC,
      TowerType.LIMIT,
    ]
    expect(call(ids, ['magic-curve-zone'])).toBe('limit-piecewise')
  })

  it('cycles back to the dominant when every principle has already been shown', () => {
    const ids: TowerTypeT[] = [
      TowerType.MAGIC, TowerType.MAGIC,
      TowerType.LIMIT,
    ]
    expect(call(ids, ['magic-curve-zone', 'limit-piecewise'])).toBe('magic-curve-zone')
  })

  it('treats Radar A/B/C as a single principle archetype', () => {
    const ids: TowerTypeT[] = [
      TowerType.RADAR_A, TowerType.RADAR_B, TowerType.RADAR_C,
      TowerType.MAGIC,
    ]
    // Three radar towers collapse to radar-arc with count 3, dominant over magic (1).
    expect(call(ids)).toBe('radar-arc')
  })
})
