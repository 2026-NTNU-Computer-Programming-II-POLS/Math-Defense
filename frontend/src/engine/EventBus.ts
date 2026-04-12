/**
 * EventBus — generic type-safe event bus.
 * TEvents is an event-map interface with specific keys; there is deliberately
 * no `[key: string]: unknown` index signature so a typo at the call site is a
 * compile error instead of a valid string emit.
 */

type ListenerFn<T> = (payload: T) => void

export class EventBus<TEvents> {
  private _listeners = new Map<PropertyKey, Set<ListenerFn<unknown>>>()

  on<K extends keyof TEvents>(event: K, cb: ListenerFn<TEvents[K]>): () => void {
    const key = event as PropertyKey
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set())
    }
    this._listeners.get(key)!.add(cb as ListenerFn<unknown>)
    return () => this.off(event, cb)
  }

  once<K extends keyof TEvents>(event: K, cb: ListenerFn<TEvents[K]>): () => void {
    const wrapper: ListenerFn<TEvents[K]> = (payload) => {
      this.off(event, wrapper)
      cb(payload)
    }
    return this.on(event, wrapper)
  }

  off<K extends keyof TEvents>(event: K, cb: ListenerFn<TEvents[K]>): void {
    const key = event as PropertyKey
    const set = this._listeners.get(key)
    if (set) {
      set.delete(cb as ListenerFn<unknown>)
      if (set.size === 0) this._listeners.delete(key)
    }
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const set = this._listeners.get(event as PropertyKey)
    if (!set) return
    // Snapshot before iterating so once()/off() invoked during dispatch can't skip later listeners
    const snapshot = Array.from(set)
    for (const cb of snapshot) cb(payload)
  }

  clear(): void {
    this._listeners.clear()
  }
}
