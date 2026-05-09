/**
 * event-registry-check.ts — enforces EVENT_HANDLER_REGISTRY accuracy.
 *
 * Walks `frontend/src/**` looking for production `eventBus.on(Events.X, ...)`
 * subscriptions and compares counts to entries in
 * `engine/event-handlers/registry.ts`. Fails on any mismatch so the registry
 * stops being mere documentation (audit F-ARCH-15).
 *
 * Test files (`*.test.ts`, `__tests__/`) are excluded — the registry only
 * tracks production wiring.
 *
 * Invocation: `npm run event-registry-check` (cwd = frontend/). Exits non-zero
 * on any drift; prints one issue per line.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SRC_ROOT = resolve(process.cwd(), 'src')
const REGISTRY_FILE = join(SRC_ROOT, 'engine', 'event-handlers', 'registry.ts')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (entry === '__tests__') continue
      walk(p, out)
    } else if (/\.(ts|vue)$/.test(entry) && !/\.test\.ts$/.test(entry)) {
      out.push(p)
    }
  }
  return out
}

/**
 * Parse the EVENT_HANDLER_REGISTRY object literal. For each top-level key,
 * count the subscriber entries (each entry has a `module:` field).
 */
function parseRegistry(): Map<string, number> {
  const text = readFileSync(REGISTRY_FILE, 'utf8')
  const start = text.indexOf('Object.freeze({')
  const end = text.lastIndexOf('})')
  if (start < 0 || end < 0) {
    throw new Error('Could not locate EVENT_HANDLER_REGISTRY in registry.ts')
  }
  const body = text.slice(start, end)
  const counts = new Map<string, number>()

  // Match top-level entries: `KEY: [ ... ],` where [...] may span lines.
  // Bracket-depth scan handles the few keys that wrap onto multiple lines.
  const keyRe = /^\s{2}([A-Z][A-Z0-9_]*):\s*\[/gm
  let m: RegExpExecArray | null
  while ((m = keyRe.exec(body)) !== null) {
    const key = m[1]
    let depth = 1
    let i = m.index + m[0].length
    let arrStart = i
    while (i < body.length && depth > 0) {
      const ch = body[i]
      if (ch === '[') depth++
      else if (ch === ']') depth--
      i++
    }
    const arr = body.slice(arrStart, i - 1)
    const entryCount = (arr.match(/\bmodule\s*:/g) ?? []).length
    counts.set(key, entryCount)
  }
  return counts
}

const SUBSCRIBE_RE = /eventBus\.on\(\s*Events\.([A-Z][A-Z0-9_]*)/g

function scanSubscriptions(): Map<string, number> {
  const counts = new Map<string, number>()
  for (const file of walk(SRC_ROOT)) {
    if (file === REGISTRY_FILE) continue
    const text = readFileSync(file, 'utf8')
    let m: RegExpExecArray | null
    SUBSCRIBE_RE.lastIndex = 0
    while ((m = SUBSCRIBE_RE.exec(text)) !== null) {
      const key = m[1]
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return counts
}

function main(): void {
  const registry = parseRegistry()
  const actual = scanSubscriptions()
  const issues: string[] = []

  // Events with code subscriptions but missing or under-counted in registry.
  for (const [key, n] of actual) {
    const r = registry.get(key)
    if (r === undefined) {
      issues.push(`registry MISSING event "${key}" — found ${n} eventBus.on(Events.${key}) call(s) in src/`)
    } else if (r !== n) {
      issues.push(`registry COUNT MISMATCH for "${key}": registry=${r}, code=${n}`)
    }
  }

  // Events listed in registry that no code subscribes to (excluding the
  // intentional broadcast-only `[]` entries — those have count 0 in both).
  for (const [key, r] of registry) {
    if (r === 0) continue
    if (!actual.has(key)) {
      issues.push(`registry STALE entry "${key}": ${r} subscriber(s) listed but no eventBus.on(Events.${key}) call found`)
    }
  }

  if (issues.length > 0) {
    console.error('EVENT_HANDLER_REGISTRY drift detected:')
    for (const issue of issues) console.error('  - ' + issue)
    console.error(`\n${issues.length} issue(s). Update src/engine/event-handlers/registry.ts.`)
    process.exit(1)
  }
  console.log(`event-registry-check: OK (${registry.size} events, ${[...actual.values()].reduce((a, b) => a + b, 0)} subscriptions)`)
}

main()
