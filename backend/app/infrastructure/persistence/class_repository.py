"""SQLAlchemy implementation of ClassRepository"""
from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.domain.class_.aggregate import (
    Class,
    ClassCoTeacher,
    ClassGroup,
    ClassGroupMember,
    ClassMembership,
    PendingInvite,
    RemovedMembership,
)
from app.domain.errors import ConstraintViolationError
from app.models.class_ import Class as ClassModel
from app.models.class_co_teacher import ClassCoTeacher as CoTeacherModel
from app.models.class_group import (
    ClassGroup as GroupModel,
    ClassGroupMember as GroupMemberModel,
)
from app.models.class_membership import ClassMembership as MembershipModel
from app.models.class_pending_invite import ClassPendingInvite as InviteModel
from app.models.removed_class_membership import RemovedClassMembership as RemovedModel
from app.utils.integrity import extract_constraint_name


class SqlAlchemyClassRepository:

    def __init__(self, db: DbSession):
        self._db = db

    # ── Classes ──────────────────────────────────────────────────────────────
    def find_by_id(self, class_id: str) -> Class | None:
        row = self._db.query(ClassModel).filter(ClassModel.id == class_id).first()
        return self._to_domain(row) if row else None

    def find_by_join_code(self, code: str) -> Class | None:
        row = self._db.query(ClassModel).filter(ClassModel.join_code == code.upper()).first()
        return self._to_domain(row) if row else None

    def find_by_teacher(self, teacher_id: str, *, include_archived: bool = True) -> list[Class]:
        q = self._db.query(ClassModel).filter(ClassModel.teacher_id == teacher_id)
        if not include_archived:
            q = q.filter(ClassModel.archived_at.is_(None))
        rows = q.all()
        return [self._to_domain(r) for r in rows]

    def find_by_ids(self, class_ids: list[str]) -> list[Class]:
        if not class_ids:
            return []
        rows = self._db.query(ClassModel).filter(ClassModel.id.in_(class_ids)).all()
        return [self._to_domain(r) for r in rows]

    def find_all(self) -> list[Class]:
        rows = self._db.query(ClassModel).limit(1000).all()
        return [self._to_domain(r) for r in rows]

    def find_all_paginated(
        self, offset: int, limit: int, *, include_archived: bool = True,
    ) -> tuple[list[Class], int]:
        q = self._db.query(ClassModel)
        if not include_archived:
            q = q.filter(ClassModel.archived_at.is_(None))
        total = q.count()
        # B-BUG-13: append .id as a tiebreaker so identical created_at
        # timestamps (bulk seeds) cannot duplicate / skip rows across pages.
        rows = (
            q.order_by(ClassModel.created_at.desc(), ClassModel.id.asc())
            .offset(offset).limit(limit).all()
        )
        return [self._to_domain(r) for r in rows], total

    def count_by_teacher(self, teacher_id: str) -> int:
        return self._db.query(ClassModel).filter(ClassModel.teacher_id == teacher_id).count()

    def count_by_teacher_bulk(self, teacher_ids: list[str]) -> dict[str, int]:
        """Class counts for many teachers in one GROUP BY query (avoids N+1).

        Returns a sparse dict — teachers with no classes are absent; callers
        should default a missing key to 0.
        """
        if not teacher_ids:
            return {}
        rows = (
            self._db.query(ClassModel.teacher_id, func.count(ClassModel.id))
            .filter(ClassModel.teacher_id.in_(teacher_ids))
            .group_by(ClassModel.teacher_id)
            .all()
        )
        return {teacher_id: count for teacher_id, count in rows}

    def save(self, cls_: Class) -> None:
        row = self._db.query(ClassModel).filter(ClassModel.id == cls_.id).first()
        if row:
            row.name = cls_.name
            row.teacher_id = cls_.teacher_id
            row.join_code = cls_.join_code
            row.description = cls_.description
            row.subject = cls_.subject
            row.school_year = cls_.school_year
            row.capacity = cls_.capacity
            row.color = cls_.color
            row.icon = cls_.icon
            row.archived_at = cls_.archived_at
        else:
            row = ClassModel(
                id=cls_.id,
                name=cls_.name,
                teacher_id=cls_.teacher_id,
                join_code=cls_.join_code,
                created_at=cls_.created_at,
                description=cls_.description,
                subject=cls_.subject,
                school_year=cls_.school_year,
                capacity=cls_.capacity,
                color=cls_.color,
                icon=cls_.icon,
                archived_at=cls_.archived_at,
            )
            self._db.add(row)
        self._flush()

    def _flush(self) -> None:
        try:
            self._db.flush()
        except IntegrityError as e:
            raise ConstraintViolationError(
                str(e), constraint_name=extract_constraint_name(e)
            ) from e

    def delete(self, class_id: str) -> None:
        self._db.query(ClassModel).filter(ClassModel.id == class_id).delete()
        self._db.flush()

    # ── Memberships ──────────────────────────────────────────────────────────
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

    def count_memberships_by_class(self, class_id: str) -> int:
        return self._db.query(MembershipModel).filter(MembershipModel.class_id == class_id).count()

    def count_memberships_by_class_bulk(self, class_ids: list[str]) -> dict[str, int]:
        """Membership counts for many classes in one GROUP BY query (avoids N+1).

        Returns a sparse dict — empty classes are absent; callers should
        default a missing key to 0.
        """
        if not class_ids:
            return {}
        rows = (
            self._db.query(MembershipModel.class_id, func.count(MembershipModel.id))
            .filter(MembershipModel.class_id.in_(class_ids))
            .group_by(MembershipModel.class_id)
            .all()
        )
        return {class_id: count for class_id, count in rows}

    def count_memberships_by_student(self, student_id: str) -> int:
        return self._db.query(MembershipModel).filter(MembershipModel.student_id == student_id).count()

    def count_memberships_by_student_bulk(self, student_ids: list[str]) -> dict[str, int]:
        """Membership counts for many students in one GROUP BY query (avoids N+1).

        Returns a sparse dict — students in no classes are absent; callers
        should default a missing key to 0.
        """
        if not student_ids:
            return {}
        rows = (
            self._db.query(MembershipModel.student_id, func.count(MembershipModel.id))
            .filter(MembershipModel.student_id.in_(student_ids))
            .group_by(MembershipModel.student_id)
            .all()
        )
        return {student_id: count for student_id, count in rows}

    def save_membership(self, membership: ClassMembership) -> None:
        row = MembershipModel(
            id=membership.id,
            class_id=membership.class_id,
            student_id=membership.student_id,
            joined_at=membership.joined_at,
        )
        self._db.add(row)
        self._flush()

    def delete_membership(self, class_id: str, student_id: str) -> None:
        self._db.query(MembershipModel).filter(
            MembershipModel.class_id == class_id,
            MembershipModel.student_id == student_id,
        ).delete()
        self._db.flush()

    def find_removed_membership(self, class_id: str, student_id: str) -> RemovedMembership | None:
        row = (
            self._db.query(RemovedModel)
            .filter(RemovedModel.class_id == class_id, RemovedModel.student_id == student_id)
            .first()
        )
        return self._removed_to_domain(row) if row else None

    def record_removal(self, rm: RemovedMembership) -> None:
        row = (
            self._db.query(RemovedModel)
            .filter(RemovedModel.class_id == rm.class_id, RemovedModel.student_id == rm.student_id)
            .first()
        )
        if row:
            row.removed_at = rm.removed_at
        else:
            self._db.add(RemovedModel(
                id=rm.id,
                class_id=rm.class_id,
                student_id=rm.student_id,
                removed_at=rm.removed_at,
            ))
        self._db.flush()

    def delete_removed_membership(self, class_id: str, student_id: str) -> None:
        self._db.query(RemovedModel).filter(
            RemovedModel.class_id == class_id,
            RemovedModel.student_id == student_id,
        ).delete()
        self._db.flush()

    # ── Co-teachers ──────────────────────────────────────────────────────────
    def find_co_teacher(self, class_id: str, teacher_id: str) -> ClassCoTeacher | None:
        row = (
            self._db.query(CoTeacherModel)
            .filter(CoTeacherModel.class_id == class_id, CoTeacherModel.teacher_id == teacher_id)
            .first()
        )
        return self._co_to_domain(row) if row else None

    def find_co_teachers_by_class(self, class_id: str) -> list[ClassCoTeacher]:
        rows = self._db.query(CoTeacherModel).filter(CoTeacherModel.class_id == class_id).all()
        return [self._co_to_domain(r) for r in rows]

    def find_classes_where_co_teacher(self, teacher_id: str) -> list[Class]:
        rows = (
            self._db.query(ClassModel)
            .join(CoTeacherModel, CoTeacherModel.class_id == ClassModel.id)
            .filter(CoTeacherModel.teacher_id == teacher_id)
            .all()
        )
        return [self._to_domain(r) for r in rows]

    def is_co_teacher(self, class_id: str, teacher_id: str) -> bool:
        return (
            self._db.query(CoTeacherModel)
            .filter(CoTeacherModel.class_id == class_id, CoTeacherModel.teacher_id == teacher_id)
            .first()
            is not None
        )

    def save_co_teacher(self, co: ClassCoTeacher) -> None:
        row = CoTeacherModel(
            id=co.id,
            class_id=co.class_id,
            teacher_id=co.teacher_id,
            added_at=co.added_at,
        )
        self._db.add(row)
        self._flush()

    def delete_co_teacher(self, class_id: str, teacher_id: str) -> None:
        self._db.query(CoTeacherModel).filter(
            CoTeacherModel.class_id == class_id,
            CoTeacherModel.teacher_id == teacher_id,
        ).delete()
        self._db.flush()

    # ── Invites ──────────────────────────────────────────────────────────────
    def find_invite(self, class_id: str, email: str) -> PendingInvite | None:
        row = (
            self._db.query(InviteModel)
            .filter(InviteModel.class_id == class_id, InviteModel.email == email.strip().lower())
            .first()
        )
        return self._invite_to_domain(row) if row else None

    def find_invites_by_class(self, class_id: str) -> list[PendingInvite]:
        rows = self._db.query(InviteModel).filter(InviteModel.class_id == class_id).all()
        return [self._invite_to_domain(r) for r in rows]

    def find_invites_by_email(self, email: str) -> list[PendingInvite]:
        rows = (
            self._db.query(InviteModel)
            .filter(InviteModel.email == email.strip().lower())
            .all()
        )
        return [self._invite_to_domain(r) for r in rows]

    def save_invite(self, invite: PendingInvite) -> None:
        row = InviteModel(
            id=invite.id,
            class_id=invite.class_id,
            email=invite.email,
            invited_at=invite.invited_at,
        )
        self._db.add(row)
        self._flush()

    def delete_invite(self, class_id: str, email: str) -> None:
        self._db.query(InviteModel).filter(
            InviteModel.class_id == class_id,
            InviteModel.email == email.strip().lower(),
        ).delete()
        self._db.flush()

    def delete_invites_by_email(self, email: str) -> None:
        self._db.query(InviteModel).filter(
            InviteModel.email == email.strip().lower(),
        ).delete()
        self._db.flush()

    # ── Groups ───────────────────────────────────────────────────────────────
    def find_group_by_id(self, group_id: str) -> ClassGroup | None:
        row = self._db.query(GroupModel).filter(GroupModel.id == group_id).first()
        return self._group_to_domain(row) if row else None

    def find_groups_by_class(self, class_id: str) -> list[ClassGroup]:
        rows = self._db.query(GroupModel).filter(GroupModel.class_id == class_id).all()
        return [self._group_to_domain(r) for r in rows]

    def save_group(self, group: ClassGroup) -> None:
        row = self._db.query(GroupModel).filter(GroupModel.id == group.id).first()
        if row:
            row.name = group.name
            row.color = group.color
        else:
            row = GroupModel(
                id=group.id,
                class_id=group.class_id,
                name=group.name,
                color=group.color,
                created_at=group.created_at,
            )
            self._db.add(row)
        self._flush()

    def delete_group(self, group_id: str) -> None:
        self._db.query(GroupModel).filter(GroupModel.id == group_id).delete()
        self._db.flush()

    def find_group_member(self, group_id: str, student_id: str) -> ClassGroupMember | None:
        row = (
            self._db.query(GroupMemberModel)
            .filter(GroupMemberModel.group_id == group_id, GroupMemberModel.student_id == student_id)
            .first()
        )
        return self._group_member_to_domain(row) if row else None

    def find_group_member_for_student_in_class(
        self, class_id: str, student_id: str,
    ) -> ClassGroupMember | None:
        row = (
            self._db.query(GroupMemberModel)
            .filter(
                GroupMemberModel.class_id == class_id,
                GroupMemberModel.student_id == student_id,
            )
            .first()
        )
        return self._group_member_to_domain(row) if row else None

    def find_group_members_by_group(self, group_id: str) -> list[ClassGroupMember]:
        rows = self._db.query(GroupMemberModel).filter(GroupMemberModel.group_id == group_id).all()
        return [self._group_member_to_domain(r) for r in rows]

    def find_group_members_by_class(self, class_id: str) -> list[ClassGroupMember]:
        rows = self._db.query(GroupMemberModel).filter(GroupMemberModel.class_id == class_id).all()
        return [self._group_member_to_domain(r) for r in rows]

    def save_group_member(self, member: ClassGroupMember) -> None:
        row = GroupMemberModel(
            group_id=member.group_id,
            class_id=member.class_id,
            student_id=member.student_id,
            joined_at=member.joined_at,
        )
        self._db.add(row)
        self._flush()

    def delete_group_member(self, group_id: str, student_id: str) -> None:
        self._db.query(GroupMemberModel).filter(
            GroupMemberModel.group_id == group_id,
            GroupMemberModel.student_id == student_id,
        ).delete()
        self._db.flush()

    def count_members_by_group_bulk(self, group_ids: list[str]) -> dict[str, int]:
        if not group_ids:
            return {}
        rows = (
            self._db.query(GroupMemberModel.group_id, func.count(GroupMemberModel.student_id))
            .filter(GroupMemberModel.group_id.in_(group_ids))
            .group_by(GroupMemberModel.group_id)
            .all()
        )
        return {gid: cnt for gid, cnt in rows}

    # ── Mappers ──────────────────────────────────────────────────────────────
    @staticmethod
    def _to_domain(row: ClassModel) -> Class:
        return Class(
            id=row.id,
            name=row.name,
            teacher_id=row.teacher_id,
            join_code=row.join_code,
            created_at=_ensure_utc(row.created_at),
            description=row.description,
            subject=row.subject,
            school_year=row.school_year,
            capacity=row.capacity,
            color=row.color,
            icon=row.icon,
            archived_at=_ensure_utc(row.archived_at),
        )

    @staticmethod
    def _membership_to_domain(row: MembershipModel) -> ClassMembership:
        return ClassMembership(
            id=row.id,
            class_id=row.class_id,
            student_id=row.student_id,
            joined_at=_ensure_utc(row.joined_at),
        )

    @staticmethod
    def _removed_to_domain(row: RemovedModel) -> RemovedMembership:
        return RemovedMembership(
            id=row.id,
            class_id=row.class_id,
            student_id=row.student_id,
            removed_at=_ensure_utc(row.removed_at),
        )

    @staticmethod
    def _co_to_domain(row: CoTeacherModel) -> ClassCoTeacher:
        return ClassCoTeacher(
            id=row.id,
            class_id=row.class_id,
            teacher_id=row.teacher_id,
            added_at=_ensure_utc(row.added_at),
        )

    @staticmethod
    def _invite_to_domain(row: InviteModel) -> PendingInvite:
        return PendingInvite(
            id=row.id,
            class_id=row.class_id,
            email=row.email,
            invited_at=_ensure_utc(row.invited_at),
        )

    @staticmethod
    def _group_to_domain(row: GroupModel) -> ClassGroup:
        return ClassGroup(
            id=row.id,
            class_id=row.class_id,
            name=row.name,
            color=row.color,
            created_at=_ensure_utc(row.created_at),
        )

    @staticmethod
    def _group_member_to_domain(row: GroupMemberModel) -> ClassGroupMember:
        return ClassGroupMember(
            group_id=row.group_id,
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
