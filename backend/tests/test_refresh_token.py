"""Refresh-token rotation and reuse-detection coverage (BA-S1 / BA-U1).

`consume()` returns a typed result instead of silently revoking the token
family, so the reuse->revoke decision now lives explicitly in
`AuthApplicationService`. These tests pin that behaviour end-to-end:
a rotated token is single-use, replaying it is rejected, and reuse
detection revokes every refresh token the user holds.
"""
from __future__ import annotations

from app.factories import build_auth_service

_PASSWORD = "xQ7!aPm2#vKz9"


def _register(client, name: str):
    res = client.post(
        "/api/auth/register",
        json={"email": f"{name}@test.local", "password": _PASSWORD, "player_name": name},
    )
    assert res.status_code == 201, res.text
    return res


def _refresh_with(client, raw_refresh: str):
    """POST /api/auth/refresh sending exactly `raw_refresh` as the cookie.

    The jar is cleared first so the manually-set Cookie header is the only
    refresh_token presented — otherwise a previously-rotated token lingering
    in the jar would mask which token is actually under test.
    """
    client.cookies.clear()
    return client.post(
        "/api/auth/refresh",
        headers={"Cookie": f"refresh_token={raw_refresh}"},
    )


def test_refresh_rotates_and_old_token_is_rejected(client):
    first_refresh = _register(client, "rt_rotate").cookies.get("refresh_token")
    assert first_refresh

    rot = _refresh_with(client, first_refresh)
    assert rot.status_code == 200
    second_refresh = rot.cookies.get("refresh_token")
    assert second_refresh and second_refresh != first_refresh

    # The rotated-away token is now marked used — replaying it is rejected.
    replay = _refresh_with(client, first_refresh)
    assert replay.status_code == 401


def test_refresh_token_reuse_revokes_whole_family(client):
    first_refresh = _register(client, "rt_reuse").cookies.get("refresh_token")

    rot = _refresh_with(client, first_refresh)
    assert rot.status_code == 200
    second_refresh = rot.cookies.get("refresh_token")
    assert second_refresh

    # Replaying the used token is a stolen-cookie signal: reuse detection
    # revokes the entire family.
    reuse = _refresh_with(client, first_refresh)
    assert reuse.status_code == 401

    # So the legitimately-rotated token must now be dead too — neither the
    # attacker's copy nor the victim's survives (BA-S1).
    after = _refresh_with(client, second_refresh)
    assert after.status_code == 401


def test_unknown_refresh_token_is_rejected(client):
    _register(client, "rt_unknown")
    res = _refresh_with(client, "0" * 64)
    assert res.status_code == 401


def test_logout_with_refresh_token_revokes_it(client, db_session):
    reg = _register(client, "rt_logout")
    access = reg.cookies.get("access_token")
    refresh = reg.cookies.get("refresh_token")
    assert access and refresh

    # logout_token revokes the refresh-token family inside its own UoW; the
    # commit is now explicit in the service, not a side effect of consume().
    build_auth_service(db_session).logout_token(access, refresh)

    # The revoked token can no longer mint a new access token.
    res = _refresh_with(client, refresh)
    assert res.status_code == 401
