/**
 * arch-check.ts — Separation-of-Concerns boundary enforcement.
 *
 * Walks `frontend/src/**` and fails on any import that crosses a forbidden
 * layer boundary per the matrix in the Piecewise Paths construction plan §2.
 *
 * Rules (Phase 1 baseline):
 *   1. Files under `src/data/`   may only import from `src/data/` and
 *      external modules (not Vue, not Pinia, and nothing from the app's
 *      other internal layers).
 *   2. Files under `src/domain/` may not import Vue, @vue/sub-packages, or
 *      Pinia, nor anything from `src/engine/`, `src/systems/`,
 *      `src/components/`, `src/stores/`, `src/composables/`.
 *   3. Files under `src/components/` may not import from `src/domain/`.
 *
 * Invocation: `npm run arch-check` (cwd = frontend/). Exits non-zero on
 * any violation; prints one violation per line.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

type Layer = 'data' | 'domain' | 'engine' | 'presentation'

interface Violation {
  file: string
  importPath: string
  reason: string
}

const SRC_ROOT = resolve(process.cwd(), 'src')

/**
 * Pre-existing SoC violations predating Phase 1 of the Piecewise Paths
 * feature. Each entry is tracked in `docs/debt-ledger.md` with a named
 * owner and a scheduled removal date. Adding a row here requires a
 * matching ledger row — the ratchet only permits older debt to shrink,
 * never grow.
 */
const PRE_EXISTING_ALLOWLIST: ReadonlyArray<{
  fileSuffix: string
  importPath: string
}> = [
  // `domain/formatters.ts` is presentation-layer code that lives under
  // domain/ for historical reasons. Tracked in the debt ledger; the fix
  // is a small refactor that moves the module and updates three import
  // sites — but touching Vue files is outside the Phase 1 exit gate, so
  // it is deferred to the presentation-layer PR that picks up the move.
  { fileSuffix: '/src/components/game/HUD.vue', importPath: '@/domain/formatters' },
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|vue)$/.test(entry)) out.push(p)
  }
  return out
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/')
}

function fileLayer(file: string): Layer | null {
  const n = normalize(file)
  if (n.includes('/src/data/')) return 'data'
  if (n.includes('/src/domain/')) return 'domain'
  if (n.includes('/src/engine/') || n.includes('/src/systems/')) return 'engine'
  if (
    n.includes('/src/components/') ||
    n.includes('/src/stores/') ||
    n.includes('/src/composables/')
  ) return 'presentation'
  return null
}

function aliasLayer(importPath: string): Layer | 'other' | null {
  if (importPath.startsWith('@/data/'))                                          return 'data'
  if (importPath.startsWith('@/domain/'))                                        return 'domain'
  if (importPath.startsWith('@/engine/') || importPath.startsWith('@/systems/')) return 'engine'
  if (
    importPath.startsWith('@/components/') ||
    importPath.startsWith('@/stores/') ||
    importPath.startsWith('@/composables/')
  ) return 'presentation'
  if (importPath.startsWith('@/')) return 'other'
  return null
}

function resolveRelative(importPath: string, sourceFile: string): string {
  return normalize(resolve(dirname(sourceFile), importPath))
}

function targetForImport(importPath: string, sourceFile: string): {
  kind: 'layer' | 'framework' | 'external'
  layer?: Layer | 'other'
  framework?: 'vue' | 'pinia'
} {
  if (importPath === 'vue' || importPath.startsWith('@vue/')) return { kind: 'framework', framework: 'vue' }
  if (importPath === 'pinia')                                  return { kind: 'framework', framework: 'pinia' }

  const alias = aliasLayer(importPath)
  if (alias) return { kind: 'layer', layer: alias }

  if (importPath.startsWith('./') || importPath.startsWith('../')) {
    const abs = resolveRelative(importPath, sourceFile)
    const layer = fileLayer(abs)
    return { kind: 'layer', layer: layer ?? 'other' }
  }

  return { kind: 'external' }
}

const IMPORT_RE = /import\s+(?:type\s+)?(?:[^'"`;]+?from\s+)?['"]([^'"]+)['"]/g

function extractImports(content: string): string[] {
  const out: string[] = []
  for (const m of content.matchAll(IMPORT_RE)) {
    out.push(m[1]!)
  }
  return out
}

function isAllowlisted(file: string, importPath: string): boolean {
  const n = normalize(file)
  return PRE_EXISTING_ALLOWLIST.some(
    (row) => n.endsWith(row.fileSuffix) && row.importPath === importPath,
  )
}

function check(): Violation[] {
  const violations: Violation[] = []
  for (const file of walk(SRC_ROOT)) {
    const layer = fileLayer(file)
    if (!layer) continue
    const content = readFileSync(file, 'utf8')
    for (const importPath of extractImports(content)) {
      if (isAllowlisted(file, importPath)) continue
      const t = targetForImport(importPath, file)

      if (layer === 'data') {
        if (t.kind === 'framework') {
          violations.push({ file, importPath, reason: `data layer must not import ${t.framework}` })
        } else if (t.kind === 'layer' && t.layer !== 'data' && t.layer !== 'other') {
          violations.push({ file, importPath, reason: `data layer must not import ${t.layer}` })
        }
        continue
      }

      if (layer === 'domain') {
        if (t.kind === 'framework') {
          violations.push({ file, importPath, reason: `domain layer must not import ${t.framework}` })
        } else if (t.kind === 'layer' && (t.layer === 'engine' || t.layer === 'presentation')) {
          violations.push({ file, importPath, reason: `domain layer must not import ${t.layer}` })
        }
        continue
      }

      if (layer === 'presentation' && normalize(file).includes('/src/components/')) {
        if (t.kind === 'layer' && t.layer === 'domain') {
          violations.push({ file, importPath, reason: 'components/ must not import domain' })
        }
      }
    }
  }
  return violations
}

function main(): void {
  const violations = check()
  if (violations.length === 0) {
    console.log('arch-check: OK (no layer-boundary violations)')
    process.exit(0)
  }
  for (const v of violations) {
    console.error(`arch-check: ${v.file}: import "${v.importPath}" — ${v.reason}`)
  }
  console.error(`arch-check: ${violations.length} violation(s)`)
  process.exit(1)
}

main()
