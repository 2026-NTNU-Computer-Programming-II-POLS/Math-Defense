"""Achievement definitions — single source of truth for all achievement conditions.

Each definition specifies:
- A condition type and threshold for evaluation
- The talent points awarded on unlock
- Category for UI grouping

Condition types:
- total_kills: cumulative kills across all sessions
- single_session_kills: kills in one session
- total_score: cumulative score across all sessions
- single_session_score: score in one session
- perfect_run: complete a level at star_rating with 0 HP lost
- total_sessions: total completed sessions
- max_star_cleared: highest star rating completed
- waves_survived_single: waves survived in one session
- total_waves: cumulative waves survived
- level_cleared_at_star: cleared a level at a specific star rating
- all_stars_played: played at every star rating (1-5)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class AchievementDef:
    id: str
    name: str
    description: str
    category: str
    condition_type: str
    condition_value: Any
    talent_points: int
    icon: str = ""


ACHIEVEMENT_DEFS: dict[str, AchievementDef] = {}


def _reg(d: AchievementDef) -> None:
    ACHIEVEMENT_DEFS[d.id] = d


# ── Combat ──
_reg(AchievementDef("combat_kill_50", "Beginner Slayer", "Kill 50 enemies total", "combat", "total_kills", 50, 1))
_reg(AchievementDef("combat_kill_200", "Veteran Slayer", "Kill 200 enemies total", "combat", "total_kills", 200, 2))
_reg(AchievementDef("combat_kill_500", "Elite Slayer", "Kill 500 enemies total", "combat", "total_kills", 500, 3))
_reg(AchievementDef("combat_single_30", "Wave Crusher", "Kill 30 enemies in one session", "combat", "single_session_kills", 30, 1))
_reg(AchievementDef("combat_single_80", "Massacre", "Kill 80 enemies in one session", "combat", "single_session_kills", 80, 2))

# ── Scoring ──
_reg(AchievementDef("score_1000", "Score Seeker", "Achieve total score over 1,000", "scoring", "total_score", 1000, 1))
_reg(AchievementDef("score_10000", "Score Hunter", "Achieve total score over 10,000", "scoring", "total_score", 10000, 2))
_reg(AchievementDef("score_50000", "Score Master", "Achieve total score over 50,000", "scoring", "total_score", 50000, 3))
_reg(AchievementDef("score_single_2000", "High Scorer", "Score over 2,000 in one session", "scoring", "single_session_score", 2000, 1))
_reg(AchievementDef("score_single_5000", "Top Scorer", "Score over 5,000 in one session", "scoring", "single_session_score", 5000, 2))

# ── Survival ──
_reg(AchievementDef("survival_no_damage", "Untouchable", "Complete a level without losing HP", "survival", "perfect_run", True, 3))
_reg(AchievementDef("survival_waves_3", "Wave Rider", "Survive 3 waves in one session", "survival", "waves_survived_single", 3, 1))
_reg(AchievementDef("survival_waves_5", "Endurance", "Survive 5 waves in one session", "survival", "waves_survived_single", 5, 2))
_reg(AchievementDef("survival_total_waves_20", "Marathon", "Survive 20 waves total", "survival", "total_waves", 20, 2))

# ── Efficiency ──
_reg(AchievementDef("efficiency_low_spend", "Frugal Commander", "Complete a session with score > 500 and gold remaining > 100", "efficiency", "frugal_run", {"min_score": 500, "min_gold": 100}, 2))

# ── Exploration ──
_reg(AchievementDef("explore_star_1", "First Steps", "Complete a 1-star level", "exploration", "level_cleared_at_star", 1, 1))
_reg(AchievementDef("explore_star_3", "Intermediate", "Complete a 3-star level", "exploration", "level_cleared_at_star", 3, 1))
_reg(AchievementDef("explore_star_5", "Expert", "Complete a 5-star level", "exploration", "level_cleared_at_star", 5, 2))
_reg(AchievementDef("explore_all_stars", "Cartographer", "Play at every star rating (1-5)", "exploration", "all_stars_played", True, 3))
_reg(AchievementDef("explore_sessions_5", "Regular", "Complete 5 sessions", "exploration", "total_sessions", 5, 1))
_reg(AchievementDef("explore_sessions_20", "Dedicated", "Complete 20 sessions", "exploration", "total_sessions", 20, 2))

# ── Territory ──
_reg(AchievementDef("territory_first", "Land Grabber", "Hold a territory", "territory", "territories_seized", 1, 1))
_reg(AchievementDef("territory_three", "Expansionist", "Hold 3 territories", "territory", "territories_seized", 3, 2))
_reg(AchievementDef("territory_ten", "Conqueror", "Hold 10 territories", "territory", "territories_seized", 10, 3))
_reg(AchievementDef("territory_five_star", "Star Realm", "Hold a 5-star territory", "territory", "territory_max_star", 5, 3))


def get_all_defs() -> list[AchievementDef]:
    return list(ACHIEVEMENT_DEFS.values())
