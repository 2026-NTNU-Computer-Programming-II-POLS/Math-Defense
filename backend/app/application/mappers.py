"""Aggregate -> Pydantic DTO mappers.

Keeps the domain layer free of Pydantic imports while making routers one-liners.
"""
from __future__ import annotations

from app.domain.session.aggregate import GameSession
from app.schemas.game_session import SessionOut


def session_to_out(session: GameSession) -> SessionOut:
    return SessionOut(
        id=session.id,
        level=int(session.level),
        status=session.status.value,
        current_wave=session.current_wave,
        gold=session.gold,
        hp=session.hp,
        score=session.score,
        started_at=session.started_at,
        ended_at=session.ended_at,
    )
