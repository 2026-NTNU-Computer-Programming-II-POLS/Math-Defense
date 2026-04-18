"""SQLAlchemy implementation of LeaderboardRepository"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession, aliased

from app.domain.leaderboard.aggregate import LeaderboardEntry
from app.domain.leaderboard.view import RankedLeaderboardEntry
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

    def query_ranked_global(
        self,
        page: int,
        per_page: int,
    ) -> tuple[list[RankedLeaderboardEntry], int]:
        return self._query_ranked(level=None, page=page, per_page=per_page)

    def query_ranked_by_level(
        self,
        level: int,
        page: int,
        per_page: int,
    ) -> tuple[list[RankedLeaderboardEntry], int]:
        return self._query_ranked(level=level, page=page, per_page=per_page)

    def _query_ranked(
        self,
        level: int | None,
        page: int,
        per_page: int,
    ) -> tuple[list[RankedLeaderboardEntry], int]:
        """Shared implementation: when level is None the rank is global,
        otherwise it is scoped to rows of that level.

        Rank semantics: DENSE_RANK by score — ties share a rank, next distinct
        score advances by 1. Implementation avoids a window function so the DB
        doesn't materialise every row before LIMIT. Instead, each returned row's
        rank is derived from a correlated subquery (``1 + COUNT DISTINCT higher
        scores``), which uses the score index and costs O(per_page * log N)
        rather than O(N).
        """
        count_q = self._db.query(func.count(LeaderboardEntryModel.id))
        if level is not None:
            count_q = count_q.filter(LeaderboardEntryModel.level == level)
        total = count_q.scalar() or 0
        if total == 0:
            return [], 0

        L2 = aliased(LeaderboardEntryModel)
        higher_distinct = select(func.count(func.distinct(L2.score))).where(
            L2.score > LeaderboardEntryModel.score
        )
        if level is not None:
            higher_distinct = higher_distinct.where(L2.level == level)
        rank_col = (higher_distinct.correlate(LeaderboardEntryModel).scalar_subquery() + 1).label("rank")

        q = self._db.query(
            LeaderboardEntryModel.id.label("id"),
            LeaderboardEntryModel.level.label("level"),
            LeaderboardEntryModel.score.label("score"),
            LeaderboardEntryModel.kills.label("kills"),
            LeaderboardEntryModel.waves_survived.label("waves_survived"),
            LeaderboardEntryModel.created_at.label("created_at"),
            User.username.label("username"),
            rank_col,
        ).join(User, LeaderboardEntryModel.user_id == User.id)
        if level is not None:
            q = q.filter(LeaderboardEntryModel.level == level)

        rows = (
            q.order_by(
                LeaderboardEntryModel.score.desc(),
                LeaderboardEntryModel.created_at.asc(),
                LeaderboardEntryModel.id.asc(),
            )
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )

        entries = [
            RankedLeaderboardEntry(
                id=row.id,
                rank=row.rank,
                username=row.username,
                level=row.level,
                score=row.score,
                kills=row.kills,
                waves_survived=row.waves_survived,
                created_at=row.created_at,
            )
            for row in rows
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
