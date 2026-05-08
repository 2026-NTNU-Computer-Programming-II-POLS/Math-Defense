"""WASM runtime singleton — backs FU-A server-side replay validation.

Construction plan §8 (FU-A): for ``replay_version=2`` sessions the backend must
recompute the score using the *same* musl pow that ran on the client, so the
two figures agree bit-exactly. We achieve that by loading the same
``math_engine.wasm`` artifact the frontend ships and calling it through
wasmtime-py.

The module is loaded lazily at first use and held as a process-wide singleton.
A failed load (binary missing, wasmtime unavailable, runtime error during
``__wasm_call_ctors``) is logged and ``pow_f64`` falls back to Python's builtin
``pow``. v2 verification then becomes best-effort: a tampered submission still
trips the existing tolerance check, just at the v1 ε rather than bit-exact.

This module is intentionally infrastructure-layer: domain services receive the
``pow_fn`` callable via dependency injection so unit tests can pass the Python
builtin without reaching for a real WASM runtime.
"""
from __future__ import annotations

import logging
import os
import threading
from pathlib import Path
from typing import Callable

logger = logging.getLogger(__name__)

# Default search order for the WASM binary, in order of preference:
#   1. WASM_ENGINE_PATH env var (override for tests / CI)
#   2. /app/data/math_engine.wasm — production layout (Dockerfile copies here)
#   3. ../frontend/src/math/wasm/math_engine.wasm — dev layout (repo checkout)
_DEFAULT_PATHS = (
    Path("/app/data/math_engine.wasm"),
    Path(__file__).resolve().parents[3] / "frontend" / "src" / "math" / "wasm" / "math_engine.wasm",
)

# Singleton state. The store/instance pair is *not* thread-safe in wasmtime —
# concurrent calls into the same store can corrupt internal state. We serialise
# all calls with a process-wide lock; ``power_f64`` is a single-digit microsecond
# call so the lock is not a meaningful contention point even at peak end-session
# rate. Switching to per-request stores would invite cold-start cost on every
# call.
_lock = threading.Lock()
_pow_fn: Callable[[float, float], float] | None = None
_load_attempted = False


def _resolve_wasm_path() -> Path | None:
    override = os.environ.get("WASM_ENGINE_PATH")
    if override:
        p = Path(override)
        if p.is_file():
            return p
        logger.warning("WASM_ENGINE_PATH=%s does not exist, falling back to defaults", override)
    for p in _DEFAULT_PATHS:
        if p.is_file():
            return p
    return None


def _load_wasm_pow() -> Callable[[float, float], float] | None:
    """Load math_engine.wasm and return a closure that calls ``power_f64``.

    Returns None on any failure (wasmtime missing, binary missing, link error).
    Caller must check for None and fall back to Python pow.
    """
    try:
        import wasmtime  # type: ignore[import-untyped]
    except ImportError:
        logger.warning("wasmtime not installed — score recompute falls back to Python pow")
        return None

    path = _resolve_wasm_path()
    if path is None:
        logger.warning(
            "math_engine.wasm not found in any default path — score recompute falls back to Python pow"
        )
        return None

    try:
        engine = wasmtime.Engine()
        module = wasmtime.Module.from_file(engine, str(path))
        linker = wasmtime.Linker(engine)

        # The .wasm imports env.emscripten_resize_heap because it was built with
        # ALLOW_MEMORY_GROWTH=1. power_f64 never allocates so the stub is only a
        # link-time placeholder; if it ever fires we want to know loudly rather
        # than silently grow heap and risk stale-pointer bugs.
        def _resize_heap_stub(_pages: int) -> int:
            logger.error("emscripten_resize_heap fired during pow path — should not happen")
            return 0

        linker.define_func(
            "env",
            "emscripten_resize_heap",
            wasmtime.FuncType([wasmtime.ValType.i32()], [wasmtime.ValType.i32()]),
            _resize_heap_stub,
        )

        store = wasmtime.Store(engine)
        instance = linker.instantiate(store, module)
        exports = instance.exports(store)

        ctors = exports.get("__wasm_call_ctors")
        if ctors is not None:
            ctors(store)

        wasm_pow = exports.get("power_f64")
        if wasm_pow is None:
            logger.error("math_engine.wasm has no power_f64 export at %s", path)
            return None

        def _pow(base: float, exp: float) -> float:
            with _lock:
                return float(wasm_pow(store, float(base), float(exp)))

        logger.info("[wasm_runtime] loaded %s — pow routed through musl", path)
        return _pow
    except Exception:
        logger.exception("[wasm_runtime] failed to load %s", path)
        return None


def get_pow_fn() -> Callable[[float, float], float]:
    """Return a pow callable backed by WASM if available, else Python's pow.

    First call performs the load attempt and caches the result for the
    process lifetime. Subsequent failures are not retried — a missing binary
    is a deployment problem, not a transient one.
    """
    global _pow_fn, _load_attempted
    if _pow_fn is not None:
        return _pow_fn
    with _lock:
        if _pow_fn is not None:
            return _pow_fn
        if not _load_attempted:
            _load_attempted = True
            loaded = _load_wasm_pow()
            if loaded is not None:
                _pow_fn = loaded
                return _pow_fn
        # Fallback: Python builtin pow. Bit-equality with frontend v2 is not
        # guaranteed; v2 verification widens to v1's ε tolerance on this path.
        _pow_fn = pow  # type: ignore[assignment]
        return _pow_fn


def is_wasm_loaded() -> bool:
    """True iff the WASM runtime is backing pow_fn (i.e. bit-exact verification
    is available). Used by SessionApplicationService to choose between strict
    rejection (v2 + WASM) and tolerance-based logging (everything else)."""
    fn = get_pow_fn()
    return fn is not pow  # type: ignore[comparison-overlap]
