"""AdminApplicationService — admin-only read operations"""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.domain.class_.aggregate import Class
from app.domain.errors import UserNotFoundError
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role

if TYPE_CHECKING:
    from app.application.ports import UnitOfWork
    from app.domain.class_.repository import ClassRepository
    from app.domain.user.repository import UserRepository


class AdminApplicationService:

    def __init__(
        self,
        user_repo: UserRepository,
        class_repo: ClassRepository,
        uow: UnitOfWork | None = None,
    ) -> None:
        self._user_repo = user_repo
        self._class_repo = class_repo
        self._uow = uow

    def list_teachers_paginated(self, offset: int, limit: int) -> tuple[list[tuple[User, int]], int]:
        users, total = self._user_repo.find_by_role_paginated(Role.TEACHER, offset, limit)
        counts = self._class_repo.count_by_teacher_bulk([u.id for u in users])
        return [(u, counts.get(u.id, 0)) for u in users], total

    def list_students_paginated(self, offset: int, limit: int) -> tuple[list[tuple[User, int]], int]:
        users, total = self._user_repo.find_by_role_paginated(Role.STUDENT, offset, limit)
        counts = self._class_repo.count_memberships_by_student_bulk([u.id for u in users])
        return [(u, counts.get(u.id, 0)) for u in users], total

    def list_all_classes_paginated(self, offset: int, limit: int) -> tuple[list[tuple[Class, int]], int]:
        classes, total = self._class_repo.find_all_paginated(offset, limit)
        counts = self._class_repo.count_memberships_by_class_bulk([c.id for c in classes])
        return [(c, counts.get(c.id, 0)) for c in classes], total

    def set_user_active(self, user_id: str, is_active: bool, requester_id: str) -> User:
        if self._uow is None:
            raise RuntimeError("UoW not configured")
        from app.domain.errors import DomainValueError

        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            # Disable-only invariants. Admins can always re-enable any user
            # (including themselves via DB intervention or a peer admin),
            # but disabling has two trap doors we must close:
            # 1) Self-disable would lock the requester out of their own
            #    admin session, leaving recovery to the seed/CLI.
            # 2) Disabling the last active admin leaves the system with
            #    nobody who can re-enable anyone.
            if not is_active and user.is_active:
                if user.id == requester_id:
                    raise DomainValueError("Admins cannot disable their own account")
                if user.role == Role.ADMIN:
                    # COUNT query instead of loading every admin row. The user
                    # we're about to disable is still active and counted here;
                    # refuse if disabling them would empty the active set.
                    if self._user_repo.count_active_by_role(Role.ADMIN) <= 1:
                        raise DomainValueError("Cannot disable the last active admin")
            user.is_active = is_active
            self._user_repo.save(user)
            self._uow.commit()
        return user
