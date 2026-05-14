/**
 * V3 Phase 2 — the three counter-enemy types instantiate via createEnemy with
 * the expected defensive-trait field values, and the pre-V3 enemies still get
 * inert defaults (regenPerSec 0 / damageCapPerHit 0 / towerDamageMult 1).
 */
import { describe, it, expect } from 'vitest'
import { createEnemy } from './EnemyFactory'
import { createSegmentedPath, type PathSegmentRuntime } from '@/domain/path/segmented-path'
import { EnemyType } from '@/data/constants'

function linearPath(): ReturnType<typeof createSegmentedPath> {
  const seg: PathSegmentRuntime = {
    id: 's0',
    kind: 'horizontal',
    xRange: [0, 20],
    params: { kind: 'horizontal', y: 0 },
    evaluate: () => 0,
    evaluateDerivative: () => 0,
    expr: 's0',
    label: 's0',
  }
  return createSegmentedPath([seg])
}

describe('createEnemy — V3 counter-enemy defensive traits', () => {
  it('Regenerator carries regenPerSec and inert cap / mult', () => {
    const e = createEnemy(EnemyType.REGENERATOR, linearPath())
    expect(e.regenPerSec).toBe(18)
    expect(e.damageCapPerHit).toBe(0)
    expect(e.towerDamageMult).toBe(1)
    expect(e.maxHp).toBe(80)
  })

  it('Bulwark carries damageCapPerHit and inert regen / mult', () => {
    const e = createEnemy(EnemyType.BULWARK, linearPath())
    expect(e.damageCapPerHit).toBe(14)
    expect(e.regenPerSec).toBe(0)
    expect(e.towerDamageMult).toBe(1)
    expect(e.maxHp).toBe(220)
  })

  it('Swarmling carries towerDamageMult and inert regen / cap', () => {
    const e = createEnemy(EnemyType.SWARMLING, linearPath())
    expect(e.towerDamageMult).toBe(0.35)
    expect(e.regenPerSec).toBe(0)
    expect(e.damageCapPerHit).toBe(0)
    expect(e.maxHp).toBe(12)
  })

  it('pre-V3 enemies get fully inert defaults', () => {
    const e = createEnemy(EnemyType.GENERAL, linearPath())
    expect(e.regenPerSec).toBe(0)
    expect(e.damageCapPerHit).toBe(0)
    expect(e.towerDamageMult).toBe(1)
  })
})
