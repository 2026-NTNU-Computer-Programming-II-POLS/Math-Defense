"""ClassRepository — abstract interface"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.domain.class_.aggregate import (
    Class,
    ClassCoTeacher,
    ClassGroup,
    ClassGroupMember,
    ClassMembership,
    PendingInvite,
    RemovedMembership,
)


@runtime_checkable
class ClassRepository(Protocol):
    # ── Classes ──────────────────────────────────────────────────────────────
    def find_by_id(self, class_id: str) -> Class | None: pass

    def find_by_ids(self, class_ids: list[str]) -> list[Class]: pass

    def find_by_join_code(self, code: str) -> Class | None: pass

    def find_by_teacher(self, teacher_id: str, *, include_archived: bool = True) -> list[Class]: pass

    def find_all(self) -> list[Class]: pass

    def find_all_paginated(
        self, offset: int, limit: int, *, include_archived: bool = True,
    ) -> tuple[list[Class], int]: pass

    def count_by_teacher(self, teacher_id: str) -> int: pass

    def count_by_teacher_bulk(self, teacher_ids: list[str]) -> dict[str, int]: pass

    def save(self, cls_: Class) -> None: pass

    def delete(self, class_id: str) -> None: pass

    # ── Memberships ──────────────────────────────────────────────────────────
    def find_membership(self, class_id: str, student_id: str) -> ClassMembership | None: pass

    def find_memberships_by_class(self, class_id: str) -> list[ClassMembership]: pass

    def find_memberships_by_student(self, student_id: str) -> list[ClassMembership]: pass

    def count_memberships_by_class(self, class_id: str) -> int: pass

    def count_memberships_by_class_bulk(self, class_ids: list[str]) -> dict[str, int]: pass

    def count_memberships_by_student(self, student_id: str) -> int: pass

    def count_memberships_by_student_bulk(self, student_ids: list[str]) -> dict[str, int]: pass

    def save_membership(self, membership: ClassMembership) -> None: pass

    def delete_membership(self, class_id: str, student_id: str) -> None: pass

    def find_removed_membership(self, class_id: str, student_id: str) -> RemovedMembership | None: pass

    def record_removal(self, rm: RemovedMembership) -> None: pass

    def delete_removed_membership(self, class_id: str, student_id: str) -> None: pass

    # ── Co-teachers ──────────────────────────────────────────────────────────
    def find_co_teacher(self, class_id: str, teacher_id: str) -> ClassCoTeacher | None: pass

    def find_co_teachers_by_class(self, class_id: str) -> list[ClassCoTeacher]: pass

    def find_classes_where_co_teacher(self, teacher_id: str) -> list[Class]: pass

    def is_co_teacher(self, class_id: str, teacher_id: str) -> bool: pass

    def save_co_teacher(self, co: ClassCoTeacher) -> None: pass

    def delete_co_teacher(self, class_id: str, teacher_id: str) -> None: pass

    # ── Invites ──────────────────────────────────────────────────────────────
    def find_invite(self, class_id: str, email: str) -> PendingInvite | None: pass

    def find_invites_by_class(self, class_id: str) -> list[PendingInvite]: pass

    def find_invites_by_email(self, email: str) -> list[PendingInvite]: pass

    def save_invite(self, invite: PendingInvite) -> None: pass

    def delete_invite(self, class_id: str, email: str) -> None: pass

    def delete_invites_by_email(self, email: str) -> None: pass

    # ── Groups ───────────────────────────────────────────────────────────────
    def find_group_by_id(self, group_id: str) -> ClassGroup | None: pass

    def find_groups_by_class(self, class_id: str) -> list[ClassGroup]: pass

    def save_group(self, group: ClassGroup) -> None: pass

    def delete_group(self, group_id: str) -> None: pass

    def find_group_member(self, group_id: str, student_id: str) -> ClassGroupMember | None: pass

    def find_group_member_for_student_in_class(
        self, class_id: str, student_id: str,
    ) -> ClassGroupMember | None: pass

    def find_group_members_by_group(self, group_id: str) -> list[ClassGroupMember]: pass

    def find_group_members_by_class(self, class_id: str) -> list[ClassGroupMember]: pass

    def save_group_member(self, member: ClassGroupMember) -> None: pass

    def delete_group_member(self, group_id: str, student_id: str) -> None: pass

    def count_members_by_group_bulk(self, group_ids: list[str]) -> dict[str, int]: pass
