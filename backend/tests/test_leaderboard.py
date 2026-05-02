def _register_and_token(client, name="player1"):
    res = client.post("/api/auth/register", json={
        "email": f"{name}@test.local", "password": "xQ7!aPm2#vKz9",
        "player_name": name,
    })
    return res.cookies.get("access_token")


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _create_completed_session(client, token, level=1, score=500, kills=30, waves_survived=3):
    """Create and complete a session, returning its session_id"""
    session_res = client.post(
        "/api/sessions",
        json={"star_rating": level},
        headers=_auth_headers(token),
    )
    session_id = session_res.json()["id"]
    client.post(
        f"/api/sessions/{session_id}/end",
        json={"score": score, "kills": kills, "waves_survived": waves_survived},
        headers=_auth_headers(token),
    )
    return session_id


def test_get_leaderboard_empty(client):
    res = client.get("/api/leaderboard")
    assert res.status_code == 200
    assert "entries" in res.json()


def test_submit_score_auto_created_by_end_session(client):
    """end_session auto-creates a leaderboard entry via domain event"""
    token = _register_and_token(client, "scorer1")
    _create_completed_session(client, token, score=500)
    res = client.get("/api/leaderboard")
    assert res.status_code == 200
    scores = [e["score"] for e in res.json()["entries"]]
    assert 500 in scores


def test_submit_score_duplicate_rejected(client):
    """Duplicate score submission for the same session must be rejected"""
    token = _register_and_token(client, "scorer1b")
    session_id = _create_completed_session(client, token, score=500)
    res = client.post(
        "/api/leaderboard",
        json={"kills": 30, "waves_survived": 3, "session_id": session_id},
        headers=_auth_headers(token),
    )
    assert res.status_code == 409


def test_submit_score_for_active_session_rejected(client):
    """Guards leaderboard_service.py status-check: an ACTIVE session must be rejected
    with 400 so callers cannot pre-commit a score before finishing the level."""
    token = _register_and_token(client, "active_submit")
    session_res = client.post(
        "/api/sessions",
        json={"star_rating": 1},
        headers=_auth_headers(token),
    )
    session_id = session_res.json()["id"]
    res = client.post(
        "/api/leaderboard",
        json={"kills": 30, "waves_survived": 3, "session_id": session_id},
        headers=_auth_headers(token),
    )
    assert res.status_code == 400
    assert "not completed" in res.json()["detail"].lower()


def test_submit_score_for_abandoned_session_rejected(client):
    """Sibling to the ACTIVE case: an ABANDONED session must also be rejected."""
    token = _register_and_token(client, "abandoned_submit")
    session_res = client.post(
        "/api/sessions",
        json={"star_rating": 1},
        headers=_auth_headers(token),
    )
    session_id = session_res.json()["id"]
    client.post(f"/api/sessions/{session_id}/abandon", headers=_auth_headers(token))
    res = client.post(
        "/api/leaderboard",
        json={"kills": 30, "waves_survived": 3, "session_id": session_id},
        headers=_auth_headers(token),
    )
    assert res.status_code == 400


def test_leaderboard_filter_by_level(client):
    token = _register_and_token(client, "scorer2")
    # waves_survived must not exceed level 2's wave count (4)
    _create_completed_session(client, token, level=2, score=800, kills=50, waves_survived=4)
    res = client.get("/api/leaderboard?level=2")
    assert res.status_code == 200
    for entry in res.json()["entries"]:
        assert entry["level"] == 2


# ── class_id parameter (D-3) ─────────────────────────────────────────────────

def _register_teacher(db_session, name):
    from app.factories import build_auth_service
    _user, token = build_auth_service(db_session).register(
        email=f"{name}@test.local",
        password="secret123",
        player_name=name,
        role="teacher",
    )
    return token


def test_class_leaderboard_requires_auth(client, db_session):
    teacher_token = _register_teacher(db_session, "t_lb_auth")
    class_id = client.post(
        "/api/classes", json={"name": "LB Auth Class"},
        headers=_auth_headers(teacher_token),
    ).json()["id"]
    res = client.get(f"/api/leaderboard?class_id={class_id}")
    assert res.status_code in (401, 403, 422)


def test_class_leaderboard_accessible_to_member(client, db_session):
    teacher_token = _register_teacher(db_session, "t_lb_member")
    student_token = _register_and_token(client, "s_lb_member")
    class_res = client.post(
        "/api/classes", json={"name": "LB Member Class"},
        headers=_auth_headers(teacher_token),
    )
    class_id = class_res.json()["id"]
    join_code = class_res.json()["join_code"]
    client.post("/api/classes/join", json={"code": join_code}, headers=_auth_headers(student_token))

    _create_completed_session(client, student_token, score=750)
    res = client.get(f"/api/leaderboard?class_id={class_id}", headers=_auth_headers(student_token))
    assert res.status_code == 200
    assert "entries" in res.json()


def test_class_leaderboard_rejects_non_member(client, db_session):
    teacher_token = _register_teacher(db_session, "t_lb_reject")
    outsider_token = _register_and_token(client, "s_lb_outsider")
    class_id = client.post(
        "/api/classes", json={"name": "LB Reject Class"},
        headers=_auth_headers(teacher_token),
    ).json()["id"]
    res = client.get(f"/api/leaderboard?class_id={class_id}", headers=_auth_headers(outsider_token))
    assert res.status_code == 403


def test_class_leaderboard_only_includes_class_scores(client, db_session):
    teacher_token = _register_teacher(db_session, "t_lb_scope")
    s_in_token = _register_and_token(client, "s_lb_in")
    s_out_token = _register_and_token(client, "s_lb_out")

    class_res = client.post(
        "/api/classes", json={"name": "LB Scope Class"},
        headers=_auth_headers(teacher_token),
    )
    class_id = class_res.json()["id"]
    client.post("/api/classes/join", json={"code": class_res.json()["join_code"]}, headers=_auth_headers(s_in_token))

    _create_completed_session(client, s_in_token, score=600)
    _create_completed_session(client, s_out_token, score=999)

    res = client.get(f"/api/leaderboard?class_id={class_id}", headers=_auth_headers(s_in_token))
    assert res.status_code == 200
    player_names = [e["player_name"] for e in res.json()["entries"]]
    assert "s_lb_in" in player_names
    assert "s_lb_out" not in player_names
