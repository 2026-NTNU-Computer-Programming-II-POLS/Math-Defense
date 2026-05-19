"""leaderboard router — thin Controller"""
import logging

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.errors import InvalidTokenError
from app.domain.user.aggregate import User
from app.factories import build_class_service, build_leaderboard_service
from app.limiter import limiter
from app.middleware.auth import get_current_user, get_current_user_optional
from app.schemas.leaderboard import (
    LeaderboardEntryOut,
    LeaderboardResponse,
    PersonalHistoryEntryOut,
    PersonalHistoryOut,
    ScoreSubmission,
    ScoreSubmissionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


# Global and per-level views are public. The class-scoped view requires auth
# and membership/ownership to prevent enumeration of class data by strangers.
@router.get("", response_model=LeaderboardResponse)
@limiter.limit("30/minute")
def get_leaderboard(
    request: Request,
    level: int | None = Query(None, ge=1, le=5),
    class_id: str | None = Query(None),
    challenge_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    if class_id is not None:
        if current_user is None:
            raise InvalidTokenError("Authentication required to view class leaderboard")
        build_class_service(db).verify_access(class_id, current_user.id, current_user.role)
    if challenge_id is not None and current_user is None:
        # Challenge leaderboards only render for authenticated viewers — keeps
        # the surface symmetric with /api/challenges/{id} which also requires auth.
        raise InvalidTokenError("Authentication required to view challenge leaderboard")
    ranked, total = build_leaderboard_service(db).get_leaderboard(
        level, page, per_page, class_id=class_id, challenge_id=challenge_id,
    )
    # M-08: anonymize player names for unauthenticated viewers to avoid
    # exposing student identities in an educational context.
    def _display_name(r) -> str:
        if current_user is not None:
            return r.player_name
        name = r.player_name
        if not name:
            return "*"
        if len(name) <= 2:
            return name[0] + "*"
        return name[0] + "*" * (len(name) - 2) + name[-1]

    entries = [
        LeaderboardEntryOut(
            id=r.id,
            rank=r.rank,
            player_name=_display_name(r),
            level=r.level,
            score=r.score,
            total_score=r.total_score,
            kills=r.kills,
            waves_survived=r.waves_survived,
            created_at=r.created_at,
        )
        for r in ranked
    ]
    return LeaderboardResponse(entries=entries, total=total)


@router.get("/me", response_model=PersonalHistoryOut)
@limiter.limit("30/minute")
def get_my_history(
    request: Request,
    level: int | None = Query(None, ge=1, le=5),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Personal-best timeline for the authenticated user.

    Authorisation is implicit: the user_id is read from the verified token,
    never from a query/body parameter, so the endpoint cannot return another
    user's history regardless of the query string.
    """
    history, total = build_leaderboard_service(db).get_user_history(
        current_user.id, level, page, per_page
    )
    entries = [
        PersonalHistoryEntryOut(
            id=h.id,
            level=h.level,
            score=h.score,
            kills=h.kills,
            waves_survived=h.waves_survived,
            created_at=h.created_at,
            is_personal_best=h.is_personal_best,
        )
        for h in history
    ]
    return PersonalHistoryOut(entries=entries, total=total)


@router.post("", status_code=201, response_model=ScoreSubmissionResponse)
@limiter.limit("10/minute")
def submit_score(
    request: Request,
    req: ScoreSubmission,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return build_leaderboard_service(db).submit_score(
        user_id=current_user.id,
        kills=req.kills,
        waves_survived=req.waves_survived,
        session_id=str(req.session_id),
    )
