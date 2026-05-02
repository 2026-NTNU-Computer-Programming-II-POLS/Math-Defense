"""SQLAlchemy implementation of AchievementRepository"""
from __future__ import annotations

from datetime import UTC

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session as DbSession

from app.domain.achievement.aggregate import UserAchievement
from app.models.achievement import UserAchievement as AchievementModel


class SqlAlchemyAchievementRepository:

    def __init__(self, db: DbSession):
        self._db = db

    def find_by_user(self, user_id: str) -> list[UserAchievement]:
        rows = self._db.query(AchievementModel).filter(AchievementModel.user_id == user_id).all()
        return [self._to_domain(r) for r in rows]

    def find_by_user_and_achievement(self, user_id: str, achievement_id: str) -> UserAchievement | None:
        row = (
            self._db.query(AchievementModel)
            .filter(AchievementModel.user_id == user_id, AchievementModel.achievement_id == achievement_id)
            .first()
        )
        return self._to_domain(row) if row else None

    def save(self, achievement: UserAchievement) -> None:
        row = self._db.query(AchievementModel).filter(AchievementModel.id == achievement.id).first()
        if row:
            row.achievement_id = achievement.achievement_id
            row.talent_points = achievement.talent_points
            self._db.flush()
            return
        stmt = pg_insert(AchievementModel).values(
            id=achievement.id,
            user_id=achievement.user_id,
            achievement_id=achievement.achievement_id,
            talent_points=achievement.talent_points,
            unlocked_at=achievement.unlocked_at,
        ).on_conflict_do_nothing(constraint="uq_user_achievement")
        self._db.execute(stmt)
        self._db.flush()

    def delete_by_user(self, user_id: str) -> None:
        self._db.query(AchievementModel).filter(AchievementModel.user_id == user_id).delete()
        self._db.flush()

    def count_by_user(self, user_id: str) -> int:
        return self._db.query(func.count(AchievementModel.id)).filter(AchievementModel.user_id == user_id).scalar() or 0

    def sum_talent_points(self, user_id: str) -> int:
        return (
            self._db.query(func.coalesce(func.sum(AchievementModel.talent_points), 0))
            .filter(AchievementModel.user_id == user_id)
            .scalar()
        ) or 0

    @staticmethod
    def _to_domain(row: AchievementModel) -> UserAchievement:
        unlocked_at = row.unlocked_at
        if unlocked_at and unlocked_at.tzinfo is None:
            unlocked_at = unlocked_at.replace(tzinfo=UTC)
        return UserAchievement(
            id=row.id,
            user_id=row.user_id,
            achievement_id=row.achievement_id,
            talent_points=row.talent_points,
            unlocked_at=unlocked_at,
        )
