"""Class Aggregate Root + companion entities."""
from __future__ import annotations

import secrets
import string
import uuid
from datetime import datetime, UTC

from app.domain.class_.errors import (
    ClassAlreadyArchivedError,
    ClassArchivedError,
    ClassCapacityReachedError,
    ClassNameInvalidError,
    ClassNotArchivedError,
    NotClassOwnerError,
)


class RemovedMembership:

    def __init__(self, id: str, class_id: str, student_id: str, removed_at: datetime) -> None:
        self.id = id
        self.class_id = class_id
        self.student_id = student_id
        self.removed_at = removed_at

    @classmethod
    def create(cls, class_id: str, student_id: str) -> RemovedMembership:
        return cls(
            id=str(uuid.uuid4()),
            class_id=class_id,
            student_id=student_id,
            removed_at=datetime.now(UTC),
        )


_JOIN_CODE_ALPHABET = string.ascii_uppercase + string.digits
_JOIN_CODE_LENGTH = 8


def _generate_join_code() -> str:
    return "".join(secrets.choice(_JOIN_CODE_ALPHABET) for _ in range(_JOIN_CODE_LENGTH))


class Class:
    """
    Classroom aggregate — owned by one teacher, contains student memberships.

    Invariants:
    1. join_code is unique and auto-generated on creation
    2. teacher_id is mutable only through transfer_ownership (audit B3)
    3. Only the owning teacher (or an admin) may mutate the class
    4. An archived class refuses join-by-code and student writes (audit M1/O8)
    """

    def __init__(
        self,
        id: str,
        name: str,
        teacher_id: str,
        join_code: str,
        created_at: datetime | None = None,
        description: str | None = None,
        subject: str | None = None,
        school_year: str | None = None,
        capacity: int | None = None,
        color: str | None = None,
        icon: str | None = None,
        archived_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.name = name
        self.teacher_id = teacher_id
        self.join_code = join_code
        self.created_at = created_at or datetime.now(UTC)
        self.description = description
        self.subject = subject
        self.school_year = school_year
        self.capacity = capacity
        self.color = color
        self.icon = icon
        self.archived_at = archived_at

    @staticmethod
    def _validate_name(name: str) -> str:
        name = name.strip()
        if len(name) < 1 or len(name) > 100:
            raise ClassNameInvalidError("Class name must be 1-100 characters")
        return name

    @staticmethod
    def _validate_capacity(capacity: int | None) -> int | None:
        if capacity is None:
            return None
        if capacity < 1 or capacity > 1000:
            raise ClassNameInvalidError("Capacity must be between 1 and 1000")
        return capacity

    @classmethod
    def create(
        cls,
        name: str,
        teacher_id: str,
        *,
        description: str | None = None,
        subject: str | None = None,
        school_year: str | None = None,
        capacity: int | None = None,
        color: str | None = None,
        icon: str | None = None,
    ) -> Class:
        return cls(
            id=str(uuid.uuid4()),
            name=cls._validate_name(name),
            teacher_id=teacher_id,
            join_code=_generate_join_code(),
            description=description,
            subject=subject,
            school_year=school_year,
            capacity=cls._validate_capacity(capacity),
            color=color,
            icon=icon,
        )

    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None

    def is_owned_by(self, user_id: str) -> bool:
        return self.teacher_id == user_id

    def verify_owner(self, user_id: str) -> None:
        """Raise NotClassOwnerError if user_id is not the owning teacher.

        This method only enforces teacher ownership. Admin bypass is the
        caller's responsibility — use _verify_owner_or_admin in the
        application layer for any user-facing mutation. Co-teacher policy
        is also a caller-side concern (read vs write).
        """
        if not self.is_owned_by(user_id):
            raise NotClassOwnerError("You do not own this class")

    def ensure_not_archived(self) -> None:
        if self.is_archived:
            raise ClassArchivedError("This class is archived")

    def rename(self, name: str) -> None:
        self.ensure_not_archived()
        self.name = self._validate_name(name)

    def update_metadata(
        self,
        *,
        description: str | None = ...,  # type: ignore[assignment]
        subject: str | None = ...,
        school_year: str | None = ...,
        capacity: int | None = ...,
        color: str | None = ...,
        icon: str | None = ...,
    ) -> None:
        """Patch any subset of metadata fields. `...` means leave unchanged."""
        self.ensure_not_archived()
        if description is not ...:
            self.description = description
        if subject is not ...:
            self.subject = subject
        if school_year is not ...:
            self.school_year = school_year
        if capacity is not ...:
            self.capacity = self._validate_capacity(capacity)
        if color is not ...:
            self.color = color
        if icon is not ...:
            self.icon = icon

    def regenerate_join_code(self) -> str:
        self.ensure_not_archived()
        self.join_code = _generate_join_code()
        return self.join_code

    def archive(self) -> None:
        if self.is_archived:
            raise ClassAlreadyArchivedError("Class is already archived")
        self.archived_at = datetime.now(UTC)

    def unarchive(self) -> None:
        if not self.is_archived:
            raise ClassNotArchivedError("Class is not archived")
        self.archived_at = None

    def transfer_to(self, new_teacher_id: str) -> None:
        """Move ownership to another teacher. Caller must check the new
        teacher exists, holds the TEACHER role, and is not the current owner.
        """
        if new_teacher_id == self.teacher_id:
            raise NotClassOwnerError("Already owned by this teacher")
        self.teacher_id = new_teacher_id

    def ensure_capacity_for_new_member(self, current_count: int) -> None:
        if self.capacity is not None and current_count >= self.capacity:
            raise ClassCapacityReachedError(
                f"Class capacity ({self.capacity}) reached",
            )


class ClassMembership:

    def __init__(
        self,
        id: str,
        class_id: str,
        student_id: str,
        joined_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.class_id = class_id
        self.student_id = student_id
        self.joined_at = joined_at or datetime.now(UTC)

    @classmethod
    def create(cls, class_id: str, student_id: str) -> ClassMembership:
        return cls(
            id=str(uuid.uuid4()),
            class_id=class_id,
            student_id=student_id,
        )


# ── Co-teacher ─────────────────────────────────────────────────────────────────


class ClassCoTeacher:

    def __init__(
        self,
        id: str,
        class_id: str,
        teacher_id: str,
        added_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.class_id = class_id
        self.teacher_id = teacher_id
        self.added_at = added_at or datetime.now(UTC)

    @classmethod
    def create(cls, class_id: str, teacher_id: str) -> ClassCoTeacher:
        return cls(
            id=str(uuid.uuid4()),
            class_id=class_id,
            teacher_id=teacher_id,
        )


# ── Pending invite ────────────────────────────────────────────────────────────


class PendingInvite:

    def __init__(
        self,
        id: str,
        class_id: str,
        email: str,
        invited_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.class_id = class_id
        self.email = email
        self.invited_at = invited_at or datetime.now(UTC)

    @classmethod
    def create(cls, class_id: str, email: str) -> PendingInvite:
        return cls(
            id=str(uuid.uuid4()),
            class_id=class_id,
            email=email.strip().lower(),
        )


# ── Class groups ──────────────────────────────────────────────────────────────


class ClassGroup:

    def __init__(
        self,
        id: str,
        class_id: str,
        name: str,
        color: str | None = None,
        created_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.class_id = class_id
        self.name = name
        self.color = color
        self.created_at = created_at or datetime.now(UTC)

    @staticmethod
    def _validate_name(name: str) -> str:
        name = name.strip()
        if len(name) < 1 or len(name) > 80:
            raise ClassNameInvalidError("Group name must be 1-80 characters")
        return name

    @classmethod
    def create(cls, class_id: str, name: str, color: str | None = None) -> ClassGroup:
        return cls(
            id=str(uuid.uuid4()),
            class_id=class_id,
            name=cls._validate_name(name),
            color=color,
        )

    def rename(self, name: str) -> None:
        self.name = self._validate_name(name)

    def recolor(self, color: str | None) -> None:
        self.color = color


class ClassGroupMember:

    def __init__(
        self,
        group_id: str,
        class_id: str,
        student_id: str,
        joined_at: datetime | None = None,
    ) -> None:
        self.group_id = group_id
        self.class_id = class_id
        self.student_id = student_id
        self.joined_at = joined_at or datetime.now(UTC)

    @classmethod
    def create(cls, group_id: str, class_id: str, student_id: str) -> ClassGroupMember:
        return cls(
            group_id=group_id,
            class_id=class_id,
            student_id=student_id,
        )
