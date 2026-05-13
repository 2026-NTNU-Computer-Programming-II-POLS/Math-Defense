"""Challenge Aggregate Root — teacher-authored constrained game mode (spec §23)."""
from __future__ import annotations

import uuid
from datetime import datetime, UTC

from app.domain.challenge.constraint_dsl import ChallengeConstraints
from app.domain.errors import (
    ChallengeImmutableError,
    DomainValueError,
    PermissionDeniedError,
)

TITLE_MAX_LENGTH = 120
DESCRIPTION_MAX_LENGTH = 500


class Challenge:
    """
    Aggregate root for a teacher-authored challenge.

    Invariants:
    1. ``constraints`` are immutable once any leaderboard entry references the
       challenge (enforced via ``replace_constraints`` raising). Title and
       description remain editable so teachers can fix typos without breaking
       past rankings.
    2. Soft-delete: ``deleted_at`` hides the challenge from listings without
       cascading to historical leaderboard rows.
    """

    def __init__(
        self,
        id: str,
        teacher_id: str,
        title: str,
        description: str,
        constraints: ChallengeConstraints,
        created_at: datetime | None = None,
        updated_at: datetime | None = None,
        deleted_at: datetime | None = None,
    ) -> None:
        title = (title or "").strip()
        if not title:
            raise DomainValueError("title must not be empty")
        if len(title) > TITLE_MAX_LENGTH:
            raise DomainValueError(
                f"title exceeds {TITLE_MAX_LENGTH} characters"
            )
        description = (description or "").strip()
        if len(description) > DESCRIPTION_MAX_LENGTH:
            raise DomainValueError(
                f"description exceeds {DESCRIPTION_MAX_LENGTH} characters"
            )
        self.id = id
        self.teacher_id = teacher_id
        self.title = title
        self.description = description
        self.constraints = constraints
        self.created_at = created_at or datetime.now(UTC)
        self.updated_at = updated_at or self.created_at
        self.deleted_at = deleted_at

    @classmethod
    def create(
        cls,
        teacher_id: str,
        title: str,
        description: str,
        constraints: ChallengeConstraints,
    ) -> Challenge:
        if not teacher_id:
            raise DomainValueError("teacher_id must not be empty")
        return cls(
            id=str(uuid.uuid4()),
            teacher_id=teacher_id,
            title=title,
            description=description,
            constraints=constraints,
        )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

    def assert_owned_by(self, teacher_id: str) -> None:
        if self.teacher_id != teacher_id:
            raise PermissionDeniedError(
                "Only the authoring teacher may modify this challenge"
            )

    def rename(self, title: str, description: str) -> None:
        title = (title or "").strip()
        if not title:
            raise DomainValueError("title must not be empty")
        if len(title) > TITLE_MAX_LENGTH:
            raise DomainValueError(
                f"title exceeds {TITLE_MAX_LENGTH} characters"
            )
        description = (description or "").strip()
        if len(description) > DESCRIPTION_MAX_LENGTH:
            raise DomainValueError(
                f"description exceeds {DESCRIPTION_MAX_LENGTH} characters"
            )
        self.title = title
        self.description = description
        self.updated_at = datetime.now(UTC)

    def replace_constraints(
        self,
        new_constraints: ChallengeConstraints,
        *,
        has_play_history: bool,
    ) -> None:
        """Replace the constraint surface. Forbidden after the first play.

        ``has_play_history`` is supplied by the application service after
        consulting the leaderboard repository; the aggregate intentionally
        does not import LeaderboardRepository.
        """
        if has_play_history:
            # Raise the specific subtype directly so the application service
            # does not need to translate based on its own input flag
            # (B-ARCH-14 / B-ARCH-20). The aggregate owns the rule, so it
            # also owns the error class that names it.
            raise ChallengeImmutableError(
                "constraints are immutable once the challenge has been played"
            )
        self.constraints = new_constraints
        self.updated_at = datetime.now(UTC)

    def soft_delete(self) -> None:
        if self.is_deleted:
            return
        self.deleted_at = datetime.now(UTC)
