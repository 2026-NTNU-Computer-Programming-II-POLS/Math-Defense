import { api } from './api'

export interface AchievementOut {
  id: string
  name: string
  description: string
  category: string
  // Effective talent points: banked reward for an unlocked achievement (2x for
  // a season unlock) or the prospective reward while still locked. Summing this
  // over unlocked entries equals AchievementSummary.talent_points_earned.
  talent_points: number
  unlocked: boolean
  unlocked_at: string | null
  season_id: string | null
  season_active: boolean
  season_starts_at: string | null
  season_ends_at: string | null
  season_name: string | null
}

export interface AchievementSummary {
  unlocked: number
  total: number
  talent_points_earned: number
}

// Module-level cache for the unlocked-id set. The achievement list is fairly
// stable within a play session (only changes after SESSION_COMPLETED), so
// callers that just need to know "is X unlocked" can avoid re-fetching on
// every component mount. Consumers that need fresh data after an unlock event
// can call invalidateUnlockedIds() to drop the cache.
let _unlockedIdsPromise: Promise<Set<string>> | null = null

export const achievementService = {
  list() {
    return api.get<AchievementOut[]>('/api/achievements')
  },
  summary() {
    return api.get<AchievementSummary>('/api/achievements/summary')
  },
  unlockedIds(): Promise<Set<string>> {
    if (_unlockedIdsPromise) return _unlockedIdsPromise
    _unlockedIdsPromise = api
      .get<AchievementOut[]>('/api/achievements')
      .then((entries) => new Set(entries.filter((e) => e.unlocked).map((e) => e.id)))
      .catch((err) => {
        // Drop the failed promise so the next caller retries instead of
        // permanently caching a rejection.
        _unlockedIdsPromise = null
        throw err
      })
    return _unlockedIdsPromise
  },
  invalidateUnlockedIds(): void {
    _unlockedIdsPromise = null
  },
}
