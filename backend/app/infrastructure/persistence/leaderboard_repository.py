"""SQLAlchemy implementation of LeaderboardRepository"""
from __future__ import annotations

from sqlalchemy import Float, cast, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession, aliased

from app.domain.errors import ConstraintViolationError
from app.domain.leaderboard.aggregate import LeaderboardEntry
from app.domain.leaderboard.view import RankedLeaderboardEntry
from app.domain.value_objects import Level, Score
from app.models.class_membership import ClassMembership as MembershipModel
from app.models.leaderboard import LeaderboardEntry as LeaderboardEntryModel
from app.models.user import User
from app.utils.integrity import extract_constraint_name


def _effective_score(model):
    """COALESCE(total_score, CAST(score AS FLOAT)) — V2 sessions carry a
    floating-point total_score; V1 rows fall back to the integer score."""
    return func.coalesce(model.total_score, cast(model.score, Float))


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
            challenge_id=entry.challenge_id,
            total_score=entry.total_score,
            created_at=entry.created_at,
        )
        self._db.add(row)
        self._flush()

    def _flush(self) -> None:
        try:
            self._db.flush()
        except IntegrityError as e:
            raise ConstraintViolationError(
                str(e), constraint_name=extract_constraint_name(e)
            ) from e

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
        # Backlog §23: challenge runs live on their own ranking surface and must
        # not inflate the global / per-level leaderboards. Filter them out here.
        count_q = self._db.query(func.count(LeaderboardEntryModel.id)).filter(
            LeaderboardEntryModel.user_id.isnot(None),
            LeaderboardEntryModel.challenge_id.is_(None),
        )
        if level is not None:
            count_q = count_q.filter(LeaderboardEntryModel.level == level)
        total = count_q.scalar() or 0
        if total == 0:
            return [], 0

        L2 = aliased(LeaderboardEntryModel)
        eff_l2 = _effective_score(L2)
        eff_main = _effective_score(LeaderboardEntryModel)
        higher_distinct = select(func.count(func.distinct(eff_l2))).where(
            eff_l2 > eff_main,
            L2.user_id.isnot(None),
            L2.challenge_id.is_(None),
        )
        if level is not None:
            higher_distinct = higher_distinct.where(L2.level == level)
        rank_col = (higher_distinct.correlate(LeaderboardEntryModel).scalar_subquery() + 1).label("rank")

        q = self._db.query(
            LeaderboardEntryModel.id.label("id"),
            LeaderboardEntryModel.level.label("level"),
            LeaderboardEntryModel.score.label("score"),
            LeaderboardEntryModel.total_score.label("total_score"),
            LeaderboardEntryModel.kills.label("kills"),
            LeaderboardEntryModel.waves_survived.label("waves_survived"),
            LeaderboardEntryModel.created_at.label("created_at"),
            User.player_name.label("player_name"),
            rank_col,
        ).join(User, LeaderboardEntryModel.user_id == User.id).filter(
            LeaderboardEntryModel.challenge_id.is_(None),
        )
        if level is not None:
            q = q.filter(LeaderboardEntryModel.level == level)

        rows = (
            q.order_by(
                eff_main.desc(),
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
                player_name=row.player_name,
                level=row.level,
                score=row.score,
                total_score=row.total_score,
                kills=row.kills,
                waves_survived=row.waves_survived,
                created_at=row.created_at,
            )
            for row in rows
        ]

        return entries, total

    def query_ranked_by_challenge(
        self,
        challenge_id: str,
        page: int,
        per_page: int,
    ) -> tuple[list[RankedLeaderboardEntry], int]:
        """Challenge-scoped DENSE_RANK — restricted to entries tagged with
        ``challenge_id``. Mirrors the pattern in ``_query_ranked`` but with a
        simple equality predicate instead of a level filter (Backlog §23.5)."""
        count_q = (
            self._db.query(func.count(LeaderboardEntryModel.id))
            .filter(
                LeaderboardEntryModel.user_id.isnot(None),
                LeaderboardEntryModel.challenge_id == challenge_id,
            )
        )
        total = count_q.scalar() or 0
        if total == 0:
            return [], 0

        L2 = aliased(LeaderboardEntryModel)
        eff_l2 = _effective_score(L2)
        eff_main = _effective_score(LeaderboardEntryModel)
        higher_distinct = (
            select(func.count(func.distinct(eff_l2)))
            .where(
                eff_l2 > eff_main,
                L2.user_id.isnot(None),
                L2.challenge_id == challenge_id,
            )
        )
        rank_col = (
            higher_distinct.correlate(LeaderboardEntryModel).scalar_subquery() + 1
        ).label("rank")

        q = (
            self._db.query(
                LeaderboardEntryModel.id.label("id"),
                LeaderboardEntryModel.level.label("level"),
                LeaderboardEntryModel.score.label("score"),
                LeaderboardEntryModel.total_score.label("total_score"),
                LeaderboardEntryModel.kills.label("kills"),
                LeaderboardEntryModel.waves_survived.label("waves_survived"),
                LeaderboardEntryModel.created_at.label("created_at"),
                User.player_name.label("player_name"),
                rank_col,
            )
            .join(User, LeaderboardEntryModel.user_id == User.id)
            .filter(LeaderboardEntryModel.challenge_id == challenge_id)
        )

        rows = (
            q.order_by(
                eff_main.desc(),
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
                player_name=row.player_name,
                level=row.level,
                score=row.score,
                total_score=row.total_score,
                kills=row.kills,
                waves_survived=row.waves_survived,
                created_at=row.created_at,
            )
            for row in rows
        ]
        return entries, total

    def query_ranked_by_class(
        self,
        class_id: str,
        page: int,
        per_page: int,
    ) -> tuple[list[RankedLeaderboardEntry], int]:
        student_ids_q = (
            select(MembershipModel.student_id)
            .where(MembershipModel.class_id == class_id)
        )

        count_q = (
            self._db.query(func.count(LeaderboardEntryModel.id))
            .filter(LeaderboardEntryModel.user_id.isnot(None))
            .filter(LeaderboardEntryModel.user_id.in_(student_ids_q))
            .filter(LeaderboardEntryModel.challenge_id.is_(None))
        )
        total = count_q.scalar() or 0
        if total == 0:
            return [], 0

        L2 = aliased(LeaderboardEntryModel)
        eff_l2 = _effective_score(L2)
        eff_main = _effective_score(LeaderboardEntryModel)
        higher_distinct = (
            select(func.count(func.distinct(eff_l2)))
            .where(eff_l2 > eff_main)
            .where(L2.user_id.isnot(None))
            .where(L2.user_id.in_(student_ids_q))
            .where(L2.challenge_id.is_(None))
        )
        rank_col = (higher_distinct.correlate(LeaderboardEntryModel).scalar_subquery() + 1).label("rank")

        q = (
            self._db.query(
                LeaderboardEntryModel.id.label("id"),
                LeaderboardEntryModel.level.label("level"),
                LeaderboardEntryModel.score.label("score"),
                LeaderboardEntryModel.total_score.label("total_score"),
                LeaderboardEntryModel.kills.label("kills"),
                LeaderboardEntryModel.waves_survived.label("waves_survived"),
                LeaderboardEntryModel.created_at.label("created_at"),
                User.player_name.label("player_name"),
                rank_col,
            )
            .join(User, LeaderboardEntryModel.user_id == User.id)
            .filter(LeaderboardEntryModel.user_id.in_(student_ids_q))
            .filter(LeaderboardEntryModel.challenge_id.is_(None))
        )

        rows = (
            q.order_by(
                eff_main.desc(),
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
                player_name=row.player_name,
                level=row.level,
                score=row.score,
                total_score=row.total_score,
                kills=row.kills,
                waves_survived=row.waves_survived,
                created_at=row.created_at,
            )
            for row in rows
        ]
        return entries, total

    def get_user_history(
        self,
        user_id: str,
        level: int | None = None,
        limit: int = 10000,
    ) -> list[LeaderboardEntry]:
        q = self._db.query(LeaderboardEntryModel).filter(
            LeaderboardEntryModel.user_id == user_id
        )
        if level is not None:
            q = q.filter(LeaderboardEntryModel.level == level)
        rows = q.order_by(
            LeaderboardEntryModel.created_at.desc(),
            LeaderboardEntryModel.id.desc(),
        ).limit(limit).all()
        return [self._to_domain(row) for row in rows]

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
            challenge_id=row.challenge_id,
            # M-02: map total_score from the database model
            total_score=row.total_score,
            created_at=row.created_at,
        )
