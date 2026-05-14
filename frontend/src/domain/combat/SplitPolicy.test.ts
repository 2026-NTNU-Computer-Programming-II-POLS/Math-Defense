/**
 * V3 Phase 2 — the damage-source contract. applyDamage is the single place
 * that resolves every defensive modifier: vulnerability → evasion → per-hit
 * cap → shield → HP. Callers only declare their DamageSource.
 */
import { describe, it, expect } from 'vitest'
import { applyDamage, type CombatGameContext, type DamageSource } from './SplitPolicy'
import type { Enemy } from '@/entities/types'
import { EnemyType, Events } from '@/data/constants'

function makeEnemy(over?: Partial<Enemy>): Enemy {
  return {
    id: 'e1',
    type: EnemyType.GENERAL,
    x: 0,
    y: 0,
    hp: 1000,
    maxHp: 1000,
    speed: 1,
    speedMultiplier: 1,
    size: 16,
    reward: 10,
    damage: 1,
    color: '#fff',
    active: true,
    alive: true,
    _pathX: 0,
    _targetX: 0,
    _direction: -1,
    killValue: 10,
    shield: 0,
    shieldMax: 0,
    splitDepth: 0,
    splitCount: 0,
    splitChildType: null,
    splitChildScale: 1,
    helperRadius: 0,
    helperHealPerSec: 0,
    helperSpeedBuff: 0,
    regenPerSec: 0,
    damageCapPerHit: 0,
    towerDamageMult: 1,
    minionTimer: 0,
    minionInterval: 0,
    minionType: null,
    chainRuleTriggered: false,
    chainRuleAnsweredCorrectly: null,
    chainRuleTriggerFraction: 0,
    slowFactor: 0,
    slowTimer: 0,
    speedBoost: 0,
    dotDamage: 0,
    dotTimer: 0,
    ...over,
  }
}

function makeContext(enemyVulnerability = 1): CombatGameContext {
  return {
    eventBus: { emit: () => {} },
    levelContext: null,
    enemies: [],
    state: { enemyVulnerability },
  }
}

interface RecordedEvent {
  event: string
  payload: unknown
}

function makeRecordingContext(enemyVulnerability = 1): {
  context: CombatGameContext
  events: RecordedEvent[]
} {
  const events: RecordedEvent[] = []
  const context: CombatGameContext = {
    eventBus: { emit: (event, payload) => events.push({ event, payload }) },
    levelContext: null,
    enemies: [],
    state: { enemyVulnerability },
  }
  return { context, events }
}

const ALL_SOURCES: DamageSource[] = [
  'towerHit', 'towerTick', 'dot', 'pet', 'spell', 'effect',
]

