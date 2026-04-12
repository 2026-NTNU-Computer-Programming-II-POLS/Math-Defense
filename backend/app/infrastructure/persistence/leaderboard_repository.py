"""SQLAlchemy implementation of LeaderboardRepository"""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession

from app.domain.leaderboard.aggregate import LeaderboardEntry
from app.domain.value_objects import Level, Score
from app.models.leaderboard import LeaderboardEntry as LeaderboardEntryModel
from app.models.user import User


class SqlAlchemyLeaderboardRepository:

    def __init__(self, db: DbSession):
        self._db = db

    def find_by_session_id(self, session_id: str) -> LeaderboardEntry | None:
        row = self._db.query(LeaderboardEntryModel).filter(
            LeaderboardEntryModel.session_id == session_id
        ).first()
        return self._to_domain(row) if row else None

    def save(self, entry: LeaderboardEntry) -> None:
        row = LeaderboardEntryModel(
            id=entry.id,
            user_id=entry.user_id,
            level=int(entry.level),
            score=entry.score.value,
            kills=entry.kills,
            waves_survived=entry.waves_survived,
            session_id=entry.session_id,
            created_at=entry.created_at,
        )
        self._db.add(row)
        self._db.flush()

    def query_ranked(
        self,
        level: int | None,
        page: int,
        per_page: int,
    ) -> tuple[list[dict], int]:
        """Returns (entries_with_rank, total_count)"""
        base_q = self._db.query(LeaderboardEntryModel).join(
            User, LeaderboardEntryModel.user_id == User.id
        )
        if level is not None:
            base_q = base_q.filter(LeaderboardEntryModel.level == level)

        total = base_q.count()

        # DENSE_RANK for tie handling.
        # Partition by level when filtering so rank reflects the per-level ladder
        # (without partition_by, GET ?level=2 would still report global rank).
        # id is the final tie-breaker so pagination stays stable across pages.
        rank_kwargs = {
            "order_by": [
                LeaderboardEntryModel.score.desc(),
                LeaderboardEntryModel.created_at.asc(),
                LeaderboardEntryModel.id.asc(),
            ],
        }
        if level is not None:
            rank_kwargs["partition_by"] = LeaderboardEntryModel.level
        rank_col = func.dense_rank().over(**rank_kwargs).label("rank")

        ranked_q = self._db.query(
            LeaderboardEntryModel, User.username, rank_col
        ).join(User, LeaderboardEntryModel.user_id == User.id)

        if level is not None:
            ranked_q = ranked_q.filter(LeaderboardEntryModel.level == level)

        rows = (
            ranked_q
            .order_by(
                LeaderboardEntryModel.score.desc(),
                LeaderboardEntryModel.created_at.asc(),
                LeaderboardEntryModel.id.asc(),
            )
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )

        entries = [
            {
                "rank": rank,
                "username": username,
                "level": entry.level,
                "score": entry.score,
                "kills": entry.kills,
                "waves_survived": entry.waves_survived,
                "created_at": entry.created_at,
            }
            for entry, username, rank in rows
        ]

        return entries, total

    @staticmethod
    def _to_domain(row: LeaderboardEntryModel) -> LeaderboardEntry:
        return LeaderboardEntry(
            id=row.id,
            user_id=row.user_id,
            level=Level(row.level),
            score=Score(row.score),
            kills=row.kills,
            waves_survived=row.waves_survived,
            session_id=row.session_id,
            created_at=row.created_at,
        )
