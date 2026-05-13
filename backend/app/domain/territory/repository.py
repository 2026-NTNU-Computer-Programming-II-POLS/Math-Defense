"""TerritoryRepository — abstract interface"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.domain.territory.aggregate import (
    GrabbingTerritoryActivity,
    TerritorySlot,
    TerritoryOccupation,
)


@runtime_checkable
class TerritoryRepository(Protocol):

    def find_activity_by_id(self, activity_id: str) -> GrabbingTerritoryActivity | None: pass

    def find_activity_by_id_for_update(self, activity_id: str) -> GrabbingTerritoryActivity | None: pass

    def find_activity_by_id_with_slots(self, activity_id: str) -> GrabbingTerritoryActivity | None: pass

    def find_activities_by_class(self, class_id: str) -> list[GrabbingTerritoryActivity]: pass

    def find_activities_by_class_ids(self, class_ids: list[str]) -> list[GrabbingTerritoryActivity]: pass

    def find_activities_by_teacher(self, teacher_id: str) -> list[GrabbingTerritoryActivity]: pass

    def find_all_activities(self) -> list[GrabbingTerritoryActivity]: pass

    def find_unsettled_expired_activities(self) -> list[GrabbingTerritoryActivity]: pass

    def save_activity(self, activity: GrabbingTerritoryActivity) -> None: pass

    def find_slot_by_id(self, slot_id: str) -> TerritorySlot | None: pass

    def find_slot_activity_id(self, slot_id: str) -> str | None: pass

    def find_slots_by_activity(self, activity_id: str) -> list[TerritorySlot]: pass

    def save_slot(self, slot: TerritorySlot) -> None: pass

    def find_occupation_by_slot_for_update(self, slot_id: str) -> TerritoryOccupation | None: pass

    def count_occupations_by_student(self, activity_id: str, student_id: str) -> int: pass

    def count_occupations_by_student_for_update(self, activity_id: str, student_id: str) -> int: pass

    def is_session_used(self, session_id: str) -> bool: pass

    def record_session_use(self, session_id: str) -> None: pass

    def save_occupation(self, occupation: TerritoryOccupation) -> None: pass

    def delete_occupation(self, slot_id: str) -> None: pass

    def find_occupations_by_activity(self, activity_id: str) -> list[TerritoryOccupation]: pass

    def get_external_rankings(self, activity_id: str, activity_class_id: str | None) -> list[dict]: pass

    def get_internal_rankings(self, activity_id: str) -> list[dict]: pass

    def delete_occupations_for_student_in_class(self, student_id: str, class_id: str) -> None: pass

    def count_territories_by_student(self, student_id: str) -> int: pass

    def find_max_star_for_student(self, student_id: str) -> int: pass
