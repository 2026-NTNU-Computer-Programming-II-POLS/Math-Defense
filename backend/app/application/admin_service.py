"""AdminApplicationService — admin-only read operations"""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.domain.class_.aggregate import Class
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role

if TYPE_CHECKING:
    from app.domain.class_.repository import ClassRepository
    from app.domain.user.repository import UserRepository


class AdminApplicationService:

    def __init__(
        self,
        user_repo: UserRepository,
        class_repo: ClassRepository,
    ) -> None:
        self._user_repo = user_repo
        self._class_repo = class_repo

    def list_teachers(self) -> list[User]:
        return self._user_repo.find_by_role(Role.TEACHER)

    def list_students(self) -> list[User]:
        return self._user_repo.find_by_role(Role.STUDENT)

    def list_all_classes(self) -> list[Class]:
        return self._class_repo.find_all()
