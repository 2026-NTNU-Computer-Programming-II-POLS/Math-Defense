"""SessionApplicationService — 編排 GameSession 的 Use Cases"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.domain.value_objects import Level, Score, GameResult
from app.domain.session.aggregate import GameSession
from app.domain.session.events import SessionCompleted
from app.domain.leaderboard.aggregate import LeaderboardEntry

if TYPE_CHECKING:
    from app.domain.session.repository import GameSessionRepository
    from app.domain.leaderboard.repository import LeaderboardRepository
    from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

logger = logging.getLogger(__name__)


class SessionApplicationService:
    """
    協調場次的建立、更新、結束。
    消費 SessionCompleted 事件以自動建立排行榜條目。
    """

    def __init__(
        self,
        session_repo: GameSessionRepository,
        leaderboard_repo: LeaderboardRepository,
        uow: SqlAlchemyUnitOfWork,
    ) -> None:
        self._session_repo = session_repo
        self._leaderboard_repo = leaderboard_repo
        self._uow = uow

    def create_session(self, user_id: str, level: int) -> GameSession:
        with self._uow:
            # 1. 放棄過期場次
            stale = self._session_repo.find_stale_sessions(user_id)
            for s in stale:
                s.abandon()
            self._session_repo.save_all(stale)

            # 2. 放棄現有 active 場次（每人限一個）
            existing = self._session_repo.find_active_by_user(user_id)
            if existing:
                existing.abandon()
                self._session_repo.save(existing)

            # 3. 建立新場次
            session = GameSession.create(user_id, Level(level))
            self._session_repo.save(session)
            self._uow.commit()
            return session

    def update_session(
        self,
        session_id: str,
        user_id: str,
        current_wave: int | None = None,
        gold: int | None = None,
        hp: int | None = None,
        score: int | None = None,
    ) -> GameSession:
        with self._uow:
            session = self._get_session(session_id, user_id)
            session.update_progress(
                current_wave=current_wave,
                gold=gold,
                hp=hp,
                score=score,
            )
            self._session_repo.save(session)
            self._uow.commit()
            return session

    def end_session(
        self,
        session_id: str,
        user_id: str,
        score: int,
        kills: int,
        waves_survived: int,
    ) -> GameSession:
        with self._uow:
            session = self._get_session(session_id, user_id)
            result = GameResult(
                score=Score(score),
                kills=kills,
                waves_survived=waves_survived,
            )
            session.complete(result)
            self._session_repo.save(session)

            # 消費 SessionCompleted 事件 → 自動建立排行榜條目
            for event in session.collect_events():
                if isinstance(event, SessionCompleted):
                    self._handle_session_completed(event)

            self._uow.commit()
            session.clear_events()  # commit 成功後才清除事件
            logger.info(
                "Session ended: session=%s user=%s score=%d",
                session.id, user_id, score,
            )
            return session

    def _handle_session_completed(self, event: SessionCompleted) -> None:
        """處理場次完成事件 — 自動建立排行榜條目（冪等）"""
        existing = self._leaderboard_repo.find_by_session_id(event.session_id)
        if existing:
            return
        entry = LeaderboardEntry.create_from_session(
            user_id=event.user_id,
            level=event.level,
            score=event.score,
            kills=event.kills,
            waves_survived=event.waves_survived,
            session_id=event.session_id,
        )
        self._leaderboard_repo.save(entry)

    def _get_session(self, session_id: str, user_id: str) -> GameSession:
        session = self._session_repo.find_by_id(session_id, user_id)
        if not session:
            raise SessionNotFoundError("Session 不存在")
        return session


class SessionNotFoundError(Exception):
    pass
