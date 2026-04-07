import { describe, it, expect } from 'vitest'
import {
  matrixMultiply,
  sectorCoverage,
  pointInSector,
  numericalIntegrate,
  fourierComposite,
  fourierMatch,
} from './WasmBridge'

// These tests run against JS fallback (WASM not loaded in test env)

describe('WasmBridge (JS fallback)', () => {
  describe('matrixMultiply', () => {
    it('multiplies identity by identity', () => {
      const result = matrixMultiply([1, 0, 0, 1], [1, 0, 0, 1])
      expect(result).toEqual([1, 0, 0, 1])
    })

    it('multiplies 2x2 matrices correctly', () => {
      // [1,2; 3,4] * [5,6; 7,8] = [19,22; 43,50]
      const result = matrixMultiply([1, 2, 3, 4], [5, 6, 7, 8])
      expect(result).toEqual([19, 22, 43, 50])
    })

    it('multiplies by zero matrix', () => {
      const result = matrixMultiply([1, 2, 3, 4], [0, 0, 0, 0])
      expect(result).toEqual([0, 0, 0, 0])
    })
  })

  describe('sectorCoverage', () => {
    it('calculates sector area: 0.5 * r^2 * angle', () => {
      expect(sectorCoverage(4, Math.PI / 3)).toBeCloseTo(0.5 * 16 * (Math.PI / 3))
    })

    it('full circle: 0.5 * r^2 * 2pi', () => {
      expect(sectorCoverage(1, 2 * Math.PI)).toBeCloseTo(Math.PI)
    })
  })

  describe('pointInSector', () => {
    it('detects point inside sector', () => {
      expect(pointInSector(1, 0, 0, 0, 2, 0, Math.PI / 2)).toBe(true)
    })

    it('detects point outside sector (too far)', () => {
      expect(pointInSector(5, 0, 0, 0, 2, 0, Math.PI / 2)).toBe(false)
    })

    it('detects point outside sector (wrong angle)', () => {
      expect(pointInSector(0, -1, 0, 0, 2, 0, Math.PI / 4)).toBe(false)
    })
  })

  describe('numericalIntegrate', () => {
    it('integrates constant f(x) = 5 over [0, 10] → |50|', () => {
      expect(numericalIntegrate(0, 0, 5, 0, 10)).toBeCloseTo(50, 0)
    })

    it('integrates f(x) = x over [0, 4] → |8|', () => {
      expect(numericalIntegrate(0, 1, 0, 0, 4)).toBeCloseTo(8, 0)
    })

    it('integrates f(x) = x^2 over [0, 3] → |9|', () => {
      expect(numericalIntegrate(1, 0, 0, 0, 3)).toBeCloseTo(9, 0)
    })
  })

  describe('fourierComposite', () => {
    it('returns 0 when all amplitudes are 0', () => {
      expect(fourierComposite(1, [1, 2, 3], [0, 0, 0])).toBe(0)
    })

    it('single component: A*sin(wt)', () => {
      expect(fourierComposite(Math.PI / 2, [1, 0, 0], [2, 0, 0])).toBeCloseTo(2)
    })

    it('sum of sines', () => {
      const t = 1.0
      const freqs = [1, 2, 3]
      const amps = [1, 0.5, 0.3]
      const expected =
        1 * Math.sin(1 * t) + 0.5 * Math.sin(2 * t) + 0.3 * Math.sin(3 * t)
      expect(fourierComposite(t, freqs, amps)).toBeCloseTo(expected)
    })
  })

  describe('fourierMatch', () => {
    it('identical waves → match = 1.0', () => {
      const freqs = [1, 2, 3]
      const amps = [1, 0.5, 0.3]
      expect(fourierMatch(freqs, amps, freqs, amps)).toBeCloseTo(1.0, 1)
    })

    it('completely different waves → match < 0.5', () => {
      const score = fourierMatch([1, 2, 3], [1, 1, 1], [7, 8, 9], [1, 1, 1])
      expect(score).toBeLessThan(0.5)
    })

    it('zero energy → match = 1.0', () => {
      expect(fourierMatch([1, 2, 3], [0, 0, 0], [4, 5, 6], [0, 0, 0])).toBe(1.0)
    })
  })
})