describe('applyDamage — V3 damage-source contract', () => {
  describe('evasion (towerDamageMult = 0.35)', () => {
    it('reduces towerHit / towerTick / dot / spell', () => {
      for (const source of ['towerHit', 'towerTick', 'dot', 'spell'] as DamageSource[]) {
        const enemy = makeEnemy({ towerDamageMult: 0.35 })
        applyDamage(enemy, 100, makeContext(), source)
        // 100 * 0.35 = 35
        expect(enemy.hp).toBeCloseTo(965, 5)
      }
    })

    it('does not reduce pet / effect', () => {
      for (const source of ['pet', 'effect'] as DamageSource[]) {
        const enemy = makeEnemy({ towerDamageMult: 0.35 })
        applyDamage(enemy, 100, makeContext(), source)
        expect(enemy.hp).toBeCloseTo(900, 5)
      }
    })
  })

  describe('per-hit cap (damageCapPerHit = 14)', () => {
    it('clamps discrete hits: towerHit / pet / spell / effect', () => {
      for (const source of ['towerHit', 'pet', 'spell', 'effect'] as DamageSource[]) {
        const enemy = makeEnemy({ damageCapPerHit: 14 })
        applyDamage(enemy, 40, makeContext(), source)
        expect(enemy.hp).toBeCloseTo(986, 5)
      }
    })

    it('does not clamp continuous sources: towerTick / dot', () => {
      for (const source of ['towerTick', 'dot'] as DamageSource[]) {
        const enemy = makeEnemy({ damageCapPerHit: 14 })
        applyDamage(enemy, 40, makeContext(), source)
        expect(enemy.hp).toBeCloseTo(960, 5)
      }
    })
  })

  describe('both traits together resolve in the documented order', () => {
    it('vulnerability → evasion → cap, for a capped discrete hit', () => {
      // raw 100 → *1.5 vuln = 150 → *0.35 evasion = 52.5 → cap 14.
      const enemy = makeEnemy({ towerDamageMult: 0.35, damageCapPerHit: 14 })
      applyDamage(enemy, 100, makeContext(1.5), 'towerHit')
      expect(enemy.hp).toBeCloseTo(986, 5)
    })

    it('cap does not apply to a continuous source even with evasion present', () => {
      // raw 100 → *1.5 vuln = 150 → *0.35 evasion = 52.5 → no cap.
      const enemy = makeEnemy({ towerDamageMult: 0.35, damageCapPerHit: 14 })
      applyDamage(enemy, 100, makeContext(1.5), 'towerTick')
      expect(enemy.hp).toBeCloseTo(947.5, 5)
    })

    it('evasion is bypassed by pet, then the cap still applies', () => {
      // pet bypasses evasion: raw 100 → cap 14.
      const enemy = makeEnemy({ towerDamageMult: 0.35, damageCapPerHit: 14 })
      applyDamage(enemy, 100, makeContext(), 'pet')
      expect(enemy.hp).toBeCloseTo(986, 5)
    })
  })

  describe('pre-Phase-2 enemies (defaults 0 / 0 / 1) are unaffected', () => {
    it('every source deals the plain vulnerability-scaled amount', () => {
      for (const source of ALL_SOURCES) {
        const enemy = makeEnemy()
        applyDamage(enemy, 40, makeContext(), source)
        expect(enemy.hp).toBeCloseTo(960, 5)
      }
    })

    it('shield absorption is unchanged', () => {
      const enemy = makeEnemy({ shield: 30 })
      applyDamage(enemy, 40, makeContext(), 'towerHit')
      expect(enemy.shield).toBe(0)
      expect(enemy.hp).toBeCloseTo(990, 5)
    })
  })
})

describe('applyDamage — DAMAGE_RESOLVED feedback event', () => {
  const resolved = (events: RecordedEvent[]): RecordedEvent[] =>
    events.filter((e) => e.event === Events.DAMAGE_RESOLVED)

  it('fires once for a capped towerHit, with kind "capped" and both numbers', () => {
    const { context, events } = makeRecordingContext()
    const enemy = makeEnemy({ damageCapPerHit: 14, x: 3, y: 7 })
    applyDamage(enemy, 40, context, 'towerHit')

    const hits = resolved(events)
    expect(hits).toHaveLength(1)
    expect(hits[0].payload).toEqual({
      x: 3,
      y: 7,
      raw: 40,
      applied: 14,
      kind: 'capped',
    })
  })

  it('fires once for a reduced towerHit, with kind "reduced"', () => {
    const { context, events } = makeRecordingContext()
    const enemy = makeEnemy({ towerDamageMult: 0.35 })
    applyDamage(enemy, 100, context, 'towerHit')

    const hits = resolved(events)
    expect(hits).toHaveLength(1)
    expect(hits[0].payload).toMatchObject({ raw: 100, applied: 35, kind: 'reduced' })
  })

  it('does not fire for an unmodified towerHit', () => {
    const { context, events } = makeRecordingContext()
    applyDamage(makeEnemy(), 40, context, 'towerHit')
    expect(resolved(events)).toHaveLength(0)
  })

  it('does not fire for a continuous towerTick even when evasion reduces it', () => {
    const { context, events } = makeRecordingContext()
    const enemy = makeEnemy({ towerDamageMult: 0.35 })
    applyDamage(enemy, 100, context, 'towerTick')
    expect(resolved(events)).toHaveLength(0)
  })

  it('does not fire for a continuous dot even when evasion reduces it', () => {
    const { context, events } = makeRecordingContext()
    const enemy = makeEnemy({ towerDamageMult: 0.35 })
    applyDamage(enemy, 100, context, 'dot')
    expect(resolved(events)).toHaveLength(0)
  })
})
