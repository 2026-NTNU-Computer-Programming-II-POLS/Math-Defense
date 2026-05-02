"""Grabbing Territory router

CSRF posture: all state-changing endpoints accept JSON bodies and require a
Bearer token in the Authorization header.  Browser-initiated cross-origin
requests cannot set custom Authorization headers, so CSRF tokens are
unnecessary here.
"""
import logging

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.factories import build_territory_service
from app.limiter import limiter
from app.middleware.auth import get_current_user, require_role
from app.schemas.territory import (
    ActivityDetailOut,
    ActivityOut,
    CreateActivityRequest,
    ExternalRankingEntryOut,
    OccupationOut,
    PlayResultOut,
    PlayTerritoryRequest,
    RankingEntryOut,
    SlotOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/activities", tags=["territory"])


@router.post("", response_model=ActivityOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def create_activity(
    request: Request,
    req: CreateActivityRequest,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    activity = build_territory_service(db).create_activity(
        teacher_id=user.id,
        user_role=user.role,
        title=req.title,
        deadline=req.deadline,
        class_id=req.class_id,
        slots=[s.model_dump() for s in req.slots],
    )
    return _activity_out(activity)


@router.get("", response_model=list[ActivityOut])
@limiter.limit("30/minute")
def list_activities(
    request: Request,
    class_id: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    activities = build_territory_service(db).list_activities(
        user_id=user.id,
        user_role=user.role,
        class_id=class_id,
    )
    return [_activity_out(a) for a in activities]


@router.get("/{activity_id}", response_model=ActivityDetailOut)
@limiter.limit("30/minute")
def get_activity_detail(
    request: Request,
    activity_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    detail = build_territory_service(db).get_activity_detail(activity_id, user.id, user.role)
    return ActivityDetailOut(
        activity=_activity_out(detail["activity"]),
        slots=[_slot_out(s, user.id, user.role) for s in detail["slots"]],
    )


@router.post("/{activity_id}/slots/{slot_id}/play", response_model=PlayResultOut)
@limiter.limit("30/minute")
def play_territory(
    request: Request,
    activity_id: str,
    slot_id: str,
    req: PlayTerritoryRequest,
    user: User = Depends(require_role(Role.STUDENT)),
    db: Session = Depends(get_db),
):
    result = build_territory_service(db).play_territory(
        activity_id=activity_id,
        slot_id=slot_id,
        student_id=user.id,
        session_id=req.session_id,
    )
    occ = result["occupation"]
    return PlayResultOut(
        seized=result["seized"],
        occupation=_occupation_out(occ, user.id, user.role) if occ is not None else None,
    )


@router.get("/{activity_id}/rankings", response_model=list[RankingEntryOut])
@limiter.limit("30/minute")
def get_activity_rankings(
    request: Request,
    activity_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return build_territory_service(db).get_activity_rankings(activity_id, user.id, user.role)


@router.get("/{activity_id}/external-rankings", response_model=list[ExternalRankingEntryOut])
@limiter.limit("30/minute")
def get_activity_external_rankings(
    request: Request,
    activity_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return build_territory_service(db).get_activity_external_rankings(activity_id, user.id, user.role)


@router.post("/{activity_id}/settle", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
def settle_activity(
    request: Request,
    activity_id: str,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    build_territory_service(db).settle_activity(
        activity_id=activity_id,
        requester_id=user.id,
        requester_role=user.role,
    )


def _activity_out(a) -> ActivityOut:
    return ActivityOut(
        id=a.id,
        class_id=a.class_id,
        teacher_id=a.teacher_id,
        title=a.title,
        deadline=a.deadline,
        settled=a.settled,
        settled_at=getattr(a, "settled_at", None),
        settled_by=getattr(a, "settled_by", None),
        created_at=a.created_at,
    )


def _slot_out(s, requesting_user_id: str | None = None, requesting_user_role: Role | None = None) -> SlotOut:
    return SlotOut(
        id=s.id,
        activity_id=s.activity_id,
        star_rating=s.star_rating,
        slot_index=s.slot_index,
        path_config=s.path_config,
        occupation=_occupation_out(s.occupation, requesting_user_id, requesting_user_role) if s.occupation else None,
    )


def _occupation_out(o, requesting_user_id: str | None = None, requesting_user_role: Role | None = None) -> OccupationOut:
    is_own = requesting_user_id is not None and o.student_id == requesting_user_id
    show_id = is_own or requesting_user_role in (Role.TEACHER, Role.ADMIN)
    return OccupationOut(
        id=o.id,
        slot_id=o.slot_id,
        student_id=o.student_id if show_id else None,
        score=o.score,
        occupied_at=o.occupied_at,
        player_name=getattr(o, "player_name", None),
        is_own=is_own,
    )
