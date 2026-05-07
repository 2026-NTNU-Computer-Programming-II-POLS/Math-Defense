"""Q-matrix tests — Pedagogical_Backlog_Spec.md §7.6.

The parity test is the load-bearing one: it fails CI if a new achievement is
added without a Q-matrix row, which is the whole point of declaring evidence
mappings as data.
"""
from __future__ import annotations

import pytest

from app.domain.achievement.definitions import ACHIEVEMENT_DEFS
from app.domain.assessment import (
    DIAGNOSTIC_EVENTS,
    Q_MATRIX,
    Competency,
    QMatrix,
    UnknownEventError,
)
from app.domain.errors import DomainValueError


# ── Spec-mandated tests (§7.6) ────────────────────────────────────────────────

def test_completeness() -> None:
    """Every achievement id has a Q-matrix row."""
    missing = set(ACHIEVEMENT_DEFS.keys()) - Q_MATRIX.events()
    assert not missing, f"Achievements missing from Q-matrix: {sorted(missing)}"


def test_value_bounds() -> None:
    """All weights lie in [0, 1]."""
    for event_id in Q_MATRIX.events():
        for competency in Competency:
            w = Q_MATRIX.weight(event_id, competency)
            assert 0.0 <= w <= 1.0, f"{event_id}/{competency.value} weight {w} out of bounds"


# ── Parity & contract (§7.5 acceptance criteria) ──────────────────────────────

def test_events_parity_with_definitions_and_diagnostics() -> None:
    """`QMatrix.events()` == `ACHIEVEMENT_DEFS.keys() ∪ DIAGNOSTIC_EVENTS`."""
    expected = frozenset(ACHIEVEMENT_DEFS.keys()) | DIAGNOSTIC_EVENTS
    assert Q_MATRIX.events() == expected


def test_weight_returns_float_for_known_event() -> None:
    w = Q_MATRIX.weight("combat_kill_50", Competency.MAGIC)
    assert isinstance(w, float)
    assert w == pytest.approx(0.2)


def test_weight_zero_for_competency_absent_from_row() -> None:
    """`limit_correct` is unit-loaded on LIMIT only — every other competency is 0."""
    for c in Competency:
        if c is Competency.LIMIT:
            continue
        assert Q_MATRIX.weight("limit_correct", c) == 0.0
    assert Q_MATRIX.weight("limit_correct", Competency.LIMIT) == pytest.approx(1.0)


def test_weight_raises_on_unknown_event() -> None:
    with pytest.raises(UnknownEventError):
        Q_MATRIX.weight("not_a_real_event", Competency.MAGIC)


def test_diagnostic_events_are_unit_loaded() -> None:
    """Spec §7.3: diagnostic rows may sum > 1 because they are unit-loaded
    on the competency they directly probe."""
    assert Q_MATRIX.weight("chain_rule_correct", Competency.CHAIN_RULE) == pytest.approx(1.0)
    assert Q_MATRIX.weight("chain_rule_correct", Competency.CALCULUS) == pytest.approx(0.5)
    assert Q_MATRIX.weight("monty_hall_switch_won", Competency.PROBABILITY) == pytest.approx(1.0)
    assert Q_MATRIX.weight("monty_hall_kept_won", Competency.PROBABILITY) == pytest.approx(0.3)
    assert Q_MATRIX.weight("ia_correct", Competency.MAGIC) == pytest.approx(0.4)
    assert Q_MATRIX.weight("ia_correct", Competency.CALCULUS) == pytest.approx(0.4)
    assert Q_MATRIX.weight("ia_correct", Competency.CHAIN_RULE) == pytest.approx(0.2)
    assert Q_MATRIX.weight("limit_correct", Competency.LIMIT) == pytest.approx(1.0)


def test_explicit_spec_rows_match_table() -> None:
    """The four achievement rows quoted verbatim in §7.3 must match the table."""
    expected = {
        "combat_kill_50":      [0.2, 0.2, 0.2, 0.1, 0.1, 0.1, 0.1],
        "score_single_5000":   [0.2, 0.2, 0.2, 0.1, 0.1, 0.1, 0.1],
        "efficiency_low_spend":[0.3, 0.2, 0.2, 0.1, 0.1, 0.0, 0.1],
        "survival_no_damage":  [0.2, 0.3, 0.2, 0.1, 0.1, 0.1, 0.0],
    }
    order = [
        Competency.MAGIC, Competency.RADAR, Competency.MATRIX,
        Competency.LIMIT, Competency.CALCULUS, Competency.CHAIN_RULE, Competency.PROBABILITY,
    ]
    for event_id, weights in expected.items():
        for c, w in zip(order, weights):
            assert Q_MATRIX.weight(event_id, c) == pytest.approx(w), \
                f"{event_id}/{c.value} expected {w}, got {Q_MATRIX.weight(event_id, c)}"


# ── QMatrix value-object behaviour ────────────────────────────────────────────

def test_qmatrix_rejects_weight_above_one() -> None:
    with pytest.raises(DomainValueError):
        QMatrix({"x": {Competency.MAGIC: 1.5}})


def test_qmatrix_rejects_weight_below_zero() -> None:
    with pytest.raises(DomainValueError):
        QMatrix({"x": {Competency.MAGIC: -0.1}})


def test_qmatrix_accepts_row_sum_above_one_within_seven() -> None:
    """Diagnostic rows sum > 1; QMatrix must allow up to 7."""
    QMatrix({"x": {c: 1.0 for c in Competency}})  # sum == 7, accepted
