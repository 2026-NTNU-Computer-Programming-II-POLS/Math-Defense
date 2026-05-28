"""CSRF cookie TTL pins.

The csrf_token cookie is JS-readable (httponly=False) and acts as the
double-submit pair for the refresh cookie. After audit H4, /api/auth/refresh
is CSRF-required whenever the refresh cookie is present, so the csrf cookie
must outlive the refresh cookie — otherwise a browser restart leaves
refresh_token alive but csrf_token dead, and the first /refresh comes back
as a hard 403 (which the frontend tryRefresh treats as session-expired).

These tests pin Max-Age so a future revert to session-scope can't silently
break the post-restart refresh path.
"""
from __future__ import annotations

import re
from http.cookies import SimpleCookie

from app.config import settings


_PASSWORD = "xQ7!aPm2#vKz9"


def _parse_set_cookie(response, name: str) -> SimpleCookie:
    """Return the Morsel for the named cookie from the Set-Cookie headers."""
    jar = SimpleCookie()
    for raw in response.headers.get_list("set-cookie"):
        jar.load(raw)
    assert name in jar, f"{name} not in Set-Cookie headers: {response.headers.get_list('set-cookie')}"
    return jar[name]


def test_login_csrf_cookie_carries_persistent_max_age(client):
    client.post(
        "/api/auth/register",
        json={
            "email": "csrf_ttl@test.local",
            "password": _PASSWORD,
            "player_name": "csrf_ttl",
        },
    )
    res = client.post(
        "/api/auth/login",
        json={"email": "csrf_ttl@test.local", "password": _PASSWORD},
    )
    assert res.status_code == 200

    morsel = _parse_set_cookie(res, "csrf_token")
    max_age = morsel["max-age"]
    assert max_age, "csrf_token Set-Cookie must include a Max-Age (otherwise it dies on browser close)"
    assert int(max_age) == settings.refresh_token_expire_days * 86400, (
        f"csrf_token Max-Age={max_age}s must equal refresh TTL "
        f"({settings.refresh_token_expire_days} days). Asymmetric TTLs break "
        f"the first POST /api/auth/refresh after a browser restart."
    )


def test_refresh_csrf_cookie_carries_persistent_max_age(client):
    """/refresh's response also mints csrf, and that cookie must persist too —
    otherwise rotating the access token in a long-lived session silently downgrades
    csrf back to session-scope on the next browser restart."""
    reg = client.post(
        "/api/auth/register",
        json={
            "email": "csrf_refresh@test.local",
            "password": _PASSWORD,
            "player_name": "csrf_refresh",
        },
    )
    assert reg.status_code == 202
    login = client.post(
        "/api/auth/login",
        json={"email": "csrf_refresh@test.local", "password": _PASSWORD},
    )
    refresh = login.cookies.get("refresh_token")
    assert refresh

    client.cookies.clear()
    res = client.post(
        "/api/auth/refresh",
        headers={"Cookie": f"refresh_token={refresh}"},
    )
    assert res.status_code == 200, res.text

    morsel = _parse_set_cookie(res, "csrf_token")
    assert morsel["max-age"], (
        "csrf_token from /refresh must carry Max-Age so a long-lived account "
        "doesn't silently downgrade to session-scope csrf after a token rotation"
    )
    assert int(morsel["max-age"]) == settings.refresh_token_expire_days * 86400


def test_csrf_cookie_attributes_have_not_drifted(client):
    """Lock the rest of the cookie envelope (HttpOnly off, SameSite=lax,
    Path=/) so that a future change to mint_csrf_cookie can't silently break
    the double-submit contract."""
    client.post(
        "/api/auth/register",
        json={
            "email": "csrf_attrs@test.local",
            "password": _PASSWORD,
            "player_name": "csrf_attrs",
        },
    )
    res = client.post(
        "/api/auth/login",
        json={"email": "csrf_attrs@test.local", "password": _PASSWORD},
    )
    raw = next(
        h for h in res.headers.get_list("set-cookie") if h.startswith("csrf_token=")
    )
    lowered = raw.lower()
    # httponly absent — JS must read this cookie to send it as a header.
    assert "httponly" not in lowered, raw
    assert "samesite=lax" in lowered, raw
    assert re.search(r"(^|;\s*)path=/(\s|;|$)", raw, re.IGNORECASE), raw
