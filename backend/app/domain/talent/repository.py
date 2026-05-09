"""TalentRepository — abstract interface (Protocol)"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.domain.talent.aggregate import TalentAllocation


@runtime_checkable
class TalentRepository(Protocol):
    def find_by_user(self, user_id: str) -> list[TalentAllocation]: pass

    def find_by_user_for_update(self, user_id: str) -> list[TalentAllocation]: pass

    def acquire_user_lock(self, user_id: str) -> None:
        """Take an exclusive row lock on ``users.id = user_id`` so concurrent
        talent allocations for the same user are serialised at the
        user-aggregate level. Locking the talent rows is insufficient because
        a user with no prior allocations has zero rows to lock — both
        concurrent INSERT paths would then bypass the budget check.
        Must be called inside the same transaction as the subsequent
        budget read and write.
        """
        ...

    def find_by_user_and_node(self, user_id: str, talent_node_id: str) -> TalentAllocation | None: pass

    def save(self, allocation: TalentAllocation) -> None: pass

    def delete_by_user(self, user_id: str) -> int: pass
