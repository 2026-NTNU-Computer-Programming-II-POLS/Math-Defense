/**
 * waveService — presentation-layer entry point for wave templates.
 *
 * Views must not reach into `domain/wave/` directly (arch-check rule);
 * this thin re-export gives them a service-layer surface for the same
 * data without duplicating the wave definitions.
 */
export { buildWavesForStar } from '@/domain/wave/wave-generator'
export type { WaveDef, EnemySpawnEntry } from '@/domain/wave/wave-generator'
