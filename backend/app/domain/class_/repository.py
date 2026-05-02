"""ClassRepository — abstract interface"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.domain.class_.aggregate import Class, ClassMembership, RemovedMembership


@runtime_checkable
class ClassRepository(Protocol):
    def find_by_id(self, class_id: str) -> Class | None: pass

    def find_by_ids(self, class_ids: list[str]) -> list[Class]: pass

    def find_by_join_code(self, code: str) -> Class | None: pass

    def find_by_teacher(self, teacher_id: str) -> list[Class]: pass

    def find_all(self) -> list[Class]: pass

    def find_all_paginated(self, offset: int, limit: int) -> tuple[list[Class], int]: pass

    def count_by_teacher(self, teacher_id: str) -> int: pass

    def save(self, cls_: Class) -> None: pass

    def delete(self, class_id: str) -> None: pass

    def find_membership(self, class_id: str, student_id: str) -> ClassMembership | None: pass

    def find_memberships_by_class(self, class_id: str) -> list[ClassMembership]: pass

    def find_memberships_by_student(self, student_id: str) -> list[ClassMembership]: pass

    def count_memberships_by_class(self, class_id: str) -> int: pass

    def count_memberships_by_student(self, student_id: str) -> int: pass

    def save_membership(self, membership: ClassMembership) -> None: pass

    def delete_membership(self, class_id: str, student_id: str) -> None: pass

    def find_removed_membership(self, class_id: str, student_id: str) -> RemovedMembership | None: pass

    def record_removal(self, rm: RemovedMembership) -> None: pass

    def delete_removed_membership(self, class_id: str, student_id: str) -> None: pass
