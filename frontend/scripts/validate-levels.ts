/**
 * validate-levels.ts — author-time level validation.
 *
 * Runs `validateLevelPath` over every entry in `LEVELS`. With `--visual`
 * prints an ASCII map of each level's path cells (`.`) and buildable cells
 * (`B`) so authors can eyeball the result without opening the game.
 *
 * Exit codes: 0 = all levels valid, 1 = any validation error.
 *
 * Invocation: `npm run validate-levels` (cwd = frontend/). Keep stdout terse
 * by default: one PASS/FAIL line per level, visual art opt-in.
 */
import { LEVELS } from '../src/data/level-defs'
import { validateLevelPath } from '../src/domain/path/path-validator'
import { buildLevelPath } from '../src/domain/path/path-builder'
import {
  GRID_MAX_X,
  GRID_MAX_Y,
  GRID_MIN_X,
  GRID_MIN_Y,
} from '../src/data/constants'

const VISUAL = process.argv.includes('--visual')

function renderAscii(level: typeof LEVELS[number]): string {
  const path = buildLevelPath(level)
  const pathCells = new Set<string>()
  for (const seg of path.segments) {
    if (seg.params.kind === 'vertical') {
      const gx = Math.round(seg.params.x)
      const lo = Math.min(seg.params.yStart, seg.params.yEnd)
      const hi = Math.max(seg.params.yStart, seg.params.yEnd)
      for (let gy = Math.floor(lo); gy <= Math.ceil(hi); gy++) {
        pathCells.add(`${gx},${gy}`)
      }
      continue
    }
    const [lo, hi] = seg.xRange
    const loGx = Math.max(Math.ceil(lo), GRID_MIN_X)
    const hiGx = Math.min(Math.floor(hi), GRID_MAX_X - 1)
    for (let gx = loGx; gx <= hiGx; gx++) {
      pathCells.add(`${gx},${Math.round(seg.evaluate(gx))}`)
    }
  }
  const buildable = new Set(level.buildablePositions.map(([x, y]) => `${x},${y}`))

  const lines: string[] = []
  for (let gy = GRID_MAX_Y - 1; gy >= GRID_MIN_Y; gy--) {
    let row = ''
    for (let gx = GRID_MIN_X; gx < GRID_MAX_X; gx++) {
      const key = `${gx},${gy}`
      if (pathCells.has(key)) row += '.'
      else if (buildable.has(key)) row += 'B'
      else row += ' '
    }
    lines.push(`  ${row}`)
  }
  return lines.join('\n')
}

function main(): void {
  let failed = 0
  for (const level of LEVELS) {
    const errors = validateLevelPath(level)
    if (errors.length === 0) {
      console.log(`validate-levels: PASS — Level ${level.id} (${level.nameEn}) · ${level.path.segments.length} segment(s), ${level.buildablePositions.length} buildable cell(s)`)
    } else {
      failed++
      console.error(`validate-levels: FAIL — Level ${level.id} (${level.nameEn})`)
      for (const err of errors) {
        console.error(`  • ${JSON.stringify(err)}`)
      }
    }
    if (VISUAL && errors.length === 0) {
      console.log(renderAscii(level))
    }
  }
  if (failed > 0) {
    console.error(`validate-levels: ${failed} level(s) failed validation.`)
    process.exit(1)
  }
  console.log(`validate-levels: OK — ${LEVELS.length} level(s) validated.`)
  process.exit(0)
}

main()
