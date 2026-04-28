"""ClassApplicationService — classroom CRUD and membership management"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy.exc import IntegrityError

from app.domain.class_.aggregate import Class, ClassMembership
from app.domain.class_.errors import (
    ClassNotFoundError,
    InvalidJoinCodeError,
    StudentAlreadyInClassError,
    StudentNotInClassError,
)
from app.domain.errors import PermissionDeniedError
from app.domain.user.value_objects import Role

if TYPE_CHECKING:
    from app.domain.class_.repository import ClassRepository
    from app.domain.user.repository import UserRepository
    from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

logger = logging.getLogger(__name__)


class ClassApplicationService:

    def __init__(
        self,
        class_repo: ClassRepository,
        user_repo: UserRepository,
        uow: SqlAlchemyUnitOfWork,
    ) -> None:
        self._class_repo = class_repo
        self._user_repo = user_repo
        self._uow = uow

    def _get_class_or_raise(self, class_id: str) -> Class:
        cls_ = self._class_repo.find_by_id(class_id)
        if cls_ is None:
            raise ClassNotFoundError("Class not found")
        return cls_

    def _verify_owner_or_admin(self, cls_: Class, user_id: str, user_role: Role) -> None:
        if user_role == Role.ADMIN:
            return
        cls_.verify_owner(user_id)

    def create_class(self, name: str, teacher_id: str) -> Class:
        with self._uow:
            cls_ = Class.create(name=name, teacher_id=teacher_id)
            self._class_repo.save(cls_)
            self._uow.commit()
        return cls_

    def get_class(self, class_id: str) -> Class:
        return self._get_class_or_raise(class_id)

    def get_class_for_owner(self, class_id: str, requester_id: str, requester_role: Role) -> Class:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role)
        return cls_

    def list_classes_for_teacher(self, teacher_id: str) -> list[Class]:
        return self._class_repo.find_by_teacher(teacher_id)

    def list_all_classes(self) -> list[Class]:
        return self._class_repo.find_all()

    def list_classes_for_student(self, student_id: str) -> list[Class]:
        memberships = self._class_repo.find_memberships_by_student(student_id)
        classes = []
        for m in memberships:
            cls_ = self._class_repo.find_by_id(m.class_id)
            if cls_:
                classes.append(cls_)
        return classes

    def add_student(self, class_id: str, student_id: str, requester_id: str, requester_role: Role) -> ClassMembership:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role)
        student = self._user_repo.find_by_id(student_id)
        if student is None or student.role != Role.STUDENT:
            raise PermissionDeniedError("Target user is not a student")
        with self._uow:
            if self._class_repo.find_membership(class_id, student_id):
                raise StudentAlreadyInClassError("Student is already in this class")
            membership = ClassMembership.create(class_id=class_id, student_id=student_id)
            try:
                self._class_repo.save_membership(membership)
                self._uow.commit()
            except IntegrityError as e:
                raise StudentAlreadyInClassError("Student is already in this class") from e
        return membership

    def remove_student(self, class_id: str, student_id: str, requester_id: str, requester_role: Role) -> None:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role)
        existing = self._class_repo.find_membership(class_id, student_id)
        if existing is None:
            raise StudentNotInClassError("Student is not in this class")
        with self._uow:
            self._class_repo.delete_membership(class_id, student_id)
            self._uow.commit()

    def list_students_in_class(self, class_id: str, requester_id: str, requester_role: Role) -> list[ClassMembership]:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role)
        return self._class_repo.find_memberships_by_class(class_id)

    def join_by_code(self, code: str, student_id: str) -> ClassMembership:
        cls_ = self._class_repo.find_by_join_code(code.upper().strip())
        if cls_ is None:
            raise InvalidJoinCodeError("Invalid join code")
        with self._uow:
            if self._class_repo.find_membership(cls_.id, student_id):
                raise StudentAlreadyInClassError("You are already in this class")
            membership = ClassMembership.create(class_id=cls_.id, student_id=student_id)
            try:
                self._class_repo.save_membership(membership)
                self._uow.commit()
            except IntegrityError as e:
                raise StudentAlreadyInClassError("You are already in this class") from e
        return membership

    def regenerate_join_code(self, class_id: str, requester_id: str, requester_role: Role) -> str:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role)
        with self._uow:
            new_code = cls_.regenerate_join_code()
            self._class_repo.save(cls_)
            self._uow.commit()
        return new_code
