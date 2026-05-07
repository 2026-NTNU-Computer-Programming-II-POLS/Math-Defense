"""SQLAlchemy implementation of SeasonRepository."""
from __future__ import annotations

from datetime import UTC

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session as DbSession

from app.domain.season.aggregate import Season
from app.models.season import Season as SeasonModel


class SqlAlchemySeasonRepository:
    def __init__(self, db: DbSession) -> None:
        self._db = db

    def find_all(self) -> list[Season]:
        rows = self._db.query(SeasonModel).order_by(SeasonModel.starts_at.desc()).all()
        return [self._to_domain(r) for r in rows]

    def find_by_id(self, season_id: str) -> Season | None:
        row = self._db.query(SeasonModel).filter(SeasonModel.season_id == season_id).first()
        return self._to_domain(row) if row else None

    def save(self, season: Season) -> None:
        stmt = (
            pg_insert(SeasonModel)
            .values(
                season_id=season.season_id,
                name=season.name,
                starts_at=season.starts_at,
                ends_at=season.ends_at,
            )
            .on_conflict_do_update(
                index_elements=["season_id"],
                set_={
                    "name": season.name,
                    "starts_at": season.starts_at,
                    "ends_at": season.ends_at,
                },
            )
        )
        self._db.execute(stmt)
        self._db.flush()

    def delete(self, season_id: str) -> None:
        self._db.query(SeasonModel).filter(SeasonModel.season_id == season_id).delete()
        self._db.flush()

    @staticmethod
    def _to_domain(row: SeasonModel) -> Season:
        starts_at = row.starts_at
        ends_at = row.ends_at
        if starts_at and starts_at.tzinfo is None:
            starts_at = starts_at.replace(tzinfo=UTC)
        if ends_at and ends_at.tzinfo is None:
            ends_at = ends_at.replace(tzinfo=UTC)
        return Season(
            season_id=row.season_id,
            name=row.name,
            starts_at=starts_at,
            ends_at=ends_at,
        )
