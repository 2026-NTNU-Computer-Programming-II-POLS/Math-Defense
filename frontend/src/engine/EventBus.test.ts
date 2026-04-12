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

  // ── Concurrent once() dispatch (bug 2.4) ──
  // emit() snapshots its listener set so once() unsubscribing during dispatch
  // can't cause a sibling listener to be skipped or double-fired.
  describe('concurrent once() dispatch', () => {
    it('multiple once listeners on the same event each fire exactly once', () => {
      const bus = new EventBus<TestEvents>()
      const fn1 = vi.fn()
      const fn2 = vi.fn()
      const fn3 = vi.fn()
      bus.once('count', fn1)
      bus.once('count', fn2)
      bus.once('count', fn3)

      bus.emit('count', 7)

      expect(fn1).toHaveBeenCalledTimes(1)
      expect(fn2).toHaveBeenCalledTimes(1)
      expect(fn3).toHaveBeenCalledTimes(1)
      expect(fn1).toHaveBeenCalledWith(7)

      // Second emit: all once-listeners must have unsubscribed
      bus.emit('count', 99)
      expect(fn1).toHaveBeenCalledTimes(1)
      expect(fn2).toHaveBeenCalledTimes(1)
      expect(fn3).toHaveBeenCalledTimes(1)
    })

    it('off() invoked from inside a listener does not skip later siblings', () => {
      const bus = new EventBus<TestEvents>()
      const fn2 = vi.fn()
      const fn3 = vi.fn()
      const fn1: (p: number) => void = () => {
        bus.off('count', fn2) // mutates the listener set mid-dispatch
      }
      bus.on('count', fn1)
      bus.on('count', fn2)
      bus.on('count', fn3)

      bus.emit('count', 1)
      // fn3 must still fire even though fn2 was removed during dispatch
      expect(fn3).toHaveBeenCalledTimes(1)
      // fn2 was still in the snapshot, so it fires this round
      expect(fn2).toHaveBeenCalledTimes(1)

      // On the next emit, fn2 is gone but fn3 remains
      fn2.mockClear()
      fn3.mockClear()
      bus.emit('count', 2)
      expect(fn2).not.toHaveBeenCalled()
      expect(fn3).toHaveBeenCalledTimes(1)
    })

    it('mixing on() and once() — once unsubscribes itself, on stays', () => {
      const bus = new EventBus<TestEvents>()
      const persistent = vi.fn()
      const transient = vi.fn()
      bus.on('count', persistent)
      bus.once('count', transient)

      bus.emit('count', 1)
      bus.emit('count', 2)
      bus.emit('count', 3)

      expect(persistent).toHaveBeenCalledTimes(3)
      expect(transient).toHaveBeenCalledTimes(1)
      expect(transient).toHaveBeenCalledWith(1)
    })

    it('once() can re-subscribe itself from inside its own callback', () => {
      // A cooperative pattern: the listener requeues a fresh once for the next emit.
      const bus = new EventBus<TestEvents>()
      const calls: number[] = []
      const subscribe = () => bus.once('count', (n) => {
        calls.push(n)
        if (calls.length < 3) subscribe()
      })
      subscribe()

      bus.emit('count', 1)
      bus.emit('count', 2)
      bus.emit('count', 3)
      bus.emit('count', 4) // no re-sub after #3 — should not fire

      expect(calls).toEqual([1, 2, 3])
    })
  })
})
