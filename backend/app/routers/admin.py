from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.factories import build_admin_service
from app.limiter import limiter
from app.middleware.auth import require_role
from app.schemas.admin import ClassSummaryOut, PaginatedClassesOut, PaginatedUsersOut, SetUserActiveRequest, UserSummaryOut

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
