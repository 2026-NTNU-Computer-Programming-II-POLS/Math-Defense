"""Bayesian Competency Estimator — Pedagogical_Backlog_Spec.md §8.6.

Splits into:
  * pure-function tests for ``update``, ``mean``, ``ci95`` (well-known Beta
    moments, so no statistical-library dependency is needed);
  * aggregate tests for ``CompetencyState.apply_event`` (Q-matrix dispatch
    and dirty-set bookkeeping);
  * an integration test that drives an ``AssessmentApplicationService``
    against the SQLAlchemy repository and asserts the §8.5 acceptance
    criteria (5 chain-rule-correct → mean > 0.85; uniform prior → mean 0.5;
    one SELECT for ``get_posteriors``).
"""
from __future__ import annotations

import math

import pytest

from app.application.assessment_service import AssessmentApplicationService
from app.domain.assessment import (
    UNIFORM_PRIOR,
    Beta,
    BetaSummary,
    Competency,
    CompetencyState,
    QMatrix,
    Q_MATRIX,
    UnknownEventError,
    ci95,
    mean,
    update,
)
from app.domain.errors import DomainValueError
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.infrastructure.persistence.competency_state_repository import (
    SqlAlchemyCompetencyStateRepository,
)
from app.infrastructure.persistence.user_repository import SqlAlchemyUserRepository
from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork


# ── Pure Beta math ────────────────────────────────────────────────────────────

class TestBetaInvariants:
    def test_uniform_prior_mean_is_half(self):
        assert mean(UNIFORM_PRIOR) == 0.5

    def test_update_no_evidence_returns_unchanged_shapes(self):
        b = update(UNIFORM_PRIOR, weight=0.0, success=True)
        assert b.alpha == UNIFORM_PRIOR.alpha
        assert b.beta == UNIFORM_PRIOR.beta

    def test_update_success_weight_one_increments_alpha(self):
        b = update(UNIFORM_PRIOR, weight=1.0, success=True)
        assert b.alpha == 2.0 and b.beta == 1.0

    def test_update_failure_weight_one_increments_beta(self):
        b = update(UNIFORM_PRIOR, weight=1.0, success=False)
        assert b.alpha == 1.0 and b.beta == 2.0

    def test_fractional_weight(self):
        b = update(UNIFORM_PRIOR, weight=0.3, success=True)
        assert b.alpha == pytest.approx(1.3)
        assert b.beta == pytest.approx(1.0)

    def test_negative_weight_rejected(self):
        with pytest.raises(DomainValueError):
            update(UNIFORM_PRIOR, weight=-0.1, success=True)

    def test_zero_shapes_rejected(self):
        with pytest.raises(DomainValueError):
            Beta(0.0, 1.0)
        with pytest.raises(DomainValueError):
            Beta(1.0, 0.0)


class TestBetaMomentsMatchClosedForm:
    """Closed-form Beta moments — the test that catches an arithmetic
    regression in ``update`` even if the dirty-set bookkeeping silently
    masks it at the aggregate level."""

    @pytest.mark.parametrize("a,b", [(2, 5), (10, 3), (1, 1), (50, 50)])
    def test_mean_matches_formula(self, a, b):
        assert mean(Beta(a, b)) == pytest.approx(a / (a + b))

    @pytest.mark.parametrize("a,b", [(20, 5), (10, 10), (50, 50)])
    def test_ci95_brackets_mean(self, a, b):
        beta = Beta(a, b)
        lo, hi = ci95(beta)
        m = mean(beta)
        assert 0.0 <= lo <= m <= hi <= 1.0
        # Half-width should shrink as α + β grows (variance ~ 1/(α+β+1))
        var = (a * b) / (((a + b) ** 2) * (a + b + 1.0))
        sd = math.sqrt(var)
        assert hi - lo == pytest.approx(2 * 1.959963984540054 * sd, abs=1e-9) \
            or (lo == 0.0 or hi == 1.0)


class TestBetaSummary:
    def test_from_beta_carries_shape_and_summary(self):
        s = BetaSummary.from_beta(Beta(3.0, 7.0))
        assert s.alpha == 3.0 and s.beta == 7.0
        assert s.mean == pytest.approx(0.3)
        assert 0.0 <= s.ci_low <= s.mean <= s.ci_high <= 1.0


# ── CompetencyState aggregate ─────────────────────────────────────────────────

class TestCompetencyState:
    def test_unseen_competency_returns_uniform_prior(self):
        state = CompetencyState.empty("u")
        assert state.posterior(Competency.LIMIT) == UNIFORM_PRIOR

    def test_apply_event_updates_loaded_competencies(self):
        state = CompetencyState.empty("u")
        updated = state.apply_event(Q_MATRIX, "limit_correct", success=True)
        # limit_correct is unit-loaded on LIMIT only.
        assert updated == [Competency.LIMIT]
        assert state.posterior(Competency.LIMIT).alpha == 2.0
        for c in Competency:  # lgtm[py/iteration-over-non-iterable]
            if c is Competency.LIMIT:
                continue
            assert state.posterior(c) == UNIFORM_PRIOR

    def test_apply_event_dirty_set_tracks_writes(self):
        state = CompetencyState.empty("u")
        state.apply_event(Q_MATRIX, "chain_rule_correct", success=True)
        assert state.dirty == frozenset(
            {Competency.CALCULUS, Competency.CHAIN_RULE}
        )
        state.mark_clean()
        assert state.dirty == frozenset()

    def test_apply_event_rejects_unknown_event(self):
        state = CompetencyState.empty("u")
        with pytest.raises(UnknownEventError):
            state.apply_event(Q_MATRIX, "not_a_real_event", success=True)

    def test_repeated_chain_rule_correct_drives_mean_above_0_85(self):
        """Spec §8.5 acceptance criterion."""
        state = CompetencyState.empty("u")
        for _ in range(5):
            state.apply_event(Q_MATRIX, "chain_rule_correct", success=True)
        assert mean(state.posterior(Competency.CHAIN_RULE)) > 0.85

    def test_zero_event_user_has_mean_half_for_every_competency(self):
        state = CompetencyState.empty("u")
        for c in Competency:  # lgtm[py/iteration-over-non-iterable]
            assert mean(state.posterior(c)) == 0.5


