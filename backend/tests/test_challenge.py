"""Generative Challenge Mode integration tests (Backlog §23)."""
from __future__ import annotations

from app.factories import build_auth_service


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_student(client, name: str) -> str:
    res = client.post(
        "/api/auth/register",
        json={
            "email": f"{name}@test.local",
            "password": "xQ7!aPm2#vKz9",
            "player_name": name,
        },
    )
    return res.cookies.get("access_token")


def _register_teacher(db_session, name: str) -> str:
    _user, token, _refresh = build_auth_service(db_session).register(
        email=f"{name}@test.local",
        password="secret123",
        player_name=name,
        role="teacher",
    )
    return token


def _valid_constraints() -> dict:
    return {
        "allowed_towers": ["magic", "radarA"],
        "magic_param_bounds": {"b": [0.0, 2.0]},
        "forbidden_mechanics": ["calculus_pet"],
        "wave_count": 3,
        "target_score": 1500,
    }


# ── CRUD ─────────────────────────────────────────────────────────────────────


def test_teacher_can_create_challenge(client, db_session):
    token = _register_teacher(db_session, "ch_t1")
    res = client.post(
        "/api/challenges",
        json={"title": "Magic Only", "description": "Try b=2", "constraints": _valid_constraints()},
        headers=_auth(token),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["title"] == "Magic Only"
    assert body["deep_link"] == f"/challenge/{body['id']}"
    assert body["constraints"]["wave_count"] == 3


def test_student_cannot_create_challenge(client):
    token = _register_student(client, "ch_s1")
    res = client.post(
        "/api/challenges",
        json={"title": "Hi", "description": "", "constraints": _valid_constraints()},
        headers=_auth(token),
    )
    assert res.status_code == 403


def test_student_can_get_challenge_by_id(client, db_session):
    teacher_token = _register_teacher(db_session, "ch_t2")
    create_res = client.post(
        "/api/challenges",
        json={"title": "Public", "description": "", "constraints": _valid_constraints()},
        headers=_auth(teacher_token),
    )
    cid = create_res.json()["id"]

    student_token = _register_student(client, "ch_s2")
    res = client.get(f"/api/challenges/{cid}", headers=_auth(student_token))
    assert res.status_code == 200
    assert res.json()["id"] == cid


def test_get_unknown_challenge_returns_404(client):
    token = _register_student(client, "ch_s_404")
    res = client.get("/api/challenges/00000000-0000-0000-0000-000000000000", headers=_auth(token))
    assert res.status_code == 404


def test_teacher_lists_own_challenges(client, db_session):
    token = _register_teacher(db_session, "ch_t_list")
    client.post(
        "/api/challenges",
        json={"title": "A", "description": "", "constraints": _valid_constraints()},
        headers=_auth(token),
    )
    client.post(
        "/api/challenges",
        json={"title": "B", "description": "", "constraints": _valid_constraints()},
        headers=_auth(token),
    )
    res = client.get("/api/challenges?mine=true", headers=_auth(token))
    assert res.status_code == 200
    titles = {c["title"] for c in res.json()}
    assert {"A", "B"} <= titles


# ── Validation ───────────────────────────────────────────────────────────────


def test_unknown_forbidden_mechanic_rejected(client, db_session):
    token = _register_teacher(db_session, "ch_t_bad_mech")
    bad = _valid_constraints()
    bad["forbidden_mechanics"] = ["frobnicate"]
    res = client.post(
        "/api/challenges",
        json={"title": "Bad", "description": "", "constraints": bad},
        headers=_auth(token),
    )
    assert res.status_code == 422


def test_empty_allowed_towers_rejected(client, db_session):
    token = _register_teacher(db_session, "ch_t_empty_tow")
    bad = _valid_constraints()
    bad["allowed_towers"] = []
    res = client.post(
        "/api/challenges",
        json={"title": "Bad", "description": "", "constraints": bad},
        headers=_auth(token),
    )
    assert res.status_code == 422


def test_wave_count_out_of_range_rejected(client, db_session):
    token = _register_teacher(db_session, "ch_t_wave_oob")
    bad = _valid_constraints()
    bad["wave_count"] = 99
    res = client.post(
        "/api/challenges",
        json={"title": "Bad", "description": "", "constraints": bad},
        headers=_auth(token),
    )
    assert res.status_code == 422


# ── Session integration ─────────────────────────────────────────────────────


def test_session_with_challenge_id_records_it(client, db_session):
    teacher_token = _register_teacher(db_session, "ch_t_sess")
    cid = client.post(
        "/api/challenges",
        json={"title": "S", "description": "", "constraints": _valid_constraints()},
        headers=_auth(teacher_token),
    ).json()["id"]

    student_token = _register_student(client, "ch_s_sess")
    res = client.post(
        "/api/sessions",
        json={"star_rating": 1, "challenge_id": cid},
        headers=_auth(student_token),
    )
    assert res.status_code == 201
    assert res.json()["challenge_id"] == cid


def test_challenge_wave_count_enforced_on_end(client, db_session):
    """Submitting waves_survived above the challenge's wave_count must 422."""
    teacher_token = _register_teacher(db_session, "ch_t_wave")
    constraints = _valid_constraints()
    constraints["wave_count"] = 1
    cid = client.post(
        "/api/challenges",
        json={"title": "OneWave", "description": "", "constraints": constraints},
        headers=_auth(teacher_token),
    ).json()["id"]

    student_token = _register_student(client, "ch_s_wave")
    sid = client.post(
        "/api/sessions",
        json={"star_rating": 1, "challenge_id": cid},
        headers=_auth(student_token),
    ).json()["id"]
    res = client.post(
        f"/api/sessions/{sid}/end",
        json={"score": 200, "kills": 5, "waves_survived": 2},
        headers=_auth(student_token),
    )
    assert res.status_code == 422


def test_challenge_run_appears_only_in_challenge_leaderboard(client, db_session):
    teacher_token = _register_teacher(db_session, "ch_t_lb")
    cid = client.post(
        "/api/challenges",
        json={"title": "LB", "description": "", "constraints": _valid_constraints()},
        headers=_auth(teacher_token),
    ).json()["id"]

    student_token = _register_student(client, "ch_s_lb")
    sid = client.post(
        "/api/sessions",
        json={"star_rating": 1, "challenge_id": cid},
        headers=_auth(student_token),
    ).json()["id"]
    end = client.post(
        f"/api/sessions/{sid}/end",
        json={"score": 500, "kills": 5, "waves_survived": 1},
        headers=_auth(student_token),
    )
    assert end.status_code == 200, end.text

    challenge_lb = client.get(
        f"/api/leaderboard?challenge_id={cid}",
        headers=_auth(student_token),
    ).json()
    assert any(e["score"] == 500 for e in challenge_lb["entries"])

    global_lb = client.get("/api/leaderboard").json()
    assert all(e["score"] != 500 for e in global_lb["entries"])


# ── Immutability ─────────────────────────────────────────────────────────────


def test_constraints_immutable_after_play(client, db_session):
    teacher_token = _register_teacher(db_session, "ch_t_imm")
    cid = client.post(
        "/api/challenges",
        json={"title": "Imm", "description": "", "constraints": _valid_constraints()},
        headers=_auth(teacher_token),
    ).json()["id"]

    student_token = _register_student(client, "ch_s_imm")
    sid = client.post(
        "/api/sessions",
        json={"star_rating": 1, "challenge_id": cid},
        headers=_auth(student_token),
    ).json()["id"]
    client.post(
        f"/api/sessions/{sid}/end",
        json={"score": 100, "kills": 1, "waves_survived": 1},
        headers=_auth(student_token),
    )

    new_constraints = _valid_constraints()
    new_constraints["wave_count"] = 5
    res = client.put(
        f"/api/challenges/{cid}/constraints",
        json={"constraints": new_constraints},
        headers=_auth(teacher_token),
    )
    assert res.status_code == 409


def test_rename_after_play_still_allowed(client, db_session):
    teacher_token = _register_teacher(db_session, "ch_t_rn")
    cid = client.post(
        "/api/challenges",
        json={"title": "Old", "description": "", "constraints": _valid_constraints()},
        headers=_auth(teacher_token),
    ).json()["id"]

    student_token = _register_student(client, "ch_s_rn")
    sid = client.post(
        "/api/sessions",
        json={"star_rating": 1, "challenge_id": cid},
        headers=_auth(student_token),
    ).json()["id"]
    client.post(
        f"/api/sessions/{sid}/end",
        json={"score": 100, "kills": 1, "waves_survived": 1},
        headers=_auth(student_token),
    )

    res = client.patch(
        f"/api/challenges/{cid}",
        json={"title": "New", "description": "fixed typo"},
        headers=_auth(teacher_token),
    )
    assert res.status_code == 200
    assert res.json()["title"] == "New"


def test_only_owner_can_modify(client, db_session):
    owner_token = _register_teacher(db_session, "ch_t_owner")
    other_token = _register_teacher(db_session, "ch_t_other")
    cid = client.post(
        "/api/challenges",
        json={"title": "Owned", "description": "", "constraints": _valid_constraints()},
        headers=_auth(owner_token),
    ).json()["id"]

    res = client.patch(
        f"/api/challenges/{cid}",
        json={"title": "Hacked", "description": ""},
        headers=_auth(other_token),
    )
    assert res.status_code == 403


def test_soft_delete_hides_from_listing(client, db_session):
    teacher_token = _register_teacher(db_session, "ch_t_del")
    cid = client.post(
        "/api/challenges",
        json={"title": "Doomed", "description": "", "constraints": _valid_constraints()},
        headers=_auth(teacher_token),
    ).json()["id"]
    delete_res = client.delete(f"/api/challenges/{cid}", headers=_auth(teacher_token))
    assert delete_res.status_code == 204

    listing = client.get("/api/challenges?mine=true", headers=_auth(teacher_token)).json()
    assert all(c["id"] != cid for c in listing)
    # Direct lookup also 404s after soft delete.
    detail = client.get(f"/api/challenges/{cid}", headers=_auth(teacher_token))
    assert detail.status_code == 404
