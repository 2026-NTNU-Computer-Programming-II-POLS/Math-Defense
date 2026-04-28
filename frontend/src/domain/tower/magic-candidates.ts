import { hashStr, mulberry32 } from '@/math/RandomUtils'

export type CurveFunction = (x: number) => number

export interface MagicCandidate {
  label: string
  fn: CurveFunction
}

export function generateMagicCandidates(
  towerId: string,
  towerX: number,
  towerY: number,
): MagicCandidate[] {
  const seed = hashStr(towerId)
  const rng = mulberry32(seed)

  const a = Math.floor(rng() * 3) + 1
  const b = Math.floor(rng() * 5) - 2
  const polyFn: CurveFunction = (x) => a * (x - towerX) * (x - towerX) + b + towerY

  const amp = 1 + Math.floor(rng() * 3)
  const freq = 0.5 + rng()
  const trigFn: CurveFunction = (x) => amp * Math.sin(freq * (x - towerX)) + towerY

  const scale = 1 + Math.floor(rng() * 3)
  const logFn: CurveFunction = (x) => {
    const dx = x - towerX
    if (dx <= 0) return towerY
    return scale * Math.log(dx + 1) + towerY
  }

  return [
    { label: 'Polynomial', fn: polyFn },
    { label: 'Trigonometric', fn: trigFn },
    { label: 'Logarithmic', fn: logFn },
  ]
}
