import type { GeneratedLevel } from '@/math/curve-types'

// F-BUG-14: cap the byte size of any JSON payload accepted from history.state
// or sessionStorage. A tampered/oversized payload could stall JSON.parse on a
// multi-MB string before failing the shape check.
const MAX_LEVEL_JSON_BYTES = 64 * 1024
const MAX_TERRITORY_CTX_BYTES = 1024

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

export function parseLevelJson(raw: unknown): GeneratedLevel | null {
  if (typeof raw !== 'string') return null
  if (raw.length > MAX_LEVEL_JSON_BYTES) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return null }
  if (!isPlainObject(parsed)) return null
  if (!Array.isArray(parsed.curves)) return null
  if (!isPlainObject(parsed.endpoint)) return null
  if (!isPlainObject(parsed.region)) return null
  if (!Array.isArray(parsed.interval) || parsed.interval.length !== 2) return null
  if (typeof parsed.starRating !== 'number') return null
  return parsed as unknown as GeneratedLevel
}

export function parseTerritoryContext(
  raw: unknown,
): { activityId: string; slotId: string } | null {
  if (typeof raw !== 'string') return null
  if (raw.length > MAX_TERRITORY_CTX_BYTES) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return null }
  if (!isPlainObject(parsed)) return null
  if (typeof parsed.activityId !== 'string' || typeof parsed.slotId !== 'string') return null
  return { activityId: parsed.activityId, slotId: parsed.slotId }
}