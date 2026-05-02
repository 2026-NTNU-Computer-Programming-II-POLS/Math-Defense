"""Grabbing Territory Aggregate Root"""
from __future__ import annotations

import uuid
from datetime import datetime, UTC
from typing import Any

from app.domain.territory.errors import (
    ActivityExpiredError,
    ActivityAlreadySettledError,
    TerritoryCapReachedError,
    ScoreNotHighEnoughError,
    NotActivityOwnerError,
)

TERRITORY_CAP_PER_STUDENT = 5


class TerritoryOccupation:

    def __init__(
        self,
        id: str,
        slot_id: str,
        student_id: str,
        score: float,
        occupied_at: datetime | None = None,
        player_name: str | None = None,
        session_id: str | None = None,
    ) -> None:
        self.id = id
        self.slot_id = slot_id
        self.student_id = student_id
        self.score = score
        self.occupied_at = occupied_at or datetime.now(UTC)
        self.player_name = player_name
        self.session_id = session_id


class TerritorySlot:

    def __init__(
        self,
        id: str,
        activity_id: str,
        star_rating: int,
        slot_index: int,
        path_config: dict[str, Any] | None = None,
        occupation: TerritoryOccupation | None = None,
    ) -> None:
        self.id = id
        self.activity_id = activity_id
        self.star_rating = star_rating
        self.slot_index = slot_index
        self.path_config = path_config
        self.occupation = occupation

    @classmethod
    def create(
        cls,
        activity_id: str,
        star_rating: int,
        slot_index: int,
        path_config: dict[str, Any] | None = None,
    ) -> TerritorySlot:
        return cls(
            id=str(uuid.uuid4()),
            activity_id=activity_id,
            star_rating=star_rating,
            slot_index=slot_index,
            path_config=path_config,
        )


class GrabbingTerritoryActivity:
    """
    Aggregate root for a Grabbing Territory activity.

    Invariants:
    1. Only the owning teacher can mutate the activity.
    2. No occupation changes after settlement or past deadline.
    3. A student may hold at most TERRITORY_CAP_PER_STUDENT slots per activity.
    4. A slot can only be seized if empty or the new score beats the current holder.
    5. One occupation per slot (enforced by DB unique constraint).
    """

    def __init__(
        self,
        id: str,
        class_id: str | None,
        teacher_id: str,
        title: str,
        deadline: datetime,
        settled: bool = False,
        created_at: datetime | None = None,
        slots: list[TerritorySlot] | None = None,
        settled_at: datetime | None = None,
        settled_by: str | None = None,
    ) -> None:
        self.id = id
        self.class_id = class_id
        self.teacher_id = teacher_id
        self.title = title
        self.deadline = deadline
        self.settled = settled
        self.created_at = created_at or datetime.now(UTC)
        self.slots: list[TerritorySlot] = slots or []
        self.settled_at = settled_at
        self.settled_by = settled_by

    @classmethod
    def create(
        cls,
        teacher_id: str,
        title: str,
        deadline: datetime,
        class_id: str | None = None,
    ) -> GrabbingTerritoryActivity:
        return cls(
            id=str(uuid.uuid4()),
            class_id=class_id,
            teacher_id=teacher_id,
            title=title,
            deadline=deadline,
        )

    def is_owned_by(self, user_id: str) -> bool:
        return self.teacher_id == user_id

    def verify_owner(self, user_id: str) -> None:
        if not self.is_owned_by(user_id):
            raise NotActivityOwnerError("You do not own this activity")

    def is_expired(self) -> bool:
        return datetime.now(UTC) >= self.deadline

    def ensure_playable(self) -> None:
        if self.settled:
            raise ActivityAlreadySettledError("This activity has been settled")
        if self.is_expired():
            raise ActivityExpiredError("This activity has passed its deadline")

    def add_slot(self, star_rating: int, slot_index: int, path_config: dict[str, Any] | None = None) -> TerritorySlot:
        slot = TerritorySlot.create(
            activity_id=self.id,
            star_rating=star_rating,
            slot_index=slot_index,
            path_config=path_config,
        )
        self.slots.append(slot)
        return slot

    @staticmethod
    def effective_occupation_count(
        raw_count: int,
        current_occupation: TerritoryOccupation | None,
        student_id: str,
    ) -> int:
        """Compute how many *other* slots the student holds.

        When the student already owns the target slot, the raw repo count
        includes that slot — subtract 1 so the cap check reflects the
        number of *additional* slots the student would hold after the seize.
        """
        if current_occupation and current_occupation.student_id == student_id:
            return max(0, raw_count - 1)
        return raw_count

    def attempt_occupation(
        self,
        slot: TerritorySlot,
        student_id: str,
        new_score: float,
        student_occupation_count: int,
        session_id: str | None = None,
    ) -> TerritoryOccupation:
        self.ensure_playable()

        current = slot.occupation

        if current is not None and current.student_id == student_id:
            if new_score <= current.score:
                raise ScoreNotHighEnoughError(
                    "Your new score does not beat your current score on this territory"
                )
            # B-M-2: return new object instead of mutating current in place so
            # a rollback (IntegrityError) cannot leave the aggregate in a dirty state.
            return TerritoryOccupation(
                id=current.id,
                slot_id=current.slot_id,
                student_id=current.student_id,
                score=new_score,
                occupied_at=datetime.now(UTC),
                session_id=session_id,
            )

        if current is not None and new_score <= current.score:
            raise ScoreNotHighEnoughError(
                "Your score does not beat the current holder's score"
            )

        if student_occupation_count >= TERRITORY_CAP_PER_STUDENT:
            raise TerritoryCapReachedError(
                f"You already hold {TERRITORY_CAP_PER_STUDENT} territories in this activity"
            )

        return TerritoryOccupation(
            id=str(uuid.uuid4()),
            slot_id=slot.id,
            student_id=student_id,
            score=new_score,
            session_id=session_id,
        )

    def settle(self, settled_by: str | None = None) -> None:
        if self.settled:
            raise ActivityAlreadySettledError("Activity already settled")
        self.settled = True
        self.settled_at = datetime.now(UTC)
        self.settled_by = settled_by
