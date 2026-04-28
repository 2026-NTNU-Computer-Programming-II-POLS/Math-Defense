import logging

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.factories import build_class_service
from app.limiter import limiter
from app.middleware.auth import get_current_user, require_role
from app.schemas.class_ import (
    AddStudentRequest,
    ClassOut,
    ClassOutStudent,
    CreateClassRequest,
    JoinClassRequest,
    MembershipOut,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/classes", tags=["classes"])


@router.post("", response_model=ClassOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def create_class(
    request: Request,
    req: CreateClassRequest,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    cls_ = build_class_service(db).create_class(name=req.name, teacher_id=user.id)
    logger.info("Class created: id=%s by user=%s", cls_.id, user.id)
    return _class_out(cls_)


@router.get("", response_model=list[ClassOut | ClassOutStudent])
@limiter.limit("30/minute")
def list_classes(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc = build_class_service(db)
    if user.is_admin:
        return [_class_out(c) for c in svc.list_all_classes()]
    if user.is_teacher:
        return [_class_out(c) for c in svc.list_classes_for_teacher(user.id)]
    return [_class_out_student(c) for c in svc.list_classes_for_student(user.id)]


@router.post("/join", response_model=MembershipOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def join_class(
    request: Request,
    req: JoinClassRequest,
    user: User = Depends(require_role(Role.STUDENT)),
    db: Session = Depends(get_db),
):
    membership = build_class_service(db).join_by_code(code=req.code, student_id=user.id)
    return _membership_out(membership)


@router.get("/{class_id}", response_model=ClassOut)
@limiter.limit("30/minute")
def get_class(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    cls_ = build_class_service(db).get_class_for_owner(class_id, user.id, user.role)
    return _class_out(cls_)


@router.post("/{class_id}/students", response_model=MembershipOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def add_student(
    request: Request,
    class_id: str,
    req: AddStudentRequest,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    membership = build_class_service(db).add_student(
        class_id=class_id,
        student_id=req.student_id,
        requester_id=user.id,
        requester_role=user.role,
    )
    return _membership_out(membership)


@router.delete("/{class_id}/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def remove_student(
    request: Request,
    class_id: str,
    student_id: str,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    build_class_service(db).remove_student(
        class_id=class_id,
        student_id=student_id,
        requester_id=user.id,
        requester_role=user.role,
    )


@router.get("/{class_id}/students", response_model=list[MembershipOut])
@limiter.limit("30/minute")
def list_students(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    memberships = build_class_service(db).list_students_in_class(class_id, user.id, user.role)
    return [_membership_out(m) for m in memberships]


@router.post("/{class_id}/regenerate-code", response_model=dict)
@limiter.limit("5/minute")
def regenerate_code(
    request: Request,
    class_id: str,
    user: User = Depends(require_role(Role.TEACHER, Role.ADMIN)),
    db: Session = Depends(get_db),
):
    new_code = build_class_service(db).regenerate_join_code(
        class_id=class_id,
        requester_id=user.id,
        requester_role=user.role,
    )
    return {"join_code": new_code}


def _class_out(cls_) -> ClassOut:
    return ClassOut(
        id=cls_.id,
        name=cls_.name,
        teacher_id=cls_.teacher_id,
        join_code=cls_.join_code,
        created_at=cls_.created_at,
    )


def _class_out_student(cls_) -> ClassOutStudent:
    return ClassOutStudent(
        id=cls_.id,
        name=cls_.name,
        teacher_id=cls_.teacher_id,
        created_at=cls_.created_at,
    )


def _membership_out(m) -> MembershipOut:
    return MembershipOut(
        id=m.id,
        class_id=m.class_id,
        student_id=m.student_id,
        joined_at=m.joined_at,
    )
