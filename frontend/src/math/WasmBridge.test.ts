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

    // ── JS-vs-WASM boundary parity (bug 2.12) ──
    // The JS fallback uses a 1e-6 epsilon on angle comparisons. WASM (point_in_sector
    // in math_engine.c) must agree on these exact boundary conditions or stealth
    // detection / radar sweeps will diverge between platforms.
    describe('boundary parity (must match WASM behaviour)', () => {
      it('point exactly on the radius is inside (dist === radius, not >)', () => {
        // Sector at origin, radius 2, full first quadrant. (2, 0) sits on the arc.
        expect(pointInSector(2, 0, 0, 0, 2, 0, Math.PI / 2)).toBe(true)
      })

      it('point at exactly the start angle is inside (eps slack)', () => {
        // start = π/4, width = π/2; point along start ray at radius 1
        const start = Math.PI / 4
        const px = Math.cos(start)
        const py = Math.sin(start)
        expect(pointInSector(px, py, 0, 0, 2, start, Math.PI / 2)).toBe(true)
      })

      it('point at exactly the end angle is inside (eps slack)', () => {
        // start = 0, width = π/2; point along end ray (π/2) at radius 1 → (0, 1)
        expect(pointInSector(0, 1, 0, 0, 2, 0, Math.PI / 2)).toBe(true)
      })

      it('point just past the end angle is outside', () => {
        // angle slightly larger than end + eps
        const end = Math.PI / 2
        const a = end + 1e-3
        expect(pointInSector(Math.cos(a), Math.sin(a), 0, 0, 2, 0, end)).toBe(false)
      })

      it('point just past the radius is outside', () => {
        // radius = 2; place a point at distance 2 + 1e-3 along the +x axis
        expect(pointInSector(2 + 1e-3, 0, 0, 0, 2, 0, Math.PI / 2)).toBe(false)
      })

      it('wrap-around sector: start near 2π, width crosses zero', () => {
        // start = 350°, width = 20° → end = 370° → angle 5° must hit wrap branch
        const start = (350 * Math.PI) / 180
        const width = (20 * Math.PI) / 180
        const angleAt5deg = (5 * Math.PI) / 180
        const px = Math.cos(angleAt5deg)
        const py = Math.sin(angleAt5deg)
        expect(pointInSector(px, py, 0, 0, 2, start, width)).toBe(true)

        // 30° must be outside the wrap window
        const angleAt30 = (30 * Math.PI) / 180
        const px2 = Math.cos(angleAt30)
        const py2 = Math.sin(angleAt30)
        expect(pointInSector(px2, py2, 0, 0, 2, start, width)).toBe(false)
      })

      it('negative angleStart is normalised to [0, 2π)', () => {
        // start = -π/4 normalises to 7π/4, width = π/2 → covers (-π/4, π/4)
        // Point at angle 0 (along +x axis) must be inside the wrapped window.
        expect(pointInSector(1, 0, 0, 0, 2, -Math.PI / 4, Math.PI / 2)).toBe(true)
      })

      it('center of sector at non-origin is inside', () => {
        // Sector centred at (10, 10), radius 1, full circle (effectively)
        expect(pointInSector(10, 10, 10, 10, 1, 0, Math.PI * 2)).toBe(true)
      })

      it('parity table: independently-derived expected values', () => {
        // Each row is an independently calculated expectation from the math
        // (not a re-call of pointInSector). If JS and WASM both agree with
        // these, parity holds.
        type Row = [number, number, number, number, number, number, number, boolean, string]
        const cases: Row[] = [
          // px py cx cy r start width expected label
          [1, 0, 0, 0, 1, 0, Math.PI / 2, true, 'inside, on radius'],
          [0, 1, 0, 0, 1, 0, Math.PI / 2, true, 'inside, end ray'],
          [-1, 0, 0, 0, 1, 0, Math.PI / 2, false, 'opposite quadrant'],
          [0.5, 0.5, 0, 0, 1, 0, Math.PI / 2, true, 'interior 45°'],
          [0.5, 0.5, 0, 0, 1, Math.PI, Math.PI / 2, false, 'rotated sector excludes Q1'],
          [0, 0, 5, 5, 10, 0, Math.PI * 2, true, 'origin inside large sector'],
        ]
        for (const [px, py, cx, cy, r, st, w, expected, label] of cases) {
          expect(pointInSector(px, py, cx, cy, r, st, w), label).toBe(expected)
        }
      })
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
