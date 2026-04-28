from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.user.aggregate import User
from app.factories import build_talent_service
from app.limiter import limiter
from app.middleware.auth import get_current_user
from app.schemas.talent import TalentTreeOut, TalentModifiersOut

router = APIRouter(prefix="/api/talents", tags=["talents"])


@router.get("", response_model=TalentTreeOut)
@limiter.limit("60/minute")
def get_talent_tree(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return build_talent_service(db).get_tree(current_user.id)


@router.get("/modifiers", response_model=TalentModifiersOut)
@limiter.limit("60/minute")
def get_talent_modifiers(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    modifiers = build_talent_service(db).get_modifiers(current_user.id)
    return {"modifiers": modifiers}


@router.post("/{node_id}/allocate", response_model=TalentTreeOut)
@limiter.limit("30/minute")
def allocate_talent_point(
    request: Request,
    node_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return build_talent_service(db).allocate_point(current_user.id, node_id)


@router.post("/reset", response_model=TalentTreeOut)
@limiter.limit("10/minute")
def reset_talent_tree(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return build_talent_service(db).reset_tree(current_user.id)
