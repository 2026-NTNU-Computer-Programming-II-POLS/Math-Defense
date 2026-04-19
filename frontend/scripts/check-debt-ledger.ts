/**
 * check-debt-ledger.ts — Enforces removal deadlines for in-flight debt.
 *
 * Parses `docs/debt-ledger.md`, reads every row under the **Active entries**
 * table, and fails if any row's `Scheduled removal` is an explicit
 * ISO-8601 date (`YYYY-MM-DD`) that is already in the past.
 *
 * Rows whose deadline is expressed as `ship-date + Nd` or `end of Phase N`
 * are considered pending — they cannot be evaluated until a ship date is
 * stamped into the ledger. Those forms are allowed, but each is also its
 * own invitation to slip silently; phase-closing PRs must convert them
 * to absolute dates.
 *
 * Invocation: `npm run check-debt-ledger` (cwd = frontend/). Exits
 * non-zero on any past-due entry; prints one offending row per line.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const LEDGER_PATH = resolve(process.cwd(), '..', 'docs', 'debt-ledger.md')

interface LedgerRow {
  item: string
  introduced: string
  scheduledRemoval: string
  owner: string
  closingPhase: string
}

const ACTIVE_HEADER = /^##\s+Active entries\s*$/m
const TABLE_ROW = /^\|(.+)\|\s*$/

function readActiveRows(markdown: string): LedgerRow[] {
  const headerMatch = ACTIVE_HEADER.exec(markdown)
  if (!headerMatch) {
    throw new Error('check-debt-ledger: `## Active entries` section not found.')
  }
  const tail = markdown.slice(headerMatch.index + headerMatch[0].length)
  const lines = tail.split(/\r?\n/)
  const rows: LedgerRow[] = []
  let sawDivider = false

  for (const raw of lines) {
    const line = raw.trim()
    if (line.startsWith('## ')) break
    if (!line) continue
    const m = TABLE_ROW.exec(line)
    if (!m) continue
    const cells = m[1]!.split('|').map((c) => c.trim())
    if (cells.length !== 5) continue
    // Skip the header row and the markdown divider (---|---|...).
    if (cells.every((c) => /^[-:\s]+$/.test(c))) { sawDivider = true; continue }
    if (!sawDivider) continue
    const [item, introduced, scheduledRemoval, owner, closingPhase] = cells as [string, string, string, string, string]
    rows.push({ item, introduced, scheduledRemoval, owner, closingPhase })
  }
  return rows
}

function startOfTodayUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function isPastDueAbsoluteDate(deadline: string, today: Date): { pastDue: boolean; parsedAs?: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(deadline)
  if (!match) return { pastDue: false }
  const [, y, m, d] = match
  const parsed = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  return { pastDue: parsed.getTime() < today.getTime(), parsedAs: parsed }
}

function main(): void {
  let markdown: string
  try {
    markdown = readFileSync(LEDGER_PATH, 'utf8')
  } catch (err) {
    console.error(`check-debt-ledger: cannot read ${LEDGER_PATH}: ${(err as Error).message}`)
    process.exit(2)
  }

  const rows = readActiveRows(markdown)
  const today = startOfTodayUtc()
  const offenders: string[] = []
  for (const row of rows) {
    const { pastDue, parsedAs } = isPastDueAbsoluteDate(row.scheduledRemoval, today)
    if (pastDue) {
      offenders.push(
        `  • "${row.item}" owned by ${row.owner} was due ${parsedAs!.toISOString().slice(0, 10)} (closes in ${row.closingPhase}).`,
      )
    }
  }

  if (offenders.length === 0) {
    console.log(`check-debt-ledger: OK — ${rows.length} active entry/entries, none past due.`)
    process.exit(0)
  }

  console.error('check-debt-ledger: past-due entries:')
  for (const line of offenders) console.error(line)
  process.exit(1)
}

main()
