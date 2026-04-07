import { describe, it, expect, vi } from 'vitest'
import { EventBus } from './EventBus'

interface TestEvents {
  [key: string]: unknown
  ping: string
  count: number
  empty: void
}

describe('EventBus', () => {
  it('calls listeners when event is emitted', () => {
    const bus = new EventBus<TestEvents>()
    const fn = vi.fn()
    bus.on('ping', fn)
    bus.emit('ping', 'hello')
    expect(fn).toHaveBeenCalledWith('hello')
  })

  it('supports multiple listeners for the same event', () => {
    const bus = new EventBus<TestEvents>()
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    bus.on('count', fn1)
    bus.on('count', fn2)
    bus.emit('count', 42)
    expect(fn1).toHaveBeenCalledWith(42)
    expect(fn2).toHaveBeenCalledWith(42)
  })

  it('on() returns an unsubscribe function', () => {
    const bus = new EventBus<TestEvents>()
    const fn = vi.fn()
    const unsub = bus.on('ping', fn)
    unsub()
    bus.emit('ping', 'hello')
    expect(fn).not.toHaveBeenCalled()
  })

  it('off() removes a specific listener', () => {
    const bus = new EventBus<TestEvents>()
    const fn = vi.fn()
    bus.on('ping', fn)
    bus.off('ping', fn)
    bus.emit('ping', 'hello')
    expect(fn).not.toHaveBeenCalled()
  })

  it('once() fires only once', () => {
    const bus = new EventBus<TestEvents>()
    const fn = vi.fn()
    bus.once('count', fn)
    bus.emit('count', 1)
    bus.emit('count', 2)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(1)
  })

  it('clear() removes all listeners', () => {
    const bus = new EventBus<TestEvents>()
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    bus.on('ping', fn1)
    bus.on('count', fn2)
    bus.clear()
    bus.emit('ping', 'x')
    bus.emit('count', 0)
    expect(fn1).not.toHaveBeenCalled()
    expect(fn2).not.toHaveBeenCalled()
  })

  it('emitting an event with no listeners does not throw', () => {
    const bus = new EventBus<TestEvents>()
    expect(() => bus.emit('ping', 'test')).not.toThrow()
  })
})
