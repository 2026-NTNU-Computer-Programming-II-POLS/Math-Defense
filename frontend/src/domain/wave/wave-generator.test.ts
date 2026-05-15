/**
 * V3 Phase 5 — wave integration. Asserts the counter-enemies land in the
 * waves exactly per the phase-5 tables, never below their introduction star,
 * and that Swarmling batches carry the per-entry burst interval.
 */
import { describe, it, expect } from 'vitest'
import { buildWavesForStar, type WaveDef } from './wave-generator'
import { EnemyType } from '@/data/constants'

function countOf(wave: WaveDef, type: EnemyType): number {
  return wave.enemies.filter((e) => e.type === type).length
}

function countsPerWave(star: number, type: EnemyType): number[] {
  return buildWavesForStar(star).map((w) => countOf(w, type))
}

describe('buildWavesForStar — counter-enemy placement', () => {
  it('1★ has no counter-enemies at all', () => {
    for (const type of [EnemyType.BULWARK, EnemyType.REGENERATOR, EnemyType.SWARMLING]) {
      expect(countsPerWave(1, type)).toEqual([0, 0, 0])
    }
  })

  it('2★ introduces Bulwark once, in the last wave, and nothing else', () => {
    expect(countsPerWave(2, EnemyType.BULWARK)).toEqual([0, 0, 0, 1])
    expect(countsPerWave(2, EnemyType.REGENERATOR)).toEqual([0, 0, 0, 0])
    expect(countsPerWave(2, EnemyType.SWARMLING)).toEqual([0, 0, 0, 0])
  })

  it('3★ matches the table', () => {
    expect(countsPerWave(3, EnemyType.REGENERATOR)).toEqual([0, 1, 0, 0, 0])
    expect(countsPerWave(3, EnemyType.BULWARK)).toEqual([0, 0, 1, 0, 1])
    expect(countsPerWave(3, EnemyType.SWARMLING)).toEqual([0, 0, 0, 4, 0])
  })

  it('4★ matches the table', () => {
    expect(countsPerWave(4, EnemyType.BULWARK)).toEqual([1, 1, 0, 0, 1])
    expect(countsPerWave(4, EnemyType.REGENERATOR)).toEqual([0, 1, 0, 2, 1])
    expect(countsPerWave(4, EnemyType.SWARMLING)).toEqual([0, 0, 6, 0, 0])
  })

  it('5★ matches the table', () => {
    expect(countsPerWave(5, EnemyType.REGENERATOR)).toEqual([1, 0, 2, 1, 1])
    expect(countsPerWave(5, EnemyType.BULWARK)).toEqual([1, 1, 0, 2, 1])
    expect(countsPerWave(5, EnemyType.SWARMLING)).toEqual([0, 8, 6, 0, 5])
  })

  it('no counter-enemy appears below its introduction star', () => {
    // Bulwark unlocks at 2★; Regenerator and Swarmling at 3★.
    expect(countsPerWave(1, EnemyType.BULWARK)).toEqual([0, 0, 0])
    for (const star of [1, 2]) {
      const regen = countsPerWave(star, EnemyType.REGENERATOR)
      const swarm = countsPerWave(star, EnemyType.SWARMLING)
      expect(regen.every((c) => c === 0)).toBe(true)
      expect(swarm.every((c) => c === 0)).toBe(true)
    }
  })

  it('existing enemies are kept — counter-enemies are spliced in, not replacing', () => {
    // 2★ wave 4 still has its 6 Fast + 4 General alongside the new Bulwark.
    const wave = buildWavesForStar(2)[3]!
    expect(countOf(wave, EnemyType.FAST)).toBe(6)
    expect(countOf(wave, EnemyType.GENERAL)).toBe(4)
    expect(countOf(wave, EnemyType.BULWARK)).toBe(1)
  })
})

describe('burst() vs s() — per-entry interval', () => {
  it('Swarmling burst entries each carry interval 0.15', () => {
    // 3★ wave 4 adds burst(SWARMLING, 4).
    const wave = buildWavesForStar(3)[3]!
    const swarmlings = wave.enemies.filter((e) => e.type === EnemyType.SWARMLING)
    expect(swarmlings).toHaveLength(4)
    expect(swarmlings.every((e) => e.interval === 0.15)).toBe(true)
  })

  it('s() entries carry no interval (use the wave default)', () => {
    const wave = buildWavesForStar(3)[3]!
    const nonBurst = wave.enemies.filter((e) => e.type !== EnemyType.SWARMLING)
    expect(nonBurst.length).toBeGreaterThan(0)
    expect(nonBurst.every((e) => e.interval === undefined)).toBe(true)
  })
})
