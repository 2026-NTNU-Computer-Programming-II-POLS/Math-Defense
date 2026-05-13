import { describe, expect, it } from 'vitest'
import { tileStyleFor } from './tile-style'

describe('tileStyleFor', () => {
  it('maps forbidden to a hatched style', () => {
    const style = tileStyleFor('forbidden')
    expect(style.hatching).toBe(true)
    expect(style.fill).toBeTypeOf('string')
    expect(style.borderStyle).toBeUndefined()
  })

  it('maps buildable to a dotted border', () => {
    const style = tileStyleFor('buildable')
    expect(style.borderStyle).toBe('dotted')
    expect(style.border).toBeTypeOf('string')
    expect(style.hatching).toBeFalsy()
  })

  it('maps path to a solid border', () => {
    const style = tileStyleFor('path')
    expect(style.borderStyle).toBe('solid')
    expect(style.border).toBeTypeOf('string')
    expect(style.hatching).toBeFalsy()
  })

  it('returns a new style object per call (no shared mutable state)', () => {
    const a = tileStyleFor('path')
    const b = tileStyleFor('path')
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})
