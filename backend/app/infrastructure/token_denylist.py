"""In-memory token deny-list for server-side logout.

Denied tokens are held until their natural JWT expiry (access_token_expire_minutes),
so the set stays bounded: at most one entry per active-then-logged-out user.

For a multi-process deployment, swap this for a Redis SET with TTL.
"""
from __future__ import annotations

import threading
import time

_lock = threading.Lock()
_denied: dict[str, float] = {}  # jti -> expiry timestamp


def deny(jti: str, expires_at: float) -> None:
    """Add a token's JTI to the deny-list until it expires."""
    now = time.time()
    with _lock:
        _denied[jti] = expires_at
        # Piggyback cleanup on writes so the dict doesn't grow without bound.
        expired = [k for k, exp in _denied.items() if exp <= now]
        for k in expired:
            del _denied[k]


def is_denied(jti: str) -> bool:
    """Check whether a JTI has been revoked."""
    with _lock:
        exp = _denied.get(jti)
        if exp is None:
            return False
        if exp <= time.time():
            del _denied[jti]
            return False
        return True


def purge_expired() -> None:
    """Remove entries whose JWT would have expired anyway."""
    now = time.time()
    with _lock:
        expired = [jti for jti, exp in _denied.items() if exp <= now]
        for jti in expired:
            del _denied[jti]
