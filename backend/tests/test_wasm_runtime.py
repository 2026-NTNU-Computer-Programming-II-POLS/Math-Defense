"""Unit tests for the FU-A WASM runtime — backend's musl pow loader.

Construction plan §8 (FU-A): server-side replay validation needs the same
musl pow that ran in the browser so v2 score recomputation agrees bit-exactly.
These tests exercise the loader in isolation (no DB, no FastAPI app) — the
end-to-end 422 + replay_mismatch path is covered by test_score_verify.py.

If wasmtime is missing or the WASM artifact hasn't been built, the loader
gracefully falls back to Python pow and ``is_wasm_loaded()`` returns False.
We tolerate that here so the suite stays green on contributors who haven't
run the prebuild — strict-rejection asserts are only made when the WASM did
load successfully.
"""
from __future__ import annotations

import pytest

from app.domain.scoring.score_calculator import recompute_total_score
from app.infrastructure.wasm_runtime import get_pow_fn, is_wasm_loaded


_V2 = dict(
    kill_value=500,
    time_total=60.0,
    time_exclude_prepare=[5.0],
    cost_total=200,
    health_origin=20,
    health_final=20,
    initial_answer=False,
)


class TestWasmRuntime:
    def test_get_pow_fn_returns_callable(self):
        fn = get_pow_fn()
        assert callable(fn)

    def test_pow_fn_matches_basic_cases(self):
        fn = get_pow_fn()
        assert fn(2.0, 10.0) == 1024.0
        assert fn(9.0, 0.5) == 3.0
        assert fn(0.0, 0.5) == 0.0

    def test_pow_fn_handles_score_formula_inputs(self):
        # Mirrors WasmBridge.wasm.test.ts cases — these are the exponents the
        # score calculator actually feeds in (1/exponentDenom for HP delta 1..5).
        fn = get_pow_fn()
        for base, exp in [(1024.0, 1 / 3), (50.0, 1 / 5), (1e6, 1 / 2)]:
            wasm_val = fn(base, exp)
            py_val = pow(base, exp)
            assert wasm_val == pytest.approx(py_val, rel=1e-12)

    def test_idempotent_loader(self):
        # Singleton — second call must return the same object.
        a = get_pow_fn()
        b = get_pow_fn()
        assert a is b

    def test_recompute_with_wasm_pow_matches_python_pow(self):
        # FU-A acceptance signal: the WASM-backed recompute must produce a
        # value within rounding distance of the Python reference. Bit-equality
        # holds when WASM is loaded; without WASM both paths use Python pow
        # and the assertion still trivially passes.
        wasm = recompute_total_score(pow_fn=get_pow_fn(), **_V2)
        plain = recompute_total_score(**_V2)
        assert wasm is not None and plain is not None
        assert abs(wasm - plain) < 1e-9


class TestWasmRuntimeWhenLoaded:
    """Tests that only assert when the WASM runtime loaded successfully.

    Skipped on environments missing the .wasm artifact (e.g. fresh checkout
    without `npm run prebuild`). Once skipped, the strict-rejection contract
    is unverified — flag this in the PR description rather than silently
    passing CI.
    """

    @pytest.fixture(autouse=True)
    def _require_wasm(self):
        if not is_wasm_loaded():
            pytest.skip("WASM runtime not loaded — likely no prebuild artifact")

    def test_pow_bit_exact_for_zero_kill(self):
        fn = get_pow_fn()
        # Frontend zero-kill path: 0 ** 0.5 must equal 0 byte-exactly so the
        # backend canonical value matches the displayed totalScore=0.
        assert fn(0.0, 0.5) == 0.0

    def test_pow_handles_realistic_score_input(self):
        # Realistic score-formula path: kill_value=500, active_time=55,
        # cost_total=200, HP delta 0 → exponent_denom=3, k≈4.55.
        fn = get_pow_fn()
        recomputed = recompute_total_score(pow_fn=fn, **_V2)
        assert recomputed is not None
        # Sanity: positive, within plausible band for these inputs.
        assert 1.0 < recomputed < 10.0
