/**
 * Spawn calculator — Phase 3 of construction plan makes this a thin pass-through
 * to the WASM bridge. The previous JS walker lives inside WasmBridge.ts as
 * a private fallback (avoids a cycle now that this file delegates).
 *
 * For each curve, walk outward from P* in both directions and report the
 * first point where the curve leaves the playable area. Each curve produces
 * exactly two spawns (one per direction); curves that cannot produce both
 * directions only emit the side(s) that succeed and the level generator
 * rejects such layouts.
 */
import type { CurveDefinition } from '@/math/curve-types'
import { computeSpawnPointsWasm, type BridgeSpawnPoint } from '@/math/WasmBridge'

export interface SpawnPoint {
  readonly x: number
  readonly y: number
  readonly edge: 'top' | 'bottom' | 'left' | 'right'
  readonly curveIndex: number
  readonly side: 1 | -1
}

export function computeSpawnPoints(
  curves: readonly CurveDefinition[],
  endpoint: { readonly x: number; readonly y: number },
): SpawnPoint[] {
  return computeSpawnPointsWasm(curves, endpoint) as BridgeSpawnPoint[] as SpawnPoint[]
}
