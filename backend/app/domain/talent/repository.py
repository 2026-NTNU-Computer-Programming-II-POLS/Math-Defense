"""TalentRepository — abstract interface (Protocol)"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.domain.talent.aggregate import TalentAllocation


@runtime_checkable
class TalentRepository(Protocol):
    def find_by_user(self, user_id: str) -> list[TalentAllocation]: ...

    def find_by_user_for_update(self, user_id: str) -> list[TalentAllocation]: ...

    def find_by_user_and_node(self, user_id: str, talent_node_id: str) -> TalentAllocation | None: ...

    def save(self, allocation: TalentAllocation) -> None: ...

    def delete_by_user(self, user_id: str) -> int: ...
