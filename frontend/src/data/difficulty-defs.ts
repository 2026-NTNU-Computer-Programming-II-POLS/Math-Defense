export type MultisetEntry = number | 'sin' | 'cos' | 'log'

export interface MultisetDef {
  readonly entries: readonly MultisetEntry[]
  readonly groupId: string
}

export const STAR_MIN = 1
export const STAR_MAX = 5

function ms(entries: MultisetEntry[], groupId: string): MultisetDef {
  return { entries, groupId }
}

export const DIFFICULTY_TABLE: Readonly<Record<number, readonly MultisetDef[]>> = {
  1: [
    ms([1, 1], 'type-1'),
    ms([1, 2], 'type-1'),
    ms([2, 2], 'type-1'),
    ms([1, 1, 1], 'type-1'),
    ms([1, 1, 1, 1], 'type-1'),
  ],
  2: [
    ms([1, 3], 'type-1'),
    ms([2, 3], 'type-1'),
    ms([3, 3], 'type-1'),
    ms([1, 1, 2], 'type-1'),
    ms([1, 2, 2], 'type-1'),
    ms([2, 2, 2], 'type-1'),
    ms([1, 1, 1, 2], 'type-1'),
    ms([1, 1, 2, 2], 'type-1'),
    ms([1, 1, 1, 1, 2], 'type-1'),
    ms([1, 1, 1, 1, 1], 'type-1'),
    ms([1, 'log'], 'type-3'),
    ms([2, 'log'], 'type-3'),
    ms([3, 'log'], 'type-3'),
    ms([1, 'sin'], 'type-2'),
    ms([2, 'sin'], 'type-2'),
    ms([3, 'sin'], 'type-2'),
    ms([1, 'cos'], 'type-2'),
    ms([2, 'cos'], 'type-2'),
    ms([3, 'cos'], 'type-2'),
  ],
  3: [
    ms([1, 1, 3], 'type-1'),
    ms([1, 2, 3], 'type-1'),
    ms([2, 2, 3], 'type-1'),
    ms([1, 1, 1, 3], 'type-1'),
    ms([1, 2, 2, 2], 'type-1'),
    ms([2, 2, 2, 2], 'type-1'),
    ms([1, 1, 1, 2, 2], 'type-1'),
    ms([1, 1, 2, 2, 2], 'type-1'),
    ms([1, 1, 'log'], 'type-3'),
    ms([1, 2, 'log'], 'type-3'),
    ms([1, 3, 'log'], 'type-3'),
    ms([2, 2, 'log'], 'type-3'),
    ms([2, 3, 'log'], 'type-3'),
    ms([3, 3, 'log'], 'type-3'),
    ms([1, 1, 'sin'], 'type-2'),
    ms([1, 2, 'sin'], 'type-2'),
    ms([1, 3, 'sin'], 'type-2'),
    ms([2, 2, 'sin'], 'type-2'),
    ms([2, 3, 'sin'], 'type-2'),
    ms([3, 3, 'sin'], 'type-2'),
    ms([1, 1, 'cos'], 'type-2'),
    ms([1, 2, 'cos'], 'type-2'),
    ms([1, 3, 'cos'], 'type-2'),
    ms([2, 2, 'cos'], 'type-2'),
    ms([2, 3, 'cos'], 'type-2'),
    ms([3, 3, 'cos'], 'type-2'),
  ],
  4: [
    ms([1, 3, 3], 'type-1'),
    ms([2, 3, 3], 'type-1'),
    ms([3, 3, 3], 'type-1'),
    ms([1, 1, 2, 3], 'type-1'),
    ms([1, 1, 3, 3], 'type-1'),
    ms([1, 2, 2, 3], 'type-1'),
    ms([1, 2, 3, 3], 'type-1'),
    ms([2, 2, 2, 3], 'type-1'),
    ms([2, 2, 3, 3], 'type-1'),
    ms([1, 1, 1, 2, 3], 'type-1'),
    ms([1, 1, 1, 3, 3], 'type-1'),
    ms([1, 2, 2, 2, 2], 'type-1'),
    ms([2, 2, 2, 2, 2], 'type-1'),
    ms(['log', 'log'], 'type-6'),
    ms(['sin', 'sin'], 'type-5'),
    ms(['cos', 'cos'], 'type-5'),
    ms(['log', 'sin'], 'type-4'),
    ms(['log', 'cos'], 'type-4'),
    ms(['sin', 'cos'], 'type-5'),
    ms([1, 'log', 'log'], 'type-3'),
    ms([2, 'log', 'log'], 'type-3'),
    ms([3, 'log', 'log'], 'type-3'),
    ms([1, 'sin', 'sin'], 'type-2'),
    ms([2, 'sin', 'sin'], 'type-2'),
    ms([3, 'sin', 'sin'], 'type-2'),
    ms([1, 'cos', 'cos'], 'type-2'),
    ms([2, 'cos', 'cos'], 'type-2'),
    ms([3, 'cos', 'cos'], 'type-2'),
    ms([1, 'log', 'sin'], 'type-7'),
    ms([2, 'log', 'sin'], 'type-7'),
    ms([3, 'log', 'sin'], 'type-7'),
    ms([1, 'log', 'cos'], 'type-7'),
    ms([2, 'log', 'cos'], 'type-7'),
    ms([3, 'log', 'cos'], 'type-7'),
    ms([1, 'sin', 'cos'], 'type-7'),
    ms([2, 'sin', 'cos'], 'type-7'),
    ms([3, 'sin', 'cos'], 'type-7'),
  ],
  5: [
    ms([1, 3, 3, 3], 'type-1'),
    ms([2, 3, 3, 3], 'type-1'),
    ms([3, 3, 3, 3], 'type-1'),
    ms([1, 1, 3, 3, 3], 'type-1'),
    ms([1, 2, 3, 3, 3], 'type-1'),
    ms([2, 2, 3, 3, 3], 'type-1'),
    ms([1, 1, 2, 3, 3], 'type-1'),
    ms([1, 2, 2, 3, 3], 'type-1'),
    ms([2, 2, 2, 3, 3], 'type-1'),
    ms([1, 3, 3, 3, 3], 'type-1'),
    ms([2, 3, 3, 3, 3], 'type-1'),
    ms([3, 3, 3, 3, 3], 'type-1'),
    ms([1, 1, 2, 2, 3], 'type-1'),
    ms([1, 2, 2, 2, 3], 'type-1'),
    ms([2, 2, 2, 2, 3], 'type-1'),
    ms(['log', 'log', 'log'], 'type-6'),
    ms(['sin', 'sin', 'sin'], 'type-5'),
    ms(['cos', 'cos', 'cos'], 'type-5'),
    ms(['log', 'log', 'sin'], 'type-4'),
    ms(['log', 'log', 'cos'], 'type-4'),
    ms(['sin', 'sin', 'log'], 'type-4'),
    ms(['sin', 'sin', 'cos'], 'type-5'),
    ms(['cos', 'cos', 'log'], 'type-4'),
    ms(['cos', 'cos', 'sin'], 'type-5'),
    ms(['log', 'sin', 'cos'], 'type-7'),
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
