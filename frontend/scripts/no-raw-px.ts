/**
 * no-raw-px.ts — Typography token enforcement.
 *
 * Walks `frontend/src/**` and fails on any `font-size: NNpx` declaration in
 * .vue / .css / .ts / .tsx files. Authored values must use the `--text-*`
 * tokens defined in `src/styles/variables.css` (see
 * docs/V3_surgicalPlan/UI_Typography_Refresh_Plan.md §4) so that browser
 * zoom scales UI text consistently across all views.
 *
 * Allowlist covers the one intentional raw-px anchor: the `html` root font
 * size in global.css, which is the pivot the rem-based tokens resolve
 * against and must stay in px.
 *
 * Invocation: `npm run no-raw-px` (cwd = frontend/). Exits non-zero on any
 * violation; prints one violation per line.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

interface Violation {
  file: string
  line: number
  text: string
}

const SRC_ROOT = resolve(process.cwd(), 'src')

const ALLOWLIST: ReadonlyArray<{
  fileSuffix: string
  match: RegExp
}> = [
  // Root html font-size — the rem pivot. Must remain in px so the
  // typography token scale (rem-based) has a stable resolution point.
  { fileSuffix: 'src/styles/global.css', match: /font-size:\s*17px/ },
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(vue|css|ts|tsx)$/.test(entry)) out.push(p)
  }
  return out
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/')
}

function isAllowlisted(file: string, lineText: string): boolean {
  const n = normalize(file)
  return ALLOWLIST.some(
    (row) => n.endsWith(row.fileSuffix) && row.match.test(lineText),
  )
}

const RAW_PX_RE = /font-size:\s*\d+(?:\.\d+)?px/

function check(): Violation[] {
  const violations: Violation[] = []
  for (const file of walk(SRC_ROOT)) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i]!
      if (!RAW_PX_RE.test(text)) continue
      if (isAllowlisted(file, text)) continue
      violations.push({ file, line: i + 1, text: text.trim() })
    }
  }
  return violations
}

function main(): void {
  const violations = check()
  if (violations.length === 0) {
    console.log('no-raw-px: OK (all font-size values use --text-* tokens)')
    process.exit(0)
  }
  for (const v of violations) {
    console.error(`no-raw-px: ${v.file}:${v.line}: ${v.text}`)
  }
  console.error(`no-raw-px: ${violations.length} violation(s) — use var(--text-*) tokens from src/styles/variables.css`)
  process.exit(1)
}

main()
