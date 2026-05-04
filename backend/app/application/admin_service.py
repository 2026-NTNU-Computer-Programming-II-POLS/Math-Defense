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

    def list_teachers(self) -> list[User]:
        return self._user_repo.find_by_role(Role.TEACHER)

    def list_students(self) -> list[User]:
        return self._user_repo.find_by_role(Role.STUDENT)

    def list_all_classes(self) -> list[Class]:
        return self._class_repo.find_all()

    def list_teachers_paginated(self, offset: int, limit: int) -> tuple[list[tuple[User, int]], int]:
        users, total = self._user_repo.find_by_role_paginated(Role.TEACHER, offset, limit)
        return [(u, self._class_repo.count_by_teacher(u.id)) for u in users], total

    def list_students_paginated(self, offset: int, limit: int) -> tuple[list[tuple[User, int]], int]:
        users, total = self._user_repo.find_by_role_paginated(Role.STUDENT, offset, limit)
        return [(u, self._class_repo.count_memberships_by_student(u.id)) for u in users], total

    def list_all_classes_paginated(self, offset: int, limit: int) -> tuple[list[tuple[Class, int]], int]:
        classes, total = self._class_repo.find_all_paginated(offset, limit)
        return [(c, self._class_repo.count_memberships_by_class(c.id)) for c in classes], total

    def set_user_active(self, user_id: str, is_active: bool) -> User:
        if self._uow is None:
            raise RuntimeError("UoW not configured")
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            user.is_active = is_active
            self._user_repo.save(user)
            self._uow.commit()
        return user
