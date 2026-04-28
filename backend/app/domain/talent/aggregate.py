"""TalentAllocation Aggregate Root"""
from __future__ import annotations

import uuid
from datetime import datetime, UTC


class TalentAllocation:
    def __init__(
        self,
        id: str,
        user_id: str,
        talent_node_id: str,
        current_level: int,
        updated_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.user_id = user_id
        self.talent_node_id = talent_node_id
        self.current_level = current_level
        self.updated_at = updated_at or datetime.now(UTC)

    @classmethod
    def create(cls, user_id: str, talent_node_id: str) -> TalentAllocation:
        return cls(
            id=str(uuid.uuid4()),
            user_id=user_id,
            talent_node_id=talent_node_id,
            current_level=1,
        )

    def upgrade(self) -> None:
        self.current_level += 1
        self.updated_at = datetime.now(UTC)
