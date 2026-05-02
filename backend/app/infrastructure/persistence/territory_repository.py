"""SQLAlchemy implementation of TerritoryRepository"""
from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session as DbSession

from app.domain.territory.aggregate import (
    GrabbingTerritoryActivity,
    TerritorySlot,
    TerritoryOccupation,
)
from app.models.class_ import Class as ClassModel
from app.models.class_membership import ClassMembership as MembershipModel
from app.models.territory import (
    GrabbingTerritoryActivity as ActivityModel,
    TerritorySlot as SlotModel,
    TerritoryOccupation as OccupationModel,
    TerritorySessionUse as SessionUseModel,
)
from app.models.user import User as UserModel


class SqlAlchemyTerritoryRepository:

    def __init__(self, db: DbSession):
        self._db = db

    # ── Activity ──

    def find_activity_by_id(self, activity_id: str) -> GrabbingTerritoryActivity | None:
        row = self._db.query(ActivityModel).filter(ActivityModel.id == activity_id).first()
        return self._activity_to_domain(row) if row else None

    def find_activity_by_id_with_slots(self, activity_id: str) -> GrabbingTerritoryActivity | None:
        row = self._db.query(ActivityModel).filter(ActivityModel.id == activity_id).first()
        if not row:
            return None
        activity = self._activity_to_domain(row)
        activity.slots = self.find_slots_by_activity(activity_id)
        return activity

    def find_activity_by_id_for_update(self, activity_id: str) -> GrabbingTerritoryActivity | None:
        row = (
            self._db.query(ActivityModel)
            .filter(ActivityModel.id == activity_id)
            .with_for_update()
            .first()
        )
        return self._activity_to_domain(row) if row else None

    def find_activities_by_class(self, class_id: str) -> list[GrabbingTerritoryActivity]:
        rows = self._db.query(ActivityModel).filter(ActivityModel.class_id == class_id).all()
        return [self._activity_to_domain(r) for r in rows]

    def find_activities_by_class_ids(self, class_ids: list[str]) -> list[GrabbingTerritoryActivity]:
        if not class_ids:
            return []
        rows = self._db.query(ActivityModel).filter(ActivityModel.class_id.in_(class_ids)).all()
        return [self._activity_to_domain(r) for r in rows]

    def find_activities_by_teacher(self, teacher_id: str) -> list[GrabbingTerritoryActivity]:
        rows = self._db.query(ActivityModel).filter(ActivityModel.teacher_id == teacher_id).all()
        return [self._activity_to_domain(r) for r in rows]

    def find_all_activities(self) -> list[GrabbingTerritoryActivity]:
        rows = self._db.query(ActivityModel).order_by(ActivityModel.created_at.desc()).all()
        return [self._activity_to_domain(r) for r in rows]

    def find_unsettled_expired_activities(self) -> list[GrabbingTerritoryActivity]:
        now = datetime.now(UTC)
        rows = (
            self._db.query(ActivityModel)
            .filter(ActivityModel.settled == False, ActivityModel.deadline < now)
            .order_by(ActivityModel.deadline.asc())
            .all()
        )
        return [self._activity_to_domain(r) for r in rows]

    def save_activity(self, activity: GrabbingTerritoryActivity) -> None:
        row = self._db.query(ActivityModel).filter(ActivityModel.id == activity.id).first()
        if row:
            row.title = activity.title
            row.deadline = activity.deadline
            row.settled = activity.settled
            row.settled_at = activity.settled_at
            row.settled_by = activity.settled_by
            row.class_id = activity.class_id
        else:
            row = ActivityModel(
                id=activity.id,
                class_id=activity.class_id,
                teacher_id=activity.teacher_id,
                title=activity.title,
                deadline=activity.deadline,
                settled=activity.settled,
                created_at=activity.created_at,
            )
            self._db.add(row)
        self._db.flush()

    # ── Slot ──

    def find_slot_by_id(self, slot_id: str) -> TerritorySlot | None:
        row = self._db.query(SlotModel).filter(SlotModel.id == slot_id).first()
        if not row:
            return None
        occ = self._db.query(OccupationModel).filter(OccupationModel.slot_id == slot_id).first()
        return self._slot_to_domain(row, occ)

    def find_slot_activity_id(self, slot_id: str) -> str | None:
        """Return only the activity_id for a slot — no occupation load, safe to call before FOR UPDATE."""
        row = self._db.query(SlotModel.activity_id).filter(SlotModel.id == slot_id).first()
        return row.activity_id if row else None

    def find_slots_by_activity(self, activity_id: str) -> list[TerritorySlot]:
        rows = (
            self._db.query(SlotModel)
            .filter(SlotModel.activity_id == activity_id)
            .order_by(SlotModel.slot_index)
            .all()
        )
        slot_ids = [r.id for r in rows]
        occs: dict[str, tuple[OccupationModel, str | None]] = {}
        if slot_ids:
            occ_rows = (
                self._db.query(OccupationModel, UserModel.player_name.label("player_name"))
                .join(UserModel, OccupationModel.student_id == UserModel.id)
                .filter(OccupationModel.slot_id.in_(slot_ids))
                .all()
            )
            for row in occ_rows:
                occ_model, player_name = row[0], row[1]
                occs[occ_model.slot_id] = (occ_model, player_name)
        result = []
        for r in rows:
            if r.id in occs:
                occ_model, player_name = occs[r.id]
                result.append(self._slot_to_domain(r, occ_model, player_name))
            else:
                result.append(self._slot_to_domain(r, None))
        return result

    def save_slot(self, slot: TerritorySlot) -> None:
        row = self._db.query(SlotModel).filter(SlotModel.id == slot.id).first()
        if row:
            row.star_rating = slot.star_rating
            row.path_config = slot.path_config
            row.slot_index = slot.slot_index
        else:
            row = SlotModel(
                id=slot.id,
                activity_id=slot.activity_id,
                star_rating=slot.star_rating,
                path_config=slot.path_config,
                slot_index=slot.slot_index,
            )
            self._db.add(row)
        self._db.flush()

    # ── Occupation ──

    def find_occupation_by_slot_for_update(self, slot_id: str) -> TerritoryOccupation | None:
        row = (
            self._db.query(OccupationModel)
            .filter(OccupationModel.slot_id == slot_id)
            .with_for_update()
            .first()
        )
        return self._occupation_to_domain(row) if row else None

    def count_occupations_by_student(self, activity_id: str, student_id: str) -> int:
        return (
            self._db.query(func.count(OccupationModel.id))
            .join(SlotModel, OccupationModel.slot_id == SlotModel.id)
            .filter(SlotModel.activity_id == activity_id, OccupationModel.student_id == student_id)
            .scalar()
        ) or 0

    def count_occupations_by_student_for_update(self, activity_id: str, student_id: str) -> int:
        rows = (
            self._db.query(OccupationModel.id)
            .join(SlotModel, OccupationModel.slot_id == SlotModel.id)
            .filter(SlotModel.activity_id == activity_id, OccupationModel.student_id == student_id)
            .with_for_update()
            .all()
        )
        return len(rows)

    def acquire_student_activity_lock(self, activity_id: str, student_id: str) -> None:
        # B-M-1: advisory lock on (activity, student) pair prevents two parallel
        # requests by the same student from both reading count=4 and both inserting.
        self._db.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:a)::int, hashtext(:s)::int)"),
            {"a": activity_id, "s": student_id},
        )

    def is_session_used(self, session_id: str) -> bool:
        return (
            self._db.query(SessionUseModel.session_id)
            .filter(SessionUseModel.session_id == session_id)
            .first()
        ) is not None

    def record_session_use(self, session_id: str) -> None:
        self._db.merge(SessionUseModel(session_id=session_id))
        self._db.flush()

    def save_occupation(self, occupation: TerritoryOccupation) -> None:
        row = self._db.query(OccupationModel).filter(OccupationModel.slot_id == occupation.slot_id).first()
        if row:
            row.student_id = occupation.student_id
            row.score = occupation.score
            row.session_id = occupation.session_id
            row.occupied_at = occupation.occupied_at
        else:
            row = OccupationModel(
                id=occupation.id,
                slot_id=occupation.slot_id,
                student_id=occupation.student_id,
                score=occupation.score,
                session_id=occupation.session_id,
                occupied_at=occupation.occupied_at,
            )
            self._db.add(row)
        self._db.flush()

    def delete_occupation(self, slot_id: str) -> None:
        self._db.query(OccupationModel).filter(OccupationModel.slot_id == slot_id).delete()
        self._db.flush()

    def count_territories_by_student(self, student_id: str) -> int:
        """Return the number of territory slots currently occupied by this student."""
        return (
            self._db.query(func.count(OccupationModel.id))
            .filter(OccupationModel.student_id == student_id)
            .scalar()
        ) or 0

    def find_max_star_for_student(self, student_id: str) -> int:
        """Return the highest star_rating among slots currently occupied by this student.

        Returns 0 when the student holds no territory.
        """
        result = (
            self._db.query(func.max(SlotModel.star_rating))
            .join(OccupationModel, SlotModel.id == OccupationModel.slot_id)
            .filter(OccupationModel.student_id == student_id)
            .scalar()
        )
        return result or 0

    def get_external_rankings(self, activity_id: str, activity_class_id: str | None) -> list[dict]:
        # B-H-10 / C-2: external ranking is meaningless for a class-scoped activity
        if activity_class_id is not None:
            return []

        student_val = (
            select(
                OccupationModel.student_id,
                func.sum(SlotModel.star_rating).label("territory_value"),
            )
            .join(SlotModel, OccupationModel.slot_id == SlotModel.id)
            .where(SlotModel.activity_id == activity_id)
            .group_by(OccupationModel.student_id)
            .subquery()
        )
        # C-1: count how many classes each student belongs to; a student in N classes
        # has their score weighted 1/N so they don't inflate multiple class averages.
        student_class_count = (
            select(
                MembershipModel.student_id,
                func.count(MembershipModel.class_id).label("class_count"),
            )
            .group_by(MembershipModel.student_id)
            .subquery()
        )
        # B-H-9 / C-1: LEFT JOIN so non-participating members contribute 0;
        # divide by class_count so multi-class students aren't double-counted.
        weighted_val = (
            func.coalesce(student_val.c.territory_value, 0.0)
            / student_class_count.c.class_count
        )
        avg_col = func.avg(weighted_val)
        rows = (
            self._db.query(
                MembershipModel.class_id,
                ClassModel.name.label("class_name"),
                avg_col.label("avg_territory_value"),
            )
            .join(ClassModel, MembershipModel.class_id == ClassModel.id)
            .outerjoin(student_val, MembershipModel.student_id == student_val.c.student_id)
            .join(student_class_count, MembershipModel.student_id == student_class_count.c.student_id)
            .group_by(MembershipModel.class_id, ClassModel.name)
            .order_by(avg_col.desc())
            .all()
        )
        return [
            {
                "rank": i + 1,
                "class_id": row.class_id,
                "class_name": row.class_name,
                "avg_territory_value": float(row.avg_territory_value),
            }
            for i, row in enumerate(rows)
        ]

    def get_internal_rankings(self, activity_id: str) -> list[dict]:
        # B-H-11: include player_name so callers don't expose raw UUIDs
        territory_value = func.sum(SlotModel.star_rating)
        rows = (
            self._db.query(
                OccupationModel.student_id,
                UserModel.player_name,
                territory_value.label("territory_value"),
            )
            .join(SlotModel, OccupationModel.slot_id == SlotModel.id)
            .join(UserModel, OccupationModel.student_id == UserModel.id)
            .filter(SlotModel.activity_id == activity_id)
            .group_by(OccupationModel.student_id, UserModel.player_name)
            .order_by(territory_value.desc(), UserModel.player_name.asc())
            .all()
        )
        # B-M-4: competition-style ranking (1, 1, 3) with secondary sort by player_name
        result: list[dict] = []
        rank = 0
        prev_value: float | None = None
        for i, row in enumerate(rows):
            tv = float(row.territory_value)
            if tv != prev_value:
                rank = i + 1
                prev_value = tv
            result.append({
                "rank": rank,
                "student_id": row.student_id,
                "player_name": row.player_name,
                "territory_value": tv,
            })
        return result

    def find_occupations_by_activity(self, activity_id: str) -> list[TerritoryOccupation]:
        rows = (
            self._db.query(OccupationModel)
            .join(SlotModel, OccupationModel.slot_id == SlotModel.id)
            .filter(SlotModel.activity_id == activity_id)
            .all()
        )
        return [self._occupation_to_domain(r) for r in rows]

    def delete_occupations_for_student_in_class(self, student_id: str, class_id: str) -> None:
        slot_ids_query = (
            self._db.query(SlotModel.id)
            .join(ActivityModel, SlotModel.activity_id == ActivityModel.id)
            .filter(ActivityModel.class_id == class_id)
        )
        self._db.query(OccupationModel).filter(
            OccupationModel.student_id == student_id,
            OccupationModel.slot_id.in_(slot_ids_query),
        ).delete(synchronize_session=False)
        self._db.flush()

    # ── Mappers ──

    @staticmethod
    def _activity_to_domain(row: ActivityModel) -> GrabbingTerritoryActivity:
        return GrabbingTerritoryActivity(
            id=row.id,
            class_id=row.class_id,
            teacher_id=row.teacher_id,
            title=row.title,
            deadline=_ensure_utc(row.deadline),
            settled=row.settled,
            settled_at=_ensure_utc(row.settled_at),
            settled_by=row.settled_by,
            created_at=_ensure_utc(row.created_at),
        )

    @staticmethod
    def _slot_to_domain(row: SlotModel, occ_row: OccupationModel | None = None, player_name: str | None = None) -> TerritorySlot:
        occupation = None
        if occ_row:
            occupation = TerritoryOccupation(
                id=occ_row.id,
                slot_id=occ_row.slot_id,
                student_id=occ_row.student_id,
                score=occ_row.score,
                occupied_at=_ensure_utc(occ_row.occupied_at),
                player_name=player_name,
                session_id=occ_row.session_id,
            )
        return TerritorySlot(
            id=row.id,
            activity_id=row.activity_id,
            star_rating=row.star_rating,
            slot_index=row.slot_index,
            path_config=row.path_config,
            occupation=occupation,
        )

    @staticmethod
    def _occupation_to_domain(row: OccupationModel) -> TerritoryOccupation:
        return TerritoryOccupation(
            id=row.id,
            slot_id=row.slot_id,
            student_id=row.student_id,
            score=row.score,
            occupied_at=_ensure_utc(row.occupied_at),
            session_id=row.session_id,
        )


def _ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
