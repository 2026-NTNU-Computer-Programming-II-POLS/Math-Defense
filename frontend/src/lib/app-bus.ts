/**
 * App-level event bus for cross-store / cross-module signals that are NOT
 * part of the game engine (which has its own engine/EventBus.ts).
 *
 * Used for things like `auth:logout`, where authStore needs to broadcast a
 * teardown signal without dynamic-importing every store that holds
 * user-scoped state. Each interested store subscribes on init.
 */

export type AppBusEvents = {
  /**
   * Emitted by authStore.logout() AFTER local auth state is cleared.
   * Subscribers should clear their per-user state. Payload is the user id
   * that was just signed out (null if it could not be captured), useful for
   * scrubbing per-user storage keys.
   */
  'auth:logout': { previousUserId: string | null }
}

type Listener<E extends keyof AppBusEvents> = (payload: AppBusEvents[E]) => void

const listeners: { [E in keyof AppBusEvents]?: Set<Listener<E>> } = {}

function getSet<E extends keyof AppBusEvents>(event: E): Set<Listener<E>> {
  let set = listeners[event] as Set<Listener<E>> | undefined
  if (!set) {
    set = new Set()
    listeners[event] = set as never
  }
  return set
}

export const appBus = {
  on<E extends keyof AppBusEvents>(event: E, fn: Listener<E>): () => void {
    const set = getSet(event)
    set.add(fn)
    return () => { set.delete(fn) }
  },

  emit<E extends keyof AppBusEvents>(event: E, payload: AppBusEvents[E]): void {
    const set = listeners[event] as Set<Listener<E>> | undefined
    if (!set) return
    for (const fn of set) {
      try { fn(payload) } catch (err) { console.error(`[appBus:${String(event)}] listener threw`, err) }
    }
  },

  /** Test helper — drop every listener. Production code never calls this. */
  _resetForTests(): void {
    for (const key of Object.keys(listeners)) {
      delete (listeners as Record<string, unknown>)[key]
    }
  },
}
