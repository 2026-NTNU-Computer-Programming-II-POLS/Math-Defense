"""B-ARCH-6 — shared parity fixtures for recompute_total_score.

The V2 score formula has two implementations (Python in
``backend/app/domain/scoring/score_calculator.py`` and TypeScript in
``frontend/src/domain/scoring/score-calculator.ts``). Until both call into a
single WASM export, drift between the two is the most plausible source of
``replay_mismatch`` flapping.

This test loads the canonical fixtures at ``shared/score_parity_fixtures.json``
and asserts the Python implementation matches them. The TS side has a sibling
test that consumes the same file. A change to the formula must regenerate the
fixture set and update both languages in lock-step; otherwise one of the two
test files will fail in CI.
"""
from __future__ import annotations

import json
from pathlib import Path

from app.domain.scoring.score_calculator import recompute_total_score

_FIXTURES = (
    Path(__file__).resolve().parents[2] / "shared" / "score_parity_fixtures.json"
)

# Shared cross-implementation parity tolerance — kept identical to
# frontend/src/domain/scoring/score-calculator.parity.test.ts. Both suites
# compare the raw formula output against the same fixtures, so the only
# admissible difference is last-ULP pow variance across libm implementations.
_PARITY_TOLERANCE = 1e-12


def test_python_matches_shared_fixtures() -> None:
    with _FIXTURES.open("r", encoding="utf-8") as f:
        cases = json.load(f)
    for case in cases:
        actual = recompute_total_score(**case["input"])
        expected = case["expected"]
        if expected is None:
            assert actual is None, f"expected None, got {actual!r} for {case['input']}"
            continue
        assert actual is not None, f"expected {expected!r}, got None for {case['input']}"
        assert abs(actual - expected) < _PARITY_TOLERANCE, (
            f"score drift on case {case['input']}: actual={actual!r} expected={expected!r}"
        )
