/**
 * level-defs.ts — level configuration (pure data, no closures).
 *
 * Each level declares its piecewise path as a `PathLayout` (one or more
 * `PathSegmentDef`s in ascending x order) plus a preset list of buildable
 * grid cells. The math that turns these shapes into runtime closures lives
 * in `domain/path/segment-factories.ts`; this file stays data-only per the
 * SoC matrix in §2 of the Piecewise Paths construction plan.
 *
 * Boundary convention: adjacent segments share an exact x; `findSegmentAt`
 * resolves the shared value to the right-hand (higher-x) segment at
 * runtime. Segments here are authored to be C^0-continuous at every
 * interior boundary so enemies do not teleport in y when they cross.
 *
 * Wave enemies stay pure `{ type, count }` data; `WaveSystem` + `EnemyFactory`
 * handle instantiation. `EnemySpawnEntry.overrides` was deleted at the end
 * of Phase 6 after `scripts/audit-overrides.ts` confirmed no level used it.
 */
import { TowerType, EnemyType } from './constants'
import type { PathLayout } from './path-segment-types'

export interface EnemySpawnEntry {
  readonly type: EnemyType
}

export interface WaveDef {
  readonly spawnInterval: number
  readonly enemies: ReadonlyArray<EnemySpawnEntry>
}

export interface LevelDef {
  readonly id: number
  readonly name: string
  readonly nameEn: string
  readonly description: string
  readonly availableTowers: ReadonlyArray<TowerType>
  readonly path: PathLayout
  readonly buildablePositions: ReadonlyArray<readonly [number, number]>
  readonly waves: ReadonlyArray<WaveDef>
}

// Shorthand helper for repeated single-type spawns.
function s(type: EnemyType, n = 1): EnemySpawnEntry[] {
  return Array.from({ length: n }, () => ({ type }))
}

