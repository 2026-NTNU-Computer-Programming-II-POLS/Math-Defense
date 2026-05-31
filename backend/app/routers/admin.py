import hashlib
import logging

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.errors import DomainValueError, PersistenceError
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.factories import build_admin_service, build_season_service
from app.infrastructure.audit_logger import record_audit_event
from app.limiter import limiter
from app.middleware.auth import require_role
from app.schemas.admin import (
    ClassSummaryOut,
    CreateTeacherRequest,
    PaginatedClassesOut,
    PaginatedUsersOut,
    SetUserActiveRequest,
    UserSummaryOut,
)
from app.schemas.season import SeasonCreateRequest, SeasonOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _anon(identifier: object) -> str:
    return hashlib.sha256(str(identifier).encode("utf-8")).hexdigest()[:10]


@router.get("/teachers", response_model=PaginatedUsersOut)
@limiter.limit("30/minute")
def list_teachers(
    request: Request,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    _user: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    offset = (page - 1) * per_page
    rows, total = build_admin_service(db).list_teachers_paginated(offset, per_page)
    return PaginatedUsersOut(items=[_to_user_out(u, cnt) for u, cnt in rows], total=total)


@router.get("/students", response_model=PaginatedUsersOut)
@limiter.limit("30/minute")
def list_students(
    request: Request,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    _user: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    offset = (page - 1) * per_page
    rows, total = build_admin_service(db).list_students_paginated(offset, per_page)
    return PaginatedUsersOut(items=[_to_user_out(u, cnt) for u, cnt in rows], total=total)


@router.get("/classes", response_model=PaginatedClassesOut)
@limiter.limit("30/minute")
def list_classes(
    request: Request,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    _user: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    offset = (page - 1) * per_page
    rows, total = build_admin_service(db).list_all_classes_paginated(offset, per_page)
    return PaginatedClassesOut(items=[_to_class_out(c, cnt) for c, cnt in rows], total=total)


@router.post("/teachers", response_model=UserSummaryOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
def create_teacher(
    request: Request,
    req: CreateTeacherRequest,
    requester: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Provision a teacher account. Closes the M-04 gap where the schema
    refuses self-service teacher registration but no admin-side path existed
    to create teachers in production.
    """
    user = build_admin_service(db).create_teacher(
        email=req.email,
        password=req.password,
        player_name=req.player_name,
    )
    logger.info("Admin provisioned teacher: admin=%s teacher_anon=%s", requester.id, _anon(user.id))
    record_audit_event(
        request,
        "ADMIN_TEACHER_CREATE",
        requester.id,
        {"created_user_id": user.id, "email_anon": _anon(req.email)},
    )
    return _to_user_out(user)


@router.patch("/users/{user_id}/active", response_model=UserSummaryOut)
@limiter.limit("30/minute")
def set_user_active(
    request: Request,
    user_id: str,
    req: SetUserActiveRequest,
    requester: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    u = build_admin_service(db).set_user_active(user_id, req.is_active, requester.id)
    logger.info(
        "Admin set user active=%s: admin=%s target_anon=%s",
        req.is_active, requester.id, _anon(user_id),
    )
    record_audit_event(
        request,
        "ADMIN_USER_SET_ACTIVE",
        requester.id,
        {"target_user_id": user_id, "is_active": req.is_active},
    )
    return _to_user_out(u)


@router.post("/seasons", response_model=SeasonOut)
@limiter.limit("30/minute")
def create_season(
    request: Request,
    req: SeasonCreateRequest,
    requester: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Promote a set of achievements (those tagged with `season_id`) as a
    time-bounded season. Reward is doubled while the window is active. Spec:
    docs/Pedagogical_Backlog_Spec.md §22.
    """
    season_svc = build_season_service(db)
    try:
        season_svc.upsert_season(
            season_id=req.season_id,
            name=req.name,
            starts_at=req.starts_at,
            ends_at=req.ends_at,
        )
    except ValueError as exc:
        raise DomainValueError(str(exc))
    record_audit_event(
        request,
        "ADMIN_SEASON_UPSERT",
        requester.id,
        {"season_id": req.season_id},
    )
    seasons = season_svc.list_seasons()
    match = next((s for s in seasons if s["season_id"] == req.season_id), None)
    if match is None:
        # We just upserted this season in the same DB session, so it must read
        # back. Its absence means the write did not persist — surface a real
        # error rather than fabricating a SeasonOut with placeholder fields
        # (which would report the season as inactive with null dates).
        logger.error("Season %s not found after upsert", req.season_id)
        raise PersistenceError("Season was not persisted")
    return SeasonOut(**match)


@router.get("/seasons", response_model=list[SeasonOut])
@limiter.limit("60/minute")
def list_seasons_admin(
    request: Request,
    _user: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    return [SeasonOut(**s) for s in build_season_service(db).list_seasons()]


def _to_user_out(u: User, classes_joined_count: int = 0) -> UserSummaryOut:
    return UserSummaryOut(
        id=u.id,
        email=u.email,
        player_name=u.player_name,
        role=u.role.value,
        is_active=u.is_active,
        created_at=u.created_at,
        classes_joined_count=classes_joined_count,
    )


def _to_class_out(c, student_count: int = 0) -> ClassSummaryOut:
    return ClassSummaryOut(
        id=c.id,
        name=c.name,
        teacher_id=c.teacher_id,
        join_code=c.join_code,
        created_at=c.created_at,
        student_count=student_count,
    )
