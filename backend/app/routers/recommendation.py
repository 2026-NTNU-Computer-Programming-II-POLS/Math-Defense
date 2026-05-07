"""Recommendation router — Pedagogical_Backlog_Spec.md §28.

Surfaces the per-user adaptive suggestions consumed by ``LevelSelectView``
and ``TalentTreeView``. Authenticated users only; the suggestion is
advisory and dismissible client-side, so this route is read-only.
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.user.aggregate import User
from app.factories import build_recommender_service
from app.limiter import limiter
from app.middleware.auth import get_current_user
from app.schemas.recommendation import RecommendationOut

router = APIRouter(prefix="/api/recommendation", tags=["recommendation"])


@router.get("/me", response_model=RecommendationOut)
@limiter.limit("60/minute")
def my_recommendation(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rec = build_recommender_service(db).get_recommendation(user.id)
    return RecommendationOut(
        star=rec.star,
        weighted_mean=rec.weighted_mean,
        lowest_competency=rec.lowest_competency.value,
        lowest_mean=rec.lowest_mean,
        talent_node_id=rec.talent_node_id,
    )
