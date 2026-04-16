"""Per-account login attempt tracking with progressive lockout.

After MAX_ATTEMPTS consecutive failures within the WINDOW, the account is
locked for LOCKOUT_SECONDS.  Successful logins reset the counter.

For a multi-process deployment, swap the dict for Redis INCR with TTL.
"""
from __future__ import annotations

import threading
import time

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 300       # 5-minute sliding window
LOCKOUT_SECONDS = 300      # 5-minute lockout after MAX_ATTEMPTS

_lock = threading.Lock()
_attempts: dict[str, list[float]] = {}  # username -> list of failure timestamps
_lockouts: dict[str, float] = {}        # username -> lockout-until timestamp


def is_locked(username: str) -> bool:
    """Return True if the account is currently locked out."""
    with _lock:
        until = _lockouts.get(username)
        if until is None:
            return False
        if time.time() >= until:
            del _lockouts[username]
            _attempts.pop(username, None)
            return False
        return True


def record_failure(username: str) -> None:
    """Record a failed login attempt. Triggers lockout if threshold reached."""
    now = time.time()
    with _lock:
        times = _attempts.setdefault(username, [])
        times.append(now)
        # Trim to window
        cutoff = now - WINDOW_SECONDS
        _attempts[username] = [t for t in times if t > cutoff]
        if len(_attempts[username]) >= MAX_ATTEMPTS:
            _lockouts[username] = now + LOCKOUT_SECONDS


def record_success(username: str) -> None:
    """Clear failure history on successful login."""
    with _lock:
        _attempts.pop(username, None)
        _lockouts.pop(username, None)
