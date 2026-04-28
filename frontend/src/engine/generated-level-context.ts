import { Events } from '@/data/constants'
import { buildCurvePath } from '@/domain/path/path-builder'
import {
  createPathProgressTracker,
  type PathProgressTracker,
} from '@/domain/path/path-progress-tracker'
import {
  createLevelLayoutService,
  type LevelLayoutService,
} from '@/domain/level/level-layout-service'
import { generateDecoyCells } from '@/domain/level/decoy-generator'
import type { SegmentedPath } from '@/domain/path/segmented-path'
import { computeSpawnPoints, type SpawnPoint } from '@/domain/path/spawn-calculator'
import type { GeneratedLevel, DisclosureRegion } from '@/math/curve-types'
import type { LevelContextEmitter } from './level-context'

export type { LevelContextEmitter }

/**
 * Per-spawn descriptor: pairs each boundary-spawn with the SegmentedPath that
 * carries that curve. WaveSystem pulls from this list (round-robin over the
 * 2 × N spawns) so every curve / direction sees fair traffic.
 */
export interface SpawnDescriptor {
  readonly spawn: SpawnPoint
  readonly path: SegmentedPath
  /** Endpoint x — passed as `targetX` to createEnemy; enemy direction follows. */
  readonly targetX: number
}

export interface GeneratedLevelContext {
  readonly isGenerated: true
  readonly paths: ReadonlyArray<SegmentedPath>
  readonly path: SegmentedPath
  readonly layout: LevelLayoutService
  readonly tracker: PathProgressTracker
  readonly endpoint: { readonly x: number; readonly y: number }
  readonly region: DisclosureRegion
  readonly spawns: ReadonlyArray<SpawnDescriptor>
  readonly decoyCells: ReadonlyArray<readonly [number, number]>
  dispose(): void
}

export function isGeneratedLevelContext(ctx: unknown): ctx is GeneratedLevelContext {
  return typeof ctx === 'object' && ctx !== null && (ctx as GeneratedLevelContext).isGenerated === true
}

export function createGeneratedLevelContext(
  level: GeneratedLevel,
  eventBus: LevelContextEmitter,
): GeneratedLevelContext {
  const spawns = computeSpawnPoints(level.curves, level.endpoint)
  const paths = buildPathsForCurves(level, spawns)
  const spawnDescriptors = pairSpawnsWithPaths(spawns, paths, level.endpoint.x)

  const decoyCells = generateDecoyCells({ paths, region: level.region })
  const layout = createLevelLayoutService(
    { buildablePositions: [], decoyCells },
    paths,
  )

  const primaryPath = paths[0]!
  const tracker = createPathProgressTracker(primaryPath, (payload) => {
    eventBus.emit(Events.SEGMENT_CHANGED, payload)
  })

  let disposed = false
  function dispose(): void {
    if (disposed) return
    disposed = true
    tracker.dispose()
  }

  return {
    isGenerated: true,
    paths,
    path: primaryPath,
    layout,
    tracker,
    endpoint: level.endpoint,
    region: level.region,
    spawns: spawnDescriptors,
    decoyCells,
    dispose,
  }
}

/**
 * One SegmentedPath per curve, spanning [leftSpawn.x, rightSpawn.x] so every
 * enemy on this curve — regardless of which side it spawned on — finds its
 * x in `findSegmentAt`. Falls back to `level.interval` for rare cases where
 * a side did not produce a spawn (the level generator should have rejected
 * those layouts upstream).
 */
function buildPathsForCurves(
  level: GeneratedLevel,
  spawns: ReadonlyArray<SpawnPoint>,
): ReadonlyArray<SegmentedPath> {
  return level.curves.map((curve, i) => {
    const leftX = spawns.find((s) => s.curveIndex === i && s.side < 0)?.x ?? level.interval[0]
    const rightX = spawns.find((s) => s.curveIndex === i && s.side > 0)?.x ?? level.interval[1]
    return buildCurvePath(curve, [leftX, rightX], `curve-${i}`, `Curve ${i + 1}`)
  })
}

function pairSpawnsWithPaths(
  spawns: ReadonlyArray<SpawnPoint>,
  paths: ReadonlyArray<SegmentedPath>,
  endpointX: number,
): ReadonlyArray<SpawnDescriptor> {
  return spawns.map((s) => ({
    spawn: s,
    path: paths[s.curveIndex]!,
    targetX: endpointX,
  }))
}
