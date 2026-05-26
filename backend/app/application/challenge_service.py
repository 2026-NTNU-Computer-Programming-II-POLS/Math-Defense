"""ChallengeApplicationService — Challenge CRUD use cases (spec §23)."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.domain.challenge.aggregate import Challenge
from app.domain.challenge.constraint_dsl import ChallengeConstraints
from app.domain.errors import ChallengeNotFoundError
from app.domain.user.value_objects import Role

if TYPE_CHECKING:
    from app.application.ports import UnitOfWork
    from app.domain.challenge.repository import ChallengeRepository

logger = logging.getLogger(__name__)


class ChallengeApplicationService:
    def __init__(
        self,
        challenge_repo: ChallengeRepository,
        uow: UnitOfWork,
    ) -> None:
        self._repo = challenge_repo
        self._uow = uow

    def _verify_owner_or_admin(
        self, challenge: Challenge, requester_id: str, requester_role: Role
    ) -> None:
        # ADMIN bypasses the ownership check — mirrors the class/territory
        # services so administrators can remediate any teacher's challenge
        # (e.g. abuse-report cleanup) without an out-of-band DB edit.
        if requester_role == Role.ADMIN:
            return
        challenge.assert_owned_by(requester_id)

    def create(
        self,
        teacher_id: str,
        title: str,
        description: str,
        constraints: ChallengeConstraints,
    ) -> Challenge:
        with self._uow:
            challenge = Challenge.create(
                teacher_id=teacher_id,
                title=title,
                description=description,
                constraints=constraints,
            )
            self._repo.save(challenge)
            self._uow.commit()
            logger.info(
                "Challenge created: id=%s teacher=%s", challenge.id, teacher_id
            )
            return challenge

    def get(self, challenge_id: str) -> Challenge:
        challenge = self._repo.find_by_id(challenge_id)
        if challenge is None or challenge.is_deleted:
            raise ChallengeNotFoundError("Challenge not found")
        return challenge

    def list_for_teacher(self, teacher_id: str) -> list[Challenge]:
        return self._repo.find_by_teacher(teacher_id)

    def rename(
        self,
        challenge_id: str,
        requester_id: str,
        requester_role: Role,
        title: str,
        description: str,
    ) -> Challenge:
        with self._uow:
            challenge = self.get(challenge_id)
            self._verify_owner_or_admin(challenge, requester_id, requester_role)
            challenge.rename(title, description)
            self._repo.save(challenge)
            self._uow.commit()
            return challenge

    def replace_constraints(
        self,
        challenge_id: str,
        requester_id: str,
        requester_role: Role,
        new_constraints: ChallengeConstraints,
    ) -> Challenge:
        with self._uow:
            challenge = self.get(challenge_id)
            self._verify_owner_or_admin(challenge, requester_id, requester_role)
            played = self._repo.has_play_history(challenge_id)
            # The aggregate raises ChallengeImmutableError directly when
            # ``played`` is True, so no service-level translation is needed
            # (B-ARCH-14 / B-ARCH-20).
            challenge.replace_constraints(
                new_constraints, has_play_history=played
            )
            self._repo.save(challenge)
            self._uow.commit()
            return challenge

    def delete(
        self, challenge_id: str, requester_id: str, requester_role: Role
    ) -> None:
        with self._uow:
            challenge = self.get(challenge_id)
            self._verify_owner_or_admin(challenge, requester_id, requester_role)
            challenge.soft_delete()
            self._repo.save(challenge)
            self._uow.commit()
            logger.info(
                "Challenge soft-deleted: id=%s by=%s role=%s",
                challenge_id, requester_id, requester_role.value,
            )
