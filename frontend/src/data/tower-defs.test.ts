import { describe, it, expect } from 'vitest'
import { TOWER_DEFS } from './tower-defs'
import { TowerType } from './constants'

describe('TOWER_DEFS', () => {
  it('has a non-empty examRelevance for every tower', () => {
    for (const type of Object.values(TowerType)) {
      const def = TOWER_DEFS[type]
      expect(def, `missing def for ${type}`).toBeDefined()
      expect(typeof def.examRelevance, `examRelevance must be a string for ${type}`).toBe('string')
      expect(def.examRelevance.trim().length, `empty examRelevance for ${type}`).toBeGreaterThan(0)
    }
  })
})
