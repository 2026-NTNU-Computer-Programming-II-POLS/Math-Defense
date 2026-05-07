/**
 * Wave checkpoint for Star-5 retry (Pedagogical Backlog §12).
 *
 * Captured at WAVE_END for the wave that just cleared. On a checkpoint
 * retry we apply these values to a fresh session (timeTotal/score start
 * over) so the score formula's anti-cheat invariants stay intact.
 *
 * `waveIndex` is the wave the player will resume at — i.e. the wave they
 * died in / were about to play, equal to `clearedWave + 1`.
 */
export interface Checkpoint {
  readonly waveIndex: number
  readonly gold: number
  readonly hp: number
  readonly costTotal: number
  readonly killValue: number
}

export function serialize(checkpoint: Checkpoint): string {
  return JSON.stringify(checkpoint)
}

export function deserialize(raw: string): Checkpoint | null {
  let obj: unknown
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof obj !== 'object' || obj === null) return null
  const o = obj as Record<string, unknown>
  if (
    typeof o.waveIndex !== 'number' || !Number.isFinite(o.waveIndex) || o.waveIndex < 1 ||
    typeof o.gold !== 'number' || !Number.isFinite(o.gold) || o.gold < 0 ||
    typeof o.hp !== 'number' || !Number.isFinite(o.hp) || o.hp <= 0 ||
    typeof o.costTotal !== 'number' || !Number.isFinite(o.costTotal) || o.costTotal < 0 ||
    typeof o.killValue !== 'number' || !Number.isFinite(o.killValue) || o.killValue < 0
  ) {
    return null
  }
  return {
    waveIndex: o.waveIndex,
    gold: o.gold,
    hp: o.hp,
    costTotal: o.costTotal,
    killValue: o.killValue,
  }
}
