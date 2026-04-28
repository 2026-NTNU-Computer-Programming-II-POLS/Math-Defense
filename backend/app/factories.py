"""Application service factories.

Centralised so routers and middleware share a single construction path.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.application.achievement_service import AchievementApplicationService
from app.application.admin_service import AdminApplicationService
from app.application.auth_service import AuthApplicationService
from app.application.class_service import ClassApplicationService
from app.application.leaderboard_service import LeaderboardApplicationService
from app.application.session_service import SessionApplicationService
from app.application.talent_service import TalentApplicationService
from app.application.territory_service import TerritoryApplicationService
from app.infrastructure.persistence.achievement_repository import (
    SqlAlchemyAchievementRepository,
)
from app.infrastructure.persistence.class_repository import SqlAlchemyClassRepository
from app.infrastructure.persistence.leaderboard_repository import (
    SqlAlchemyLeaderboardRepository,
)
from app.infrastructure.persistence.login_attempt_repository import (
    SqlAlchemyLoginAttemptRepository,
)
from app.infrastructure.persistence.session_repository import (
    SqlAlchemySessionRepository,
)
from app.infrastructure.persistence.talent_repository import (
    SqlAlchemyTalentRepository,
)
from app.infrastructure.persistence.territory_repository import (
    SqlAlchemyTerritoryRepository,
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


def build_admin_service(db: "DbSession") -> AdminApplicationService:
    return AdminApplicationService(
        user_repo=SqlAlchemyUserRepository(db),
        class_repo=SqlAlchemyClassRepository(db),
    )


def build_class_service(db: "DbSession") -> ClassApplicationService:
    return ClassApplicationService(
        class_repo=SqlAlchemyClassRepository(db),
        user_repo=SqlAlchemyUserRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
    )


def build_session_service(db: "DbSession") -> SessionApplicationService:
    return SessionApplicationService(
        session_repo=SqlAlchemySessionRepository(db),
        leaderboard_repo=SqlAlchemyLeaderboardRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
        achievement_svc=build_achievement_service(db),
        territory_repo=SqlAlchemyTerritoryRepository(db),
    )


def build_leaderboard_service(db: "DbSession") -> LeaderboardApplicationService:
    return LeaderboardApplicationService(
        leaderboard_repo=SqlAlchemyLeaderboardRepository(db),
        session_repo=SqlAlchemySessionRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
    )


def build_achievement_service(db: "DbSession") -> AchievementApplicationService:
    return AchievementApplicationService(
        achievement_repo=SqlAlchemyAchievementRepository(db),
        session_repo=SqlAlchemySessionRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
    )


def build_territory_service(db: "DbSession") -> TerritoryApplicationService:
    return TerritoryApplicationService(
        territory_repo=SqlAlchemyTerritoryRepository(db),
        class_repo=SqlAlchemyClassRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
    )


def build_talent_service(db: "DbSession") -> TalentApplicationService:
    return TalentApplicationService(
        talent_repo=SqlAlchemyTalentRepository(db),
        achievement_repo=SqlAlchemyAchievementRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
    )
