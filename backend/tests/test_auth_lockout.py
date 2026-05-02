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


def _register(client, email: str = "lockme@test.local", password: str = "correct1") -> None:
    res = client.post("/api/auth/register", json={
        "email": email, "password": password, "player_name": "lockme",
    })
    assert res.status_code == 201


def test_five_failed_logins_lock_account(client):
    _register(client)

    for _ in range(MAX_ATTEMPTS):
        res = client.post("/api/auth/login", json={"email": "lockme@test.local", "password": "wrong"})
        assert res.status_code == 401

    res = client.post("/api/auth/login", json={"email": "lockme@test.local", "password": "correct1"})
    assert res.status_code == 429


def test_lockout_window_expiry_restores_login(client, db_session):
    _register(client)

    for _ in range(MAX_ATTEMPTS):
        client.post("/api/auth/login", json={"email": "lockme@test.local", "password": "wrong"})

    past = datetime.now(UTC) - timedelta(hours=1)
    db_session.execute(
        update(LoginAttempt)
        .where(LoginAttempt.username == "lockme@test.local")
        .values(locked_until=past, window_started_at=past)
    )
    db_session.commit()

    res = client.post("/api/auth/login", json={"email": "lockme@test.local", "password": "correct1"})
    assert res.status_code == 200


def test_successful_login_resets_failure_counter(client, db_session):
    _register(client)

    for _ in range(MAX_ATTEMPTS - 1):
        client.post("/api/auth/login", json={"email": "lockme@test.local", "password": "wrong"})

    ok = client.post("/api/auth/login", json={"email": "lockme@test.local", "password": "correct1"})
    assert ok.status_code == 200

    row = db_session.query(LoginAttempt).filter_by(username="lockme@test.local").one_or_none()
    assert row is None
