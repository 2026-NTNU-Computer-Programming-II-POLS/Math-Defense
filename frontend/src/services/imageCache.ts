/**
 * imageCache — dataURL → HTMLImageElement loader with a Map cache.
 *
 * Used by useGameLoop to materialise the player's custom endpoint-marker
 * image (uploaded in ProfileView, stored as a data URL in uiStore) into an
 * Image that the canvas renderer can draw with `ctx.drawImage`.
 *
 * Stateless beyond the cache: callers ask for the same dataURL twice and
 * get the same Image instance. A dataURL the cache has not yet resolved
 * returns `null` from `getCached`; consumers should kick `loadImage` and
 * fall back to a placeholder until the promise resolves.
 */

const cache = new Map<string, HTMLImageElement>()
const pending = new Map<string, Promise<HTMLImageElement>>()

export function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const hit = cache.get(dataUrl)
  if (hit) return Promise.resolve(hit)
  const inFlight = pending.get(dataUrl)
  if (inFlight) return inFlight

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      cache.set(dataUrl, img)
      pending.delete(dataUrl)
      resolve(img)
    }
    img.onerror = () => {
      pending.delete(dataUrl)
      reject(new Error('Failed to decode endpoint marker image'))
    }
    img.src = dataUrl
  })
  pending.set(dataUrl, promise)
  return promise
}

export function getCached(dataUrl: string): HTMLImageElement | null {
  return cache.get(dataUrl) ?? null
}

export function clearCache(): void {
  cache.clear()
  pending.clear()
}
