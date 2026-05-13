"""AchievementPolicy — domain service that encapsulates all achievement evaluation rules.

Keeping evaluation here (domain layer) rather than in the application service
means the rules are reachable by any caller, not just the HTTP/application path.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.domain.achievement.definitions import AchievementDef
    from app.domain.session.repository import CumulativeStats

logger = logging.getLogger(__name__)


def evaluate(
    d: "AchievementDef",
    stats: "CumulativeStats",
    session_score: int,
    session_kills: int,
    session_waves: int,
    session_star: int,
    session_hp_lost: int,
    session_gold_remaining: int,
    territories_held: int = 0,
    territory_max_star: int = 0,
) -> bool:
    ct = d.condition_type
    cv = d.condition_value

    if ct == "total_kills":
        return stats.total_kills >= cv
    if ct == "single_session_kills":
        return session_kills >= cv
    if ct == "total_score":
        return stats.total_score >= cv
    if ct == "single_session_score":
        return session_score >= cv
    if ct == "perfect_run":
        # Require at least one wave survived so a zero-play run doesn't qualify.
        return session_hp_lost == 0 and session_waves >= 1
    if ct == "total_sessions":
        return stats.total_sessions >= cv
    if ct == "waves_survived_single":
        return session_waves >= cv
    if ct == "total_waves":
        return stats.total_waves >= cv
    if ct == "level_cleared_at_star":
        # Require at least one wave survived; a session that ends immediately
        # at 0 waves is not a genuine level completion.
        return session_star == cv and session_waves >= 1
    if ct == "all_stars_played":
        return stats.stars_played == {1, 2, 3, 4, 5}
    if ct == "frugal_run":
        return session_score >= cv["min_score"] and session_gold_remaining >= cv["min_gold"]
    if ct == "territories_seized":
        return territories_held >= cv
    if ct == "territory_max_star":
        return territory_max_star >= cv
    if ct == "max_star_cleared":
        return bool(stats.stars_played) and max(stats.stars_played) >= cv

    logger.warning("Unknown achievement condition_type %s (achievement=%s)", ct, d.id)
    return False
