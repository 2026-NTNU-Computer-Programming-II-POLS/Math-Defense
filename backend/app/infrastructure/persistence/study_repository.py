"""SQLAlchemy persistence for study enrollments, probe attempts, and affect
responses (Pedagogical_Backlog_Spec.md §27).

The repository deliberately exposes thin CRUD methods plus one aggregate
query (``export_rows``) that powers the admin CSV. The export is a single
LEFT JOIN of all three tables, keyed on (user_id, study_id), so the admin
view is always consistent even if some participants skipped a phase
(missing values surface as ``None`` in the row tuple, which the router
maps to an empty CSV cell).
"""
from __future__ import annotations

from sqlalchemy.orm import Session as DbSession

from app.models.study import (
    StudyAffectResponse,
    StudyEnrollment,
    StudyProbeAttempt,
)


class StudyExportRow:
    """Flat row built by the export query. Kept as a plain class (not a
    dataclass / Pydantic model) so the SQL layer does not need to import
    pydantic, and the router does the CSV serialisation explicitly."""

    __slots__ = (
        "user_id",
        "group",
        "pre_score",
        "post_score",
        "delay_score",
        "dosage_seconds",
        "anxiety_pre",
        "anxiety_post",
    )

    def __init__(
        self,
        user_id: str,
        group: str,
        pre_score: int | None,
        post_score: int | None,
        delay_score: int | None,
        dosage_seconds: int,
        anxiety_pre: float | None,
        anxiety_post: float | None,
    ) -> None:
        self.user_id = user_id
        self.group = group
        self.pre_score = pre_score
        self.post_score = post_score
        self.delay_score = delay_score
        self.dosage_seconds = dosage_seconds
        self.anxiety_pre = anxiety_pre
        self.anxiety_post = anxiety_post


class SqlAlchemyStudyRepository:
    def __init__(self, db: DbSession) -> None:
        self._db = db

    # ── Enrollment ────────────────────────────────────────────────────
    def find_enrollment(
        self, user_id: str, study_id: str,
    ) -> StudyEnrollment | None:
        return (
            self._db.query(StudyEnrollment)
            .filter(
                StudyEnrollment.user_id == user_id,
                StudyEnrollment.study_id == study_id,
            )
            .first()
        )

    def add_enrollment(
        self, user_id: str, study_id: str, group: str,
    ) -> StudyEnrollment:
        row = StudyEnrollment(
            user_id=user_id, study_id=study_id, group=group,
        )
        self._db.add(row)
        self._db.flush()
        return row

    # ── Probe ─────────────────────────────────────────────────────────
    def find_probe(
        self, user_id: str, study_id: str, form: str,
    ) -> StudyProbeAttempt | None:
        return (
            self._db.query(StudyProbeAttempt)
            .filter(
                StudyProbeAttempt.user_id == user_id,
                StudyProbeAttempt.study_id == study_id,
                StudyProbeAttempt.form == form,
            )
            .first()
        )

    def save_probe(
        self,
        *,
        user_id: str,
        study_id: str,
        form: str,
        score: int,
        responses: list[dict],
    ) -> StudyProbeAttempt:
        row = StudyProbeAttempt(
            user_id=user_id,
            study_id=study_id,
            form=form,
            score=score,
            responses=responses,
        )
        self._db.add(row)
        self._db.flush()
        return row

    # ── Affect ────────────────────────────────────────────────────────
    def find_affect(
        self, user_id: str, study_id: str, phase: str,
    ) -> StudyAffectResponse | None:
        return (
            self._db.query(StudyAffectResponse)
            .filter(
                StudyAffectResponse.user_id == user_id,
                StudyAffectResponse.study_id == study_id,
                StudyAffectResponse.phase == phase,
            )
            .first()
        )

    def save_affect(
        self,
        *,
        user_id: str,
        study_id: str,
        phase: str,
        anxiety_mean: float,
        motivation_mean: float,
        responses: dict,
    ) -> StudyAffectResponse:
        row = StudyAffectResponse(
            user_id=user_id,
            study_id=study_id,
            phase=phase,
            anxiety_mean=anxiety_mean,
            motivation_mean=motivation_mean,
            responses=responses,
        )
        self._db.add(row)
        self._db.flush()
        return row

    # ── Export ────────────────────────────────────────────────────────
    def export_rows(self, study_id: str) -> list[StudyExportRow]:
        """Return one StudyExportRow per enrolled participant.

        Built in three indexed lookups + an in-memory join. The participant
        count for a course-final study is at most a few dozen (§27.1
        targets N=20 per group), so a single SQL JOIN with three LEFT JOINs
        is overkill here; the simple approach keeps the SQL boring and
        the assembly testable.
        """
        enrollments = (
            self._db.query(StudyEnrollment)
            .filter(StudyEnrollment.study_id == study_id)
            .order_by(StudyEnrollment.enrolled_at.asc())
            .all()
        )
        if not enrollments:
            return []

        probes = (
            self._db.query(StudyProbeAttempt)
            .filter(StudyProbeAttempt.study_id == study_id)
            .all()
        )
        affect = (
            self._db.query(StudyAffectResponse)
            .filter(StudyAffectResponse.study_id == study_id)
            .all()
        )

        # Index by (user_id, form / phase) so the row assembly below is O(N).
        probe_by_key: dict[tuple[str, str], int] = {
            (p.user_id, p.form): p.score for p in probes
        }
        affect_by_key: dict[tuple[str, str], float] = {
            (a.user_id, a.phase): a.anxiety_mean for a in affect
        }

        out: list[StudyExportRow] = []
        for e in enrollments:
            out.append(
                StudyExportRow(
                    user_id=e.user_id,
                    group=e.group,
                    pre_score=probe_by_key.get((e.user_id, "pre")),
                    post_score=probe_by_key.get((e.user_id, "post")),
                    delay_score=probe_by_key.get((e.user_id, "delay")),
                    dosage_seconds=e.dosage_seconds,
                    anxiety_pre=affect_by_key.get((e.user_id, "pre")),
                    anxiety_post=affect_by_key.get((e.user_id, "post")),
                )
            )
        return out
