"""SQLAlchemy implementation of the competency-state repository.

Spec §8.5 mandates that ``get_posteriors`` issue exactly one SELECT — so
``find_by_user`` materialises the whole row set in a single query and
``CompetencyState.from_rows`` reconstitutes the aggregate without per-key
fetches. ``save`` mirrors this by upserting only the dirty rows in one
``execute`` via the PG ``ON CONFLICT`` form already used elsewhere in this
package.
"""
from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session as DbSession

from app.domain.assessment import Beta, Competency, CompetencyState
from app.models.competency_state import UserCompetencyState as CompetencyStateModel


class SqlAlchemyCompetencyStateRepository:
    def __init__(self, db: DbSession) -> None:
        self._db = db

    def find_by_user(self, user_id: str) -> CompetencyState:
        """Single SELECT: spec §8.5 forbids N+1 access."""
        return self._read_state(user_id, for_update=False)

    def find_by_user_for_update(self, user_id: str) -> CompetencyState:
        # B-BUG-6: read-modify-write on the Beta posterior under READ
        # COMMITTED loses one of two concurrent updates because both
        # transactions read the same alpha/beta and both upsert their
        # locally-incremented value with `excluded.alpha`. Two layers of
        # locking close the window:
        #   1. Anchor on users.id FOR UPDATE so concurrent transactions
        #      serialise even when no competency rows exist yet (with_for_
        #      update on an empty competency rowset locks nothing — the
        #      same cold-start trap as B-BUG-2).
        #   2. with_for_update on the competency rows themselves so that
        #      once rows exist, the read sees the post-commit state of the
        #      previous winner.
        self._db.execute(
            text("SELECT id FROM users WHERE id = :uid FOR UPDATE"),
            {"uid": user_id},
        )
        return self._read_state(user_id, for_update=True)

    def _read_state(self, user_id: str, for_update: bool) -> CompetencyState:
        q = (
            self._db.query(CompetencyStateModel)
            .filter(CompetencyStateModel.user_id == user_id)
        )
        if for_update:
            q = q.with_for_update()
        rows = q.all()
        posteriors: dict[Competency, Beta] = {}
        for row in rows:
            try:
                comp = Competency(row.competency)
            except ValueError:
                # Competency was retired from the taxonomy — drop the row
                # silently rather than crashing the dashboard. The migration
                # that retires a competency is responsible for cleanup; this
                # is just a defence against stale data on a partial rollback.
                continue
            posteriors[comp] = Beta(alpha=row.alpha, beta=row.beta)
        return CompetencyState.from_rows(user_id, posteriors)

    def find_by_users(self, user_ids: list[str]) -> dict[str, CompetencyState]:
        """Batch read for the teacher dashboard (spec §9). One SELECT for the
        whole roster — students with zero stored rows still get an entry, with
        ``CompetencyState.empty`` so the dashboard can render the uniform-prior
        bars without a per-student fallback."""
        if not user_ids:
            return {}
        rows = (
            self._db.query(CompetencyStateModel)
            .filter(CompetencyStateModel.user_id.in_(user_ids))
            .all()
        )
        per_user: dict[str, dict[Competency, Beta]] = {uid: {} for uid in user_ids}
        for row in rows:
            try:
                comp = Competency(row.competency)
            except ValueError:
                continue
            per_user.setdefault(row.user_id, {})[comp] = Beta(
                alpha=row.alpha, beta=row.beta
            )
        return {
            uid: CompetencyState.from_rows(uid, posteriors)
            for uid, posteriors in per_user.items()
        }

    def save(self, state: CompetencyState) -> None:
        """Upsert only the dirty competencies. Idempotent on the natural
        key (``user_id``, ``competency``)."""
        dirty = state.dirty_posteriors()
        if not dirty:
            return
        now = datetime.now(UTC)
        values = [
            {
                "user_id": state.user_id,
                "competency": comp.value,
                "alpha": beta.alpha,
                "beta": beta.beta,
                "updated_at": now,
            }
            for comp, beta in dirty.items()
        ]
        stmt = pg_insert(CompetencyStateModel).values(values)
        stmt = stmt.on_conflict_do_update(
            index_elements=["user_id", "competency"],
            set_={
                "alpha": stmt.excluded.alpha,
                "beta": stmt.excluded.beta,
                "updated_at": stmt.excluded.updated_at,
            },
        )
        self._db.execute(stmt)
        self._db.flush()
        state.mark_clean()
