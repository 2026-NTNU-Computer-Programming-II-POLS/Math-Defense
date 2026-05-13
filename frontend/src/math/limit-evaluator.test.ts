import { describe, it, expect } from 'vitest'
import { parseLimitAnswer } from './limit-evaluator'

describe('parseLimitAnswer', () => {
  it('parses positive infinity forms', () => {
    expect(parseLimitAnswer('+inf')).toEqual({ outcome: '+inf', value: Infinity })
    expect(parseLimitAnswer('inf')).toEqual({ outcome: '+inf', value: Infinity })
    expect(parseLimitAnswer('infinity')).toEqual({ outcome: '+inf', value: Infinity })
    expect(parseLimitAnswer('+infinity')).toEqual({ outcome: '+inf', value: Infinity })
    expect(parseLimitAnswer('  INF  ')).toEqual({ outcome: '+inf', value: Infinity })
    expect(parseLimitAnswer('Infinity')).toEqual({ outcome: '+inf', value: Infinity })
  })

  it('parses negative infinity forms', () => {
    expect(parseLimitAnswer('-inf')).toEqual({ outcome: '-inf', value: -Infinity })
    expect(parseLimitAnswer('-infinity')).toEqual({ outcome: '-inf', value: -Infinity })
    expect(parseLimitAnswer(' -INF ')).toEqual({ outcome: '-inf', value: -Infinity })
  })

  it('parses zero (with or without sign / decimal point)', () => {
    expect(parseLimitAnswer('0')).toEqual({ outcome: 'zero', value: 0 })
    expect(parseLimitAnswer('+0')).toEqual({ outcome: 'zero', value: 0 })
    expect(parseLimitAnswer('-0')).toEqual({ outcome: 'zero', value: 0 })
    expect(parseLimitAnswer('0.0')).toEqual({ outcome: 'zero', value: 0 })
  })

  it('parses positive integers and decimals to +c', () => {
    expect(parseLimitAnswer('3')).toEqual({ outcome: '+c', value: 3 })
    expect(parseLimitAnswer('+3')).toEqual({ outcome: '+c', value: 3 })
    expect(parseLimitAnswer('2.5')).toEqual({ outcome: '+c', value: 2.5 })
    expect(parseLimitAnswer(' 7 ')).toEqual({ outcome: '+c', value: 7 })
  })

  it('parses negative integers and decimals to -c', () => {
    expect(parseLimitAnswer('-2')).toEqual({ outcome: '-c', value: -2 })
    expect(parseLimitAnswer('-1.5')).toEqual({ outcome: '-c', value: -1.5 })
    expect(parseLimitAnswer(' -4 ')).toEqual({ outcome: '-c', value: -4 })
  })

  it('parses DNE (case-insensitive) to constant outcome', () => {
    expect(parseLimitAnswer('DNE')).toEqual({ outcome: 'constant', value: 0 })
    expect(parseLimitAnswer('dne')).toEqual({ outcome: 'constant', value: 0 })
    expect(parseLimitAnswer(' DnE ')).toEqual({ outcome: 'constant', value: 0 })
  })

  it('returns null for empty or unparseable input', () => {
    expect(parseLimitAnswer('')).toBeNull()
    expect(parseLimitAnswer('   ')).toBeNull()
    expect(parseLimitAnswer('abc')).toBeNull()
    expect(parseLimitAnswer('1+1')).toBeNull()
    expect(parseLimitAnswer('NaN')).toBeNull()
    expect(parseLimitAnswer('limit')).toBeNull()
    expect(parseLimitAnswer('--3')).toBeNull()
  })
})
