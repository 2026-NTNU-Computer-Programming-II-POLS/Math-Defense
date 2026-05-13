"""Application service factories.

Centralised so routers and middleware share a single construction path.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.application.achievement_service import AchievementApplicationService
from app.application.admin_service import AdminApplicationService
from app.application.challenge_service import ChallengeApplicationService
from app.application.season_service import SeasonApplicationService
from app.application.assessment_service import AssessmentApplicationService
from app.application.auth_service import AuthApplicationService
from app.application.class_service import ClassApplicationService
from app.application.leaderboard_service import LeaderboardApplicationService
from app.application.recommender_service import RecommenderApplicationService
from app.application.replay_service import ReplayApplicationService
from app.application.session_service import SessionApplicationService
from app.application.study_service import StudyApplicationService
from app.application.talent_service import TalentApplicationService
from app.application.territory_recommendation_service import (
    TerritoryRecommendationApplicationService,
)
from app.application.territory_service import TerritoryApplicationService
from app.infrastructure.persistence.achievement_repository import (
    SqlAlchemyAchievementRepository,
)
from app.infrastructure.persistence.challenge_repository import (
    SqlAlchemyChallengeRepository,
)
from app.domain.assessment import Q_MATRIX
from app.infrastructure.persistence.class_repository import SqlAlchemyClassRepository
from app.infrastructure.persistence.competency_state_repository import (
    SqlAlchemyCompetencyStateRepository,
)
from app.infrastructure.persistence.leaderboard_repository import (
    SqlAlchemyLeaderboardRepository,
)
from app.config import settings
from app.infrastructure.email_service import SmtpEmailService
from app.infrastructure.persistence.email_verification_repository import (
    SqlAlchemyEmailVerificationRepository,
)
from app.infrastructure.persistence.login_attempt_repository import (
    SqlAlchemyLoginAttemptRepository,
)
from app.infrastructure.persistence.season_repository import (
    SqlAlchemySeasonRepository,
)
from app.infrastructure.persistence.session_event_repository import (
    SqlAlchemySessionEventRepository,
)
from app.infrastructure.persistence.session_repository import (
    SqlAlchemySessionRepository,
)
from app.infrastructure.persistence.study_repository import (
    SqlAlchemyStudyRepository,
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
from app.infrastructure.persistence.refresh_token_repository import (
    SqlAlchemyRefreshTokenRepository,
)
from app.infrastructure.persistence.user_repository import SqlAlchemyUserRepository
from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

if TYPE_CHECKING:
    from sqlalchemy.orm import Session as DbSession

# B-ARCH-11: every builder previously instantiated its own
# ``SqlAlchemyUnitOfWork(db)``. Multiple builders in the same request meant
# multiple UoW wrappers — harmless because the underlying SQLAlchemy session
# is shared, but architecturally noisy. Cache one UoW per ``db`` (which is
# already request-scoped via ``Depends(get_db)``) so the request gets a
# single UoW that is threaded through every service it touches.
_UOW_ATTR = "_arch_request_uow"


def _get_uow(db: "DbSession") -> SqlAlchemyUnitOfWork:
    uow = getattr(db, _UOW_ATTR, None)
    if uow is None:
        uow = SqlAlchemyUnitOfWork(db)
        setattr(db, _UOW_ATTR, uow)
    return uow


def build_auth_service(db: "DbSession") -> AuthApplicationService:
    return AuthApplicationService(
        user_repo=SqlAlchemyUserRepository(db),
        login_attempt_repo=SqlAlchemyLoginAttemptRepository(db),
        token_denylist_repo=SqlAlchemyTokenDenylistRepository(db),
        email_verification_repo=SqlAlchemyEmailVerificationRepository(db),
        email_svc=SmtpEmailService(settings),
        uow=_get_uow(db),
        refresh_token_repo=SqlAlchemyRefreshTokenRepository(db),
    )


def build_admin_service(db: "DbSession") -> AdminApplicationService:
    return AdminApplicationService(
        user_repo=SqlAlchemyUserRepository(db),
        class_repo=SqlAlchemyClassRepository(db),
        uow=_get_uow(db),
    )


def build_class_service(db: "DbSession") -> ClassApplicationService:
    return ClassApplicationService(
        class_repo=SqlAlchemyClassRepository(db),
        user_repo=SqlAlchemyUserRepository(db),
        uow=_get_uow(db),
        territory_repo=SqlAlchemyTerritoryRepository(db),
        session_repo=SqlAlchemySessionRepository(db),
    )


def build_replay_service(db: "DbSession") -> ReplayApplicationService:
    return ReplayApplicationService(
        session_repo=SqlAlchemySessionRepository(db),
        event_repo=SqlAlchemySessionEventRepository(db),
        uow=_get_uow(db),
    )


def build_session_service(db: "DbSession") -> SessionApplicationService:
    return SessionApplicationService(
        session_repo=SqlAlchemySessionRepository(db),
        leaderboard_repo=SqlAlchemyLeaderboardRepository(db),
        uow=_get_uow(db),
        achievement_svc=build_achievement_service(db),
        territory_repo=SqlAlchemyTerritoryRepository(db),
        assessment_svc=build_assessment_service(db),
        user_repo=SqlAlchemyUserRepository(db),
        challenge_repo=SqlAlchemyChallengeRepository(db),
        # B-BUG-8: wire the replay event repo so end_session can derive
        # waves_survived from the persisted log instead of trusting client.
        event_repo=SqlAlchemySessionEventRepository(db),
    )


def build_challenge_service(db: "DbSession") -> ChallengeApplicationService:
    return ChallengeApplicationService(
        challenge_repo=SqlAlchemyChallengeRepository(db),
        uow=_get_uow(db),
    )


def build_assessment_service(db: "DbSession") -> AssessmentApplicationService:
    return AssessmentApplicationService(
        competency_repo=SqlAlchemyCompetencyStateRepository(db),
        q_matrix=Q_MATRIX,
        uow=_get_uow(db),
        class_repo=SqlAlchemyClassRepository(db),
        user_repo=SqlAlchemyUserRepository(db),
    )


def build_recommender_service(db: "DbSession") -> RecommenderApplicationService:
    return RecommenderApplicationService(
        competency_repo=SqlAlchemyCompetencyStateRepository(db),
    )


def build_leaderboard_service(db: "DbSession") -> LeaderboardApplicationService:
    return LeaderboardApplicationService(
        leaderboard_repo=SqlAlchemyLeaderboardRepository(db),
        session_repo=SqlAlchemySessionRepository(db),
        uow=_get_uow(db),
    )


def build_achievement_service(db: "DbSession") -> AchievementApplicationService:
    return AchievementApplicationService(
        achievement_repo=SqlAlchemyAchievementRepository(db),
        session_repo=SqlAlchemySessionRepository(db),
        uow=_get_uow(db),
        season_repo=SqlAlchemySeasonRepository(db),
    )


def build_season_service(db: "DbSession") -> SeasonApplicationService:
    return SeasonApplicationService(
        season_repo=SqlAlchemySeasonRepository(db),
        uow=_get_uow(db),
    )


def build_territory_service(db: "DbSession") -> TerritoryApplicationService:
    return TerritoryApplicationService(
        territory_repo=SqlAlchemyTerritoryRepository(db),
        class_repo=SqlAlchemyClassRepository(db),
        session_repo=SqlAlchemySessionRepository(db),
        uow=_get_uow(db),
    )


def build_territory_recommendation_service(
    db: "DbSession",
) -> TerritoryRecommendationApplicationService:
    return TerritoryRecommendationApplicationService(
        session_repo=SqlAlchemySessionRepository(db),
        territory_repo=SqlAlchemyTerritoryRepository(db),
        class_repo=SqlAlchemyClassRepository(db),
    )


def build_study_service(db: "DbSession") -> StudyApplicationService:
    return StudyApplicationService(
        study_repo=SqlAlchemyStudyRepository(db),
        uow=_get_uow(db),
    )


def build_talent_service(db: "DbSession") -> TalentApplicationService:
    return TalentApplicationService(
        talent_repo=SqlAlchemyTalentRepository(db),
        achievement_repo=SqlAlchemyAchievementRepository(db),
        uow=_get_uow(db),
    )
