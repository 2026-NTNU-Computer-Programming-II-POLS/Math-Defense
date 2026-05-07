"""Initial Q-matrix table — Pedagogical_Backlog_Spec.md §7.

Every entry in `ACHIEVEMENT_DEFS` plus every diagnostic event id must appear
here exactly once. The CI parity test in `tests/test_q_matrix.py` enforces this
invariant so a new achievement cannot ship without a competency-evidence row.

Weight rationale:
* The four explicit rows in §7.3 (`combat_kill_50`, `score_single_5000`,
  `efficiency_low_spend`, `survival_no_damage`) are reproduced verbatim.
* Sibling achievements in the same pedagogical category inherit the explicit
  row's weights — they exercise the same play surface, so they evidence the
  same competencies at the same magnitudes.
* Diagnostic events (`chain_rule_correct`, `monty_hall_*`, `ia_correct`,
  `limit_correct`) are unit-loaded on the competency they directly probe.
"""
from __future__ import annotations

from app.domain.achievement.definitions import ACHIEVEMENT_DEFS

from .competencies import Competency as C
from .q_matrix import QMatrix


# ── Diagnostic event ids (forward-looking — not yet emitted by gameplay) ──
DIAGNOSTIC_EVENTS: frozenset[str] = frozenset({
    "chain_rule_correct",
    "monty_hall_switch_won",
    "monty_hall_kept_won",
    "ia_correct",
    "limit_correct",
})


# ── Category-default rows (sum ≤ 1) ──
_COMBAT = {
    C.MAGIC: 0.2, C.RADAR: 0.2, C.MATRIX: 0.2,
    C.LIMIT: 0.1, C.CALCULUS: 0.1, C.CHAIN_RULE: 0.1, C.PROBABILITY: 0.1,
}
_SCORING = {
    C.MAGIC: 0.2, C.RADAR: 0.2, C.MATRIX: 0.2,
    C.LIMIT: 0.1, C.CALCULUS: 0.1, C.CHAIN_RULE: 0.1, C.PROBABILITY: 0.1,
}
_EFFICIENCY = {
    C.MAGIC: 0.3, C.RADAR: 0.2, C.MATRIX: 0.2,
    C.LIMIT: 0.1, C.CALCULUS: 0.1, C.PROBABILITY: 0.1,
}
_SURVIVAL = {
    C.MAGIC: 0.2, C.RADAR: 0.3, C.MATRIX: 0.2,
    C.LIMIT: 0.1, C.CALCULUS: 0.1, C.CHAIN_RULE: 0.1,
}
# Generalist categories — light evidence across all towers.
_EXPLORATION = {
    C.MAGIC: 0.15, C.RADAR: 0.15, C.MATRIX: 0.15,
    C.LIMIT: 0.1, C.CALCULUS: 0.1, C.CHAIN_RULE: 0.05, C.PROBABILITY: 0.1,
}
_TERRITORY = {
    C.MAGIC: 0.15, C.RADAR: 0.2, C.MATRIX: 0.2,
    C.LIMIT: 0.1, C.CALCULUS: 0.1, C.CHAIN_RULE: 0.05, C.PROBABILITY: 0.1,
}
# Curve-family unlocks gate magic-tower content; treat as magic-only evidence.
_UNLOCK_MAGIC_CURVE = {C.MAGIC: 0.7}


_CATEGORY_DEFAULTS: dict[str, dict[C, float]] = {
    "combat": _COMBAT,
    "scoring": _SCORING,
    "efficiency": _EFFICIENCY,
    "survival": _SURVIVAL,
    "exploration": _EXPLORATION,
    "territory": _TERRITORY,
}


# Per-id overrides take precedence over category defaults.
_ROW_OVERRIDES: dict[str, dict[C, float]] = {
    # Curve-family unlocks: magic-tower-specific, not generalist exploration.
    "unlock_trig_curves": _UNLOCK_MAGIC_CURVE,
    "unlock_log_curves": _UNLOCK_MAGIC_CURVE,
}


def _build_achievement_rows() -> dict[str, dict[C, float]]:
    rows: dict[str, dict[C, float]] = {}
    for event_id, defn in ACHIEVEMENT_DEFS.items():
        if event_id in _ROW_OVERRIDES:
            rows[event_id] = dict(_ROW_OVERRIDES[event_id])
            continue
        default = _CATEGORY_DEFAULTS.get(defn.category)
        if default is None:
            raise RuntimeError(
                f"Achievement {event_id!r} category {defn.category!r} has no Q-matrix default; "
                "add a category default in q_matrix_defs._CATEGORY_DEFAULTS or a per-id override."
            )
        rows[event_id] = dict(default)
    return rows


_DIAGNOSTIC_ROWS: dict[str, dict[C, float]] = {
    "chain_rule_correct":   {C.CALCULUS: 0.5, C.CHAIN_RULE: 1.0},
    "monty_hall_switch_won": {C.PROBABILITY: 1.0},
    "monty_hall_kept_won":   {C.PROBABILITY: 0.3},
    "ia_correct":            {C.MAGIC: 0.4, C.CALCULUS: 0.4, C.CHAIN_RULE: 0.2},
    "limit_correct":         {C.LIMIT: 1.0},
}


def _build_q_matrix() -> QMatrix:
    rows = _build_achievement_rows()
    # Diagnostic event ids must not collide with achievement ids.
    overlap = set(rows.keys()) & set(_DIAGNOSTIC_ROWS.keys())
    if overlap:
        raise RuntimeError(f"Diagnostic event ids collide with achievement ids: {overlap}")
    rows.update(_DIAGNOSTIC_ROWS)
    return QMatrix(rows)


Q_MATRIX: QMatrix = _build_q_matrix()
