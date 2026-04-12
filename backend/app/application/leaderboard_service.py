"""LeaderboardApplicationService — Leaderboard Use Cases"""
from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from app.domain.value_objects import Level, Score, SessionStatus
from app.domain.leaderboard.aggregate import LeaderboardEntry

if TYPE_CHECKING:
    from app.domain.leaderboard.repository import LeaderboardRepository
    from app.domain.session.repository import GameSessionRepository
    from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

logger = logging.getLogger(__name__)


class LeaderboardApplicationService:

    def __init__(
        self,
        leaderboard_repo: LeaderboardRepository,
        session_repo: GameSessionRepository,
        uow: SqlAlchemyUnitOfWork,
    ) -> None:
        self._leaderboard_repo = leaderboard_repo
        self._session_repo = session_repo
        self._uow = uow

    def get_leaderboard(
        self,
        level: int | None,
        page: int,
        per_page: int,
    ) -> tuple[list[dict], int]:
        return self._leaderboard_repo.query_ranked(level, page, per_page)

    def submit_score(
        self,
        user_id: str,
        level: int,
        score: int,
        kills: int,
        waves_survived: int,
        session_id: str,
    ) -> dict:
        with self._uow:
            # Validate session ownership and status (session_id must be provided)
            session = self._session_repo.find_by_id(session_id, user_id)
            if not session:
                raise SessionValidationError("Session not found")
            if session.user_id != user_id:
                raise PermissionDeniedError("Not authorized to access this session")
            if session.status != SessionStatus.COMPLETED:
                raise SessionValidationError("Session is not completed")

            # Domain rule: duplicate submission check
            existing = self._leaderboard_repo.find_by_session_id(session_id)
            if existing:
                raise DuplicateSubmissionError("Score already submitted for this session")

            entry = LeaderboardEntry(
                id=str(uuid.uuid4()),
                user_id=user_id,
                level=Level(level),
                score=Score(score),
                kills=kills,
                waves_survived=waves_survived,
                session_id=session_id,
            )
            self._leaderboard_repo.save(entry)
            self._uow.commit()

            logger.info(
                "Score submitted: user=%s level=%d score=%d",
                user_id, level, score,
            )
            return {"id": entry.id, "score": entry.score.value}


class SessionValidationError(Exception):
    pass


class PermissionDeniedError(Exception):
    pass


class DuplicateSubmissionError(Exception):
    pass
