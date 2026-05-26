"""Regenerate shared/score_parity_fixtures.json from the canonical score formula.

Workflow when the V2 score formula changes:

  1. Edit wasm/math_engine.c::compute_total_score   (canonical source)
  2. cd wasm && make                                (rebuild WASM + .d.ts)
  3. Edit backend/app/domain/scoring/score_calculator.py (Python mirror)
  4. Edit frontend/src/domain/scoring/score-calculator.ts (TS mirror)
  5. python scripts/regenerate_score_fixtures.py    (refresh expected values)
  6. Run backend + frontend parity tests — both should now agree.

The canonical source of `expected` values is the WASM build (musl pow inside
the .wasm bytecode), because that is the implementation the frontend parity
test calls directly. We try to load it via ``wasm_runtime.get_total_score_fn``
first; if wasmtime isn't installed or the binary hasn't been rebuilt yet, we
fall back to the Python mirror (``recompute_total_score``). The script prints
which path it used so a reviewer can sanity-check the fixture diff against the
expected source of truth.

The input list below is the canonical representative coverage matrix: each
row exercises a distinct branch of the formula (zero-kill, no-tower path,
high-HP-loss exponent, prep-time deduction, etc.). Add a new row when a
new branch lands; never delete a row without a comment explaining why.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT / "backend"))

from app.domain.scoring.score_calculator import recompute_total_score  # noqa: E402

_FIXTURES_PATH = _ROOT / "shared" / "score_parity_fixtures.json"

# Each entry is a kwargs dict for recompute_total_score. Keep ordering stable
# so diffs stay legible when only the expected column changes.
CASES: list[dict] = [
    {
        "kill_value": 100,
        "time_total": 120.0,
        "time_exclude_prepare": [10.0],
        "cost_total": 50,
        "health_origin": 10,
        "health_final": 10,
        "initial_answer": True,
    },
    {
        "kill_value": 200,
        "time_total": 200.0,
        "time_exclude_prepare": [20.0, 5.0],
        "cost_total": 100,
        "health_origin": 10,
        "health_final": 8,
        "initial_answer": False,
    },
    {
        # cost_total = 0 exercises the no-tower penalty path (s2 = 0).
        "kill_value": 50,
        "time_total": 60.0,
        "time_exclude_prepare": [],
        "cost_total": 0,
        "health_origin": 10,
        "health_final": 10,
        "initial_answer": True,
    },
    {
        # kill_value = 0 must short-circuit to 0.0 regardless of other inputs.
        "kill_value": 0,
        "time_total": 120.0,
        "time_exclude_prepare": [10.0],
        "cost_total": 50,
        "health_origin": 10,
        "health_final": 10,
        "initial_answer": True,
    },
    {
        # Large HP loss + initial_answer=False exercises the exponent path.
        "kill_value": 300,
        "time_total": 180.0,
        "time_exclude_prepare": [15.0],
        "cost_total": 200,
        "health_origin": 10,
        "health_final": 5,
        "initial_answer": False,
    },
]


def _resolve_total_score_fn():
    """Return (callable, source_label).

    Prefer the WASM-backed compute_total_score so the fixture pins the same
    bit-pattern the frontend parity test verifies. Fall back to None (which
    drives recompute_total_score's Python branch) when wasmtime is unavailable
    or the .wasm hasn't been rebuilt with the export yet.
    """
    try:
        from app.infrastructure.wasm_runtime import get_total_score_fn
    except ImportError:
        return None, "python (wasm_runtime import failed)"
    fn = get_total_score_fn()
    if fn is None:
        return None, "python (wasmtime missing or compute_total_score not exported)"
    return fn, "wasm (compute_total_score via wasmtime)"


def main() -> int:
    total_score_fn, source = _resolve_total_score_fn()
    out: list[dict] = []
    for case in CASES:
        expected = recompute_total_score(**case, total_score_fn=total_score_fn)
        out.append({"input": case, "expected": expected})

    text = json.dumps(out, indent=2, ensure_ascii=False) + "\n"
    _FIXTURES_PATH.write_text(text, encoding="utf-8")
    print(f"Wrote {len(out)} fixtures to {_FIXTURES_PATH.relative_to(_ROOT)}")
    print(f"Source of `expected` values: {source}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
