"""Per-account login attempt tracking with progressive lockout.

After MAX_ATTEMPTS consecutive failures within the WINDOW, the account is
locked for LOCKOUT_SECONDS. Successful logins reset the counter.

Persisted to Postgres so lockouts survive process restarts and propagate
across replicas — a previous in-memory implementation let an attacker reset
their counter with a restart and parallelise attempts across instances.
"""
from __future__ import annotations

from datetime import datetime, timedelta, UTC

from sqlalchemy.orm import Session as DbSession

from app.models.login_attempt import LoginAttempt

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 300       # 5-minute sliding window
LOCKOUT_SECONDS = 300      # 5-minute lockout after MAX_ATTEMPTS


def _now() -> datetime:
    return datetime.now(UTC)


def _ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def is_locked(db: DbSession, username: str) -> bool:
    """Return True if the account is currently locked out."""
    row = db.get(LoginAttempt, username)
    if row is None:
        return False
    locked_until = _ensure_utc(row.locked_until)
    if locked_until is None:
        return False
    if _now() >= locked_until:
        # Lockout expired — clear it so the next failure starts a fresh window.
        row.locked_until = None
        row.failures = 0
        row.window_started_at = _now()
        db.commit()
        return False
    return True


def record_failure(db: DbSession, username: str) -> None:
    """Record a failed login attempt. Triggers lockout if threshold reached."""
    now = _now()
    row = db.get(LoginAttempt, username)
    if row is None:
        row = LoginAttempt(username=username, failures=1, window_started_at=now)
        db.add(row)
    else:
        window_start = _ensure_utc(row.window_started_at) or now
        # Reset the window if the previous one has aged out so old failures
        # can't accumulate past the intended sliding horizon.
        if (now - window_start).total_seconds() > WINDOW_SECONDS:
            row.failures = 1
            row.window_started_at = now
        else:
            row.failures += 1
        if row.failures >= MAX_ATTEMPTS:
            row.locked_until = now + timedelta(seconds=LOCKOUT_SECONDS)
    db.commit()


def record_success(db: DbSession, username: str) -> None:
    """Clear failure history on successful login."""
    row = db.get(LoginAttempt, username)
    if row is not None:
        db.delete(row)
        db.commit()
