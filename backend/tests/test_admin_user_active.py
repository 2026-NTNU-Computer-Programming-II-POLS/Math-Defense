"""Admin enable/disable of accounts (PATCH /api/admin/users/{id}/active).

Covers the disable-only invariants (self-disable, last active admin) and the
hard-logout semantics (disabling revokes the target's refresh-token family so
a re-enable cannot resurrect a previously-issued cookie).
"""
from __future__ import annotations

import dataclasses

from app.models.refresh_token import RefreshToken
from tests.conftest import register_test_user

_STRONG_PASSWORD = "xQ7!aPm2#vKz9"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _make(db_session, role: str, email: str, name: str):
    return register_test_user(
        db_session, email=email, password=_STRONG_PASSWORD, player_name=name, role=role,
    )


def test_disable_then_enable_student(client, db_session):
    _admin, admin_token, _ = _make(db_session, "admin", "ad_dis@test.local", "ad_dis")
    student, _stoken, _ref = _make(db_session, "student", "stu_dis@test.local", "stu_dis")

    disabled = client.patch(
        f"/api/admin/users/{student.id}/active",
        json={"is_active": False},
        headers=_auth(admin_token),
    )
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["is_active"] is False

    enabled = client.patch(
        f"/api/admin/users/{student.id}/active",
        json={"is_active": True},
        headers=_auth(admin_token),
    )
    assert enabled.status_code == 200, enabled.text
    assert enabled.json()["is_active"] is True


def test_disabled_user_cannot_login(client, db_session):
    _admin, admin_token, _ = _make(db_session, "admin", "ad_li@test.local", "ad_li")
    student, _stoken, _ref = _make(db_session, "student", "stu_li@test.local", "stu_li")

    client.patch(
        f"/api/admin/users/{student.id}/active",
        json={"is_active": False},
        headers=_auth(admin_token),
    )
    login = client.post(
        "/api/auth/login",
        json={"email": "stu_li@test.local", "password": _STRONG_PASSWORD},
    )
    assert login.status_code == 403, login.text


def test_disable_revokes_refresh_tokens(client, db_session):
    """Hard-logout: disabling kills the target's refresh-token family so the
    cookie cannot mint fresh access tokens even after a later re-enable."""
    _admin, admin_token, _ = _make(db_session, "admin", "ad_rv@test.local", "ad_rv")
    student, _stoken, _ref = _make(db_session, "student", "stu_rv@test.local", "stu_rv")

    # register_test_user logged the student in, so a live refresh row exists.
    before = (
        db_session.query(RefreshToken)
        .filter(RefreshToken.user_id == student.id, RefreshToken.revoked.is_(False))
        .count()
    )
    assert before >= 1

    client.patch(
        f"/api/admin/users/{student.id}/active",
        json={"is_active": False},
        headers=_auth(admin_token),
    )

    db_session.expire_all()
    after = (
        db_session.query(RefreshToken)
        .filter(RefreshToken.user_id == student.id, RefreshToken.revoked.is_(False))
        .count()
    )
    assert after == 0


def test_admin_cannot_disable_self(client, db_session):
    admin, admin_token, _ = _make(db_session, "admin", "ad_self@test.local", "ad_self")
    res = client.patch(
        f"/api/admin/users/{admin.id}/active",
        json={"is_active": False},
        headers=_auth(admin_token),
    )
    assert res.status_code == 422, res.text
    assert "own account" in res.json()["detail"].lower()


def test_disable_unknown_user_404(client, db_session):
    _admin, admin_token, _ = _make(db_session, "admin", "ad_404@test.local", "ad_404")
    res = client.patch(
        "/api/admin/users/does-not-exist/active",
        json={"is_active": False},
        headers=_auth(admin_token),
    )
    assert res.status_code == 404, res.text


def test_disable_peer_admin_allowed_while_another_remains(client, db_session):
    """A second active admin keeps the active-admin count above one, so
    disabling a peer admin is permitted (the last-admin guard is a
    concurrency backstop, not a sequential block)."""
    _a, a_token, _ = _make(db_session, "admin", "ad_p1@test.local", "ad_p1")
    b, _b_token, _ = _make(db_session, "admin", "ad_p2@test.local", "ad_p2")
    res = client.patch(
        f"/api/admin/users/{b.id}/active",
        json={"is_active": False},
        headers=_auth(a_token),
    )
    assert res.status_code == 200, res.text
    assert res.json()["is_active"] is False


def test_non_admin_cannot_toggle(client, db_session):
    _t, teacher_token, _ = _make(db_session, "teacher", "te_tog@test.local", "te_tog")
    student, _stoken, _ref = _make(db_session, "student", "stu_tog@test.local", "stu_tog")
    res = client.patch(
        f"/api/admin/users/{student.id}/active",
        json={"is_active": False},
        headers=_auth(teacher_token),
    )
    assert res.status_code == 403, res.text