# ── Integration: repository + service against PG test DB ─────────────────────

def _make_user(db_session, name: str) -> User:
    user = User.create(
        email=f"{name}@test.local",
        player_name=name,
        role=Role.STUDENT,
        password_hash="x",
    )
    SqlAlchemyUserRepository(db_session).save(user)
    db_session.flush()
    return user


class TestAssessmentService:
    def _service(self, db_session) -> AssessmentApplicationService:
        return AssessmentApplicationService(
            competency_repo=SqlAlchemyCompetencyStateRepository(db_session),
            q_matrix=Q_MATRIX,
            uow=SqlAlchemyUnitOfWork(db_session),
        )

    def test_get_posteriors_uniform_for_new_user(self, db_session):
        user = _make_user(db_session, "assess_new")
        svc = self._service(db_session)
        posteriors = svc.get_posteriors(user.id)
        assert set(posteriors.keys()) == set(Competency)
        for summary in posteriors.values():
            assert summary.mean == pytest.approx(0.5)

    def test_record_event_persists_across_calls(self, db_session):
        user = _make_user(db_session, "assess_persist")
        svc = self._service(db_session)
        svc.record_event(user.id, "limit_correct", success=True)
        # Fresh service instance — simulate a separate request reading state.
        fresh = self._service(db_session)
        post = fresh.get_posteriors(user.id)[Competency.LIMIT]
        assert post.alpha == 2.0
        assert post.beta == 1.0
        # Untouched competencies remain at the uniform prior.
        assert fresh.get_posteriors(user.id)[Competency.MAGIC].mean == 0.5

    def test_record_events_batches_into_one_uow(self, db_session):
        user = _make_user(db_session, "assess_batch")
        svc = self._service(db_session)
        svc.record_events(
            user.id,
            [("chain_rule_correct", True)] * 5,
        )
        post = svc.get_posteriors(user.id)[Competency.CHAIN_RULE]
        assert post.mean > 0.85
        # CHAIN_RULE rows: weight 1.0 × 5 → α = 1 + 5 = 6.0
        assert post.alpha == pytest.approx(6.0)

    def test_unknown_event_is_swallowed(self, db_session):
        user = _make_user(db_session, "assess_unk")
        svc = self._service(db_session)
        # Must not raise — protects end_session from a typo'd event id.
        svc.record_event(user.id, "no_such_event", success=True)
        post = svc.get_posteriors(user.id)
        for summary in post.values():
            assert summary.mean == pytest.approx(0.5)

    def test_get_posteriors_uses_single_select(self, db_session):
        """Spec §8.5: ``get_posteriors`` must not N+1 the database."""
        user = _make_user(db_session, "assess_n1")
        svc = self._service(db_session)
        # Seed multiple competencies so a per-key fetch would issue 7 SELECTs.
        svc.record_events(
            user.id,
            [
                ("limit_correct", True),
                ("chain_rule_correct", True),
                ("monty_hall_switch_won", True),
            ],
        )
        statements: list[str] = []

        from sqlalchemy import event as sa_event

        engine = db_session.get_bind()

        def _capture(conn, cursor, statement, *args, **kwargs):
            if "user_competency_state" in statement:
                statements.append(statement)

        sa_event.listen(engine, "before_cursor_execute", _capture)
        try:
            svc.get_posteriors(user.id)
        finally:
            sa_event.remove(engine, "before_cursor_execute", _capture)

        selects = [s for s in statements if s.lstrip().upper().startswith("SELECT")]
        assert len(selects) == 1, f"expected 1 SELECT, got {len(selects)}: {selects}"


# ── Q-matrix dispatch via a deterministic fixture matrix ─────────────────────

class TestApplyEventWithFixtureMatrix:
    """Locks down ``apply_event`` semantics independent of the project-wide
    Q-matrix so a future row reweighting cannot silently break the rule."""

    def setup_method(self):
        self.q = QMatrix({
            "win": {Competency.MAGIC: 1.0, Competency.RADAR: 0.5},
            "loss_evidence": {Competency.PROBABILITY: 0.5},
        })

    def test_success_increments_alpha_by_weight(self):
        state = CompetencyState.empty("u")
        state.apply_event(self.q, "win", success=True)
        assert state.posterior(Competency.MAGIC).alpha == pytest.approx(2.0)
        assert state.posterior(Competency.MAGIC).beta == pytest.approx(1.0)
        assert state.posterior(Competency.RADAR).alpha == pytest.approx(1.5)

    def test_failure_increments_beta_by_weight(self):
        state = CompetencyState.empty("u")
        state.apply_event(self.q, "loss_evidence", success=False)
        post = state.posterior(Competency.PROBABILITY)
        assert post.alpha == pytest.approx(1.0)
        assert post.beta == pytest.approx(1.5)
