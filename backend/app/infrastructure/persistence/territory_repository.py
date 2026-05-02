"""SQLAlchemy implementation of TerritoryRepository"""
from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from app.domain.territory.aggregate import (
    GrabbingTerritoryActivity,
    TerritorySlot,
    TerritoryOccupation,
)
from app.models.class_membership import ClassMembership as MembershipModel
from app.models.territory import (
    GrabbingTerritoryActivity as ActivityModel,
    TerritorySlot as SlotModel,
    TerritoryOccupation as OccupationModel,
)
from app.models.user import User as UserModel


class SqlAlchemyTerritoryRepository:

    def __init__(self, db: DbSession):
        self._db = db

    # ── Activity ──

    def find_activity_by_id(self, activity_id: str) -> GrabbingTerritoryActivity | None:
        row = self._db.query(ActivityModel).filter(ActivityModel.id == activity_id).first()
        return self._activity_to_domain(row) if row else None

    def find_activities_by_class(self, class_id: str) -> list[GrabbingTerritoryActivity]:
        rows = self._db.query(ActivityModel).filter(ActivityModel.class_id == class_id).all()
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
            .all()
        )
        return [self._activity_to_domain(r) for r in rows]

    def save_activity(self, activity: GrabbingTerritoryActivity) -> None:
        row = self._db.query(ActivityModel).filter(ActivityModel.id == activity.id).first()
        if row:
            row.title = activity.title
            row.deadline = activity.deadline
            row.settled = activity.settled
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

    def is_session_used(self, session_id: str) -> bool:
        return (
            self._db.query(OccupationModel.id)
            .filter(OccupationModel.session_id == session_id)
            .first()
        ) is not None

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

    def get_external_rankings(self, activity_id: str) -> list[dict]:
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
        avg_col = func.avg(student_val.c.territory_value)
        rows = (
            self._db.query(
                MembershipModel.class_id,
                avg_col.label("avg_territory_value"),
            )
            .join(student_val, MembershipModel.student_id == student_val.c.student_id)
            .group_by(MembershipModel.class_id)
            .order_by(avg_col.desc())
            .all()
        )
        return [
            {
                "rank": i + 1,
                "class_id": row.class_id,
                "avg_territory_value": float(row.avg_territory_value),
            }
            for i, row in enumerate(rows)
        ]

    def count_territories_by_student(self, student_id: str) -> int:
        return (
            self._db.query(func.count(OccupationModel.id))
            .filter(OccupationModel.student_id == student_id)
            .scalar()
        ) or 0

    def find_max_star_for_student(self, student_id: str) -> int:
        result = (
            self._db.query(func.max(SlotModel.star_rating))
            .join(OccupationModel, SlotModel.id == OccupationModel.slot_id)
            .filter(OccupationModel.student_id == student_id)
            .scalar()
        )
        return result or 0

    def find_occupations_by_activity(self, activity_id: str) -> list[TerritoryOccupation]:
        rows = (
            self._db.query(OccupationModel)
            .join(SlotModel, OccupationModel.slot_id == SlotModel.id)
            .filter(SlotModel.activity_id == activity_id)
            .all()
        )
        return [self._occupation_to_domain(r) for r in rows]

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
