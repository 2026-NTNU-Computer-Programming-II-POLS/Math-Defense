"""TerritoryApplicationService — Grabbing Territory use cases"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, UTC
from typing import TYPE_CHECKING, Any

from app.domain.class_.errors import ClassNotFoundError
from app.domain.errors import ConstraintViolationError
from app.domain.territory.aggregate import GrabbingTerritoryActivity
from app.domain.territory.errors import (
    ActivityAlreadySettledError,
    ActivityExpiredError,
    ActivityNotFoundError,
    InvalidSessionError,
    NotActivityOwnerError,
    ScoreNotHighEnoughError,
    SlotNotFoundError,
)
from app.domain.user.value_objects import Role
from app.domain.value_objects import SessionStatus

_MIN_DEADLINE_BUFFER = timedelta(minutes=5)

if TYPE_CHECKING:
    from app.application.ports import UnitOfWork
    from app.domain.session.repository import GameSessionRepository
    from app.domain.territory.repository import TerritoryRepository
    from app.domain.class_.repository import ClassRepository

logger = logging.getLogger(__name__)


class TerritoryApplicationService:

    def __init__(
        self,
        territory_repo: TerritoryRepository,
        class_repo: ClassRepository,
        session_repo: GameSessionRepository,
        uow: UnitOfWork,
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

    def _get_activity_for_update_or_raise(self, activity_id: str) -> GrabbingTerritoryActivity:
        activity = self._territory_repo.find_activity_by_id_for_update(activity_id)
        if activity is None:
            raise ActivityNotFoundError("Activity not found")
        return activity

    def _verify_owner_or_admin(
        self,
        activity: GrabbingTerritoryActivity,
        user_id: str,
        user_role: Role,
        *,
        is_read_op: bool = False
    ) -> None:
        if user_role == Role.ADMIN:
            if not is_read_op:
                from app.domain.errors import PermissionDeniedError
                raise PermissionDeniedError("Admins have read-only access and cannot perform mutations")
            return
        # C-5: any teacher may settle an inter-class activity (no single owner)
        if user_role == Role.TEACHER and activity.class_id is None:
            return
        activity.verify_owner(user_id)

    def create_activity(
        self,
        teacher_id: str,
        user_role: Role,
        title: str,
        deadline: datetime,
        class_id: str | None,
        slots: list[dict[str, Any]],
    ) -> GrabbingTerritoryActivity:
        with self._uow:
            # B-H-4: domain guard against past-or-imminent deadlines
            dl = deadline if deadline.tzinfo else deadline.replace(tzinfo=UTC)
            if dl <= datetime.now(UTC) + _MIN_DEADLINE_BUFFER:
                raise ActivityExpiredError("Deadline must be at least 5 minutes in the future")

            if class_id:
                cls_ = self._class_repo.find_by_id(class_id)
                if cls_ is None:
                    raise ClassNotFoundError("Class not found")
                if user_role == Role.ADMIN:
                    from app.domain.errors import PermissionDeniedError
                    raise PermissionDeniedError("Admins have read-only access and cannot create activities")
                if cls_.teacher_id != teacher_id:
                    raise ClassNotFoundError("Class not found")

            activity = GrabbingTerritoryActivity.create(
                teacher_id=teacher_id,
                title=title,
                deadline=deadline,
                class_id=class_id,
            )
            self._territory_repo.save_activity(activity)

            for i, slot_def in enumerate(slots):
                pc = slot_def.get("path_config")
                if pc is not None and len(json.dumps(pc)) > 10_240:
                    raise ValueError(f"Slot {i}: path_config exceeds 10 KiB limit")
                slot = activity.add_slot(
                    star_rating=slot_def["star_rating"],
                    slot_index=i,
                    path_config=pc,
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
            if user_role == Role.ADMIN:
                return self._territory_repo.find_activities_by_class(class_id)
            if user_role == Role.TEACHER:
                cls_ = self._class_repo.find_by_id(class_id)
                if cls_ is None or cls_.teacher_id != user_id:
                    raise NotActivityOwnerError("You do not own this class")
                return self._territory_repo.find_activities_by_class(class_id)
            if self._class_repo.find_membership(class_id, user_id) is None:
                raise ActivityNotFoundError("Activity not found")
            return self._territory_repo.find_activities_by_class(class_id)
        if user_role == Role.ADMIN:
            return self._territory_repo.find_all_activities()
        if user_role == Role.TEACHER:
            # C-3: teachers see their own activities plus all inter-class activities
            owned = self._territory_repo.find_activities_by_teacher(user_id)
            seen = {a.id for a in owned}
            result = list(owned)
            for a in self._territory_repo.find_all_activities():
                if a.class_id is None and a.id not in seen:
                    seen.add(a.id)
                    result.append(a)
            return result
        memberships = self._class_repo.find_memberships_by_student(user_id)
        class_ids = [m.class_id for m in memberships]
        activities: list[GrabbingTerritoryActivity] = []
        seen: set[str] = set()
        for a in self._territory_repo.find_activities_by_class_ids(class_ids):
            if a.id not in seen:
                seen.add(a.id)
                activities.append(a)
        for a in self._territory_repo.find_all_activities():
            if a.class_id is None and a.id not in seen:
                seen.add(a.id)
                activities.append(a)
        return activities

    def _verify_activity_access(
        self,
        activity: GrabbingTerritoryActivity,
        user_id: str,
        user_role: Role,
    ) -> None:
        """Ensure the caller may view this activity's detail or rankings."""
        if user_role == Role.ADMIN:
            return
        # C-3: teachers may access their own activities and any inter-class activity
        if user_role == Role.TEACHER:
            if activity.class_id is not None and activity.teacher_id != user_id:
                raise ActivityNotFoundError("Activity not found")
            return
        if activity.class_id is None:
            return
        membership = self._class_repo.find_membership(activity.class_id, user_id)
        if membership is None:
            raise ActivityNotFoundError("Activity not found")

    def get_activity_detail(self, activity_id: str, user_id: str, user_role: Role) -> dict:
        # B-M-11: load slots into the aggregate so activity.slots is never stale
        activity = self._territory_repo.find_activity_by_id_with_slots(activity_id)
        if activity is None:
            raise ActivityNotFoundError("Activity not found")
        self._verify_activity_access(activity, user_id, user_role)
        return {"activity": activity, "slots": activity.slots}

    def _validate_session(
        self, session_id: str, student_id: str, slot_star_rating: int,
    ) -> float:
        session = self._session_repo.find_by_id(session_id, student_id)
        if session is None:
            raise InvalidSessionError("Game session not found")
        if session.status != SessionStatus.COMPLETED:
            raise InvalidSessionError("Game session is not completed")
        score = session.total_score if session.total_score is not None else float(session.score)
        if score < 0:
            raise InvalidSessionError("Game session has no valid score")
        if int(session.level) != slot_star_rating:
            raise InvalidSessionError(
                f"Session difficulty ({int(session.level)}) does not match "
                f"slot requirement ({slot_star_rating})"
            )
        return score

    def play_territory(
        self,
        activity_id: str,
        slot_id: str,
        student_id: str,
        session_id: str,
    ) -> dict:
        with self._uow:
            # B-H-2: lock activity row to prevent settle-vs-play race
            activity = self._get_activity_for_update_or_raise(activity_id)

            # B-H-5: check playable immediately, before any expensive validation
            activity.ensure_playable()

            # B-C-1: enforce class membership before any game logic
            self._verify_activity_access(activity, student_id, Role.STUDENT)

            # B-H-8: validate slot belongs to activity before acquiring any row lock;
            # use the lightweight lookup that reads only SlotModel so OccupationModel
            # is not cached in the identity map before find_occupation_by_slot_for_update
            slot_activity_id = self._territory_repo.find_slot_activity_id(slot_id)
            if slot_activity_id != activity_id:
                raise SlotNotFoundError("Territory slot not found in this activity")

            occ_from_db = self._territory_repo.find_occupation_by_slot_for_update(slot_id)

            slot = self._territory_repo.find_slot_by_id(slot_id)
            if slot is None:
                raise SlotNotFoundError("Territory slot not found in this activity")

            score = self._validate_session(session_id, student_id, slot.star_rating)

            # B-C-2: check durable session-use table (survives counter-seize deletions)
            if self._territory_repo.is_session_used(session_id):
                raise InvalidSessionError("This session has already been used for a territory capture")

            slot.occupation = occ_from_db

            raw_count = self._territory_repo.count_occupations_by_student_for_update(activity_id, student_id)
            effective_count = GrabbingTerritoryActivity.effective_occupation_count(
                raw_count, occ_from_db, student_id,
            )

            try:
                occupation = activity.attempt_occupation(slot, student_id, score, effective_count, session_id)
            except ScoreNotHighEnoughError:
                return {"seized": False, "occupation": None}

            try:
                # B-H-6: record_session_use flush can raise ConstraintViolationError if two
                # concurrent plays pass the is_session_used check then both race to insert;
                # treat as "session already used". save_occupation is also here to catch
                # slot-unique violations (B-C-3) in one handler.
                self._territory_repo.record_session_use(session_id)
                self._territory_repo.save_occupation(occupation)
                self._uow.commit()
            except ConstraintViolationError:
                return {"seized": False, "occupation": None}

            displaced = occ_from_db is not None and occ_from_db.student_id != occupation.student_id
            logger.info(
                "Territory seized: activity=%s slot=%s student=%s score=%.1f displaced=%s",
                activity_id, slot_id, student_id, score, displaced,
            )
        return {"seized": True, "occupation": occupation}

    def get_activity_external_rankings(self, activity_id: str, user_id: str, user_role: Role) -> list[dict]:
        activity = self._get_activity_or_raise(activity_id)
        self._verify_activity_access(activity, user_id, user_role)
        # B-H-10: pass class_id so repo can scope/reject intra-class activities
        return self._territory_repo.get_external_rankings(activity_id, activity.class_id)

    def get_activity_rankings(self, activity_id: str, user_id: str, user_role: Role) -> list[dict]:
        activity = self._get_activity_or_raise(activity_id)
        self._verify_activity_access(activity, user_id, user_role)
        # B-H-11: repo join includes player_name
        return self._territory_repo.get_internal_rankings(activity_id)

    def settle_activity(
        self,
        activity_id: str,
        requester_id: str,
        requester_role: Role,
    ) -> None:
        with self._uow:
            # B-H-2: lock activity row to prevent settle-vs-play race
            activity = self._get_activity_for_update_or_raise(activity_id)
            self._verify_owner_or_admin(activity, requester_id, requester_role)
            activity.settle(settled_by=requester_id)
            self._territory_repo.save_activity(activity)
            self._uow.commit()
            logger.info("GT activity settled: id=%s by=%s", activity_id, requester_id)

    def settle_expired(self) -> int:
        # Collect IDs outside any transaction so the loop's per-item UoW is clean
        expired_ids = [a.id for a in self._territory_repo.find_unsettled_expired_activities()]
        count = 0
        for activity_id in expired_ids:
            try:
                with self._uow:
                    # B-H-2: lock the row; B-H-3: re-check settled so concurrent
                    # settle calls skip gracefully rather than raising and aborting the batch
                    activity = self._territory_repo.find_activity_by_id_for_update(activity_id)
                    if activity is None or activity.settled:
                        continue
                    activity.settle(settled_by=None)
                    self._territory_repo.save_activity(activity)
                    self._uow.commit()
                    count += 1
            except ActivityAlreadySettledError:
                # Handled concurrently, safe to ignore
                pass
        return count
