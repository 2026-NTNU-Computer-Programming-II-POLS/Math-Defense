"""ClassApplicationService — classroom CRUD and membership management"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.domain.class_.aggregate import Class, ClassMembership, RemovedMembership
from app.domain.class_.errors import (
    ClassNameConflictError,
    ClassNotFoundError,
    InvalidJoinCodeError,
    NotAStudentError,
    StudentAlreadyInClassError,
    StudentEmailNotFoundError,
    StudentNotInClassError,
    StudentRemovedFromClassError,
)
from app.domain.errors import ConstraintViolationError, PermissionDeniedError
from app.domain.user.value_objects import Role

if TYPE_CHECKING:
    from app.application.ports import UnitOfWork
    from app.domain.class_.repository import ClassRepository
    from app.domain.territory.repository import TerritoryRepository
    from app.domain.user.repository import UserRepository

logger = logging.getLogger(__name__)


_CLASS_NAME_UNIQUE_CONSTRAINT = "uq_classes_teacher_name"


class ClassApplicationService:

    def __init__(
        self,
        class_repo: ClassRepository,
        user_repo: UserRepository,
        uow: UnitOfWork,
        territory_repo: TerritoryRepository | None = None,
    ) -> None:
        self._class_repo = class_repo
        self._user_repo = user_repo
        self._uow = uow
        self._territory_repo = territory_repo

    def _get_class_or_raise(self, class_id: str) -> Class:
        cls_ = self._class_repo.find_by_id(class_id)
        if cls_ is None:
            raise ClassNotFoundError("Class not found")
        return cls_

    def _verify_owner_or_admin(self, cls_: Class, user_id: str, user_role: Role, *, is_read_op: bool = False) -> None:
        if user_role == Role.ADMIN:
            if not is_read_op:
                raise PermissionDeniedError("Admins have read-only access and cannot perform mutations")
            return
        cls_.verify_owner(user_id)

    def create_class(self, name: str, teacher_id: str) -> Class:
        for attempt in range(3):
            cls_ = Class.create(name=name, teacher_id=teacher_id)
            try:
                with self._uow:
                    self._class_repo.save(cls_)
                    self._uow.commit()
                return cls_
            except ConstraintViolationError as exc:
                if exc.constraint_name == _CLASS_NAME_UNIQUE_CONSTRAINT:
                    raise ClassNameConflictError("A class with this name already exists") from exc
                if attempt == 2:
                    raise
        raise RuntimeError("Unreachable")

    def get_class(self, class_id: str) -> Class:
        return self._get_class_or_raise(class_id)

    def get_class_for_owner(self, class_id: str, requester_id: str, requester_role: Role) -> Class:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role, is_read_op=True)
        return cls_

    def list_classes_for_teacher(self, teacher_id: str) -> list[Class]:
        return self._class_repo.find_by_teacher(teacher_id)

    def list_all_classes(self) -> list[Class]:
        return self._class_repo.find_all()

    def list_classes_for_student(self, student_id: str) -> list[Class]:
        memberships = self._class_repo.find_memberships_by_student(student_id)
        ids = [m.class_id for m in memberships]
        return self._class_repo.find_by_ids(ids)

    def list_classes_for_student_with_teachers(self, student_id: str):
        classes = self.list_classes_for_student(student_id)
        teacher_ids = list({c.teacher_id for c in classes})
        teachers = {u.id: u for u in self._user_repo.find_by_ids(teacher_ids)}
        return [(c, teachers.get(c.teacher_id)) for c in classes]

    def get_class_for_student_with_teacher(self, class_id: str, student_id: str):
        self.verify_access(class_id, student_id, Role.STUDENT)
        cls_ = self._get_class_or_raise(class_id)
        teacher = self._user_repo.find_by_id(cls_.teacher_id)
        return cls_, teacher

    def add_student(self, class_id: str, student_email: str, requester_id: str, requester_role: Role) -> ClassMembership:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role)
        student = self._user_repo.find_by_email(student_email.strip().lower())
        if student is None:
            raise StudentEmailNotFoundError("No account found for that email")
        if student.role != Role.STUDENT:
            raise NotAStudentError("That account is not a student")
        student_id = student.id
        with self._uow:
            # Optimistic read: the unique constraint on (class_id, student_id) is
            # the true guard. Two concurrent calls can both pass here; whichever
            # INSERT loses is caught below and mapped to StudentAlreadyInClassError.
            if self._class_repo.find_membership(class_id, student_id):
                raise StudentAlreadyInClassError("Student is already in this class")
            membership = ClassMembership.create(class_id=class_id, student_id=student_id)
            try:
                self._class_repo.save_membership(membership)
                # Teacher explicitly re-adding a removed student clears the blocklist.
                self._class_repo.delete_removed_membership(class_id, student_id)
                self._uow.commit()
            except ConstraintViolationError as e:
                raise StudentAlreadyInClassError("Student is already in this class") from e
        return membership

    def verify_access(self, class_id: str, user_id: str, user_role: Role) -> None:
        """Raise PermissionDeniedError unless the user owns the class, is an admin, or is a member."""
        cls_ = self._get_class_or_raise(class_id)
        if user_role == Role.ADMIN or cls_.is_owned_by(user_id):
            return
        if user_role == Role.STUDENT:
            if self._class_repo.find_membership(class_id, user_id):
                return
        raise PermissionDeniedError("You are not a member of this class")

    def remove_student(self, class_id: str, student_id: str, requester_id: str, requester_role: Role) -> None:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role)
        existing = self._class_repo.find_membership(class_id, student_id)
        if existing is None:
            raise StudentNotInClassError("Student is not in this class")
        with self._uow:
            self._class_repo.delete_membership(class_id, student_id)
            self._class_repo.record_removal(RemovedMembership.create(class_id, student_id))
            if self._territory_repo is not None:
                self._territory_repo.delete_occupations_for_student_in_class(student_id, class_id)
            self._uow.commit()
        logger.info("Student %s removed from class %s", student_id, class_id)

    def add_student_with_user(self, class_id: str, student_email: str, requester_id: str, requester_role: Role):
        membership = self.add_student(class_id, student_email, requester_id, requester_role)
        user = self._user_repo.find_by_id(membership.student_id)
        return membership, user

    def list_students_in_class(self, class_id: str, requester_id: str, requester_role: Role) -> list[ClassMembership]:
        # Intentional: a teacher can only roster their own class. There is no
        # cross-teacher sharing by design. Admin sees all via the bypass above.
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role, is_read_op=True)
        return self._class_repo.find_memberships_by_class(class_id)

    def list_students_with_users(self, class_id: str, requester_id: str, requester_role: Role):
        memberships = self.list_students_in_class(class_id, requester_id, requester_role)
        student_ids = [m.student_id for m in memberships]
        users = {u.id: u for u in self._user_repo.find_by_ids(student_ids)}
        return [(m, users.get(m.student_id)) for m in memberships]

    def join_by_code(self, code: str, student_id: str, student_role: Role = Role.STUDENT) -> ClassMembership:
        if student_role != Role.STUDENT:
            raise PermissionDeniedError("Only students can join a class by code")
        cls_ = self._class_repo.find_by_join_code(code)
        if cls_ is None:
            raise InvalidJoinCodeError("Invalid join code")
        with self._uow:
            if self._class_repo.find_membership(cls_.id, student_id):
                raise StudentAlreadyInClassError("You are already in this class")
            if self._class_repo.find_removed_membership(cls_.id, student_id):
                raise StudentRemovedFromClassError("You have been removed from this class and cannot rejoin via code")
            membership = ClassMembership.create(class_id=cls_.id, student_id=student_id)
            try:
                self._class_repo.save_membership(membership)
                self._uow.commit()
            except ConstraintViolationError as e:
                raise StudentAlreadyInClassError("You are already in this class") from e
        return membership

    def delete_class(self, class_id: str, requester_id: str, requester_role: Role) -> None:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role)
        with self._uow:
            self._class_repo.delete(class_id)
            self._uow.commit()

    def rename_class(self, class_id: str, name: str, requester_id: str, requester_role: Role) -> Class:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role)
        cls_.rename(name)
        with self._uow:
            try:
                self._class_repo.save(cls_)
                self._uow.commit()
            except ConstraintViolationError as exc:
                if exc.constraint_name == _CLASS_NAME_UNIQUE_CONSTRAINT:
                    raise ClassNameConflictError("A class with this name already exists") from exc
                raise
        return cls_

    def regenerate_join_code(self, class_id: str, requester_id: str, requester_role: Role) -> str:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role)
        for attempt in range(3):
            cls_.regenerate_join_code()
            try:
                with self._uow:
                    self._class_repo.save(cls_)
                    self._uow.commit()
                return cls_.join_code
            except ConstraintViolationError:
                if attempt == 2:
                    raise
        raise RuntimeError("Unreachable")
