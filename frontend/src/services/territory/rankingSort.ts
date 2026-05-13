import type { RankingEntryWithMeta } from '@/services/territoryService'

export type SortMode = 'territory_value' | 'rank_change' | 'last_occupation_at'

export const SORT_LABEL: Record<SortMode, string> = {
  territory_value: 'Territory value',
  rank_change: 'Rank change',
  last_occupation_at: 'Most recent activity',
}

/**
 * Sort entries for display.
 *
 * - 'territory_value' returns the input order (the backend already sorts
 *   by rank, which matches territory_value desc + name tiebreak).
 * - 'rank_change' sorts by climbed-most → declined-most. Entries with
 *   `rank_change === null` are pushed to the bottom so the UI can render
 *   "no prior snapshot" at the end without faking zeros.
 * - 'last_occupation_at' sorts by recency (most recent first); nulls last.
 */
export function sortRankings(entries: RankingEntryWithMeta[], mode: SortMode): RankingEntryWithMeta[] {
  if (mode === 'territory_value') return entries.slice()

  if (mode === 'rank_change') {
    return entries.slice().sort((a, b) => {
      if (a.rank_change === null && b.rank_change === null) return a.rank - b.rank
      if (a.rank_change === null) return 1
      if (b.rank_change === null) return -1
      return b.rank_change - a.rank_change
    })
  }

  return entries.slice().sort((a, b) => {
    const at = a.last_occupation_at ? new Date(a.last_occupation_at).getTime() : NaN
    const bt = b.last_occupation_at ? new Date(b.last_occupation_at).getTime() : NaN
    const aNull = !Number.isFinite(at)
    const bNull = !Number.isFinite(bt)
    if (aNull && bNull) return a.rank - b.rank
    if (aNull) return 1
    if (bNull) return -1
    return bt - at
  })
}

export function formatRankChange(change: number | null): string {
  if (change === null) return '—'
  if (change > 0) return `↑${change}`
  if (change < 0) return `↓${Math.abs(change)}`
  return '·'
}

export function formatComposition(buckets: { star: number; count: number }[]): string {
  if (buckets.length === 0) return ''
  return buckets.map(b => `${b.count}×${b.star}★`).join(' · ')
}

export function formatRelativeTime(iso: string | null, nowMs: number = Date.now()): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const deltaSec = Math.max(0, Math.floor((nowMs - t) / 1000))
  if (deltaSec < 60) return `${deltaSec}s ago`
  const deltaMin = Math.floor(deltaSec / 60)
  if (deltaMin < 60) return `${deltaMin}m ago`
  const deltaHr = Math.floor(deltaMin / 60)
  if (deltaHr < 24) return `${deltaHr}h ago`
  return `${Math.floor(deltaHr / 24)}d ago`
}
