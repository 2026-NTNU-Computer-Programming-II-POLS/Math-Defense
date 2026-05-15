/** A multiset entry is a polynomial degree — generation is polynomial-only. */
export type MultisetEntry = 1 | 2 | 3

export interface MultisetDef {
  readonly entries: readonly MultisetEntry[]
}

export const STAR_MIN = 1
export const STAR_MAX = 5

function ms(entries: MultisetEntry[]): MultisetDef {
  return { entries }
}

export const DIFFICULTY_TABLE: Readonly<Record<number, readonly MultisetDef[]>> = {
  1: [
    ms([1, 1]),
    ms([1, 2]),
    ms([2, 2]),
    ms([1, 1, 1]),
    ms([1, 1, 1, 1]),
  ],
  2: [
    ms([1, 3]),
    ms([2, 3]),
    ms([3, 3]),
    ms([1, 1, 2]),
    ms([1, 2, 2]),
    ms([2, 2, 2]),
    ms([1, 1, 1, 2]),
    ms([1, 1, 2, 2]),
    ms([1, 1, 1, 1, 2]),
    ms([1, 1, 1, 1, 1]),
    ms([1, 1, 1, 1, 1, 1]),
    ms([1, 1, 1, 1, 1, 2]),
    ms([1, 1, 1, 1, 2, 2]),
  ],
  3: [
    ms([1, 1, 3]),
    ms([1, 2, 3]),
    ms([2, 2, 3]),
    ms([1, 1, 1, 3]),
    ms([1, 2, 2, 2]),
    ms([2, 2, 2, 2]),
    ms([1, 1, 1, 2, 2]),
    ms([1, 1, 2, 2, 2]),
    ms([1, 1, 1, 1, 3]),
    ms([1, 1, 1, 2, 2, 2]),
    ms([1, 1, 2, 2, 2, 2]),
    ms([2, 2, 2, 2, 2, 2]),
    ms([1, 1, 1, 1, 2, 3]),
    ms([1, 1, 1, 1, 1, 3]),
  ],
  4: [
    ms([1, 3, 3]),
    ms([2, 3, 3]),
    ms([3, 3, 3]),
    ms([1, 1, 2, 3]),
    ms([1, 1, 3, 3]),
    ms([1, 2, 2, 3]),
    ms([1, 2, 3, 3]),
    ms([2, 2, 2, 3]),
    ms([2, 2, 3, 3]),
    ms([1, 1, 1, 2, 3]),
    ms([1, 1, 1, 3, 3]),
    ms([1, 2, 2, 2, 2]),
    ms([2, 2, 2, 2, 2]),
    ms([1, 1, 1, 1, 3, 3]),
    ms([1, 1, 1, 2, 2, 3]),
    ms([1, 1, 2, 2, 2, 3]),
    ms([1, 2, 2, 2, 2, 3]),
    ms([2, 2, 2, 2, 2, 3]),
  ],
  5: [
    ms([1, 3, 3, 3]),
    ms([2, 3, 3, 3]),
    ms([3, 3, 3, 3]),
    ms([1, 1, 3, 3, 3]),
    ms([1, 2, 3, 3, 3]),
    ms([2, 2, 3, 3, 3]),
    ms([1, 1, 2, 3, 3]),
    ms([1, 2, 2, 3, 3]),
    ms([2, 2, 2, 3, 3]),
    ms([1, 3, 3, 3, 3]),
    ms([2, 3, 3, 3, 3]),
    ms([3, 3, 3, 3, 3]),
    ms([1, 1, 2, 2, 3]),
    ms([1, 2, 2, 2, 3]),
    ms([2, 2, 2, 2, 3]),
    ms([1, 1, 1, 3, 3, 3]),
    ms([1, 1, 2, 3, 3, 3]),
    ms([1, 2, 2, 3, 3, 3]),
    ms([2, 2, 2, 3, 3, 3]),
    ms([1, 1, 3, 3, 3, 3]),
    ms([1, 2, 3, 3, 3, 3]),
    ms([2, 2, 3, 3, 3, 3]),
    ms([1, 3, 3, 3, 3, 3]),
    ms([2, 3, 3, 3, 3, 3]),
    ms([3, 3, 3, 3, 3, 3]),
  ],
}

export function getMultisetsForStar(star: number): readonly MultisetDef[] {
  return DIFFICULTY_TABLE[star] ?? []
}

export function pickRandomMultiset(star: number, rng: () => number): MultisetDef {
  const pool = getMultisetsForStar(star)
  if (pool.length === 0) throw new Error(`No multisets defined for star ${star}`)
  return pool[Math.floor(rng() * pool.length)]
}
