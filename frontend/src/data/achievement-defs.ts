export type AchievementCategory = 'combat' | 'scoring' | 'efficiency' | 'survival' | 'exploration' | 'territory'

export interface AchievementDef {
  id: string
  name: string
  description: string
  category: AchievementCategory
  talentPoints: number
  icon: string
}

export const ACHIEVEMENT_CATEGORIES: { id: AchievementCategory; label: string }[] = [
  { id: 'combat', label: 'Combat' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'efficiency', label: 'Efficiency' },
  { id: 'survival', label: 'Survival' },
  { id: 'exploration', label: 'Exploration' },
  { id: 'territory', label: 'Territory' },
]

export const ACHIEVEMENT_DEFS: Record<string, AchievementDef> = {
  combat_kill_50:     { id: 'combat_kill_50', name: 'Beginner Slayer', description: 'Kill 50 enemies total', category: 'combat', talentPoints: 1, icon: '⚔' },
  combat_kill_200:    { id: 'combat_kill_200', name: 'Veteran Slayer', description: 'Kill 200 enemies total', category: 'combat', talentPoints: 2, icon: '⚔' },
  combat_kill_500:    { id: 'combat_kill_500', name: 'Elite Slayer', description: 'Kill 500 enemies total', category: 'combat', talentPoints: 3, icon: '⚔' },
  combat_single_30:   { id: 'combat_single_30', name: 'Wave Crusher', description: 'Kill 30 enemies in one session', category: 'combat', talentPoints: 1, icon: '⚔' },
  combat_single_80:   { id: 'combat_single_80', name: 'Massacre', description: 'Kill 80 enemies in one session', category: 'combat', talentPoints: 2, icon: '⚔' },

  score_1000:         { id: 'score_1000', name: 'Score Seeker', description: 'Achieve total score over 1,000', category: 'scoring', talentPoints: 1, icon: '★' },
  score_10000:        { id: 'score_10000', name: 'Score Hunter', description: 'Achieve total score over 10,000', category: 'scoring', talentPoints: 2, icon: '★' },
  score_50000:        { id: 'score_50000', name: 'Score Master', description: 'Achieve total score over 50,000', category: 'scoring', talentPoints: 3, icon: '★' },
  score_single_2000:  { id: 'score_single_2000', name: 'High Scorer', description: 'Score over 2,000 in one session', category: 'scoring', talentPoints: 1, icon: '★' },
  score_single_5000:  { id: 'score_single_5000', name: 'Top Scorer', description: 'Score over 5,000 in one session', category: 'scoring', talentPoints: 2, icon: '★' },

  survival_no_damage: { id: 'survival_no_damage', name: 'Untouchable', description: 'Complete a level without losing HP', category: 'survival', talentPoints: 3, icon: '♥' },
  survival_waves_3:   { id: 'survival_waves_3', name: 'Wave Rider', description: 'Survive 3 waves in one session', category: 'survival', talentPoints: 1, icon: '♥' },
  survival_waves_5:   { id: 'survival_waves_5', name: 'Endurance', description: 'Survive 5 waves in one session', category: 'survival', talentPoints: 2, icon: '♥' },
  survival_total_waves_20: { id: 'survival_total_waves_20', name: 'Marathon', description: 'Survive 20 waves total', category: 'survival', talentPoints: 2, icon: '♥' },

  efficiency_low_spend: { id: 'efficiency_low_spend', name: 'Frugal Commander', description: 'Complete a session with score > 500 and gold > 100', category: 'efficiency', talentPoints: 2, icon: '$' },

  explore_star_1:     { id: 'explore_star_1', name: 'First Steps', description: 'Complete a 1-star level', category: 'exploration', talentPoints: 1, icon: '?' },
  explore_star_3:     { id: 'explore_star_3', name: 'Intermediate', description: 'Complete a 3-star level', category: 'exploration', talentPoints: 1, icon: '?' },
  explore_star_5:     { id: 'explore_star_5', name: 'Expert', description: 'Complete a 5-star level', category: 'exploration', talentPoints: 2, icon: '?' },
  explore_all_stars:  { id: 'explore_all_stars', name: 'Cartographer', description: 'Play at every star rating (1-5)', category: 'exploration', talentPoints: 3, icon: '?' },
  explore_sessions_5: { id: 'explore_sessions_5', name: 'Regular', description: 'Complete 5 sessions', category: 'exploration', talentPoints: 1, icon: '?' },
  explore_sessions_20: { id: 'explore_sessions_20', name: 'Dedicated', description: 'Complete 20 sessions', category: 'exploration', talentPoints: 2, icon: '?' },

  territory_first:     { id: 'territory_first', name: 'Land Grabber', description: 'Hold a territory', category: 'territory', talentPoints: 1, icon: '#' },
  territory_three:     { id: 'territory_three', name: 'Expansionist', description: 'Hold 3 territories', category: 'territory', talentPoints: 2, icon: '#' },
  territory_ten:       { id: 'territory_ten', name: 'Conqueror', description: 'Hold 10 territories', category: 'territory', talentPoints: 3, icon: '#' },
  territory_five_star: { id: 'territory_five_star', name: 'Star Realm', description: 'Hold a 5-star territory', category: 'territory', talentPoints: 3, icon: '#' },
}
