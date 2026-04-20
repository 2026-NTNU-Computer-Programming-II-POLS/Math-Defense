"""Application service factories.

Centralised so routers and middleware share a single construction path.
Replaces four near-identical ``_get_service(db)`` helpers that had been
copy-pasted across ``routers/*`` and ``middleware/auth``.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.application.auth_service import AuthApplicationService
from app.application.leaderboard_service import LeaderboardApplicationService
from app.application.session_service import SessionApplicationService
from app.infrastructure.persistence.leaderboard_repository import (
    SqlAlchemyLeaderboardRepository,
)
from app.infrastructure.persistence.login_attempt_repository import (
    SqlAlchemyLoginAttemptRepository,
)
from app.infrastructure.persistence.session_repository import (
    SqlAlchemySessionRepository,
)
from app.infrastructure.persistence.token_denylist_repository import (
    SqlAlchemyTokenDenylistRepository,
)
from app.infrastructure.persistence.user_repository import SqlAlchemyUserRepository
from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

if TYPE_CHECKING:
    from sqlalchemy.orm import Session as DbSession


def build_auth_service(db: "DbSession") -> AuthApplicationService:
    return AuthApplicationService(
        user_repo=SqlAlchemyUserRepository(db),
        login_attempt_repo=SqlAlchemyLoginAttemptRepository(db),
        token_denylist_repo=SqlAlchemyTokenDenylistRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
    )


def build_session_service(db: "DbSession") -> SessionApplicationService:
    return SessionApplicationService(
        session_repo=SqlAlchemySessionRepository(db),
        leaderboard_repo=SqlAlchemyLeaderboardRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
    )


def build_leaderboard_service(db: "DbSession") -> LeaderboardApplicationService:
    return LeaderboardApplicationService(
        leaderboard_repo=SqlAlchemyLeaderboardRepository(db),
        session_repo=SqlAlchemySessionRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
    )
