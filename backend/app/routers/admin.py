from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.factories import build_admin_service
from app.limiter import limiter
from app.middleware.auth import require_role
from app.schemas.admin import ClassSummaryOut, UserSummaryOut

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/teachers", response_model=list[UserSummaryOut])
@limiter.limit("30/minute")
def list_teachers(
    request: Request,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    _user: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    teachers = build_admin_service(db).list_teachers()
    start = (page - 1) * per_page
    return [_to_user_out(t) for t in teachers[start:start + per_page]]


@router.get("/students", response_model=list[UserSummaryOut])
@limiter.limit("30/minute")
def list_students(
    request: Request,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    _user: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    students = build_admin_service(db).list_students()
    start = (page - 1) * per_page
    return [_to_user_out(s) for s in students[start:start + per_page]]


@router.get("/classes", response_model=list[ClassSummaryOut])
@limiter.limit("30/minute")
def list_classes(
    request: Request,
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=50, ge=1, le=200),
    _user: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    classes = build_admin_service(db).list_all_classes()
    start = (page - 1) * per_page
    return [_to_class_out(c) for c in classes[start:start + per_page]]


def _to_user_out(u: User) -> UserSummaryOut:
    return UserSummaryOut(
        id=u.id,
        email=u.email,
        player_name=u.player_name,
        role=u.role.value,
        created_at=u.created_at,
    )


def _to_class_out(c) -> ClassSummaryOut:
    return ClassSummaryOut(
        id=c.id,
        name=c.name,
        teacher_id=c.teacher_id,
        join_code=c.join_code,
        created_at=c.created_at,
    )
