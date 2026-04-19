/**
 * lint-chinese-comments.ts — enforce English-only comments.
 *
 * Walks `src/**\/*.{ts,tsx,vue}` and fails if any comment (`//`, `/* */`,
 * or `/** */`) contains a non-ASCII character. Strings, identifiers, and
 * JSX text are ignored — only comment bodies are checked. This is a
 * deliberately strict rule: if a file legitimately needs non-ASCII in a
 * comment (math symbols, legacy translation notes), opt out with a
 * file-header directive:
 *
 *   // @allow-non-ascii-comments: <reason>
 *
 * A pre-existing allowlist below carries files that predated the rule
 * (Phase 6 does not require translating every legacy comment — only those
 * in files the Piecewise Paths feature actually touched). The ratchet is
 * one-way: new rows cannot be added, only removed as files get cleaned up.
 *
 * Invocation: `npm run lint-chinese-comments` (cwd = frontend/). Exits
 * non-zero on any violation; prints one file:line per offense.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SRC_ROOT = resolve(process.cwd(), 'src')

/**
 * Files that contained non-ASCII comments before this rule landed. These
 * are the specific legacy comments we have not yet translated; the ledger
 * tracks the cleanup as a follow-up. Do not add rows.
 */
const LEGACY_ALLOWLIST: ReadonlySet<string> = new Set([
  'components/game/IntegralPanel.vue',
  'components/game/MatrixInputPanel.vue',
  'data/tower-defs.ts',
  'math/PathEvaluator.ts',
  'math/WasmBridge.ts',
  'math/WasmBridge.test.ts',
  'math/WasmBridge.wasm.test.ts',
  'systems/CombatSystem.ts',
  'composables/useSessionSync.test.ts',
  'stores/gameStore.ts',
  'views/MenuView.vue',
])

const DIRECTIVE_RE = /@allow-non-ascii-comments\s*:/

function normalize(p: string): string {
  return p.replace(/\\/g, '/')
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
 * Extract comment spans from source. Skips string and template literals so
 * non-ASCII user-facing strings (Chinese level names, etc.) never trigger.
 * Tracks only the positions of comment bytes and returns them with their
 * 1-based line number.
 */
function findNonAsciiInComments(source: string): Array<{ line: number; char: string }> {
  const hits: Array<{ line: number; char: string }> = []
  let i = 0
  const n = source.length
  let line = 1

  function advance(count: number): void {
    for (let k = 0; k < count; k++) {
      if (source[i + k] === '\n') line++
    }
    i += count
  }

  function inComment(endMarker: '\n' | '*/'): void {
    const startLine = line
    while (i < n) {
      if (endMarker === '\n') {
        const c = source[i]!
        if (c === '\n') { advance(1); return }
        const code = c.charCodeAt(0)
        if (code > 0x7f) hits.push({ line, char: c })
        advance(1)
      } else {
        if (source[i] === '*' && source[i + 1] === '/') { advance(2); return }
        const c = source[i]!
        const code = c.charCodeAt(0)
        if (code > 0x7f) hits.push({ line, char: c })
        advance(1)
      }
    }
    // Unterminated block comment — still report what we saw; record startLine for debugging.
    void startLine
  }

  function skipStringLiteral(quote: string): void {
    advance(1)
    while (i < n) {
      const c = source[i]
      if (c === '\\') { advance(2); continue }
      if (c === quote) { advance(1); return }
      if (c === '\n' && quote !== '`') return // unterminated; let main loop continue
      advance(1)
    }
  }

  while (i < n) {
    const c = source[i]!
    const next = source[i + 1]
    if (c === '/' && next === '/') { advance(2); inComment('\n'); continue }
    if (c === '/' && next === '*') { advance(2); inComment('*/'); continue }
    if (c === '"' || c === '\'' || c === '`') { skipStringLiteral(c); continue }
    advance(1)
  }
  return hits
}

interface Violation {
  file: string
  line: number
  sample: string
}

function check(): Violation[] {
  const violations: Violation[] = []
  for (const file of walk(SRC_ROOT)) {
    const content = readFileSync(file, 'utf8')
    const rel = normalize(file.slice(SRC_ROOT.length + 1))
    if (LEGACY_ALLOWLIST.has(rel)) continue
    if (DIRECTIVE_RE.test(content)) continue
    const hits = findNonAsciiInComments(content)
    if (hits.length === 0) continue
    // Group by line, report first sample per line.
    const seen = new Set<number>()
    for (const h of hits) {
      if (seen.has(h.line)) continue
      seen.add(h.line)
      violations.push({ file: rel, line: h.line, sample: h.char })
    }
  }
  return violations
}

function main(): void {
  const violations = check()
  if (violations.length === 0) {
    console.log('lint-chinese-comments: OK (no non-ASCII comments outside the legacy allowlist)')
    process.exit(0)
  }
  for (const v of violations) {
    console.error(`lint-chinese-comments: src/${v.file}:${v.line} — non-ASCII char in comment: "${v.sample}" (U+${v.sample.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')})`)
  }
  console.error(`lint-chinese-comments: ${violations.length} violation(s)`)
  process.exit(1)
}

main()
