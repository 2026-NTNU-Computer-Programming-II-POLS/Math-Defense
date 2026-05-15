"""AssessmentApplicationService — Pedagogical_Backlog_Spec.md §8.

Translates raw evidence events into Beta-posterior updates. The Q-matrix is
injected so tests can substitute a deterministic fixture; production wiring
in ``factories.py`` passes the project-wide ``Q_MATRIX`` singleton.

The service is intentionally thin: the aggregate owns the update rule, the
repository owns persistence, and this class only sequences the lookup,
update, and save inside a unit of work.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol

from app.domain.assessment import (
    BetaSummary,
    Competency,
    CompetencyState,
    QMatrix,
    UnknownEventError,
    suggestion_for,
)
from app.domain.class_.errors import ClassNotFoundError

if TYPE_CHECKING:
    from app.application.ports import UnitOfWork
    from app.domain.class_.repository import ClassRepository
    from app.domain.user.repository import UserRepository

logger = logging.getLogger(__name__)


class CompetencyStateRepository(Protocol):
    def find_by_user(self, user_id: str) -> CompetencyState: ...
    def find_by_user_for_update(self, user_id: str) -> CompetencyState: ...
    def find_by_users(self, user_ids: list[str]) -> dict[str, CompetencyState]: ...
    def save(self, state: CompetencyState) -> None: ...


@dataclass(frozen=True)
class StudentCompetencySummary:
    """Per-student row in the teacher dashboard read model (spec §9.1)."""

    student_id: str
    student_name: str
    posteriors: dict[Competency, BetaSummary]
    lowest_competency: Competency
    suggestion: str


class AssessmentApplicationService:
    def __init__(
        self,
        competency_repo: CompetencyStateRepository,
        q_matrix: QMatrix,
        uow: UnitOfWork,
        class_repo: ClassRepository | None = None,
        user_repo: UserRepository | None = None,
    ) -> None:
        self._repo = competency_repo
        self._q_matrix = q_matrix
        self._uow = uow
        self._class_repo = class_repo
        self._user_repo = user_repo

    def record_event(self, user_id: str, event_id: str, success: bool) -> None:
        """Apply one evidence event for ``user_id``.

        Unknown event ids are swallowed-with-warning rather than re-raised:
        we do not want a typo in a future emitter to roll back a
        successfully completed session. The Q-matrix parity test in
        ``tests/test_q_matrix.py`` is the right place to catch that mistake.
        """
        try:
            row = {c: self._q_matrix.weight(event_id, c) for c in Competency}
        except UnknownEventError:
            logger.warning(
                "assessment.record_event: unknown event id %r — skipping (user=%s)",
                event_id,
                user_id,
            )
            return
        if all(w == 0.0 for w in row.values()):
            return
        with self._uow:
            # B-BUG-6: lock rows on the read so concurrent evidence events
            # for the same (user, competency) cannot lose-update each other.
            state = self._repo.find_by_user_for_update(user_id)
            updated = state.apply_event(self._q_matrix, event_id, success)
            self._repo.save(state)
            self._uow.commit()
            logger.info(
                "assessment.record_event user=%s event=%s success=%s competencies=%s",
                user_id, event_id, success, [c.value for c in updated],
            )

    def apply_evidence_in_open_uow(
        self, user_id: str, events: list[tuple[str, bool]]
    ) -> None:
        """Write Beta-evidence rows using the caller's already-open DB session.

        Does NOT open or commit a UoW — the caller is responsible for both.
        Used by AchievementCheckHandler so achievement unlocks and their
        corresponding Beta-evidence land in the same DB commit (H3 atomicity).
        All services share one SqlAlchemyUnitOfWork per request (see factories
        _get_uow), so writes here participate in the caller's transaction.
        """
        if not events:
            return
        state = self._repo.find_by_user_for_update(user_id)
        for event_id, success in events:
            try:
                state.apply_event(self._q_matrix, event_id, success)
            except UnknownEventError:
                logger.warning(
                    "assessment.apply_evidence_in_open_uow: unknown event id %r — skipping (user=%s)",
                    event_id,
                    user_id,
                )
        self._repo.save(state)

    def get_posteriors(self, user_id: str) -> dict[Competency, BetaSummary]:
        """Return a summary per competency. Single SELECT under the hood —
        spec §8.5 acceptance criterion."""
        state = self._repo.find_by_user(user_id)
        return {
            c: BetaSummary.from_beta(b) for c, b in state.all_posteriors().items()
        }

    def get_class_posteriors(
        self, class_id: str, requester_id: str
    ) -> list[StudentCompetencySummary]:
        """Roster-wide posterior read model for the teacher dashboard
        (spec §9). Verifies teacher ownership inside — the route gates on
        ``require_role(TEACHER)``, which prevents students hitting it, but
        the ownership check is what stops a teacher reading another
        teacher's class.

        Order is stable by student name then id so the dashboard does not
        reshuffle on every refresh.
        """
        if self._class_repo is None or self._user_repo is None:
            raise RuntimeError(
                "AssessmentApplicationService requires class_repo and user_repo "
                "to serve get_class_posteriors"
            )
        cls_ = self._class_repo.find_by_id(class_id)
        if cls_ is None:
            raise ClassNotFoundError("Class not found")
        cls_.verify_owner(requester_id)

        memberships = self._class_repo.find_memberships_by_class(class_id)
        student_ids = [m.student_id for m in memberships]
        if not student_ids:
            return []
        users = {u.id: u for u in self._user_repo.find_by_ids(student_ids)}
        states = self._repo.find_by_users(student_ids)

        rows: list[StudentCompetencySummary] = []
        for sid in student_ids:
            state = states.get(sid) or CompetencyState.empty(sid)
            posteriors_beta = state.all_posteriors()
            lowest, text = suggestion_for(posteriors_beta)
            user = users.get(sid)
            rows.append(
                StudentCompetencySummary(
                    student_id=sid,
                    student_name=user.player_name if user else "",
                    posteriors={
                        c: BetaSummary.from_beta(b)
                        for c, b in posteriors_beta.items()
                    },
                    lowest_competency=lowest,
                    suggestion=text,
                )
            )
        rows.sort(key=lambda r: (r.student_name.lower(), r.student_id))
        return rows
