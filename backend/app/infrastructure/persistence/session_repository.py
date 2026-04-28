"""SQLAlchemy implementation of GameSessionRepository"""
from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession

from app.domain.session.aggregate import GameSession, _stale_cutoff
from app.domain.session.repository import CumulativeStats
from app.domain.value_objects import SessionStatus, Level
from app.models.game_session import GameSession as GameSessionModel


class SqlAlchemySessionRepository:

    def __init__(self, db: DbSession):
        self._db = db

    def find_by_id(self, session_id: str, user_id: str) -> GameSession | None:
        row = self._db.query(GameSessionModel).filter(
            GameSessionModel.id == session_id,
            GameSessionModel.user_id == user_id,
        ).first()
        return self._to_domain(row) if row else None

    def find_by_id_for_update(self, session_id: str, user_id: str) -> GameSession | None:
        # Row-level lock prevents the TOCTOU race between the duplicate-submission
        # check and the leaderboard insert. On SQLite with_for_update is a no-op,
        # but the DB-level unique constraint on leaderboard.session_id is the
        # fallback safety net (callers should also catch IntegrityError).
        row = self._db.query(GameSessionModel).filter(
            GameSessionModel.id == session_id,
            GameSessionModel.user_id == user_id,
        ).with_for_update().first()
        return self._to_domain(row) if row else None

    def find_active_by_user(self, user_id: str) -> GameSession | None:
        row = self._db.query(GameSessionModel).filter(
            GameSessionModel.user_id == user_id,
            GameSessionModel.status == SessionStatus.ACTIVE.value,
        ).with_for_update().first()
        return self._to_domain(row) if row else None

    def find_stale_sessions(self, user_id: str) -> list[GameSession]:
        cutoff = datetime.now(UTC) - _stale_cutoff()
        rows = self._db.query(GameSessionModel).filter(
            GameSessionModel.user_id == user_id,
            GameSessionModel.status == SessionStatus.ACTIVE.value,
            GameSessionModel.started_at < cutoff,
        ).all()
        return [self._to_domain(r) for r in rows]

    def save(self, session: GameSession) -> None:
        # Normalise tz on the way out so the column never receives a naive
        # datetime, mirroring _ensure_utc() on load. Keeps the entire round-trip
        # UTC-aware even if an upstream caller handed us a naive datetime.
        started_at = _ensure_utc(session.started_at)
        ended_at = _ensure_utc(session.ended_at)

        row = self._db.query(GameSessionModel).filter(
            GameSessionModel.id == session.id
        ).first()
        if row:
            # started_at is an aggregate invariant: it is set once at creation
            # and must never change. Surface future setters that break this
            # instead of silently dropping the mutation on update.
            if _ensure_utc(row.started_at) != started_at:
                raise StartedAtMutationError(
                    f"started_at is immutable on GameSession (session={session.id})"
                )
            row.status = session.status.value
            row.current_wave = session.current_wave
            row.gold = session.gold
            row.hp = session.hp
            row.score = session.score
            row.kills = session.kills
            row.waves_survived = session.waves_survived
            row.kill_value = session.kill_value
            row.cost_total = session.cost_total
            row.time_total = session.time_total
            row.health_origin = session.health_origin
            row.health_final = session.health_final
            row.time_exclude_prepare = session.time_exclude_prepare
            row.total_score = session.total_score
            row.ended_at = ended_at
        else:
            row = GameSessionModel(
                id=session.id,
                user_id=session.user_id,
                star_rating=int(session.level),
                initial_answer=session.initial_answer,
                status=session.status.value,
                current_wave=session.current_wave,
                gold=session.gold,
                hp=session.hp,
                score=session.score,
                kills=session.kills,
                waves_survived=session.waves_survived,
                kill_value=session.kill_value,
                cost_total=session.cost_total,
                time_total=session.time_total,
                health_origin=session.health_origin,
                health_final=session.health_final,
                time_exclude_prepare=session.time_exclude_prepare,
                total_score=session.total_score,
                started_at=started_at,
                ended_at=ended_at,
            )
            self._db.add(row)
        self._db.flush()

    def save_all(self, sessions: list[GameSession]) -> None:
        for s in sessions:
            self.save(s)

    def get_cumulative_stats(self, user_id: str) -> CumulativeStats:
        completed = SessionStatus.COMPLETED.value
        row = self._db.query(
            func.coalesce(func.sum(GameSessionModel.kills), 0).label("total_kills"),
            func.coalesce(func.sum(GameSessionModel.score), 0).label("total_score"),
            func.coalesce(func.sum(GameSessionModel.waves_survived), 0).label("total_waves"),
            func.count(GameSessionModel.id).label("total_sessions"),
        ).filter(
            GameSessionModel.user_id == user_id,
            GameSessionModel.status == completed,
        ).one()

        stars_played = {
            r[0] for r in
            self._db.query(GameSessionModel.star_rating)
            .filter(GameSessionModel.user_id == user_id, GameSessionModel.status == completed)
            .distinct()
            .all()
        }

        return CumulativeStats(
            total_kills=row.total_kills,
            total_score=row.total_score,
            total_waves=row.total_waves,
            total_sessions=row.total_sessions,
            stars_played=stars_played,
        )

    @staticmethod
    def _to_domain(row: GameSessionModel) -> GameSession:
        session = GameSession(
            id=row.id,
            user_id=row.user_id,
            level=Level(row.star_rating),
            status=SessionStatus(row.status),
            current_wave=row.current_wave,
            gold=row.gold,
            hp=row.hp,
            score=row.score,
            kills=row.kills,
            waves_survived=row.waves_survived,
            initial_answer=bool(row.initial_answer),
            started_at=_ensure_utc(row.started_at),
            ended_at=_ensure_utc(row.ended_at),
        )
        session.kill_value = row.kill_value
        session.cost_total = row.cost_total
        session.time_total = row.time_total
        session.health_origin = row.health_origin
        session.health_final = row.health_final
        session.time_exclude_prepare = row.time_exclude_prepare
        session.total_score = row.total_score
        return session


class StartedAtMutationError(RuntimeError):
    """Raised when a caller attempts to persist a changed started_at."""


def _ensure_utc(value: datetime | None) -> datetime | None:
    # All DateTime columns are tz-aware under PG, so this is a safety net that
    # normalises any stray naive datetime to UTC before it hits downstream
    # comparisons (e.g. started_at < now - STALE_CUTOFF).
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
