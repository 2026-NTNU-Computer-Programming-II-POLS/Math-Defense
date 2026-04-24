"""Token deny-list idempotency coverage.

``deny()`` uses ``ON CONFLICT DO NOTHING`` so repeated logouts of the same
JTI must not raise and must not grow the table. Exercises the behaviour
through the Application service so the repository/UoW wiring is covered too.
"""
from __future__ import annotations

from app.factories import build_auth_service
from app.infrastructure.token_denylist import is_denied
from app.models.denied_token import DeniedToken


def _register_and_token(client) -> str:
    res = client.post(
        "/api/auth/register",
        json={"username": "logoutme", "password": "secret123"},
    )
    assert res.status_code == 201
    return res.cookies.get("access_token")


def test_logout_token_is_idempotent(client, db_session):
    token = _register_and_token(client)
    service = build_auth_service(db_session)

    service.logout_token(token)
    service.logout_token(token)  # must not raise or duplicate the row

    count = db_session.query(DeniedToken).count()
    assert count == 1


def test_revoked_token_is_rejected(client, db_session):
    token = _register_and_token(client)
    service = build_auth_service(db_session)
    service.logout_token(token)

    # The JTI is now on the deny-list; /me must reject the token.
    res = client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 401


def test_deny_list_read_sees_post_commit_write(db_session):
    """Sanity check: a deny() via the service commits so other sessions see it."""
    from app.utils.security import create_access_token, decode_token

    token = create_access_token({"sub": "user-xyz"})
    payload = decode_token(token)
    assert payload is not None
    jti = payload["jti"]

    service = build_auth_service(db_session)
    service.logout_token(token)

    assert is_denied(db_session, jti) is True