export const LEVELS: ReadonlyArray<LevelDef> = [
  // ── Level 1: Grassland ──
  // Gentle teaching level: a horizontal entry, a symmetric parabolic dip,
  // and a horizontal exit. Three segments, C^0-continuous at both interior
  // boundaries (x=6 and x=14, both at y=6).
  {
    id: 1, name: '草原', nameEn: 'Grassland',
    description: '教學關，引導 y = mx + b',
    availableTowers: [TowerType.FUNCTION_CANNON, TowerType.PROBABILITY_SHRINE],
    path: {
      segments: [
        {
          id: 'L1-S1', xRange: [-3, 6], kind: 'horizontal',
          params: { kind: 'horizontal', y: 6 },
          label: 'Entry corridor', expr: 'y = 6',
        },
        {
          id: 'L1-S2', xRange: [6, 14], kind: 'quadratic',
          // 0.25(x-10)^2 + 2 = 0.25 x^2 - 5 x + 27; endpoints y(6)=y(14)=6, vertex y(10)=2.
          params: { kind: 'quadratic', a: 0.25, b: -5, c: 27 },
          label: 'Descending dip', expr: 'y = 0.25x^2 - 5x + 27',
        },
        {
          id: 'L1-S3', xRange: [14, 25], kind: 'horizontal',
          params: { kind: 'horizontal', y: 6 },
          label: 'Exit corridor', expr: 'y = 6',
        },
      ],
    },
    buildablePositions: [
      // Row y=8 (above the y=6 corridor) — primary tower shelf.
      [0, 8], [2, 8], [4, 8], [6, 8], [8, 8], [10, 8],
      [12, 8], [14, 8], [16, 8], [18, 8], [20, 8], [22, 8],
      // Row y=10 — long-range overwatch.
      [5, 10], [10, 10], [15, 10], [20, 10],
      // Row y=3 — below the corridor, flanks the dip entry/exit.
      [-1, 3], [3, 3], [16, 3], [20, 3],
    ],
    waves: [
      { spawnInterval: 1.5, enemies: s(EnemyType.BASIC_SLIME, 4) },
      { spawnInterval: 1.2, enemies: s(EnemyType.BASIC_SLIME, 6) },
      { spawnInterval: 1.0, enemies: s(EnemyType.BASIC_SLIME, 8) },
    ],
  },

  // ── Level 2: Canyon ──
  // A climbing ramp, a sinusoidal traverse (hills then valleys), and a
  // descending ramp. Three segments; trig covers the middle so the player
  // sees a live sinusoid without a composite path.
  {
    id: 2, name: '峽谷', nameEn: 'Canyon',
    description: '三角函數覆蓋 + 拋物線路徑',
    availableTowers: [TowerType.FUNCTION_CANNON, TowerType.RADAR_SWEEP, TowerType.PROBABILITY_SHRINE],
    path: {
      segments: [
        {
          id: 'L2-S1', xRange: [-3, 5], kind: 'linear',
          // y = 0.5 x + 7.5; y(-3)=6, y(5)=10.
          params: { kind: 'linear', slope: 0.5, intercept: 7.5 },
          label: 'Ascending ramp', expr: 'y = 0.5x + 7.5',
        },
        {
          id: 'L2-S2', xRange: [5, 15], kind: 'trigonometric',
          // 3 sin(pi/5 * x - pi) + 10 — zero crossings at x=5,10,15; amplitude 3.
          params: { kind: 'trigonometric', amplitude: 3, frequency: Math.PI / 5, phase: -Math.PI, offset: 10 },
          label: 'Sinusoidal traverse', expr: 'y = 3 sin(pi/5 x - pi) + 10',
        },
        {
          id: 'L2-S3', xRange: [15, 25], kind: 'linear',
          // y = -0.5 x + 17.5; y(15)=10, y(25)=5.
          params: { kind: 'linear', slope: -0.5, intercept: 17.5 },
          label: 'Descending ramp', expr: 'y = -0.5x + 17.5',
        },
      ],
    },
    buildablePositions: [
      // Row y=3 — below the entire path; the trig segment oscillates down to
      // y=7, so y=3 is safely off-path across the whole x-range.
      [-2, 3], [0, 3], [2, 3], [4, 3], [6, 3], [8, 3], [10, 3],
      [12, 3], [14, 3], [16, 3], [18, 3], [20, 3], [22, 3], [24, 3],
      // Row y=5 — flanks the descending ramp finish and the ascending entry.
      [0, 5], [4, 5], [8, 5], [12, 5], [16, 5], [20, 5],
    ],
    waves: [
      { spawnInterval: 1.2, enemies: [...s(EnemyType.BASIC_SLIME, 3), ...s(EnemyType.FAST_SLIME, 2)] },
      { spawnInterval: 1.0, enemies: [...s(EnemyType.BASIC_SLIME, 3), ...s(EnemyType.FAST_SLIME, 3)] },
      { spawnInterval: 0.9, enemies: [...s(EnemyType.FAST_SLIME, 4), ...s(EnemyType.BASIC_SLIME, 4)] },
      { spawnInterval: 0.8, enemies: [...s(EnemyType.FAST_SLIME, 6), ...s(EnemyType.BASIC_SLIME, 4)] },
    ],
  },

  // ── Level 3: Fortress ──
  // Four segments: flat, climb, dip, plateau. Two choke points around the
  // quadratic's vertex at (14, 2). Mid-level buildable density.
  {
    id: 3, name: '堡壘', nameEn: 'Fortress',
    description: '矩陣連結 + 積分砲登場',
    availableTowers: [
      TowerType.FUNCTION_CANNON, TowerType.RADAR_SWEEP,
      TowerType.MATRIX_LINK, TowerType.PROBABILITY_SHRINE, TowerType.INTEGRAL_CANNON,
    ],
    path: {
      segments: [
        {
          id: 'L3-S1', xRange: [-3, 4], kind: 'horizontal',
          params: { kind: 'horizontal', y: 4 },
          label: 'Low entry', expr: 'y = 4',
        },
        {
          id: 'L3-S2', xRange: [4, 10], kind: 'linear',
          // y = x; y(4)=4, y(10)=10.
          params: { kind: 'linear', slope: 1, intercept: 0 },
          label: 'Rising ramp', expr: 'y = x',
        },
        {
          id: 'L3-S3', xRange: [10, 18], kind: 'quadratic',
          // 0.5(x-14)^2 + 2 = 0.5 x^2 - 14 x + 100; y(10)=y(18)=10, vertex y(14)=2.
          params: { kind: 'quadratic', a: 0.5, b: -14, c: 100 },
          label: 'Deep dip', expr: 'y = 0.5x^2 - 14x + 100',
        },
        {
          id: 'L3-S4', xRange: [18, 25], kind: 'horizontal',
          params: { kind: 'horizontal', y: 10 },
          label: 'High plateau', expr: 'y = 10',
        },
      ],
    },
    buildablePositions: [
      // Row y=12 — overlooking the high plateau and the dip's side walls.
      [0, 12], [5, 12], [9, 12], [11, 12], [15, 12], [17, 12], [19, 12], [22, 12],
      // Around the quadratic's dip (vertex at x=14, y=2).
      [13, 5], [14, 6], [15, 5],
      // Flanking the low entry.
      [0, 8], [3, 2], [5, 2],
    ],
    waves: [
      { spawnInterval: 1.0, enemies: [...s(EnemyType.BASIC_SLIME, 3), ...s(EnemyType.TANK_SLIME, 1), ...s(EnemyType.FAST_SLIME, 2)] },
      { spawnInterval: 0.9, enemies: [...s(EnemyType.TANK_SLIME, 1), ...s(EnemyType.SPLIT_SLIME, 2), ...s(EnemyType.FAST_SLIME, 3)] },
      { spawnInterval: 0.8, enemies: [...s(EnemyType.TANK_SLIME, 2), ...s(EnemyType.SPLIT_SLIME, 2), ...s(EnemyType.FAST_SLIME, 4)] },
      { spawnInterval: 0.7, enemies: [...s(EnemyType.SPLIT_SLIME, 3), ...s(EnemyType.TANK_SLIME, 2), ...s(EnemyType.FAST_SLIME, 5)] },
      { spawnInterval: 0.6, enemies: [...s(EnemyType.TANK_SLIME, 3), ...s(EnemyType.SPLIT_SLIME, 3), ...s(EnemyType.FAST_SLIME, 4)] },
    ],
  },

  // ── Level 4: Dragon Lair ──
  // Three segments: long flat, deep parabolic dip, long flat. Boss level,
  // so buildable density is the narrowest band (~10 cells).
  {
    id: 4, name: '魔王巢', nameEn: 'Dragon Lair',
    description: 'Boss 龍 + 傅立葉護盾破解',
    availableTowers: [
      TowerType.FUNCTION_CANNON, TowerType.RADAR_SWEEP,
      TowerType.MATRIX_LINK, TowerType.PROBABILITY_SHRINE,
      TowerType.INTEGRAL_CANNON, TowerType.FOURIER_SHIELD,
    ],
    path: {
      segments: [
        {
          id: 'L4-S1', xRange: [-3, 8], kind: 'horizontal',
          params: { kind: 'horizontal', y: 8 },
          label: 'Approach corridor', expr: 'y = 8',
        },
        {
          id: 'L4-S2', xRange: [8, 16], kind: 'quadratic',
          // 0.375(x-12)^2 + 2 = 0.375 x^2 - 9 x + 56; endpoints y(8)=y(16)=8, vertex y(12)=2.
          params: { kind: 'quadratic', a: 0.375, b: -9, c: 56 },
          label: 'Lair descent', expr: 'y = 0.375x^2 - 9x + 56',
        },
        {
          id: 'L4-S3', xRange: [16, 25], kind: 'horizontal',
          params: { kind: 'horizontal', y: 8 },
          label: 'Throne approach', expr: 'y = 8',
        },
      ],
    },
    buildablePositions: [
      [2, 10], [6, 10], [10, 10], [14, 10], [18, 10], [22, 10],
      [0, 5], [4, 5], [20, 5], [24, 5],
    ],
    waves: [
      { spawnInterval: 0.8, enemies: [...s(EnemyType.STEALTH_SLIME, 3), ...s(EnemyType.FAST_SLIME, 4)] },
      { spawnInterval: 0.7, enemies: [...s(EnemyType.STEALTH_SLIME, 3), ...s(EnemyType.TANK_SLIME, 2), ...s(EnemyType.SPLIT_SLIME, 3)] },
      { spawnInterval: 0.6, enemies: [...s(EnemyType.STEALTH_SLIME, 4), ...s(EnemyType.FAST_SLIME, 6), ...s(EnemyType.TANK_SLIME, 2)] },
      { spawnInterval: 0.5, enemies: [...s(EnemyType.SPLIT_SLIME, 4), ...s(EnemyType.STEALTH_SLIME, 4), ...s(EnemyType.TANK_SLIME, 3)] },
      { spawnInterval: 2.0, enemies: s(EnemyType.BOSS_DRAGON, 1) },
    ],
  },
]
