"""Aggregate -> Pydantic DTO mappers.

Keeps the domain layer free of Pydantic imports while making routers one-liners.
"""
from __future__ import annotations

from app.domain.session.aggregate import GameSession
from app.schemas.game_session import SessionOut


def session_to_out(
    session: GameSession,
    newly_unlocked: list[dict] | None = None,
    ia_recent_accuracy: float = 0.0,
) -> SessionOut:
    return SessionOut(
        id=session.id,
        star_rating=int(session.level),
        status=session.status.value,
        current_wave=session.current_wave,
        gold=session.gold,
        hp=session.hp,
        score=session.score,
        started_at=session.started_at,
        ended_at=session.ended_at,
        practice_mode=getattr(session, "practice_mode", False),
        challenge_id=getattr(session, "challenge_id", None),
        # Backlog §24 — surfaced so the Replay player can re-seed the engine.
        rng_seed=getattr(session, "rng_seed", None),
        # 施工計畫書 §3.8 — surfaced so the Replay player branches the right way.
        replay_version=getattr(session, "replay_version", 1) or 1,
        newly_unlocked_achievements=newly_unlocked or [],
        ia_recent_accuracy=ia_recent_accuracy,
    )
