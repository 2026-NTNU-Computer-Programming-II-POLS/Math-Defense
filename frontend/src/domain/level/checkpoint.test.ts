import { describe, it, expect } from 'vitest'
import { serialize, deserialize, type Checkpoint } from './checkpoint'

describe('Checkpoint', () => {
  const sample: Checkpoint = {
    waveIndex: 4,
    gold: 250,
    hp: 14,
    costTotal: 800,
    killValue: 42,
  }

  it('round-trips serialize → deserialize', () => {
    const restored = deserialize(serialize(sample))
    expect(restored).toEqual(sample)
  })

  it('rejects malformed JSON', () => {
    expect(deserialize('not json')).toBeNull()
    expect(deserialize('{')).toBeNull()
  })

  it('rejects payloads missing required fields', () => {
    const partial = JSON.stringify({ waveIndex: 1, gold: 100, hp: 10 })
    expect(deserialize(partial)).toBeNull()
  })

  it('rejects payloads with wrong field types', () => {
    const bad = JSON.stringify({ ...sample, gold: '250' })
    expect(deserialize(bad)).toBeNull()
  })

  it('rejects out-of-range values', () => {
    expect(deserialize(JSON.stringify({ ...sample, waveIndex: 0 }))).toBeNull()
    expect(deserialize(JSON.stringify({ ...sample, hp: 0 }))).toBeNull()
    expect(deserialize(JSON.stringify({ ...sample, gold: -1 }))).toBeNull()
  })

  it('drops unknown fields on deserialize', () => {
    const withExtra = JSON.stringify({ ...sample, secret: 'x' })
    const restored = deserialize(withExtra)
    expect(restored).toEqual(sample)
    expect(restored && 'secret' in restored).toBe(false)
  })
})
