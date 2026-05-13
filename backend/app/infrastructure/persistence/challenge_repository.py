"""SQLAlchemy implementation of ChallengeRepository."""
from __future__ import annotations

from datetime import UTC

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.domain.challenge.aggregate import Challenge
from app.domain.challenge.constraint_dsl import ChallengeConstraints
from app.domain.errors import ConstraintViolationError
from app.models.challenge import Challenge as ChallengeModel
from app.models.leaderboard import LeaderboardEntry as LeaderboardEntryModel
from app.utils.integrity import extract_constraint_name


class SqlAlchemyChallengeRepository:
    def __init__(self, db: DbSession) -> None:
        self._db = db

    def find_by_id(self, challenge_id: str) -> Challenge | None:
        row = (
            self._db.query(ChallengeModel)
            .filter(ChallengeModel.id == challenge_id)
            .first()
        )
        return self._to_domain(row) if row else None

    def find_by_teacher(self, teacher_id: str) -> list[Challenge]:
        rows = (
            self._db.query(ChallengeModel)
            .filter(
                ChallengeModel.teacher_id == teacher_id,
                ChallengeModel.deleted_at.is_(None),
            )
            .order_by(ChallengeModel.created_at.desc())
            .all()
        )
        return [self._to_domain(r) for r in rows]

    def save(self, challenge: Challenge) -> None:
        existing = (
            self._db.query(ChallengeModel)
            .filter(ChallengeModel.id == challenge.id)
            .first()
        )
        if existing:
            existing.title = challenge.title
            existing.description = challenge.description
            existing.constraints = challenge.constraints.to_dict()
            existing.updated_at = challenge.updated_at
            existing.deleted_at = challenge.deleted_at
        else:
            self._db.add(
                ChallengeModel(
                    id=challenge.id,
                    teacher_id=challenge.teacher_id,
                    title=challenge.title,
                    description=challenge.description,
                    constraints=challenge.constraints.to_dict(),
                    created_at=challenge.created_at,
                    updated_at=challenge.updated_at,
                    deleted_at=challenge.deleted_at,
                )
            )
        try:
            self._db.flush()
        except IntegrityError as e:
            raise ConstraintViolationError(
                str(e), constraint_name=extract_constraint_name(e)
            ) from e

    def has_play_history(self, challenge_id: str) -> bool:
        count = (
            self._db.query(func.count(LeaderboardEntryModel.id))
            .filter(LeaderboardEntryModel.challenge_id == challenge_id)
            .scalar()
            or 0
        )
        return count > 0

    @staticmethod
    def _to_domain(row: ChallengeModel) -> Challenge:
        # Postgres returns timezone-aware datetimes; SQLite (legacy tests) may
        # return naive — normalise so domain code can compare freely.
        created = row.created_at
        if created and created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        updated = row.updated_at
        if updated and updated.tzinfo is None:
            updated = updated.replace(tzinfo=UTC)
        deleted = row.deleted_at
        if deleted and deleted.tzinfo is None:
            deleted = deleted.replace(tzinfo=UTC)
        return Challenge(
            id=row.id,
            teacher_id=row.teacher_id,
            title=row.title,
            description=row.description or "",
            constraints=ChallengeConstraints.from_dict(row.constraints),
            created_at=created,
            updated_at=updated,
            deleted_at=deleted,
        )
