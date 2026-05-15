"""LeaderboardApplicationService — Leaderboard Use Cases"""
from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from app.domain.errors import (
    ConstraintViolationError,
    DuplicateSubmissionError,
    PermissionDeniedError,
    SessionValidationError,
)
from app.domain.value_objects import Score, SessionStatus
from app.domain.leaderboard.aggregate import LeaderboardEntry
from app.domain.leaderboard.view import PersonalHistoryEntry, RankedLeaderboardEntry

if TYPE_CHECKING:
    from app.application.ports import UnitOfWork
    from app.domain.leaderboard.repository import LeaderboardRepository
    from app.domain.session.repository import GameSessionRepository

logger = logging.getLogger(__name__)


class LeaderboardApplicationService:

    def __init__(
        self,
        leaderboard_repo: LeaderboardRepository,
        session_repo: GameSessionRepository,
        uow: UnitOfWork,
    ) -> None:
        self._leaderboard_repo = leaderboard_repo
        self._session_repo = session_repo
        self._uow = uow

    def get_leaderboard(
        self,
        level: int | None,
        page: int,
        per_page: int,
        class_id: str | None = None,
        challenge_id: str | None = None,
    ) -> tuple[list[RankedLeaderboardEntry], int]:
        if challenge_id is not None:
            return self._leaderboard_repo.query_ranked_by_challenge(
                challenge_id, page, per_page
            )
        if class_id is not None:
            return self._leaderboard_repo.query_ranked_by_class(class_id, page, per_page)
        if level is None:
            return self._leaderboard_repo.query_ranked_global(page, per_page)
        return self._leaderboard_repo.query_ranked_by_level(level, page, per_page)

    def get_user_history(
        self,
        user_id: str,
        level: int | None = None,
        page: int = 1,
        per_page: int = 50,
    ) -> tuple[list[PersonalHistoryEntry], int]:
        """Personal-best timeline, paginated.

        Returns (entries_for_page, total_count). PB flags are computed over
        the full history first so the flag is stable regardless of page —
        an entry that is a personal best is always marked as such, even if
        it falls on page 3. The repo returns the full list (one user's
        sessions); we paginate in Python after PB detection.
        """
        history = self._leaderboard_repo.get_user_history(user_id, level)
        total = len(history)
        # Walk chronologically (ASC) to compute the rolling-max PB set.
        chronological = list(reversed(history))
        running_best = -1
        pb_ids: set[str] = set()
        for entry in chronological:
            if entry.score.value > running_best:
                running_best = entry.score.value
                pb_ids.add(entry.id)
        # Build the full annotated list (DESC order), then slice for the page.
        annotated = [
            PersonalHistoryEntry(
                id=entry.id,
                level=int(entry.level),
                score=entry.score.value,
                kills=entry.kills,
                waves_survived=entry.waves_survived,
                created_at=entry.created_at,
                is_personal_best=entry.id in pb_ids,
            )
            for entry in history
        ]
        start = (page - 1) * per_page
        return annotated[start : start + per_page], total

    def submit_score(
        self,
        user_id: str,
        kills: int,
        waves_survived: int,
        session_id: str,
    ) -> dict:
        with self._uow:
            # Lock the session row up front so the duplicate-submission check and
            # the insert below are serialised against concurrent submissions for
            # the same session_id. Without this, two concurrent POSTs can both
            # pass find_by_session_id and only the DB unique constraint would
            # catch the loser (raising 500 instead of a clean 409).
            session = self._session_repo.find_by_id_for_update(session_id, user_id)
            if not session:
                raise SessionValidationError("Session not found")
            if session.user_id != user_id:
                raise PermissionDeniedError("Not authorized to access this session")
            if session.status != SessionStatus.COMPLETED:
                raise SessionValidationError("Session is not completed")
            # Backlog §20: practice-mode sessions are leaderboard-ineligible.
            if getattr(session, "practice_mode", False):
                raise SessionValidationError(
                    "Practice-mode sessions are not eligible for the leaderboard"
                )

            # The leaderboard entry below uses the session's authoritative
            # kills / waves_survived (capped by GameSession.complete() at the
            # aggregate boundary), so client-supplied values are ignored.
            # No cap re-check is needed here — duplicating LEVEL_MAX_* would
            # split the rule across two layers.

            # Domain rule: duplicate submission check
            existing = self._leaderboard_repo.find_by_session_id(session_id)
            if existing:
                raise DuplicateSubmissionError("Score already submitted for this session")

            # Use the session's authoritative level, score, kills, and waves —
            # NOT client-reported values — to prevent forgery (C-01, M-7).
            entry = LeaderboardEntry(
                id=str(uuid.uuid4()),
                user_id=user_id,
                level=session.level,
                score=Score(session.score),
                kills=session.kills,
                waves_survived=session.waves_survived,
                session_id=session_id,
                challenge_id=session.challenge_id,
            )
            try:
                self._leaderboard_repo.save(entry)
                self._uow.commit()
            except ConstraintViolationError as e:
                # Belt-and-braces behind the row-lock in find_by_id_for_update:
                # a duplicate submission that slips past the lock still trips
                # the unique constraint. Match the exact constraint so unrelated
                # FK violations don't get silently mis-mapped to 409.
                if e.constraint_name == "uq_leaderboard_session_id":
                    raise DuplicateSubmissionError("Score already submitted for this session") from e
                raise

            logger.info(
                "Score submitted: user=%s level=%d score=%d",
                user_id, int(session.level), session.score,
            )
            return {"id": entry.id, "score": entry.score.value}
