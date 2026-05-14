/**
 * Phase 7 §7.1 — the consolidated effective-damage formula is the single
 * definition site for `tower.effectiveDamage`. These tests pin the canonical
 * value: baseDamage * damageBonus * magicBuff * interferenceFactor.
 */
import { describe, it, expect } from 'vitest'
import { recomputeEffectiveDamage } from './tower-stats'
import { TowerType } from '@/data/constants'
import type { Tower } from './types'

function makeTower(overrides: Partial<Tower> = {}): Tower {
  return {
    id: 'tower_test',
    type: TowerType.MAGIC,
    x: 0,
    y: 0,
    params: {},
    cost: 50,
    active: true,
    configured: false,
    disabled: false,
    level: 1,
    effectiveDamage: 0,
    effectiveRange: 5,
    cooldown: 1,
    cooldownTimer: 0,
    damageBonus: 1,
    rangeBonus: 1,
    baseDamage: 20,
    baseRange: 5,
    talentMods: {},
    magicBuff: 1,
    interferenceFactor: 1,
    color: '#000000',
    ...overrides,
  }
}

describe('recomputeEffectiveDamage', () => {
  it('equals baseDamage * damageBonus when magicBuff and interferenceFactor are 1, for every tower type', () => {
    for (const type of Object.values(TowerType)) {
      const tower = makeTower({ type, baseDamage: 30, damageBonus: 1.5, magicBuff: 1, interferenceFactor: 1 })
      recomputeEffectiveDamage(tower)
      expect(tower.effectiveDamage).toBe(30 * 1.5)
    }
  })

  it('folds in magicBuff — matches the canonical value MagicTowerSystem would produce', () => {
    const tower = makeTower({ baseDamage: 20, damageBonus: 2, magicBuff: 1.25, interferenceFactor: 1 })
    recomputeEffectiveDamage(tower)
    expect(tower.effectiveDamage).toBe(20 * 2 * 1.25)
  })

  it('folds in interferenceFactor', () => {
    const tower = makeTower({ baseDamage: 20, damageBonus: 1, magicBuff: 1, interferenceFactor: 0.7 })
    recomputeEffectiveDamage(tower)
    expect(tower.effectiveDamage).toBe(20 * 0.7)
  })

  it('applies magicBuff and interferenceFactor together with no double-counting', () => {
    const tower = makeTower({ baseDamage: 20, damageBonus: 1, magicBuff: 1.25, interferenceFactor: 0.85 })
    recomputeEffectiveDamage(tower)
    expect(tower.effectiveDamage).toBe(20 * 1 * 1.25 * 0.85)
  })
})
