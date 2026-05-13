"""StudyApplicationService — Empirical Validity Probe (Spec §27).

Use cases:
  * ``enroll`` — idempotent. Returns the deterministic group, persisting
    the cached row on first call. Safe to invoke from the frontend on
    every visit to the probe view.
  * ``submit_probe`` — grade and persist a 10-item form attempt.
  * ``submit_affect`` — persist a Likert response set, computing the
    anxiety_mean and motivation_mean subscales server-side.
  * ``export_csv_rows`` — admin-only readout for the CSV endpoint.

All writes go through a UnitOfWork so the failure modes match the rest of
the application layer (commit failures bubble as PersistenceError).
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.domain.errors import DomainValueError, PermissionDeniedError
from app.domain.study import (
    PROBE_FORMS,
    StudyGroup,
    assign_group,
    grade,
    is_valid_study_id,
)
from app.domain.user.value_objects import Role

if TYPE_CHECKING:
    from app.application.ports import UnitOfWork
    from app.domain.user.aggregate import User
    from app.infrastructure.persistence.study_repository import (
        SqlAlchemyStudyRepository,
        StudyExportRow,
    )

logger = logging.getLogger(__name__)

AFFECT_PHASES = frozenset({"pre", "post"})


class StudyApplicationService:
    def __init__(
        self,
        study_repo: "SqlAlchemyStudyRepository",
        uow: "UnitOfWork",
    ) -> None:
        self._repo = study_repo
        self._uow = uow

    # ── Enrollment ────────────────────────────────────────────────────
    def enroll(self, user_id: str, study_id: str) -> StudyGroup:
        if not is_valid_study_id(study_id):
            raise DomainValueError(
                "study_id must be 1..64 chars of [A-Za-z0-9_-]"
            )
        with self._uow:
            existing = self._repo.find_enrollment(user_id, study_id)
            if existing:
                # Idempotent: re-enrolling returns the cached group.
                return StudyGroup(existing.group)
            group = assign_group(user_id, study_id)
            self._repo.add_enrollment(
                user_id=user_id, study_id=study_id, group=group.value,
            )
            self._uow.commit()
            logger.info(
                "Study enrollment: user=%s study=%s group=%s",
                user_id, study_id, group.value,
            )
            return group

    # ── Probe ─────────────────────────────────────────────────────────
    def submit_probe(
        self,
        *,
        user_id: str,
        study_id: str,
        form: str,
        responses: list[dict],
    ) -> int:
        if form not in PROBE_FORMS:
            raise DomainValueError(
                f"form must be one of {sorted(PROBE_FORMS)}"
            )
        # Grade in the domain (raises DomainValueError on bad payload).
        score, enriched = grade(form, responses)
        with self._uow:
            # Enroll lazily so the participant can land on the probe URL
            # and just take the test without a separate "join" step.
            if self._repo.find_enrollment(user_id, study_id) is None:
                group = assign_group(user_id, study_id)
                self._repo.add_enrollment(
                    user_id=user_id,
                    study_id=study_id,
                    group=group.value,
                )
            if self._repo.find_probe(user_id, study_id, form) is not None:
                # The unique constraint would catch this at flush time, but
                # surfacing it as a domain error gives the frontend a 422
                # message it can render instead of a generic 409.
                raise DomainValueError(
                    f"probe form {form!r} already submitted for this study"
                )
            self._repo.save_probe(
                user_id=user_id,
                study_id=study_id,
                form=form,
                score=score,
                responses=enriched,
            )
            self._uow.commit()
            return score

    # ── Affect ────────────────────────────────────────────────────────
    def submit_affect(
        self,
        *,
        user_id: str,
        study_id: str,
        phase: str,
        anxiety_items: list[int],
        motivation_items: list[int],
    ) -> None:
        if phase not in AFFECT_PHASES:
            raise DomainValueError(
                f"phase must be one of {sorted(AFFECT_PHASES)}"
            )
        if not anxiety_items or not motivation_items:
            raise DomainValueError(
                "anxiety_items and motivation_items must not be empty"
            )
        for v in (*anxiety_items, *motivation_items):
            if not isinstance(v, int) or v < 1 or v > 5:
                raise DomainValueError(
                    "Likert items must be integers in [1, 5]"
                )
        anxiety_mean = sum(anxiety_items) / len(anxiety_items)
        motivation_mean = sum(motivation_items) / len(motivation_items)
        with self._uow:
            if self._repo.find_enrollment(user_id, study_id) is None:
                group = assign_group(user_id, study_id)
                self._repo.add_enrollment(
                    user_id=user_id,
                    study_id=study_id,
                    group=group.value,
                )
            if self._repo.find_affect(user_id, study_id, phase) is not None:
                raise DomainValueError(
                    f"affect survey {phase!r} already submitted"
                )
            self._repo.save_affect(
                user_id=user_id,
                study_id=study_id,
                phase=phase,
                anxiety_mean=anxiety_mean,
                motivation_mean=motivation_mean,
                responses={
                    "anxiety": anxiety_items,
                    "motivation": motivation_items,
                },
            )
            self._uow.commit()

    # ── Export (admin only) ──────────────────────────────────────────
    def export_csv_rows(
        self, requester: "User", study_id: str,
    ) -> list["StudyExportRow"]:
        if requester.role is not Role.ADMIN:
            # Defence-in-depth: the router gates with require_role, but
            # services should not assume callers gated correctly.
            raise PermissionDeniedError("admin only")
        if not is_valid_study_id(study_id):
            raise DomainValueError(
                "study_id must be 1..64 chars of [A-Za-z0-9_-]"
            )
        return self._repo.export_rows(study_id)
