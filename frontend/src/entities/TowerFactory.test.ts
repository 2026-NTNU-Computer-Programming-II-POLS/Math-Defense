/**
 * Factory `configured` semantics. Radar towers ship with a fully playable
 * default arc (unrestricted full sweep), so they must be created already
 * `configured` and fire automatically on placement (spec: "towers fire
 * automatically") — regression guard for the bug where a placed radar dealt
 * zero damage until the player opened the arc panel and pressed Apply.
 *
 * The input-driven towers (Magic / Limit / Calculus) and the pair-driven
 * Matrix tower remain unconfigured at creation: they have no useful default
 * behaviour until the player (or auto-pair) supplies the missing piece.
 */
import { describe, it, expect } from 'vitest'
import { createTower } from './TowerFactory'
import { TowerType } from '@/data/constants'

describe('createTower configured semantics', () => {
  it.each([TowerType.RADAR_A, TowerType.RADAR_B, TowerType.RADAR_C])(
    'creates %s already configured so it fires on placement',
    (type) => {
      const tower = createTower(type, 0, 0)
      expect(tower.configured).toBe(true)
      // Default arc is the unrestricted full sweep that makes the tower playable.
      expect(tower.arcRestrict).toBe(false)
    },
  )

  it.each([TowerType.MAGIC, TowerType.LIMIT, TowerType.CALCULUS, TowerType.MATRIX])(
    'creates %s unconfigured (needs player input or a pair first)',
    (type) => {
      expect(createTower(type, 0, 0).configured).toBe(false)
    },
  )
})
