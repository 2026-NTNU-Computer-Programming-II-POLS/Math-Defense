"""SQLAlchemy implementation of ClassRepository"""
from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy.orm import Session as DbSession

from app.domain.class_.aggregate import Class, ClassMembership
from app.models.class_ import Class as ClassModel
from app.models.class_membership import ClassMembership as MembershipModel


class SqlAlchemyClassRepository:

    def __init__(self, db: DbSession):
        self._db = db

    def find_by_id(self, class_id: str) -> Class | None:
        row = self._db.query(ClassModel).filter(ClassModel.id == class_id).first()
        return self._to_domain(row) if row else None

    def find_by_join_code(self, code: str) -> Class | None:
        row = self._db.query(ClassModel).filter(ClassModel.join_code == code.upper()).first()
        return self._to_domain(row) if row else None

    def find_by_teacher(self, teacher_id: str) -> list[Class]:
        rows = self._db.query(ClassModel).filter(ClassModel.teacher_id == teacher_id).all()
        return [self._to_domain(r) for r in rows]

    def find_all(self) -> list[Class]:
        rows = self._db.query(ClassModel).all()
        return [self._to_domain(r) for r in rows]

    def save(self, cls_: Class) -> None:
        row = self._db.query(ClassModel).filter(ClassModel.id == cls_.id).first()
        if row:
            row.name = cls_.name
            row.join_code = cls_.join_code
        else:
            row = ClassModel(
                id=cls_.id,
                name=cls_.name,
                teacher_id=cls_.teacher_id,
                join_code=cls_.join_code,
                created_at=cls_.created_at,
            )
            self._db.add(row)
        self._db.flush()

    def delete(self, class_id: str) -> None:
        self._db.query(ClassModel).filter(ClassModel.id == class_id).delete()
        self._db.flush()

    def find_membership(self, class_id: str, student_id: str) -> ClassMembership | None:
        row = (
            self._db.query(MembershipModel)
            .filter(MembershipModel.class_id == class_id, MembershipModel.student_id == student_id)
            .first()
        )
        return self._membership_to_domain(row) if row else None

    def find_memberships_by_class(self, class_id: str) -> list[ClassMembership]:
        rows = self._db.query(MembershipModel).filter(MembershipModel.class_id == class_id).all()
        return [self._membership_to_domain(r) for r in rows]

    def find_memberships_by_student(self, student_id: str) -> list[ClassMembership]:
        rows = self._db.query(MembershipModel).filter(MembershipModel.student_id == student_id).all()
        return [self._membership_to_domain(r) for r in rows]

    def save_membership(self, membership: ClassMembership) -> None:
        row = MembershipModel(
            id=membership.id,
            class_id=membership.class_id,
            student_id=membership.student_id,
            joined_at=membership.joined_at,
        )
        self._db.add(row)
        self._db.flush()

    def delete_membership(self, class_id: str, student_id: str) -> None:
        self._db.query(MembershipModel).filter(
            MembershipModel.class_id == class_id,
            MembershipModel.student_id == student_id,
        ).delete()
        self._db.flush()

    @staticmethod
    def _to_domain(row: ClassModel) -> Class:
        return Class(
            id=row.id,
            name=row.name,
            teacher_id=row.teacher_id,
            join_code=row.join_code,
            created_at=_ensure_utc(row.created_at),
        )

    @staticmethod
    def _membership_to_domain(row: MembershipModel) -> ClassMembership:
        return ClassMembership(
            id=row.id,
            class_id=row.class_id,
            student_id=row.student_id,
            joined_at=_ensure_utc(row.joined_at),
        )


def _ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
