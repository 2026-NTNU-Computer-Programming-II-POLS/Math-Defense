"""AdminApplicationService — admin-only read operations"""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.application.auth_service import _assert_password_strength
from app.domain.class_.aggregate import Class
from app.domain.errors import (
    DomainValueError,
    UserNotFoundError,
    UsernameTakenError,
)
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Email, Role
from app.utils.security import hash_password

if TYPE_CHECKING:
    from app.application.ports import UnitOfWork
    from app.domain.auth.repository import RefreshTokenRepository
    from app.domain.class_.repository import ClassRepository
    from app.domain.user.repository import UserRepository


class AdminApplicationService:

    def __init__(
        self,
        user_repo: UserRepository,
        class_repo: ClassRepository,
        uow: UnitOfWork | None = None,
        refresh_token_repo: RefreshTokenRepository | None = None,
    ) -> None:
        self._user_repo = user_repo
        self._class_repo = class_repo
        self._uow = uow
        self._refresh_token_repo = refresh_token_repo

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

    def create_teacher(self, email: str, password: str, player_name: str) -> User:
        """Provision a teacher account on behalf of an admin.

        Unlike public /register (M-04 student-only, M-05 enumeration-safe),
        this path is authenticated as ADMIN so it returns explicit conflict
        feedback (UsernameTakenError → 409) and marks the account email-
        verified — the admin vouches for the identity and the new teacher
        cannot click their own verification link before first login.
        """
        if self._uow is None:
            raise RuntimeError("UoW not configured")
        try:
            email_vo = Email(email)
        except ValueError as e:
            raise DomainValueError(str(e)) from e
        _assert_password_strength(password)
        with self._uow:
            if self._user_repo.find_by_email(email_vo.value) is not None:
                raise UsernameTakenError("Email is already in use")
            user = User.create(
                email=email_vo.value,
                player_name=player_name,
                role=Role.TEACHER,
                password_hash=hash_password(password),
            )
            user.is_email_verified = True
            self._user_repo.save(user)
            self._uow.commit()
        return user

    def set_user_active(self, user_id: str, is_active: bool, requester_id: str) -> User:
        if self._uow is None:
            raise RuntimeError("UoW not configured")

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
                    # Row-lock every active admin (FOR UPDATE) instead of a bare
                    # COUNT: two admins disabling each other concurrently would
                    # otherwise both read count==2 under READ COMMITTED and both
                    # commit, emptying the active-admin set. The lock serialises
                    # them — the second transaction blocks, then re-evaluates
                    # against the committed state and sees only itself left. The
                    # target admin is still active here, so it is in the locked
                    # set and counted; refuse if disabling it empties the set.
                    if len(self._user_repo.lock_active_ids_by_role(Role.ADMIN)) <= 1:
                        raise DomainValueError("Cannot disable the last active admin")
            user.is_active = is_active
            self._user_repo.save(user)
            # Disabling is a hard logout: access tokens already fail the
            # is_active check on the next request, but refresh tokens carry no
            # such claim, so without explicit revocation they survive and would
            # mint fresh access tokens again the moment the account is
            # re-enabled (a previously-stolen cookie regaining validity). Mirror
            # change_password / disable_mfa and kill the whole refresh family.
            # NB: an already-open WebSocket is not severed mid-stream, but the
            # only WS is read-only replay spectating (authenticated at
            # handshake), so no privileged action survives a disable.
            if not is_active and self._refresh_token_repo is not None:
                self._refresh_token_repo.revoke_all_for_user(user.id)
            self._uow.commit()
        return user
