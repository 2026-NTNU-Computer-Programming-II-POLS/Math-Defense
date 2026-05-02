"""LeaderboardApplicationService — Leaderboard Use Cases"""
from __future__ import annotations

import logging
import uuid
from typing import TYPE_CHECKING

from sqlalchemy.exc import IntegrityError

from app.domain.constraints import LEVEL_MAX_KILLS, LEVEL_MAX_WAVES
from app.domain.errors import (
    DuplicateSubmissionError,
    PermissionDeniedError,
    SessionValidationError,
)
from app.domain.value_objects import Score, SessionStatus
from app.domain.leaderboard.aggregate import LeaderboardEntry
from app.domain.leaderboard.view import RankedLeaderboardEntry
from app.utils.integrity import is_constraint_violation

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
        class_id: str | None = None,
    ) -> tuple[list[RankedLeaderboardEntry], int]:
        if class_id is not None:
            return self._leaderboard_repo.query_ranked_by_class(class_id, page, per_page)
        if level is None:
            return self._leaderboard_repo.query_ranked_global(page, per_page)
        return self._leaderboard_repo.query_ranked_by_level(level, page, per_page)

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

            # Cross-validate client-reported ancillary stats against server
            # state. `score` and `level` are taken directly from the session
            # below; `kills`/`waves_survived` aren't persisted on the session
            # (they live only on the SessionCompleted event), so we re-apply
            # the same per-level ceilings the aggregate enforced at complete()
            # time. This closes the A1/V1 forgery path where a client posts
            # inflated ancillary stats on an otherwise legitimate session.
            level_int = int(session.level)
            if waves_survived > session.waves_survived:
                raise SessionValidationError(
                    "waves_survived exceeds server-tracked wave count"
                )
            wave_cap = LEVEL_MAX_WAVES.get(level_int)
            if wave_cap is not None and waves_survived > wave_cap:
                raise SessionValidationError(
                    "waves_survived exceeds level maximum"
                )
            kill_cap = LEVEL_MAX_KILLS.get(level_int)
            if kill_cap is not None and kills > kill_cap:
                raise SessionValidationError(
                    "kills exceed level maximum"
                )

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
            )
            self._leaderboard_repo.save(entry)
            try:
                self._uow.commit()
            except IntegrityError as e:
                # Belt-and-braces behind the row-lock in find_by_id_for_update:
                # a duplicate submission that slips past the lock still trips
                # the unique constraint. Match the exact constraint so unrelated
                # FK violations don't get silently mis-mapped to 409.
                if is_constraint_violation(e, constraint_name="uq_leaderboard_session_id"):
                    raise DuplicateSubmissionError("Score already submitted for this session") from e
                raise

            logger.info(
                "Score submitted: user=%s level=%d score=%d",
                user_id, int(session.level), session.score,
            )
            return {"id": entry.id, "score": entry.score.value}
