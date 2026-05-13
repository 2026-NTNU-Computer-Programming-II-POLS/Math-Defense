"""Per-account login attempt tracking with progressive lockout.

After MAX_ATTEMPTS consecutive failures within the WINDOW, the account is
locked for LOCKOUT_SECONDS. Successful logins reset the counter.

Persisted to Postgres so lockouts survive process restarts and propagate
across replicas — a previous in-memory implementation let an attacker reset
their counter with a restart and parallelise attempts across instances.
"""
from __future__ import annotations

from datetime import datetime, timedelta, UTC

from sqlalchemy import case, delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session as DbSession

from app.models.login_attempt import LoginAttempt

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 300          # 5-minute sliding window
LOCKOUT_SECONDS = 300         # 1st lockout: 5 min
LOCKOUT_SECONDS_2 = 900       # 2nd lockout: 15 min
LOCKOUT_SECONDS_3 = 3600      # 3rd+ lockout: 60 min


def _now() -> datetime:
    return datetime.now(UTC)


def is_locked(db: DbSession, username: str) -> "datetime | None":
    """Return locked_until if the account is currently locked, else None.

    Pure read. Expired lockouts are simply treated as "not locked"; the next
    ``record_failure`` atomically resets the window, so there is no need to
    mutate state from the read path (doing so opened a read-modify-write race
    on concurrent login attempts).
    """
    now = _now()
    stmt = select(LoginAttempt.locked_until).where(LoginAttempt.username == username)
    locked_until = db.execute(stmt).scalar_one_or_none()
    if locked_until is None:
        return None
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=UTC)
    return locked_until if now < locked_until else None


def record_failure(db: DbSession, username: str) -> None:
    """Record a failed login attempt. Triggers lockout if threshold reached.

    Implemented as a single atomic UPSERT so concurrent failed logins cannot
    coalesce into a single increment (the previous read-modify-write allowed
    ``MAX_ATTEMPTS × concurrency`` tries through the lockout).

    Does NOT commit. The enclosing Unit of Work owns the transaction boundary
    so a mid-login failure can't auto-commit past the Application layer's
    rollback path.
    """
    now = _now()
    window_threshold = now - timedelta(seconds=WINDOW_SECONDS)
    lockout_deadline_1 = now + timedelta(seconds=LOCKOUT_SECONDS)
    lockout_deadline_2 = now + timedelta(seconds=LOCKOUT_SECONDS_2)
    lockout_deadline_3 = now + timedelta(seconds=LOCKOUT_SECONDS_3)

    # ON CONFLICT DO UPDATE takes a row-level lock, serialising the increment.
    # The CASE expressions reference the *existing* row's columns.
    window_expired = LoginAttempt.window_started_at < window_threshold
    new_failures = case((window_expired, 1), else_=LoginAttempt.failures + 1)
    new_window = case((window_expired, now), else_=LoginAttempt.window_started_at)
    # Exponential backoff: 5 min / 15 min / 60 min based on prior lockout count.
    # lockout_count is preserved across window resets so repeat offenders see
    # escalating durations even after gaps between attack waves.
    tiered_deadline = case(
        (LoginAttempt.lockout_count == 0, lockout_deadline_1),
        (LoginAttempt.lockout_count == 1, lockout_deadline_2),
        else_=lockout_deadline_3,
    )
    # After a reset the count is 1, so no lockout. Otherwise arm the lockout
    # the moment the post-increment count crosses MAX_ATTEMPTS.
    new_locked_until = case(
        (window_expired, None),
        (LoginAttempt.failures + 1 >= MAX_ATTEMPTS, tiered_deadline),
        # Clear a lockout whose deadline has already passed so the row doesn't
        # carry stale state. Matters only if LOCKOUT_SECONDS ever drops below
        # WINDOW_SECONDS; with equal values the window_expired branch above
        # always fires first, but we don't want that coupling to be load-bearing.
        (LoginAttempt.locked_until < now, None),
        else_=LoginAttempt.locked_until,
    )
    # Only increment lockout_count when a new lockout is actually triggered
    # (not on window reset). This makes the backoff tier sticky across gaps.
    new_lockout_count = case(
        (window_expired, LoginAttempt.lockout_count),
        (LoginAttempt.failures + 1 >= MAX_ATTEMPTS, LoginAttempt.lockout_count + 1),
        else_=LoginAttempt.lockout_count,
    )

    stmt = pg_insert(LoginAttempt).values(
        username=username,
        failures=1,
        window_started_at=now,
        locked_until=None,
        lockout_count=0,
    ).on_conflict_do_update(
        index_elements=["username"],
        set_={
            "failures": new_failures,
            "window_started_at": new_window,
            "locked_until": new_locked_until,
            "lockout_count": new_lockout_count,
        },
    )
    db.execute(stmt)


def record_success(db: DbSession, username: str) -> None:
    """Clear failure history on successful login. UoW owns the commit."""
    db.execute(delete(LoginAttempt).where(LoginAttempt.username == username))


def purge_stale(db: DbSession) -> None:
    """Remove LoginAttempt rows that no longer serve any purpose.

    A row is stale when its window has aged out and any lockout has passed —
    both branches resolve to "start fresh" the next time the user fails, so
    keeping the row around just grows the table by one per ever-failed-once
    username. Intended for the same scheduler that calls ``purge_expired``
    on the deny-list.

    Does NOT commit. The caller owns the transaction boundary so all janitor
    purges commit together in a single transaction.
    """
    now = _now()
    window_cutoff = now - timedelta(seconds=WINDOW_SECONDS)
    db.execute(
        delete(LoginAttempt).where(
            LoginAttempt.window_started_at < window_cutoff,
            (LoginAttempt.locked_until.is_(None)) | (LoginAttempt.locked_until < now),
        )
    )
