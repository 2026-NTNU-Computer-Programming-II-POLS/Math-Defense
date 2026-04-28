from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.user.aggregate import User
from app.factories import build_achievement_service
from app.limiter import limiter
from app.middleware.auth import get_current_user
from app.schemas.achievement import AchievementOut, AchievementSummaryOut

router = APIRouter(prefix="/api/achievements", tags=["achievements"])


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
