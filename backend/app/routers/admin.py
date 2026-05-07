from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.errors import DomainValueError
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.factories import build_admin_service, build_season_service
from app.limiter import limiter
from app.middleware.auth import require_role
from app.schemas.admin import ClassSummaryOut, PaginatedClassesOut, PaginatedUsersOut, SetUserActiveRequest, UserSummaryOut
from app.schemas.season import SeasonCreateRequest, SeasonOut

router = APIRouter(prefix="/api/admin", tags=["admin"])


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


@router.patch("/users/{user_id}/active", response_model=UserSummaryOut)
@limiter.limit("30/minute")
def set_user_active(
    request: Request,
    user_id: str,
    req: SetUserActiveRequest,
    _user: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    u = build_admin_service(db).set_user_active(user_id, req.is_active)
    return _to_user_out(u)


@router.post("/seasons", response_model=SeasonOut)
@limiter.limit("30/minute")
def create_season(
    request: Request,
    req: SeasonCreateRequest,
    _user: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    """Promote a set of achievements (those tagged with `season_id`) as a
    time-bounded season. Reward is doubled while the window is active. Spec:
    docs/Pedagogical_Backlog_Spec.md §22.
    """
    try:
        build_season_service(db).upsert_season(
            season_id=req.season_id,
            name=req.name,
            starts_at=req.starts_at,
            ends_at=req.ends_at,
        )
    except ValueError as exc:
        raise DomainValueError(str(exc))
    seasons = build_season_service(db).list_seasons()
    match = next((s for s in seasons if s["season_id"] == req.season_id), None)
    return SeasonOut(**(match or {"season_id": req.season_id, "name": req.name}))


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
