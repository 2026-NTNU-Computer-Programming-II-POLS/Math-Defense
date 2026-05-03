"""Tests for _verify_score anti-cheat logic (H1 fix).

Guards the regression where submitting total_score without V2 fields caused
_verify_score to return early, leaving the fabricated client value in the DB.
"""
from __future__ import annotations

from app.domain.scoring.score_calculator import recompute_total_score
from app.models.game_session import GameSession as GameSessionModel


_V2 = dict(
    kill_value=500,
    time_total=60.0,
    time_exclude_prepare=[5.0],
    cost_total=200,
    health_origin=20,
    health_final=20,
)


def _register_and_token(client, name: str) -> str:
    res = client.post(
        "/api/auth/register",
        json={"email": f"{name}@test.local", "password": "xQ7!aPm2#vKz9", "player_name": name},
    )
    return res.cookies.get("access_token")


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _new_session(client, token: str) -> str:
    return client.post(
        "/api/sessions", json={"star_rating": 1}, headers=_auth(token),
    ).json()["id"]


def _end(client, token: str, sid: str, **kwargs) -> int:
    res = client.post(
        f"/api/sessions/{sid}/end",
        json={"score": 100, "kills": 5, "waves_survived": 2, **kwargs},
        headers=_auth(token),
    )
    return res.status_code


def _db_total_score(session_factory, sid: str) -> float | None:
    db = session_factory()
    try:
        row = db.query(GameSessionModel).filter(GameSessionModel.id == sid).one()
        return row.total_score
    finally:
        db.close()


class TestVerifyScore:
    def test_total_score_discarded_when_v2_fields_absent(self, client, session_factory):
        token = _register_and_token(client, "sv_v1_bypass")
        sid = _new_session(client, token)

        status = _end(client, token, sid, total_score=999_999.0)
        assert status == 200

        assert _db_total_score(session_factory, sid) is None

    def test_fabricated_total_score_overwritten_when_v2_fields_present(self, client, session_factory):
        token = _register_and_token(client, "sv_v2_overwrite")
        sid = _new_session(client, token)

        expected = recompute_total_score(initial_answer=False, **_V2)
        assert expected is not None

        status = _end(client, token, sid, total_score=999_999.0, **_V2)
        assert status == 200

        stored = _db_total_score(session_factory, sid)
        assert stored is not None
        assert abs(stored - expected) < 1e-3

    def test_matching_total_score_stored_unchanged(self, client, session_factory):
        token = _register_and_token(client, "sv_v2_match")
        sid = _new_session(client, token)

        expected = recompute_total_score(initial_answer=False, **_V2)
        assert expected is not None

        status = _end(client, token, sid, total_score=round(expected, 6), **_V2)
        assert status == 200

        stored = _db_total_score(session_factory, sid)
        assert stored is not None
        assert abs(stored - expected) < 1e-3

    def test_no_total_score_submitted_and_no_v2_fields_stores_none(self, client, session_factory):
        token = _register_and_token(client, "sv_none_none")
        sid = _new_session(client, token)

        status = _end(client, token, sid)
        assert status == 200

        assert _db_total_score(session_factory, sid) is None
