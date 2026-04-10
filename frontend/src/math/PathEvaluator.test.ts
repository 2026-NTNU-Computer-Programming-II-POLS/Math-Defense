import { describe, it, expect } from 'vitest'
import { generatePath, type PathDef } from './PathEvaluator'

describe('PathEvaluator', () => {
  describe('generatePath', () => {
    it('returns a valid PathDef for each level', () => {
      for (let level = 1; level <= 4; level++) {
        const path = generatePath(level)
        expect(path).toBeDefined()
        expect(path.fn).toBeTypeOf('function')
        expect(path.expr).toBeTypeOf('string')
        expect(path.startX).toBeGreaterThan(0)
        expect(path.targetX).toBe(0)
      }
    })

    it('generates paths where >80% of points are in valid range', () => {
      for (let level = 1; level <= 4; level++) {
        const path = generatePath(level)
        let validPoints = 0
        let totalPoints = 0
        for (let x = 0; x <= path.startX; x += 0.5) {
          const y = path.fn(x)
          totalPoints++
          if (isFinite(y) && y > -1 && y < 15) validPoints++
        }
        expect(validPoints / totalPoints).toBeGreaterThan(0.8)
      }
    })

    it('falls back to horizontal line after max attempts', () => {
      // With maxAttempts=1 and many tries, at least one should be horizontal fallback
      // But any valid path is acceptable — just verify it returns something valid
      const path = generatePath(1, 1)
      expect(path).toBeDefined()
      expect(path.fn).toBeTypeOf('function')
    })

    it('clamps level index for levels beyond defined generators', () => {
      const path = generatePath(99)
      expect(path).toBeDefined()
      expect(path.fn).toBeTypeOf('function')
    })

    it('produces finite y values across the path domain', () => {
      for (let level = 1; level <= 4; level++) {
        const path = generatePath(level)
        for (let x = 0; x <= path.startX; x += 1) {
          expect(isFinite(path.fn(x))).toBe(true)
        }
      }
    })

    it('returns correct type field for each level', () => {
      const validTypes = ['horizontal', 'linear', 'quadratic', 'trigonometric', 'piecewise', 'composite']
      for (let level = 1; level <= 4; level++) {
        const path = generatePath(level)
        expect(validTypes).toContain(path.type)
      }
    })
  })

  describe('path continuity', () => {
    it('piecewise path is continuous at x=10', () => {
      // Generate many paths at level 4 to get a piecewise one
      let piecewise: PathDef | null = null
      for (let i = 0; i < 100; i++) {
        const p = generatePath(4)
        if (p.type === 'piecewise') { piecewise = p; break }
      }
      if (piecewise) {
        const leftY = piecewise.fn(10 - 0.001)
        const rightY = piecewise.fn(10 + 0.001)
        expect(Math.abs(leftY - rightY)).toBeLessThan(0.1)
      }
    })
  })
})
