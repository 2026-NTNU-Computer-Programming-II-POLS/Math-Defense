import type { CurveDefinition } from '@/math/curve-types'
import { evaluate, isInDomain } from '@/math/curve-evaluator'
import { findPairIntersections } from '@/math/intersection-solver'

export interface AnswerOption {
  readonly x: number
  readonly y: number
  readonly isCorrect: boolean
}

const ENDPOINT_SKIP_RADIUS = 0.5
const RANDOM_POINT_SKIP_RADIUS = 1.0
const DEDUP_RADIUS = 0.3

export function generateDistractors(
  curves: readonly CurveDefinition[],
  endpoint: { x: number; y: number },
  interval: readonly [number, number],
  rng: () => number,
  count = 3,
): AnswerOption[] {
  const options: AnswerOption[] = [
    { x: endpoint.x, y: endpoint.y, isCorrect: true },
  ]

  const candidates: { x: number; y: number }[] = []

  for (let i = 0; i < curves.length && candidates.length < count * 2; i++) {
    for (let j = i + 1; j < curves.length && candidates.length < count * 2; j++) {
      const ixs = findPairIntersections(curves[i], curves[j], interval[0], interval[1])
      for (const ix of ixs) {
        if (Math.abs(ix - endpoint.x) < ENDPOINT_SKIP_RADIUS) continue
        if (!isInDomain(curves[i], ix)) continue
        const y = evaluate(curves[i], ix)
        if (isFinite(y)) candidates.push({ x: ix, y })
      }
    }
  }

  const offsets = [
    { dx: 0.5 + rng() * 1.5, dy: 0.3 + rng() * 1.0 },
    { dx: -(0.5 + rng() * 1.5), dy: 0.3 + rng() * 1.0 },
    { dx: 0.3 + rng() * 1.0, dy: -(0.5 + rng() * 1.5) },
    { dx: -(0.3 + rng() * 1.0), dy: -(0.5 + rng() * 1.5) },
  ]
  for (const off of offsets) {
    candidates.push({ x: endpoint.x + off.dx, y: endpoint.y + off.dy })
  }

  for (let ci = 0; ci < curves.length && candidates.length < count * 3; ci++) {
    const rx = interval[0] + rng() * (interval[1] - interval[0])
    if (Math.abs(rx - endpoint.x) < RANDOM_POINT_SKIP_RADIUS) continue
    if (!isInDomain(curves[ci], rx)) continue
    const ry = evaluate(curves[ci], rx)
    if (isFinite(ry)) candidates.push({ x: rx, y: ry })
  }

  shuffle(candidates, rng)

  for (const c of candidates) {
    if (options.length > count) break
    const tooClose = options.some(
      (o) => Math.abs(o.x - c.x) < DEDUP_RADIUS && Math.abs(o.y - c.y) < DEDUP_RADIUS,
    )
    if (!tooClose) {
      options.push({
        x: Math.round(c.x * 100) / 100,
        y: Math.round(c.y * 100) / 100,
        isCorrect: false,
      })
    }
  }

  shuffle(options, rng)
  return options
}

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}
