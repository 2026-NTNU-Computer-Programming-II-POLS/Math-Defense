"""Tests for _verify_score anti-cheat logic (H1 fix + FU-A strict v2).

Guards the regression where submitting total_score without V2 fields caused
_verify_score to return early, leaving the fabricated client value in the DB.

The TestVerifyScoreReplayV2Strict class covers FU-A (construction plan §8):
``replay_version=2`` sessions promised bit-exact agreement, so a tampered
total_score must be rejected with HTTP 422 + ``replay_mismatch``.
"""
from __future__ import annotations

import pytest

from app.domain.scoring.score_calculator import (
    SCORE_SCALE_K,
    difficulty_multiplier,
    recompute_total_score,
)
from app.infrastructure.wasm_runtime import get_pow_fn, is_wasm_loaded
from app.models.game_session import GameSession as GameSessionModel


_V2 = dict(
    kill_value=500,
    time_total=60.0,
    time_exclude_prepare=[5.0],
    cost_total=200,
    health_origin=20,
    health_final=20,
)


def _scaled(core: float) -> float:
    """Apply the V3 server-side transform the way _verify_score does. All
    sessions here are created at star_rating=1, so difficulty is 1.0 and the
    stored total_score is simply ``core * SCORE_SCALE_K``."""
    return core * SCORE_SCALE_K * difficulty_multiplier(1)


def _register_and_token(client, name: str) -> str:
    email = f"{name}@test.local"
    password = "xQ7!aPm2#vKz9"
    client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "player_name": name},
    )
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    return res.cookies.get("access_token")


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _new_session(client, token: str, replay_version: int = 1) -> str:
    payload: dict = {"star_rating": 1}
    if replay_version != 1:
        payload["replay_version"] = replay_version
    return client.post(
        "/api/sessions", json=payload, headers=_auth(token),
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
        # Server stores the V3-scaled value, not the raw core.
        assert abs(stored - _scaled(expected)) < 1e-2

    def test_matching_total_score_stored_unchanged(self, client, session_factory):
        token = _register_and_token(client, "sv_v2_match")
        sid = _new_session(client, token)

        expected = recompute_total_score(initial_answer=False, **_V2)
        assert expected is not None

        # A legitimate client submits the V3-scaled value (what calculateScore
        # now displays). This is a v1 session (lenient), so even a mismatch
        # would not 422 — but with the scaled value submitted there is none.
        status = _end(
            client, token, sid, total_score=round(_scaled(expected), 6), **_V2,
        )
        assert status == 200

        stored = _db_total_score(session_factory, sid)
        assert stored is not None
        assert abs(stored - _scaled(expected)) < 1e-2

    def test_no_total_score_submitted_and_no_v2_fields_stores_none(self, client, session_factory):
        token = _register_and_token(client, "sv_none_none")
        sid = _new_session(client, token)

        status = _end(client, token, sid)
        assert status == 200

        assert _db_total_score(session_factory, sid) is None


@pytest.mark.skipif(
    not is_wasm_loaded(),
    reason="strict-rejection requires WASM runtime — run `npm run prebuild` first",
)
class TestVerifyScoreReplayV2Strict:
    """FU-A acceptance — v2 sessions must reject tampered scores with 422.

    The strict path only fires when (a) the session is tagged replay_version=2
    AND (b) the backend successfully loaded math_engine.wasm. Without WASM we
    fall back to the v1 ε-tolerance behaviour even for v2 sessions because
    bit-equality cannot be guaranteed across Python's libm vs the browser's.
    The skipif above marks the contract unverified rather than passing
    silently when the artifact is missing.
    """

    def test_v2_legitimate_score_accepted(self, client, session_factory):
        token = _register_and_token(client, "sv_v2_strict_ok")
        sid = _new_session(client, token, replay_version=2)

        # Recompute with the SAME pow_fn the backend will use, so the value
        # we submit is byte-identical to what the verifier expects.
        expected = recompute_total_score(
            initial_answer=False, pow_fn=get_pow_fn(), **_V2,
        )
        assert expected is not None

        # The strict v2 path compares the submitted value against the
        # server-recomputed, V3-scaled value, so a legitimate client must
        # submit the scaled total (what calculateScore displays).
        status = _end(
            client, token, sid, total_score=round(_scaled(expected), 4), **_V2,
        )
        assert status == 200

        stored = _db_total_score(session_factory, sid)
        assert stored is not None
        assert abs(stored - _scaled(expected)) < 1e-2

    def test_v2_tampered_score_rejected_with_replay_mismatch(self, client, session_factory):
        token = _register_and_token(client, "sv_v2_strict_tamper")
        sid = _new_session(client, token, replay_version=2)

        # 999_999 is multiple orders of magnitude beyond the legitimate
        # recomputed value (~277.3 for these inputs: core × K=1 × difficulty 1.0)
        # — well past the 1e-4 rounding tolerance the strict path allows.
        res = client.post(
            f"/api/sessions/{sid}/end",
            json={
                "score": 100, "kills": 5, "waves_survived": 2,
                "total_score": 999_999.0, **_V2,
            },
            headers=_auth(token),
        )
        assert res.status_code == 422
        assert res.json()["detail"] == "replay_mismatch"

        # Session must NOT have been completed — stored row stays in its
        # pre-end state so the player can retry submission once they fix
        # the client.
        db = session_factory()
        try:
            row = db.query(GameSessionModel).filter(GameSessionModel.id == sid).one()
            assert row.status != "completed"
        finally:
            db.close()

    def test_v1_session_still_logs_warning_not_rejects(self, client, session_factory):
        # Regression guard: the strict path is v2-only. v1 (legacy) sessions
        # must keep tolerating drift so existing replays don't 422.
        token = _register_and_token(client, "sv_v1_lenient")
        sid = _new_session(client, token, replay_version=1)

        status = _end(client, token, sid, total_score=999_999.0, **_V2)
        assert status == 200  # warning, not error
