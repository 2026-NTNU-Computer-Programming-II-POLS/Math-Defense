"""SQLAlchemy 實作的 GameSessionRepository"""
from __future__ import annotations

from datetime import datetime, timedelta, UTC

from sqlalchemy.orm import Session as DbSession

from app.domain.session.aggregate import GameSession
from app.domain.value_objects import SessionStatus, Level
from app.models.game_session import GameSession as GameSessionModel

STALE_CUTOFF = timedelta(hours=2)


class SqlAlchemySessionRepository:

    def __init__(self, db: DbSession):
        self._db = db

    def find_by_id(self, session_id: str, user_id: str) -> GameSession | None:
        row = self._db.query(GameSessionModel).filter(
            GameSessionModel.id == session_id,
            GameSessionModel.user_id == user_id,
        ).first()
        return self._to_domain(row) if row else None

    def find_active_by_user(self, user_id: str) -> GameSession | None:
        row = self._db.query(GameSessionModel).filter(
            GameSessionModel.user_id == user_id,
            GameSessionModel.status == SessionStatus.ACTIVE.value,
        ).with_for_update().first()
        return self._to_domain(row) if row else None

    def find_stale_sessions(self, user_id: str) -> list[GameSession]:
        cutoff = datetime.now(UTC) - STALE_CUTOFF
        rows = self._db.query(GameSessionModel).filter(
            GameSessionModel.user_id == user_id,
            GameSessionModel.status == SessionStatus.ACTIVE.value,
            GameSessionModel.started_at < cutoff,
        ).all()
        return [self._to_domain(r) for r in rows]

    def save(self, session: GameSession) -> None:
        row = self._db.query(GameSessionModel).filter(
            GameSessionModel.id == session.id
        ).first()
        if row:
            row.status = session.status.value
            row.current_wave = session.current_wave
            row.gold = session.gold
            row.hp = session.hp
            row.score = session.score
            row.ended_at = session.ended_at
        else:
            row = GameSessionModel(
                id=session.id,
                user_id=session.user_id,
                level=int(session.level),
                status=session.status.value,
                current_wave=session.current_wave,
                gold=session.gold,
                hp=session.hp,
                score=session.score,
                started_at=session.started_at,
                ended_at=session.ended_at,
            )
            self._db.add(row)
        self._db.flush()

    def save_all(self, sessions: list[GameSession]) -> None:
        for s in sessions:
            self.save(s)

    @staticmethod
    def _to_domain(row: GameSessionModel) -> GameSession:
        return GameSession(
            id=row.id,
            user_id=row.user_id,
            level=Level(row.level),
            status=SessionStatus(row.status),
            current_wave=row.current_wave,
            gold=row.gold,
            hp=row.hp,
            score=row.score,
            started_at=row.started_at,
            ended_at=row.ended_at,
        )
