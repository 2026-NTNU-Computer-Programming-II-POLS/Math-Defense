"""Integration coverage for the persistent account-lockout flow.

The lockout state lives in Postgres (``login_attempts``); these tests exercise
the full HTTP path so a regression in the UoW / repository wiring surfaces
as a 401 where a 429 is expected.
"""
from __future__ import annotations

from datetime import datetime, timedelta, UTC

from sqlalchemy import update

from app.infrastructure.login_guard import MAX_ATTEMPTS
from app.models.login_attempt import LoginAttempt


def _register(client, email: str = "lockme@test.local", password: str = "xQ7!aPm2#vKz9") -> None:
    res = client.post("/api/auth/register", json={
        "email": email, "password": password, "player_name": "lockme",
    })
    assert res.status_code == 202


def test_five_failed_logins_lock_account(client):
    email = "lockme1@test.local"
    _register(client, email=email)

    for _ in range(MAX_ATTEMPTS):
        res = client.post("/api/auth/login", json={"email": email, "password": "wrong"})
        assert res.status_code == 401

    res = client.post("/api/auth/login", json={"email": email, "password": "xQ7!aPm2#vKz9"})
    assert res.status_code == 429


def test_lockout_window_expiry_restores_login(client, db_session):
    # B-SEC-12: per-email login throttle is process-global, so each lockout
    # test must use a unique email to avoid cross-test pollution that would
    # trip the throttle before the per-account lockout fires.
    email = "lockme2@test.local"
    _register(client, email=email)

    for _ in range(MAX_ATTEMPTS):
        client.post("/api/auth/login", json={"email": email, "password": "wrong"})

    past = datetime.now(UTC) - timedelta(hours=1)
    db_session.execute(
        update(LoginAttempt)
        .where(LoginAttempt.username == email)
        .values(locked_until=past, window_started_at=past)
    )
    db_session.commit()

    res = client.post("/api/auth/login", json={"email": email, "password": "xQ7!aPm2#vKz9"})
    assert res.status_code == 200


def test_successful_login_resets_failure_counter(client, db_session):
    email = "lockme3@test.local"
    _register(client, email=email)

    for _ in range(MAX_ATTEMPTS - 1):
        client.post("/api/auth/login", json={"email": email, "password": "wrong"})

    ok = client.post("/api/auth/login", json={"email": email, "password": "xQ7!aPm2#vKz9"})
    assert ok.status_code == 200

    row = db_session.query(LoginAttempt).filter_by(username=email).one_or_none()
    assert row is None
