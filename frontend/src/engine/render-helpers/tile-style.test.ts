import { describe, expect, it } from 'vitest'
import { tileStyleFor } from './tile-style'

describe('tileStyleFor', () => {
  it('maps forbidden to a hatched style', () => {
    const style = tileStyleFor('forbidden')
    expect(style.hatching).toBe(true)
    expect(style.fill).toBeTypeOf('string')
    expect(style.borderStyle).toBeUndefined()
  })

  it('maps buildable to a plain borderless fill', () => {
    const style = tileStyleFor('buildable')
    expect(style.borderStyle).toBeUndefined()
    expect(style.border).toBeUndefined()
    expect(style.hatching).toBeFalsy()
  })

  it('maps path to a hatched style (prohibited, same as forbidden)', () => {
    const style = tileStyleFor('path')
    expect(style.hatching).toBe(true)
    expect(style.border).toBeUndefined()
    expect(style.borderStyle).toBeUndefined()
  })

  it('returns a new style object per call (no shared mutable state)', () => {
    const a = tileStyleFor('path')
    const b = tileStyleFor('path')
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })
})
