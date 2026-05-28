"""Admin-side teacher provisioning (POST /api/admin/teachers).

Closes the M-04 enforcement gap: self-service /register refuses
role=teacher, and prior to this endpoint there was no production path for
creating teacher accounts outside the dev seed script.
"""
from __future__ import annotations

from tests.conftest import register_test_user


_STRONG_PASSWORD = "xQ7!aPm2#vKz9"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _admin_token(db_session) -> str:
    _u, token, _r = register_test_user(
        db_session,
        email="admin_ct@test.local",
        password=_STRONG_PASSWORD,
        player_name="admin_ct",
        role="admin",
    )
    return token


def test_admin_creates_teacher(client, db_session):
    token = _admin_token(db_session)
    res = client.post(
        "/api/admin/teachers",
        json={
            "email": "new_teacher@test.local",
            "password": _STRONG_PASSWORD,
            "player_name": "New Teacher",
        },
        headers=_auth(token),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["email"] == "new_teacher@test.local"
    assert body["player_name"] == "New Teacher"
    assert body["role"] == "teacher"
    assert body["is_active"] is True


def test_created_teacher_can_login(client, db_session):
    token = _admin_token(db_session)
    client.post(
        "/api/admin/teachers",
        json={
            "email": "login_teacher@test.local",
            "password": _STRONG_PASSWORD,
            "player_name": "Login Teacher",
        },
        headers=_auth(token),
    )
    login = client.post(
        "/api/auth/login",
        json={"email": "login_teacher@test.local", "password": _STRONG_PASSWORD},
    )
    assert login.status_code == 200, login.text
    me = login.json()
    assert me["role"] == "teacher"
    # Admin vouches for the identity → email is pre-verified so the
    # teacher does not need an unreachable verification click before
    # first use.
    assert me["is_email_verified"] is True


def test_duplicate_email_returns_409(client, db_session):
    token = _admin_token(db_session)
    payload = {
        "email": "dup_teacher@test.local",
        "password": _STRONG_PASSWORD,
        "player_name": "Dup Teacher",
    }
    first = client.post("/api/admin/teachers", json=payload, headers=_auth(token))
    assert first.status_code == 201
    second = client.post("/api/admin/teachers", json=payload, headers=_auth(token))
    assert second.status_code == 409


def test_weak_password_rejected(client, db_session):
    token = _admin_token(db_session)
    res = client.post(
        "/api/admin/teachers",
        json={
            "email": "weak_teacher@test.local",
            # Passes structural checks (length, classes) but trips zxcvbn.
            "password": "password1",
            "player_name": "Weak",
        },
        headers=_auth(token),
    )
    assert res.status_code == 422


def test_short_password_rejected(client, db_session):
    token = _admin_token(db_session)
    res = client.post(
        "/api/admin/teachers",
        json={
            "email": "short_teacher@test.local",
            "password": "Aa1",
            "player_name": "Short",
        },
        headers=_auth(token),
    )
    assert res.status_code == 422


def test_invalid_email_rejected(client, db_session):
    token = _admin_token(db_session)
    res = client.post(
        "/api/admin/teachers",
        json={
            "email": "not-an-email",
            "password": _STRONG_PASSWORD,
            "player_name": "Bad Email",
        },
        headers=_auth(token),
    )
    assert res.status_code == 422


def test_extra_fields_rejected(client, db_session):
    token = _admin_token(db_session)
    res = client.post(
        "/api/admin/teachers",
        json={
            "email": "extra@test.local",
            "password": _STRONG_PASSWORD,
            "player_name": "Extra",
            "role": "admin",
        },
        headers=_auth(token),
    )
    assert res.status_code == 422


def test_teacher_cannot_create_teacher(client, db_session):
    _u, teacher_token, _r = register_test_user(
        db_session,
        email="t_act@test.local",
        password=_STRONG_PASSWORD,
        player_name="t_act",
        role="teacher",
    )
    res = client.post(
        "/api/admin/teachers",
        json={
            "email": "shouldnotexist@test.local",
            "password": _STRONG_PASSWORD,
            "player_name": "Nope",
        },
        headers=_auth(teacher_token),
    )
    assert res.status_code == 403


def test_student_cannot_create_teacher(client, db_session):
    _u, student_token, _r = register_test_user(
        db_session,
        email="s_act@test.local",
        password=_STRONG_PASSWORD,
        player_name="s_act",
        role="student",
    )
    res = client.post(
        "/api/admin/teachers",
        json={
            "email": "shouldnotexist@test.local",
            "password": _STRONG_PASSWORD,
            "player_name": "Nope",
        },
        headers=_auth(student_token),
    )
    assert res.status_code == 403


def test_unauthenticated_rejected(client):
    res = client.post(
        "/api/admin/teachers",
        json={
            "email": "anon@test.local",
            "password": _STRONG_PASSWORD,
            "player_name": "Anon",
        },
    )
    assert res.status_code == 401
