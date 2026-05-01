"""TerritoryApplicationService — Grabbing Territory use cases"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import TYPE_CHECKING, Any

from app.domain.class_.errors import ClassNotFoundError
from app.domain.territory.aggregate import GrabbingTerritoryActivity
from app.domain.territory.errors import (
    ActivityNotFoundError,
    InvalidSessionError,
    ScoreNotHighEnoughError,
    SlotNotFoundError,
)
from app.domain.user.value_objects import Role
from app.domain.value_objects import SessionStatus

if TYPE_CHECKING:
    from app.domain.session.repository import GameSessionRepository
    from app.domain.territory.repository import TerritoryRepository
    from app.domain.class_.repository import ClassRepository
    from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

logger = logging.getLogger(__name__)


class TerritoryApplicationService:

    def __init__(
        self,
        territory_repo: TerritoryRepository,
        class_repo: ClassRepository,
        session_repo: GameSessionRepository,
        uow: SqlAlchemyUnitOfWork,
    ) -> None:
        self._territory_repo = territory_repo
        self._class_repo = class_repo
        self._session_repo = session_repo
        self._uow = uow

    def _get_activity_or_raise(self, activity_id: str) -> GrabbingTerritoryActivity:
        activity = self._territory_repo.find_activity_by_id(activity_id)
        if activity is None:
            raise ActivityNotFoundError("Activity not found")
        return activity

    def _verify_owner_or_admin(
        self,
        activity: GrabbingTerritoryActivity,
        user_id: str,
        user_role: Role,
    ) -> None:
        if user_role == Role.ADMIN:
            return
        activity.verify_owner(user_id)

    def create_activity(
        self,
        teacher_id: str,
        title: str,
        deadline: datetime,
        class_id: str | None,
        slots: list[dict[str, Any]],
    ) -> GrabbingTerritoryActivity:
        with self._uow:
            if class_id:
                cls_ = self._class_repo.find_by_id(class_id)
                if cls_ is None:
                    raise ClassNotFoundError("Class not found")

            activity = GrabbingTerritoryActivity.create(
                teacher_id=teacher_id,
                title=title,
                deadline=deadline,
                class_id=class_id,
            )
            self._territory_repo.save_activity(activity)

            for i, slot_def in enumerate(slots):
                slot = activity.add_slot(
                    star_rating=slot_def["star_rating"],
                    slot_index=i,
                    path_config=slot_def.get("path_config"),
                )
                self._territory_repo.save_slot(slot)

            self._uow.commit()
            logger.info("GT activity created: id=%s teacher=%s", activity.id, teacher_id)
        return activity

    def list_activities(
        self,
        user_id: str,
        user_role: Role,
        class_id: str | None = None,
    ) -> list[GrabbingTerritoryActivity]:
        if class_id:
            return self._territory_repo.find_activities_by_class(class_id)
        if user_role == Role.ADMIN:
            return self._territory_repo.find_all_activities()
        if user_role == Role.TEACHER:
            return self._territory_repo.find_activities_by_teacher(user_id)
        memberships = self._class_repo.find_memberships_by_student(user_id)
        activities: list[GrabbingTerritoryActivity] = []
        seen: set[str] = set()
        for m in memberships:
            for a in self._territory_repo.find_activities_by_class(m.class_id):
                if a.id not in seen:
                    seen.add(a.id)
                    activities.append(a)
        for a in self._territory_repo.find_all_activities():
            if a.class_id is None and a.id not in seen:
                seen.add(a.id)
                activities.append(a)
        return activities

    def get_activity_detail(self, activity_id: str) -> dict:
        activity = self._get_activity_or_raise(activity_id)
        slots = self._territory_repo.find_slots_by_activity(activity_id)
        return {"activity": activity, "slots": slots}

    def _validate_session(
        self, session_id: str, student_id: str, slot_star_rating: int,
    ) -> float:
        session = self._session_repo.find_by_id(session_id, student_id)
        if session is None:
            raise InvalidSessionError("Game session not found")
        if session.status != SessionStatus.COMPLETED:
            raise InvalidSessionError("Game session is not completed")
        if session.total_score is None or session.total_score <= 0:
            raise InvalidSessionError("Game session has no valid score")
        if int(session.level) != slot_star_rating:
            raise InvalidSessionError(
                f"Session difficulty ({int(session.level)}) does not match "
                f"slot requirement ({slot_star_rating})"
            )
        return session.total_score

    def play_territory(
        self,
        activity_id: str,
        slot_id: str,
        student_id: str,
        session_id: str,
    ) -> dict:
        with self._uow:
            activity = self._get_activity_or_raise(activity_id)

            occ_from_db = self._territory_repo.find_occupation_by_slot_for_update(slot_id)

            slot = self._territory_repo.find_slot_by_id(slot_id)
            if slot is None or slot.activity_id != activity_id:
                raise SlotNotFoundError("Territory slot not found in this activity")

            score = self._validate_session(session_id, student_id, slot.star_rating)

            slot.occupation = occ_from_db

            raw_count = self._territory_repo.count_occupations_by_student(activity_id, student_id)
            effective_count = GrabbingTerritoryActivity.effective_occupation_count(
                raw_count, occ_from_db, student_id,
            )

            try:
                occupation = activity.attempt_occupation(slot, student_id, score, effective_count)
            except ScoreNotHighEnoughError:
                return {"seized": False, "occupation": occ_from_db}

            if occ_from_db and occ_from_db.student_id != occupation.student_id:
                self._territory_repo.delete_occupation(slot_id)

            self._territory_repo.save_occupation(occupation)
            self._uow.commit()

            displaced = occ_from_db is not None and occ_from_db.student_id != occupation.student_id
            logger.info(
                "Territory seized: activity=%s slot=%s student=%s score=%.1f displaced=%s",
                activity_id, slot_id, student_id, score, displaced,
            )
        return {"seized": True, "occupation": occupation}

    def get_activity_external_rankings(self, activity_id: str) -> list[dict]:
        self._get_activity_or_raise(activity_id)
        return self._territory_repo.get_external_rankings(activity_id)

    def get_activity_rankings(self, activity_id: str) -> list[dict]:
        self._get_activity_or_raise(activity_id)
        slots = self._territory_repo.find_slots_by_activity(activity_id)

        student_scores: dict[str, float] = {}
        for slot in slots:
            if slot.occupation:
                sid = slot.occupation.student_id
                student_scores[sid] = student_scores.get(sid, 0) + slot.star_rating

        ranked = sorted(student_scores.items(), key=lambda x: x[1], reverse=True)
        return [
            {"rank": i + 1, "student_id": sid, "territory_value": val}
            for i, (sid, val) in enumerate(ranked)
        ]

    def settle_activity(
        self,
        activity_id: str,
        requester_id: str,
        requester_role: Role,
    ) -> None:
        with self._uow:
            activity = self._get_activity_or_raise(activity_id)
            self._verify_owner_or_admin(activity, requester_id, requester_role)
            activity.settle()
            self._territory_repo.save_activity(activity)
            self._uow.commit()
            logger.info("GT activity settled: id=%s", activity_id)

    def settle_expired(self) -> int:
        expired = self._territory_repo.find_unsettled_expired_activities()
        count = 0
        for activity in expired:
            with self._uow:
                activity.settle()
                self._territory_repo.save_activity(activity)
                self._uow.commit()
                count += 1
        return count
