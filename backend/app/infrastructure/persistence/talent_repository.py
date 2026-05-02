"""SQLAlchemy implementation of TalentRepository"""
from __future__ import annotations

from datetime import UTC

from sqlalchemy.orm import Session as DbSession

from app.domain.talent.aggregate import TalentAllocation
from app.models.talent import TalentAllocation as TalentModel


class SqlAlchemyTalentRepository:

    def __init__(self, db: DbSession):
        self._db = db

    def find_by_user(self, user_id: str) -> list[TalentAllocation]:
        rows = self._db.query(TalentModel).filter(TalentModel.user_id == user_id).all()
        return [self._to_domain(r) for r in rows]

    def find_by_user_for_update(self, user_id: str) -> list[TalentAllocation]:
        rows = (
            self._db.query(TalentModel)
            .filter(TalentModel.user_id == user_id)
            .with_for_update()
            .all()
        )
        return [self._to_domain(r) for r in rows]

    def find_by_user_and_node(self, user_id: str, talent_node_id: str) -> TalentAllocation | None:
        row = (
            self._db.query(TalentModel)
            .filter(TalentModel.user_id == user_id, TalentModel.talent_node_id == talent_node_id)
            .first()
        )
        return self._to_domain(row) if row else None

    def save(self, allocation: TalentAllocation) -> None:
        row = self._db.query(TalentModel).filter(TalentModel.id == allocation.id).first()
        if row:
            row.current_level = allocation.current_level
            row.updated_at = allocation.updated_at
        else:
            row = TalentModel(
                id=allocation.id,
                user_id=allocation.user_id,
                talent_node_id=allocation.talent_node_id,
                current_level=allocation.current_level,
                updated_at=allocation.updated_at,
            )
            self._db.add(row)
        self._db.flush()

    def delete_by_user(self, user_id: str) -> int:
        count = self._db.query(TalentModel).filter(TalentModel.user_id == user_id).delete()
        self._db.flush()
        return count

    @staticmethod
    def _to_domain(row: TalentModel) -> TalentAllocation:
        updated_at = row.updated_at
        if updated_at and updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=UTC)
        return TalentAllocation(
            id=row.id,
            user_id=row.user_id,
            talent_node_id=row.talent_node_id,
            current_level=row.current_level,
            updated_at=updated_at,
        )
