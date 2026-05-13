from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.user.aggregate import User
from app.factories import build_achievement_service, build_season_service
from app.limiter import limiter
from app.middleware.auth import get_current_user
from app.schemas.achievement import AchievementOut, AchievementSummaryOut
from app.schemas.season import SeasonOut

router = APIRouter(prefix="/api/achievements", tags=["achievements"])
seasons_router = APIRouter(prefix="/api/seasons", tags=["seasons"])


@router.get("", response_model=list[AchievementOut])
@limiter.limit("60/minute")
def list_achievements(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return build_achievement_service(db).get_all_for_user(current_user.id)


@router.get("/summary", response_model=AchievementSummaryOut)
@limiter.limit("60/minute")
def achievement_summary(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return build_achievement_service(db).get_summary(current_user.id)


@seasons_router.get("", response_model=list[SeasonOut])
@limiter.limit("60/minute")
def list_seasons(
    request: Request,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    """Return all seasons (active, upcoming, archived) so the Achievement view
    can render the Seasonal tab with banner + end-date metadata. Spec §22.3.
    """
    return [SeasonOut(**s) for s in build_season_service(db).list_seasons()]
