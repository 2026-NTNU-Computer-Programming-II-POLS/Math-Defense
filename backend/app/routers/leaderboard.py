"""leaderboard router — thin Controller"""
import logging

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.application.leaderboard_service import LeaderboardApplicationService
from app.db.database import get_db
from app.domain.user.aggregate import User
from app.infrastructure.persistence.leaderboard_repository import SqlAlchemyLeaderboardRepository
from app.infrastructure.persistence.session_repository import SqlAlchemySessionRepository
from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from app.limiter import limiter
from app.middleware.auth import get_current_user
from app.schemas.leaderboard import (
    LeaderboardEntryOut,
    LeaderboardResponse,
    ScoreSubmission,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


def _get_service(db: Session) -> LeaderboardApplicationService:
    return LeaderboardApplicationService(
        leaderboard_repo=SqlAlchemyLeaderboardRepository(db),
        session_repo=SqlAlchemySessionRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
    )


@router.get("", response_model=LeaderboardResponse)
def get_leaderboard(
    level: int | None = Query(None, ge=1, le=4),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    entries_data, total = _get_service(db).get_leaderboard(level, page, per_page)
    entries = [LeaderboardEntryOut(**e) for e in entries_data]
    return LeaderboardResponse(entries=entries, total=total)


@router.post("", status_code=201)
@limiter.limit("10/minute")
def submit_score(
    request: Request,
    req: ScoreSubmission,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_service(db).submit_score(
        user_id=current_user.id,
        level=req.level,
        score=req.score,
        kills=req.kills,
        waves_survived=req.waves_survived,
        session_id=req.session_id,
    )
