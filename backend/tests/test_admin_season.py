"""Admin season upsert (POST /api/admin/seasons).

A season is a forward-looking window: achievements get tagged into it over
time, so the endpoint is intentionally permissive about season_id (an admin may
create the window before any achievement references it). The response reports
which achievements currently match so the UI can flag an inert season; the
backend does not block one.
"""
from __future__ import annotations

import dataclasses

from tests.conftest import register_test_user

_STRONG_PASSWORD = "xQ7!aPm2#vKz9"


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _admin_token(db_session) -> str:
    _u, token, _r = register_test_user(
        db_session, email="ad_se@test.local", password=_STRONG_PASSWORD,
        player_name="ad_se", role="admin",
    )
    return token


def _tag_seasonal_def(monkeypatch, season_id: str) -> None:
    """Tag an existing achievement def with season_id for the test's duration."""
    from app.domain.achievement import definitions as defs_mod

    target = defs_mod.ACHIEVEMENT_DEFS["explore_star_1"]
    patched = dict(defs_mod.ACHIEVEMENT_DEFS)
    patched["explore_star_1"] = dataclasses.replace(target, season_id=season_id)
    monkeypatch.setattr(defs_mod, "ACHIEVEMENT_DEFS", patched)


def _create_season(client, token, season_id="spring_2026", name="Spring 2026"):
    return client.post(
        "/api/admin/seasons",
        json={
            "season_id": season_id,
            "name": name,
            "starts_at": "2026-03-01T00:00:00Z",
            "ends_at": "2026-06-01T00:00:00Z",
        },
        headers=_auth(token),
    )


def test_create_season_persists_window(client, db_session):
    """A season with no matching achievements is still created (inert, not
    rejected) and the response reflects the persisted window, not nulls."""
    token = _admin_token(db_session)
    res = _create_season(client, token, season_id="ghost_season", name="Ghost")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["season_id"] == "ghost_season"
    assert body["name"] == "Ghost"
    assert body["starts_at"] is not None
    assert body["ends_at"] is not None
    # No achievement references it, so the UI will flag it inert.
    assert body["achievement_ids"] == []


def test_create_season_reports_matching_achievements(client, db_session, monkeypatch):
    _tag_seasonal_def(monkeypatch, "spring_2026")
    token = _admin_token(db_session)
    res = _create_season(client, token, season_id="spring_2026")
    assert res.status_code == 200, res.text
    assert "explore_star_1" in res.json()["achievement_ids"]


def test_create_season_rejects_inverted_window(client, db_session):
    """ends_at <= starts_at is a real domain error (aggregate invariant)."""
    token = _admin_token(db_session)
    res = client.post(
        "/api/admin/seasons",
        json={
            "season_id": "spring_2026",
            "name": "Spring",
            "starts_at": "2026-06-01T00:00:00Z",
            "ends_at": "2026-03-01T00:00:00Z",
        },
        headers=_auth(token),
    )
    assert res.status_code == 422, res.text


def test_create_season_requires_admin(client, db_session):
    _u, teacher_token, _r = register_test_user(
        db_session, email="te_se@test.local", password=_STRONG_PASSWORD,
        player_name="te_se", role="teacher",
    )
    res = _create_season(client, teacher_token)
    assert res.status_code == 403, res.text
