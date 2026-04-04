/**
 * EventBus — 泛型型別安全事件匯流排
 * 使用 string literal union 作為事件名，payload 型別由泛型推導。
 */

export type EventMap = { [key: string]: unknown }

type ListenerFn<T> = (payload: T) => void

export class EventBus<TEvents extends EventMap> {
  private _listeners = new Map<string, Set<ListenerFn<unknown>>>()

  on<K extends keyof TEvents>(event: K, cb: ListenerFn<TEvents[K]>): () => void {
    const key = event as string
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
    const key = event as string
    const set = this._listeners.get(key)
    if (set) {
      set.delete(cb as ListenerFn<unknown>)
      if (set.size === 0) this._listeners.delete(key)
    }
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const set = this._listeners.get(event as string)
    if (set) {
      for (const cb of set) cb(payload)
    }
  }

  clear(): void {
    this._listeners.clear()
  }
}
