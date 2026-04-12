"""leaderboard router — thin Controller"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User
from app.schemas.leaderboard import ScoreSubmission, LeaderboardResponse, LeaderboardEntryOut
from app.middleware.auth import get_current_user
from app.limiter import limiter
from app.application.leaderboard_service import (
    LeaderboardApplicationService,
    SessionValidationError,
    PermissionDeniedError,
    DuplicateSubmissionError,
)
from app.infrastructure.persistence.leaderboard_repository import SqlAlchemyLeaderboardRepository
from app.infrastructure.persistence.session_repository import SqlAlchemySessionRepository
from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

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
    service = _get_service(db)
    entries_data, total = service.get_leaderboard(level, page, per_page)
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
    service = _get_service(db)
    try:
        result = service.submit_score(
            user_id=current_user.id,
            level=req.level,
            score=req.score,
            kills=req.kills,
            waves_survived=req.waves_survived,
            session_id=req.session_id,
        )
    except SessionValidationError as e:
        logger.warning("Score submission rejected (validation): user=%s %s", current_user.id, e)
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionDeniedError as e:
        logger.warning("Score submission rejected (permission): user=%s %s", current_user.id, e)
        raise HTTPException(status_code=403, detail=str(e))
    except DuplicateSubmissionError as e:
        logger.warning("Score submission rejected (duplicate): user=%s %s", current_user.id, e)
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        logger.warning("Score submission rejected (invalid data): user=%s %s", current_user.id, e)
        raise HTTPException(status_code=422, detail=str(e))
    except Exception:
        logger.exception("Unexpected error in score submission: user=%s", current_user.id)
        raise
    return result
