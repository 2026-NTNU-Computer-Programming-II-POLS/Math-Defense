from fastapi import APIRouter, Depends, Request
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
    _user: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    teachers = build_admin_service(db).list_teachers()
    return [_to_user_out(t) for t in teachers]


@router.get("/students", response_model=list[UserSummaryOut])
@limiter.limit("30/minute")
def list_students(
    request: Request,
    _user: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    students = build_admin_service(db).list_students()
    return [_to_user_out(s) for s in students]


@router.get("/classes", response_model=list[ClassSummaryOut])
@limiter.limit("30/minute")
def list_classes(
    request: Request,
    _user: User = Depends(require_role(Role.ADMIN)),
    db: Session = Depends(get_db),
):
    classes = build_admin_service(db).list_all_classes()
    return [_to_class_out(c) for c in classes]


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
