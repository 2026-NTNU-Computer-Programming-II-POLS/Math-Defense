"""ClassApplicationService — classroom CRUD and membership management"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

from app.domain.class_.aggregate import (
    Class,
    ClassCoTeacher,
    ClassGroup,
    ClassGroupMember,
    ClassMembership,
    PendingInvite,
    RemovedMembership,
)
from app.domain.class_.errors import (
    CannotAddOwnerAsCoTeacherError,
    ClassAlreadyArchivedError,
    ClassArchivedError,
    ClassCapacityReachedError,
    ClassNameConflictError,
    ClassNotArchivedError,
    ClassNotFoundError,
    CoTeacherAlreadyExistsError,
    CoTeacherNotFoundError,
    GroupNameConflictError,
    GroupNotFoundError,
    InvalidJoinCodeError,
    InviteAlreadyExistsError,
    InviteNotFoundError,
    NotAStudentError,
    NotATeacherError,
    StudentAlreadyInClassError,
    StudentAlreadyInGroupError,
    StudentEmailNotFoundError,
    StudentNotInClassError,
    StudentNotInClassForGroupError,
    StudentRemovedFromClassError,
)
from app.domain.errors import ConstraintViolationError, PermissionDeniedError
from app.domain.user.value_objects import Email, Role

if TYPE_CHECKING:
    from app.application.ports import UnitOfWork
    from app.domain.class_.repository import ClassRepository
    from app.domain.session.repository import GameSessionRepository
    from app.domain.territory.repository import TerritoryRepository
    from app.domain.user.repository import UserRepository


@dataclass(frozen=True)
class ClassReflectionView:
    """Read-side projection: one student reflection in a class roster."""
    session_id: str
    student_id: str
    student_name: str
    star_rating: int
    score: int
    reflection_text: str
    ended_at: datetime | None


@dataclass(frozen=True)
class ClassLeaderboardRow:
    student_id: str
    player_name: str
    sessions_played: int
    average_stars: float
    total_score: int
    last_played_at: datetime | None


@dataclass(frozen=True)
class ClassReportRow:
    student_id: str
    player_name: str
    email: str
    joined_at: datetime
    sessions_played: int
    average_stars: float
    total_score: int
    last_played_at: datetime | None
    reflections_count: int


@dataclass(frozen=True)
class BulkAddOutcome:
    added: list[tuple[ClassMembership, object]]
    invited: list[PendingInvite]
    skipped: list[dict]


logger = logging.getLogger(__name__)


_CLASS_NAME_UNIQUE_CONSTRAINT = "uq_classes_teacher_name"
_GROUP_NAME_UNIQUE_CONSTRAINT = "uq_class_groups_class_name"
_CO_TEACHER_UNIQUE_CONSTRAINT = "uq_class_co_teachers_class_teacher"
_INVITE_UNIQUE_CONSTRAINT = "uq_class_invites_class_email"


class ClassApplicationService:

    def __init__(
        self,
        class_repo: ClassRepository,
        user_repo: UserRepository,
        uow: UnitOfWork,
        territory_repo: TerritoryRepository | None = None,
        session_repo: "GameSessionRepository | None" = None,
    ) -> None:
        self._class_repo = class_repo
        self._user_repo = user_repo
        self._uow = uow
        self._territory_repo = territory_repo
        # Optional so unit tests can construct without §17 reflection wiring.
        self._session_repo = session_repo

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _get_class_or_raise(self, class_id: str) -> Class:
        cls_ = self._class_repo.find_by_id(class_id)
        if cls_ is None:
            raise ClassNotFoundError("Class not found")
        return cls_

    def _is_co_teacher(self, class_id: str, user_id: str) -> bool:
        return self._class_repo.is_co_teacher(class_id, user_id)

    def _verify_owner_or_admin(self, cls_: Class, user_id: str, user_role: Role, *, is_read_op: bool = False) -> None:
        # ADMIN policy: read-only across class management. Write routers in
        # routers/class_.py already gate to TEACHER, so an ADMIN never reaches
        # this branch in production — the explicit raise is defence-in-depth
        # for non-HTTP callers (scripts, future schedulers) and protects
        # the invariant if the router gate is ever loosened by mistake.
        if user_role == Role.ADMIN:
            if not is_read_op:
                raise PermissionDeniedError("Admins have read-only access and cannot perform mutations")
            return
        if cls_.is_owned_by(user_id):
            return
        # Co-teachers may read but not perform owner-only mutations. Owner-
        # only operations (delete, transfer, archive, add/remove co-teacher)
        # bypass this helper and call cls_.verify_owner directly.
        if is_read_op and self._is_co_teacher(cls_.id, user_id):
            return
        cls_.verify_owner(user_id)

    def _verify_teacher_write(self, cls_: Class, user_id: str, user_role: Role) -> None:
        """Allow owner or co-teacher (and bar admins) for non-destructive writes
        like add_student / bulk_add / groups CRUD.
        """
        if user_role == Role.ADMIN:
            raise PermissionDeniedError("Admins have read-only access and cannot perform mutations")
        if cls_.is_owned_by(user_id):
            return
        if self._is_co_teacher(cls_.id, user_id):
            return
        cls_.verify_owner(user_id)

    def _verify_owner_only(self, cls_: Class, user_id: str, user_role: Role) -> None:
        """Owner-only operations (delete, transfer, archive, co-teacher
        admin). Admin and co-teacher are explicitly rejected."""
        if user_role == Role.ADMIN:
            raise PermissionDeniedError("Admins cannot perform owner-only mutations")
        cls_.verify_owner(user_id)

    # ── Class CRUD ────────────────────────────────────────────────────────────

    def create_class(
        self,
        name: str,
        teacher_id: str,
        *,
        description: str | None = None,
        subject: str | None = None,
        school_year: str | None = None,
        capacity: int | None = None,
        color: str | None = None,
        icon: str | None = None,
    ) -> Class:
        for attempt in range(3):
            cls_ = Class.create(
                name=name,
                teacher_id=teacher_id,
                description=description,
                subject=subject,
                school_year=school_year,
                capacity=capacity,
                color=color,
                icon=icon,
            )
            try:
                with self._uow:
                    self._class_repo.save(cls_)
                    self._uow.commit()
                return cls_
            except ConstraintViolationError as exc:
                if exc.constraint_name == _CLASS_NAME_UNIQUE_CONSTRAINT:
                    raise ClassNameConflictError("A class with this name already exists") from exc
                if attempt == 2:
                    raise
        raise RuntimeError("Unreachable")

    def get_class(self, class_id: str) -> Class:
        return self._get_class_or_raise(class_id)

    def get_class_for_owner(self, class_id: str, requester_id: str, requester_role: Role) -> Class:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role, is_read_op=True)
        return cls_

    def list_classes_for_teacher(
        self, teacher_id: str, *, include_archived: bool = True, include_co_taught: bool = True,
    ) -> list[Class]:
        owned = self._class_repo.find_by_teacher(teacher_id, include_archived=include_archived)
        if not include_co_taught:
            return owned
        co_taught = self._class_repo.find_classes_where_co_teacher(teacher_id)
        if not include_archived:
            co_taught = [c for c in co_taught if not c.is_archived]
        # De-duplicate in case a teacher is somehow both owner and co-teacher
        # (the unique constraint should prevent that, but be defensive here).
        seen = {c.id for c in owned}
        for c in co_taught:
            if c.id not in seen:
                owned.append(c)
                seen.add(c.id)
        return owned

    def list_all_classes(self) -> list[Class]:
        return self._class_repo.find_all()

    def list_all_classes_paginated(
        self, offset: int, limit: int, *, include_archived: bool = True,
    ) -> tuple[list[Class], int]:
        return self._class_repo.find_all_paginated(
            offset=offset, limit=limit, include_archived=include_archived,
        )

    def list_classes_for_student(self, student_id: str) -> list[Class]:
        memberships = self._class_repo.find_memberships_by_student(student_id)
        ids = [m.class_id for m in memberships]
        return self._class_repo.find_by_ids(ids)

    def list_classes_for_student_with_teachers(self, student_id: str):
        classes = self.list_classes_for_student(student_id)
        teacher_ids = list({c.teacher_id for c in classes})
        teachers = {u.id: u for u in self._user_repo.find_by_ids(teacher_ids)}
        return [(c, teachers.get(c.teacher_id)) for c in classes]

    def get_class_for_student_with_teacher(self, class_id: str, student_id: str):
        self.verify_access(class_id, student_id, Role.STUDENT)
        cls_ = self._get_class_or_raise(class_id)
        teacher = self._user_repo.find_by_id(cls_.teacher_id)
        return cls_, teacher

    def update_class_metadata(
        self,
        class_id: str,
        requester_id: str,
        requester_role: Role,
        *,
        name: str | None = None,
        description: str | None = ...,  # type: ignore[assignment]
        subject: str | None = ...,
        school_year: str | None = ...,
        capacity: int | None = ...,
        color: str | None = ...,
        icon: str | None = ...,
    ) -> Class:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_teacher_write(cls_, requester_id, requester_role)
        if name is not None:
            cls_.rename(name)
        cls_.update_metadata(
            description=description,
            subject=subject,
            school_year=school_year,
            capacity=capacity,
            color=color,
            icon=icon,
        )
        with self._uow:
            try:
                self._class_repo.save(cls_)
                self._uow.commit()
            except ConstraintViolationError as exc:
                if exc.constraint_name == _CLASS_NAME_UNIQUE_CONSTRAINT:
                    raise ClassNameConflictError("A class with this name already exists") from exc
                raise
        return cls_

    # ── Membership ────────────────────────────────────────────────────────────

    def add_student(self, class_id: str, student_email: str, requester_id: str, requester_role: Role) -> ClassMembership:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_teacher_write(cls_, requester_id, requester_role)
        cls_.ensure_not_archived()
        student = self._user_repo.find_by_email(student_email.strip().lower())
        if student is None:
            raise StudentEmailNotFoundError("No account found for that email")
        if student.role != Role.STUDENT:
            raise NotAStudentError("That account is not a student")
        student_id = student.id
        with self._uow:
            # Optimistic read: the unique constraint on (class_id, student_id) is
            # the true guard. Two concurrent calls can both pass here; whichever
            # INSERT loses is caught below and mapped to StudentAlreadyInClassError.
            if self._class_repo.find_membership(class_id, student_id):
                raise StudentAlreadyInClassError("Student is already in this class")
            current = self._class_repo.count_memberships_by_class(class_id)
            cls_.ensure_capacity_for_new_member(current)
            membership = ClassMembership.create(class_id=class_id, student_id=student_id)
            try:
                self._class_repo.save_membership(membership)
                # Teacher explicitly re-adding a removed student clears the blocklist.
                self._class_repo.delete_removed_membership(class_id, student_id)
                # Any pending invite for this email becomes redundant.
                self._class_repo.delete_invite(class_id, student.email)
                self._uow.commit()
            except ConstraintViolationError as e:
                raise StudentAlreadyInClassError("Student is already in this class") from e
        return membership

    def verify_access(self, class_id: str, user_id: str, user_role: Role) -> None:
        """Raise PermissionDeniedError unless the user owns the class, is an admin,
        is a co-teacher of it, or is a member."""
        cls_ = self._get_class_or_raise(class_id)
        if user_role == Role.ADMIN or cls_.is_owned_by(user_id):
            return
        if user_role == Role.TEACHER and self._is_co_teacher(class_id, user_id):
            return
        if user_role == Role.STUDENT:
            if self._class_repo.find_membership(class_id, user_id):
                return
        raise PermissionDeniedError("You are not a member of this class")

    def remove_student(self, class_id: str, student_id: str, requester_id: str, requester_role: Role) -> None:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_teacher_write(cls_, requester_id, requester_role)
        existing = self._class_repo.find_membership(class_id, student_id)
        if existing is None:
            raise StudentNotInClassError("Student is not in this class")
        with self._uow:
            # Remove from any in-class group first (the group_members FK
            # cascades on student delete but not on membership delete).
            gm = self._class_repo.find_group_member_for_student_in_class(class_id, student_id)
            if gm is not None:
                self._class_repo.delete_group_member(gm.group_id, student_id)
            self._class_repo.delete_membership(class_id, student_id)
            self._class_repo.record_removal(RemovedMembership.create(class_id, student_id))
            if self._territory_repo is not None:
                self._territory_repo.delete_occupations_for_student_in_class(student_id, class_id)
            self._uow.commit()
        logger.info("Student %s removed from class %s", student_id, class_id)

    def add_student_with_user(self, class_id: str, student_email: str, requester_id: str, requester_role: Role):
        membership = self.add_student(class_id, student_email, requester_id, requester_role)
        user = self._user_repo.find_by_id(membership.student_id)
        return membership, user

    def list_students_in_class(self, class_id: str, requester_id: str, requester_role: Role) -> list[ClassMembership]:
        # Intentional: a teacher can only roster their own class. There is no
        # cross-teacher sharing by design. Admin sees all via the bypass above.
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role, is_read_op=True)
        return self._class_repo.find_memberships_by_class(class_id)

    def list_students_with_users(self, class_id: str, requester_id: str, requester_role: Role):
        memberships = self.list_students_in_class(class_id, requester_id, requester_role)
        student_ids = [m.student_id for m in memberships]
        users = {u.id: u for u in self._user_repo.find_by_ids(student_ids)}
        return [(m, users.get(m.student_id)) for m in memberships]

    def list_class_reflections(
        self,
        class_id: str,
        requester_id: str,
        requester_role: Role,
        limit: int = 100,
    ) -> list[ClassReflectionView]:
        """Roster + recent reflections for a class. Ownership-checked via
        list_students_with_users; returns an empty list when the class has
        no students or no reflections yet."""
        if self._session_repo is None:
            raise RuntimeError("session_repo dependency required for reflections view")
        pairs = self.list_students_with_users(class_id, requester_id, requester_role)
        student_users = {m.student_id: u for m, u in pairs}
        if not student_users:
            return []
        sessions = self._session_repo.find_reflections_for_users(
            list(student_users.keys()), limit=limit,
        )
        return [
            ClassReflectionView(
                session_id=s.id,
                student_id=s.user_id,
                student_name=(
                    student_users[s.user_id].player_name
                    if student_users.get(s.user_id) else ""
                ),
                star_rating=int(s.level),
                score=s.score,
                reflection_text=s.reflection_text or "",
                ended_at=s.ended_at,
            )
            for s in sessions
        ]

    def join_by_code(self, code: str, student_id: str, student_role: Role = Role.STUDENT) -> ClassMembership:
        if student_role != Role.STUDENT:
            raise PermissionDeniedError("Only students can join a class by code")
        cls_ = self._class_repo.find_by_join_code(code)
        if cls_ is None:
            raise InvalidJoinCodeError("Invalid join code")
        if cls_.is_archived:
            # Map to InvalidJoinCode so we don't leak the existence of an
            # archived class to a random code-typer.
            raise InvalidJoinCodeError("Invalid join code")
        with self._uow:
            if self._class_repo.find_membership(cls_.id, student_id):
                raise StudentAlreadyInClassError("You are already in this class")
            if self._class_repo.find_removed_membership(cls_.id, student_id):
                raise StudentRemovedFromClassError("You have been removed from this class and cannot rejoin via code")
            current = self._class_repo.count_memberships_by_class(cls_.id)
            cls_.ensure_capacity_for_new_member(current)
            membership = ClassMembership.create(class_id=cls_.id, student_id=student_id)
            try:
                self._class_repo.save_membership(membership)
                self._uow.commit()
            except ConstraintViolationError as e:
                raise StudentAlreadyInClassError("You are already in this class") from e
        return membership

    def delete_class(self, class_id: str, requester_id: str, requester_role: Role) -> None:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_only(cls_, requester_id, requester_role)
        # Cleanup non-cascading derived data before the class row goes.
        # class_memberships / co_teachers / pending_invites / groups all
        # cascade on classes.id, but territory_occupations only have a
        # session FK — purge them explicitly per student (audit B2).
        member_ids = [
            m.student_id for m in self._class_repo.find_memberships_by_class(class_id)
        ]
        with self._uow:
            if self._territory_repo is not None:
                for sid in member_ids:
                    self._territory_repo.delete_occupations_for_student_in_class(sid, class_id)
            self._class_repo.delete(class_id)
            self._uow.commit()

    def rename_class(self, class_id: str, name: str, requester_id: str, requester_role: Role) -> Class:
        return self.update_class_metadata(class_id, requester_id, requester_role, name=name)

    def regenerate_join_code(self, class_id: str, requester_id: str, requester_role: Role) -> str:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_teacher_write(cls_, requester_id, requester_role)
        cls_.ensure_not_archived()
        for attempt in range(3):
            cls_.regenerate_join_code()
            try:
                with self._uow:
                    self._class_repo.save(cls_)
                    self._uow.commit()
                return cls_.join_code
            except ConstraintViolationError:
                if attempt == 2:
                    raise
        raise RuntimeError("Unreachable")

    # ── Archive ───────────────────────────────────────────────────────────────

    def archive_class(self, class_id: str, requester_id: str, requester_role: Role) -> Class:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_only(cls_, requester_id, requester_role)
        try:
            cls_.archive()
        except ClassAlreadyArchivedError:
            return cls_
        with self._uow:
            self._class_repo.save(cls_)
            self._uow.commit()
        logger.info("Class archived: id=%s by user=%s", class_id, requester_id)
        return cls_

    def unarchive_class(self, class_id: str, requester_id: str, requester_role: Role) -> Class:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_only(cls_, requester_id, requester_role)
        try:
            cls_.unarchive()
        except ClassNotArchivedError:
            return cls_
        with self._uow:
            self._class_repo.save(cls_)
            self._uow.commit()
        logger.info("Class unarchived: id=%s by user=%s", class_id, requester_id)
        return cls_

    # ── Transfer ownership ────────────────────────────────────────────────────

    def transfer_ownership(
        self, class_id: str, new_teacher_id: str, requester_id: str, requester_role: Role,
    ) -> Class:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_only(cls_, requester_id, requester_role)
        new_teacher = self._user_repo.find_by_id(new_teacher_id)
        if new_teacher is None or new_teacher.role != Role.TEACHER:
            raise NotATeacherError("Target user is not a teacher")
        cls_.transfer_to(new_teacher_id)
        with self._uow:
            # If the new owner was a co-teacher, demote that record so we don't
            # end up with the same user holding both roles.
            if self._class_repo.is_co_teacher(class_id, new_teacher_id):
                self._class_repo.delete_co_teacher(class_id, new_teacher_id)
            try:
                self._class_repo.save(cls_)
                self._uow.commit()
            except ConstraintViolationError as exc:
                # The (teacher_id, name) unique constraint can collide if the
                # new owner already has a class with the same name.
                if exc.constraint_name == _CLASS_NAME_UNIQUE_CONSTRAINT:
                    raise ClassNameConflictError(
                        "Target teacher already has a class with this name",
                    ) from exc
                raise
        logger.info(
            "Class ownership transferred: class=%s from=%s to=%s",
            class_id, requester_id, new_teacher_id,
        )
        return cls_

    # ── Co-teachers ───────────────────────────────────────────────────────────

    def list_co_teachers(self, class_id: str, requester_id: str, requester_role: Role):
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role, is_read_op=True)
        cos = self._class_repo.find_co_teachers_by_class(class_id)
        teacher_ids = [c.teacher_id for c in cos]
        users = {u.id: u for u in self._user_repo.find_by_ids(teacher_ids)}
        return [(co, users.get(co.teacher_id)) for co in cos]

    def add_co_teacher(
        self, class_id: str, teacher_email: str, requester_id: str, requester_role: Role,
    ):
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_only(cls_, requester_id, requester_role)
        teacher = self._user_repo.find_by_email(teacher_email.strip().lower())
        if teacher is None:
            raise StudentEmailNotFoundError("No account found for that email")
        if teacher.role != Role.TEACHER:
            raise NotATeacherError("That account is not a teacher")
        if teacher.id == cls_.teacher_id:
            raise CannotAddOwnerAsCoTeacherError("Owner cannot be added as a co-teacher")
        co = ClassCoTeacher.create(class_id=class_id, teacher_id=teacher.id)
        with self._uow:
            if self._class_repo.find_co_teacher(class_id, teacher.id):
                raise CoTeacherAlreadyExistsError("Teacher is already a co-teacher of this class")
            try:
                self._class_repo.save_co_teacher(co)
                self._uow.commit()
            except ConstraintViolationError as exc:
                if exc.constraint_name == _CO_TEACHER_UNIQUE_CONSTRAINT:
                    raise CoTeacherAlreadyExistsError(
                        "Teacher is already a co-teacher of this class",
                    ) from exc
                raise
        return co, teacher

    def remove_co_teacher(
        self, class_id: str, teacher_id: str, requester_id: str, requester_role: Role,
    ) -> None:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_only(cls_, requester_id, requester_role)
        existing = self._class_repo.find_co_teacher(class_id, teacher_id)
        if existing is None:
            raise CoTeacherNotFoundError("Co-teacher not found")
        with self._uow:
            self._class_repo.delete_co_teacher(class_id, teacher_id)
            self._uow.commit()

    # ── Bulk add + pending invites ────────────────────────────────────────────

    def bulk_add_students(
        self,
        class_id: str,
        emails: list[str],
        requester_id: str,
        requester_role: Role,
    ) -> BulkAddOutcome:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_teacher_write(cls_, requester_id, requester_role)
        cls_.ensure_not_archived()

        added: list[tuple[ClassMembership, object]] = []
        invited: list[PendingInvite] = []
        skipped: list[dict] = []
        with self._uow:
            current = self._class_repo.count_memberships_by_class(class_id)
            for raw_email in emails:
                # The schema layer has already lower-cased and validated each
                # email, but be defensive — bulk callers can come from CSV.
                try:
                    email = Email(raw_email).value
                except Exception:
                    skipped.append({"email": raw_email, "reason": "invalid_email"})
                    continue
                user = self._user_repo.find_by_email(email)
                if user is not None:
                    if user.role != Role.STUDENT:
                        skipped.append({"email": email, "reason": "not_a_student"})
                        continue
                    if self._class_repo.find_membership(class_id, user.id):
                        skipped.append({"email": email, "reason": "already_in_class"})
                        continue
                    if cls_.capacity is not None and current >= cls_.capacity:
                        skipped.append({"email": email, "reason": "capacity_reached"})
                        continue
                    membership = ClassMembership.create(class_id=class_id, student_id=user.id)
                    # SAVEPOINT per row: without it, a unique-violation here
                    # (concurrent bulk_add racing on the same student) would
                    # poison the outer transaction and every subsequent
                    # email in this batch would fail with "current
                    # transaction is aborted".
                    try:
                        with self._uow.nested():
                            self._class_repo.save_membership(membership)
                            self._class_repo.delete_removed_membership(class_id, user.id)
                            self._class_repo.delete_invite(class_id, email)
                        added.append((membership, user))
                        current += 1
                    except ConstraintViolationError:
                        skipped.append({"email": email, "reason": "already_in_class"})
                else:
                    # No account yet — record an invite. Idempotent: an existing
                    # invite for the same (class, email) is skipped silently.
                    if self._class_repo.find_invite(class_id, email):
                        skipped.append({"email": email, "reason": "already_invited"})
                        continue
                    invite = PendingInvite.create(class_id=class_id, email=email)
                    try:
                        with self._uow.nested():
                            self._class_repo.save_invite(invite)
                        invited.append(invite)
                    except ConstraintViolationError:
                        skipped.append({"email": email, "reason": "already_invited"})
            self._uow.commit()
        return BulkAddOutcome(added=added, invited=invited, skipped=skipped)

    def list_pending_invites(
        self, class_id: str, requester_id: str, requester_role: Role,
    ) -> list[PendingInvite]:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role, is_read_op=True)
        return self._class_repo.find_invites_by_class(class_id)

    def revoke_invite(
        self, class_id: str, email: str, requester_id: str, requester_role: Role,
    ) -> None:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_teacher_write(cls_, requester_id, requester_role)
        existing = self._class_repo.find_invite(class_id, email)
        if existing is None:
            raise InviteNotFoundError("Invite not found")
        with self._uow:
            self._class_repo.delete_invite(class_id, email)
            self._uow.commit()

    def claim_pending_invites(
        self, user_id: str, email: str, role: Role,
    ) -> list[ClassMembership]:
        """Attach any pending invites that match the user's email.

        Called once just after a student account is created so the teacher's
        pre-registration invites resolve automatically. No-op for non-student
        accounts — invites against a teacher/admin email are dropped silently
        so they don't keep matching forever.
        """
        invites = self._class_repo.find_invites_by_email(email)
        if not invites:
            return []
        if role != Role.STUDENT:
            with self._uow:
                self._class_repo.delete_invites_by_email(email)
                self._uow.commit()
            return []
        results: list[ClassMembership] = []
        with self._uow:
            for invite in invites:
                cls_ = self._class_repo.find_by_id(invite.class_id)
                if cls_ is None or cls_.is_archived:
                    self._class_repo.delete_invite(invite.class_id, email)
                    continue
                if self._class_repo.find_membership(invite.class_id, user_id):
                    self._class_repo.delete_invite(invite.class_id, email)
                    continue
                if self._class_repo.find_removed_membership(invite.class_id, user_id):
                    # The student was previously removed; don't auto-attach.
                    self._class_repo.delete_invite(invite.class_id, email)
                    continue
                current = self._class_repo.count_memberships_by_class(invite.class_id)
                if cls_.capacity is not None and current >= cls_.capacity:
                    # Leave the invite in place — capacity may free up later.
                    continue
                membership = ClassMembership.create(class_id=invite.class_id, student_id=user_id)
                # SAVEPOINT per invite — see comment in bulk_add_students.
                try:
                    with self._uow.nested():
                        self._class_repo.save_membership(membership)
                        self._class_repo.delete_invite(invite.class_id, email)
                    results.append(membership)
                except ConstraintViolationError:
                    with self._uow.nested():
                        self._class_repo.delete_invite(invite.class_id, email)
            self._uow.commit()
        return results

    # ── Student transfer ──────────────────────────────────────────────────────

    def move_student_with_user(
        self,
        source_class_id: str,
        target_class_id: str,
        student_id: str,
        requester_id: str,
        requester_role: Role,
    ):
        membership = self.move_student(
            source_class_id=source_class_id,
            target_class_id=target_class_id,
            student_id=student_id,
            requester_id=requester_id,
            requester_role=requester_role,
        )
        student = self._user_repo.find_by_id(student_id)
        return membership, student

    def add_group_member_with_user(
        self,
        class_id: str,
        group_id: str,
        student_id: str,
        requester_id: str,
        requester_role: Role,
    ):
        member = self.add_group_member(
            class_id=class_id,
            group_id=group_id,
            student_id=student_id,
            requester_id=requester_id,
            requester_role=requester_role,
        )
        student = self._user_repo.find_by_id(student_id)
        return member, student

    def move_student(
        self,
        source_class_id: str,
        target_class_id: str,
        student_id: str,
        requester_id: str,
        requester_role: Role,
    ) -> ClassMembership:
        if source_class_id == target_class_id:
            raise StudentAlreadyInClassError("Source and target classes are the same")
        source = self._get_class_or_raise(source_class_id)
        target = self._get_class_or_raise(target_class_id)
        # Requester must have write access to BOTH classes.
        self._verify_teacher_write(source, requester_id, requester_role)
        self._verify_teacher_write(target, requester_id, requester_role)
        target.ensure_not_archived()
        existing = self._class_repo.find_membership(source_class_id, student_id)
        if existing is None:
            raise StudentNotInClassError("Student is not in the source class")
        if self._class_repo.find_membership(target_class_id, student_id):
            raise StudentAlreadyInClassError("Student is already in the target class")
        with self._uow:
            current = self._class_repo.count_memberships_by_class(target_class_id)
            target.ensure_capacity_for_new_member(current)
            # Drop any group affiliation from the source class — groups are
            # per-class and the membership row is moving.
            gm = self._class_repo.find_group_member_for_student_in_class(
                source_class_id, student_id,
            )
            if gm is not None:
                self._class_repo.delete_group_member(gm.group_id, student_id)
            self._class_repo.delete_membership(source_class_id, student_id)
            self._class_repo.record_removal(
                RemovedMembership.create(source_class_id, student_id),
            )
            if self._territory_repo is not None:
                self._territory_repo.delete_occupations_for_student_in_class(
                    student_id, source_class_id,
                )
            new_membership = ClassMembership.create(
                class_id=target_class_id, student_id=student_id,
            )
            try:
                self._class_repo.save_membership(new_membership)
                # A move overrides any previous removed_membership at the
                # target so the student isn't immediately blocked there.
                self._class_repo.delete_removed_membership(target_class_id, student_id)
                self._uow.commit()
            except ConstraintViolationError as e:
                raise StudentAlreadyInClassError(
                    "Student already exists in the target class",
                ) from e
        return new_membership

    # ── Groups ────────────────────────────────────────────────────────────────

    def create_group(
        self,
        class_id: str,
        name: str,
        requester_id: str,
        requester_role: Role,
        *,
        color: str | None = None,
    ) -> ClassGroup:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_teacher_write(cls_, requester_id, requester_role)
        cls_.ensure_not_archived()
        group = ClassGroup.create(class_id=class_id, name=name, color=color)
        with self._uow:
            try:
                self._class_repo.save_group(group)
                self._uow.commit()
            except ConstraintViolationError as exc:
                if exc.constraint_name == _GROUP_NAME_UNIQUE_CONSTRAINT:
                    raise GroupNameConflictError(
                        "A group with this name already exists in this class",
                    ) from exc
                raise
        return group

    def list_groups(
        self, class_id: str, requester_id: str, requester_role: Role,
    ) -> tuple[list[ClassGroup], dict[str, int]]:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role, is_read_op=True)
        groups = self._class_repo.find_groups_by_class(class_id)
        counts = self._class_repo.count_members_by_group_bulk([g.id for g in groups])
        return groups, counts

    def update_group(
        self,
        class_id: str,
        group_id: str,
        requester_id: str,
        requester_role: Role,
        *,
        name: str | None = None,
        color: str | None = ...,  # type: ignore[assignment]
    ) -> tuple[ClassGroup, int]:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_teacher_write(cls_, requester_id, requester_role)
        group = self._class_repo.find_group_by_id(group_id)
        if group is None or group.class_id != class_id:
            raise GroupNotFoundError("Group not found")
        if name is not None:
            group.rename(name)
        if color is not ...:
            group.recolor(color)
        with self._uow:
            try:
                self._class_repo.save_group(group)
                self._uow.commit()
            except ConstraintViolationError as exc:
                if exc.constraint_name == _GROUP_NAME_UNIQUE_CONSTRAINT:
                    raise GroupNameConflictError(
                        "A group with this name already exists in this class",
                    ) from exc
                raise
        # Preserve the existing member count in the response so the API
        # contract matches list_groups — frontend may consume the PUT
        # response directly without re-fetching.
        member_count = self._class_repo.count_members_by_group_bulk([group_id]).get(group_id, 0)
        return group, member_count

    def delete_group(
        self, class_id: str, group_id: str, requester_id: str, requester_role: Role,
    ) -> None:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_teacher_write(cls_, requester_id, requester_role)
        group = self._class_repo.find_group_by_id(group_id)
        if group is None or group.class_id != class_id:
            raise GroupNotFoundError("Group not found")
        with self._uow:
            self._class_repo.delete_group(group_id)
            self._uow.commit()

    def add_group_member(
        self,
        class_id: str,
        group_id: str,
        student_id: str,
        requester_id: str,
        requester_role: Role,
    ) -> ClassGroupMember:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_teacher_write(cls_, requester_id, requester_role)
        group = self._class_repo.find_group_by_id(group_id)
        if group is None or group.class_id != class_id:
            raise GroupNotFoundError("Group not found")
        # Student must be a member of the class first.
        if self._class_repo.find_membership(class_id, student_id) is None:
            raise StudentNotInClassForGroupError(
                "Student is not a member of this class",
            )
        existing = self._class_repo.find_group_member_for_student_in_class(
            class_id, student_id,
        )
        if existing is not None:
            if existing.group_id == group_id:
                raise StudentAlreadyInGroupError(
                    "Student is already in this group",
                )
            # Move between groups within the same class.
            with self._uow:
                self._class_repo.delete_group_member(existing.group_id, student_id)
                member = ClassGroupMember.create(
                    group_id=group_id, class_id=class_id, student_id=student_id,
                )
                self._class_repo.save_group_member(member)
                self._uow.commit()
            return member
        member = ClassGroupMember.create(
            group_id=group_id, class_id=class_id, student_id=student_id,
        )
        with self._uow:
            try:
                self._class_repo.save_group_member(member)
                self._uow.commit()
            except ConstraintViolationError as e:
                raise StudentAlreadyInGroupError(
                    "Student is already in a group in this class",
                ) from e
        return member

    def remove_group_member(
        self,
        class_id: str,
        group_id: str,
        student_id: str,
        requester_id: str,
        requester_role: Role,
    ) -> None:
        cls_ = self._get_class_or_raise(class_id)
        self._verify_teacher_write(cls_, requester_id, requester_role)
        existing = self._class_repo.find_group_member(group_id, student_id)
        if existing is None or existing.class_id != class_id:
            raise StudentNotInClassForGroupError(
                "Student is not in this group",
            )
        with self._uow:
            self._class_repo.delete_group_member(group_id, student_id)
            self._uow.commit()

    def list_group_members(
        self,
        class_id: str,
        group_id: str,
        requester_id: str,
        requester_role: Role,
    ):
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role, is_read_op=True)
        group = self._class_repo.find_group_by_id(group_id)
        if group is None or group.class_id != class_id:
            raise GroupNotFoundError("Group not found")
        members = self._class_repo.find_group_members_by_group(group_id)
        users = {u.id: u for u in self._user_repo.find_by_ids([m.student_id for m in members])}
        return [(m, users.get(m.student_id)) for m in members]

    # ── Leaderboard + Report ──────────────────────────────────────────────────

    def class_leaderboard(
        self, class_id: str, requester_id: str, requester_role: Role,
    ) -> list[ClassLeaderboardRow]:
        if self._session_repo is None:
            raise RuntimeError("session_repo dependency required for leaderboard")
        # Students enrolled in the class can see the in-class leaderboard.
        self.verify_access(class_id, requester_id, requester_role)
        memberships = self._class_repo.find_memberships_by_class(class_id)
        student_ids = [m.student_id for m in memberships]
        users = {u.id: u for u in self._user_repo.find_by_ids(student_ids)}
        stats = self._session_repo.aggregate_stats_for_users(student_ids)
        rows: list[ClassLeaderboardRow] = []
        for sid in student_ids:
            s = stats.get(sid, {})
            rows.append(ClassLeaderboardRow(
                student_id=sid,
                player_name=users[sid].player_name if sid in users else "",
                sessions_played=int(s.get("sessions_played", 0)),
                average_stars=float(s.get("average_stars", 0.0)),
                total_score=int(s.get("total_score", 0)),
                last_played_at=s.get("last_played_at"),
            ))
        rows.sort(key=lambda r: (-r.total_score, -r.sessions_played, r.player_name))
        return rows

    def class_report(
        self, class_id: str, requester_id: str, requester_role: Role,
    ) -> list[ClassReportRow]:
        if self._session_repo is None:
            raise RuntimeError("session_repo dependency required for report")
        cls_ = self._get_class_or_raise(class_id)
        self._verify_owner_or_admin(cls_, requester_id, requester_role, is_read_op=True)
        memberships = self._class_repo.find_memberships_by_class(class_id)
        student_ids = [m.student_id for m in memberships]
        users = {u.id: u for u in self._user_repo.find_by_ids(student_ids)}
        stats = self._session_repo.aggregate_stats_for_users(student_ids)
        rows: list[ClassReportRow] = []
        for m in memberships:
            u = users.get(m.student_id)
            s = stats.get(m.student_id, {})
            rows.append(ClassReportRow(
                student_id=m.student_id,
                player_name=u.player_name if u else "",
                email=u.email if u else "",
                joined_at=m.joined_at,
                sessions_played=int(s.get("sessions_played", 0)),
                average_stars=float(s.get("average_stars", 0.0)),
                total_score=int(s.get("total_score", 0)),
                last_played_at=s.get("last_played_at"),
                reflections_count=int(s.get("reflections_count", 0)),
            ))
        rows.sort(key=lambda r: r.player_name.lower())
        return rows
