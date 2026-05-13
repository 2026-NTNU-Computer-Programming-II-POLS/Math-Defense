/**
 * lint-determinism.ts — guard the replay-v2 determinism contract.
 *
 * Construction plan §5 (Phase 5): forbid `Math.<transcendental>` calls in
 * directories whose output drives `replay_version=2` reproduction. Every such
 * call would re-introduce cross-engine ULP drift the WASM port deliberately
 * eliminated.
 *
 * Banned identifiers:
 *   sin, cos, tan, asin, acos, atan, atan2, log, log2, log10, exp, pow
 *
 * (Math.sqrt, Math.abs, Math.min/max/round/floor/ceil, Math.PI etc are
 * IEEE-754 exact or pure integer / constant — cross-engine deterministic.)
 *
 * Scope (construction plan §5 + FU-A extension):
 *   - src/domain/level/**
 *   - src/domain/scoring/**     (FU-A: server-side wasmtime-py recomputes the
 *                                score, so frontend must agree bit-exactly)
 *   - src/math/curve-evaluator.ts
 *   - src/engine/Game.ts
 *   - src/systems/**            (new code only; legacy callers opt-out per line)
 *
 * Test files (`*.test.ts`, `*.wasm.test.ts`, `__tests__/`) are out-of-scope:
 * tests legitimately compare WASM output against ground-truth Math.* values.
 *
 * Per-line opt-out (use sparingly, with an issue ref):
 *
 *   const a = Math.atan2(dy, dx) // allow-non-deterministic-math: visual-only, not in replay path (#345)
 *
 * The directive may appear on the same line OR on the line directly above
 * the call. Keep the reason concise; CODEOWNERS will read it on review.
 *
 * Invocation: `npm run lint-determinism` (cwd = frontend/). Wired into
 * `npm run ci` so a regression fails the build.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SRC_ROOT = resolve(process.cwd(), 'src')

const BANNED = [
  'sin', 'cos', 'tan',
  'asin', 'acos', 'atan', 'atan2',
  'log', 'log2', 'log10',
  'exp', 'pow',
] as const

const BANNED_RE = new RegExp(`Math\\.(?:${BANNED.join('|')})\\s*\\(`, 'g')

const PER_LINE_DIRECTIVE = /\/\/\s*allow-non-deterministic-math\b/
const FILE_LEVEL_DIRECTIVE = /\/\*\*?\s*@allow-non-deterministic-math\b|\/\/\s*@allow-non-deterministic-math\b/

function normalize(p: string): string {
  return p.replace(/\\/g, '/')
}

/**
 * True iff the file is part of the determinism contract scope.
 */
function isInScope(absPath: string): boolean {
  const n = normalize(absPath)
  if (/\/__tests__\//.test(n)) return false
  if (/\.test\.ts$/.test(n)) return false
  if (/\.wasm\.test\.ts$/.test(n)) return false

  if (/\/src\/domain\/level\//.test(n)) return true
  if (/\/src\/domain\/scoring\//.test(n)) return true
  if (/\/src\/math\/curve-evaluator\.ts$/.test(n)) return true
  if (/\/src\/engine\/Game\.ts$/.test(n)) return true
  if (/\/src\/systems\//.test(n)) return true
  return false
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|vue)$/.test(entry)) out.push(p)
  }
  return out
}

/**
 * Strip line comments, block comments, and string/template literals so a
 * legitimate mention inside a comment ("we used to call Math.sin here") or
 * a string literal does not register as a violation. Replaces the stripped
 * content with spaces so 1-based line numbers remain stable.
 */
function stripCommentsAndStrings(source: string): string {
  let out = ''
  let i = 0
  const n = source.length
  while (i < n) {
    const c = source[i]
    const next = source[i + 1]
    if (c === '/' && next === '/') {
      while (i < n && source[i] !== '\n') { out += ' '; i++ }
      continue
    }
    if (c === '/' && next === '*') {
      out += '  '; i += 2
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        out += source[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < n) { out += '  '; i += 2 }
      continue
    }
    if (c === '"' || c === '\'' || c === '`') {
      const quote = c
      out += ' '; i++
      while (i < n && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < n) {
          out += source[i + 1] === '\n' ? '\n ' : '  '
          i += 2
          continue
        }
        out += source[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < n) { out += ' '; i++ }
      continue
    }
    out += c
    i++
  }
  return out
}

function lineOf(source: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) {
    if (source[i] === '\n') line++
  }
  return line
}

interface Violation {
  file: string
  line: number
  call: string
}

function check(): Violation[] {
  const violations: Violation[] = []
  for (const file of walk(SRC_ROOT)) {
    if (!isInScope(file)) continue

    const source = readFileSync(file, 'utf8')

    // File-level escape hatch (rare; prefer per-line so reviewers see the why).
    const head = source.slice(0, 400)
    if (FILE_LEVEL_DIRECTIVE.test(head)) continue

    const stripped = stripCommentsAndStrings(source)
    BANNED_RE.lastIndex = 0
    const lines = source.split('\n')
    const rel = normalize(file.slice(SRC_ROOT.length + 1))

    let match: RegExpExecArray | null
    while ((match = BANNED_RE.exec(stripped))) {
      const lineNum = lineOf(stripped, match.index)
      const thisLine = lines[lineNum - 1] ?? ''
      const prevLine = lines[lineNum - 2] ?? ''
      // Per-line directive may sit on the call line OR the line above.
      if (PER_LINE_DIRECTIVE.test(thisLine)) continue
      if (PER_LINE_DIRECTIVE.test(prevLine)) continue
      violations.push({ file: rel, line: lineNum, call: match[0].replace(/\s*\($/, '') })
    }
  }
  return violations
}

function main(): void {
  const violations = check()
  if (violations.length === 0) {
    console.log('lint-determinism: OK (no banned Math.* calls in replay-v2 scope)')
    process.exit(0)
  }
  for (const v of violations) {
    console.error(
      `lint-determinism: src/${v.file}:${v.line} - banned ${v.call} in replay-v2 scope. `
        + 'Route through WasmBridge, or add a per-line `// allow-non-deterministic-math: <reason>`.',
    )
  }
  console.error(`lint-determinism: ${violations.length} violation(s)`)
  process.exit(1)
}

main()
