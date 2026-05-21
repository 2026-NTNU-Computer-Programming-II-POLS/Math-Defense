"""AchievementApplicationService — evaluates and unlocks achievements after session completion"""
from __future__ import annotations

import logging
from datetime import datetime, UTC
from typing import TYPE_CHECKING

from app.domain.achievement.aggregate import UserAchievement
from app.domain.achievement.definitions import ACHIEVEMENT_DEFS, AchievementDef, get_all_defs
from app.domain.achievement import policy as achievement_policy
from app.domain.season.aggregate import Season

if TYPE_CHECKING:
    from app.application.ports import UnitOfWork
    from app.domain.achievement.repository import AchievementRepository
    from app.domain.season.repository import SeasonRepository
    from app.domain.session.repository import GameSessionRepository, CumulativeStats

logger = logging.getLogger(__name__)


class AchievementApplicationService:
    def __init__(
        self,
        achievement_repo: AchievementRepository,
        session_repo: GameSessionRepository,
        uow: UnitOfWork,
        season_repo: SeasonRepository | None = None,
    ) -> None:
        self._achievement_repo = achievement_repo
        self._session_repo = session_repo
        self._uow = uow
        self._season_repo = season_repo

    def get_all_for_user(self, user_id: str) -> list[dict]:
        unlocked = {a.achievement_id: a for a in self._achievement_repo.find_by_user(user_id)}
        seasons_by_id = self._load_seasons()
        now = datetime.now(UTC)
        result = []
        for d in get_all_defs():
            season_info = self._season_info_for_def(d, seasons_by_id, now)
            is_unlocked = d.id in unlocked
            # Report the *effective* talent points so a client can sum this
            # field across unlocked achievements and match the /summary
            # endpoint's talent_points_earned. An unlocked achievement reports
            # the reward actually banked (already doubled if it was unlocked
            # during an active season); a still-locked one reports what
            # unlocking it now would grant. Returning the raw definition value
            # here would understate seasonal rewards versus the summary.
            effective_points = (
                unlocked[d.id].talent_points
                if is_unlocked
                else self._award_points(d, seasons_by_id, now)
            )
            result.append({
                "id": d.id,
                "name": d.name,
                "description": d.description,
                "category": d.category,
                "talent_points": effective_points,
                "unlocked": is_unlocked,
                "unlocked_at": unlocked[d.id].unlocked_at.isoformat() if is_unlocked else None,
                "season_id": d.season_id,
                "season_active": season_info["active"] if season_info else False,
                "season_starts_at": (
                    season_info["starts_at"].isoformat()
                    if season_info and season_info["starts_at"] else None
                ),
                "season_ends_at": (
                    season_info["ends_at"].isoformat()
                    if season_info and season_info["ends_at"] else None
                ),
                "season_name": season_info["name"] if season_info else None,
            })
        return result

    def get_unlocked_for_user(self, user_id: str) -> list[UserAchievement]:
        return self._achievement_repo.find_by_user(user_id)

    def get_summary(self, user_id: str) -> dict:
        unlocked_count = self._achievement_repo.count_by_user(user_id)
        total_earned = self._achievement_repo.sum_talent_points(user_id)
        return {
            "unlocked": unlocked_count,
            "total": len(ACHIEVEMENT_DEFS),
            "talent_points_earned": total_earned,
        }

    def check_and_unlock(
        self,
        user_id: str,
        session_score: int,
        session_kills: int,
        session_waves: int,
        session_star: int,
        session_hp_lost: int,
        session_gold_remaining: int,
        territories_held: int = 0,
        territory_max_star: int = 0,
        completed_at: datetime | None = None,
    ) -> list[UserAchievement]:
        unlocked_ids = {a.achievement_id for a in self._achievement_repo.find_by_user(user_id)}
        stats = self._session_repo.get_cumulative_stats(user_id)
        newly_unlocked: list[UserAchievement] = []

        for d in get_all_defs():
            if d.id in unlocked_ids:
                continue
            if achievement_policy.evaluate(
                d, stats, session_score, session_kills, session_waves,
                session_star, session_hp_lost, session_gold_remaining,
                territories_held, territory_max_star,
            ):
                # B-BUG-11: refresh season state at award time. Holding a
                # pre-loop snapshot lets two concurrent end_session calls
                # award the same achievement under different multipliers
                # if a season toggled mid-loop.
                seasons_by_id = self._load_seasons()
                award_time = completed_at or datetime.now(UTC)
                points = self._award_points(d, seasons_by_id, award_time)
                achievement = UserAchievement.create(user_id, d.id, points)
                # B-BUG-3: save() returns False when the unique-constraint
                # short-circuit fires (concurrent end_session unlocked the
                # same achievement first). Skipping the append in that case
                # prevents a double Beta-evidence update and a duplicate
                # client toast.
                inserted = self._achievement_repo.save(achievement)
                if not inserted:
                    continue
                newly_unlocked.append(achievement)
                logger.info(
                    "Achievement unlocked: user=%s achievement=%s points=%d (base=%d)",
                    user_id, d.id, points, d.talent_points,
                )

        return newly_unlocked

    def _load_seasons(self) -> dict[str, Season]:
        if self._season_repo is None:
            return {}
        return {s.season_id: s for s in self._season_repo.find_all()}

    def _award_points(
        self, d: AchievementDef, seasons_by_id: dict[str, Season], now: datetime
    ) -> int:
        if self._is_season_active(d, seasons_by_id, now):
            return d.talent_points * Season.SEASON_REWARD_MULTIPLIER
        return d.talent_points

    @staticmethod
    def _is_season_active(
        d: AchievementDef, seasons_by_id: dict[str, Season], now: datetime
    ) -> bool:
        if d.season_id is None:
            return False
        admin = seasons_by_id.get(d.season_id)
        if admin is not None:
            return admin.is_active(now)
        if d.season_starts_at is not None and d.season_ends_at is not None:
            return d.season_starts_at <= now < d.season_ends_at
        return False

    @staticmethod
    def _season_info_for_def(
        d: AchievementDef, seasons_by_id: dict[str, Season], now: datetime
    ) -> dict | None:
        if d.season_id is None:
            return None
        admin = seasons_by_id.get(d.season_id)
        if admin is not None:
            return {
                "active": admin.is_active(now),
                "starts_at": admin.starts_at,
                "ends_at": admin.ends_at,
                "name": admin.name,
            }
        if d.season_starts_at is not None and d.season_ends_at is not None:
            return {
                "active": d.season_starts_at <= now < d.season_ends_at,
                "starts_at": d.season_starts_at,
                "ends_at": d.season_ends_at,
                "name": d.season_id,
            }
        return {
            "active": False,
            "starts_at": None,
            "ends_at": None,
            "name": d.season_id,
        }
