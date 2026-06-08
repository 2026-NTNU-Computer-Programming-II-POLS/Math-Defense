from tests.conftest import register_test_user


def _register_and_token(client, name="player1"):
    email = f"{name}@test.local"
    password = "xQ7!aPm2#vKz9"
    client.post("/api/auth/register", json={
        "email": email, "password": password,
        "player_name": name,
    })
    res = client.post("/api/auth/login", json={"email": email, "password": password})
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
    from tests.conftest import register_test_user
    _user, token, _refresh = register_test_user(
        db_session,
        email=f"{name}@test.local",
        password="xQ7!aPm2#vKz9",
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


# ── personal-best history (GET /api/leaderboard/me) ──────────────────────────


def test_personal_history_requires_auth(client):
    res = client.get("/api/leaderboard/me")
    assert res.status_code == 401


def test_personal_history_returns_only_own_data(client):
    """user A submits two sessions; user B submits one — A's /me returns only A's two."""
    token_a = _register_and_token(client, "pb_a")
    token_b = _register_and_token(client, "pb_b")
    _create_completed_session(client, token_a, score=400)
    _create_completed_session(client, token_a, score=600)
    _create_completed_session(client, token_b, score=999)

    res = client.get("/api/leaderboard/me", headers=_auth_headers(token_a))
    assert res.status_code == 200
    entries = res.json()["entries"]
    assert len(entries) == 2
    scores = [e["score"] for e in entries]
    assert sorted(scores) == [400, 600]
    # 999 was submitted by user B; it must not leak into A's personal history
    assert 999 not in scores


def test_get_user_history_orders_by_completed_at_desc(client):
    """Repo contract: history is newest-first so the timeline UI can render
    directly. created_at must be non-increasing."""
    token = _register_and_token(client, "pb_order")
    _create_completed_session(client, token, score=300)
    _create_completed_session(client, token, score=500)
    _create_completed_session(client, token, score=400)

    res = client.get("/api/leaderboard/me", headers=_auth_headers(token))
    assert res.status_code == 200
    entries = res.json()["entries"]
    assert len(entries) == 3
    timestamps = [e["created_at"] for e in entries]
    assert timestamps == sorted(timestamps, reverse=True)


def test_personal_history_marks_personal_bests(client):
    """A submission is a PB iff it strictly exceeds every prior submission's
    score (chronologically). The first submission is always a PB."""
    token = _register_and_token(client, "pb_marks")
    _create_completed_session(client, token, score=300)  # PB (first)
    _create_completed_session(client, token, score=200)  # not a PB
    _create_completed_session(client, token, score=500)  # PB

    res = client.get("/api/leaderboard/me", headers=_auth_headers(token))
    assert res.status_code == 200
    entries = res.json()["entries"]
    by_score = {e["score"]: e["is_personal_best"] for e in entries}
    assert by_score == {500: True, 200: False, 300: True}


def test_personal_history_filters_by_level(client):
    """Level filter scopes the timeline so other levels are excluded."""
    token = _register_and_token(client, "pb_level")
    _create_completed_session(client, token, level=1, score=300, waves_survived=3)
    # Level 2's wave cap is 4 — keep within the per-level ceiling
    _create_completed_session(client, token, level=2, score=999, kills=50, waves_survived=4)

    res = client.get("/api/leaderboard/me?level=1", headers=_auth_headers(token))
    assert res.status_code == 200
    entries = res.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["level"] == 1
    assert entries[0]["score"] == 300


def test_teacher_personal_history_includes_preview_runs(client, db_session):
    """BUG-010: every teacher run is is_preview, so it never reaches the
    leaderboard table. The self-view must still show it (sourced from the
    teacher's own game_sessions), while it stays off the public board."""
    _u, token, _r = register_test_user(
        db_session,
        email="t_hist@test.local",
        password="xQ7!aPm2#vKz9",
        player_name="t_hist",
        role="teacher",
    )
    _create_completed_session(client, token, score=420)

    res = client.get("/api/leaderboard/me", headers=_auth_headers(token))
    assert res.status_code == 200
    entries = res.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["score"] == 420
    assert entries[0]["is_personal_best"] is True

    # The preview run must NOT leak into the public global board.
    public = client.get("/api/leaderboard").json()["entries"]
    assert 420 not in [e["score"] for e in public]


def test_student_personal_history_includes_practice_runs(client, db_session):
    """BUG-010 corollary: the self-view is the player's own timeline, so a
    student's practice run appears in /me even though it is leaderboard-
    ineligible and absent from the public board."""
    token = _register_and_token(client, "pb_practice")
    _create_completed_session(client, token, score=200)
    # Practice run — leaderboard-ineligible but part of the player's history.
    sid = client.post(
        "/api/sessions",
        json={"star_rating": 1, "practice_mode": True},
        headers=_auth_headers(token),
    ).json()["id"]
    client.post(
        f"/api/sessions/{sid}/end",
        json={"score": 800, "kills": 10, "waves_survived": 3},
        headers=_auth_headers(token),
    )

    entries = client.get("/api/leaderboard/me", headers=_auth_headers(token)).json()["entries"]
    scores = sorted(e["score"] for e in entries)
    assert scores == [200, 800]

    public = client.get("/api/leaderboard").json()["entries"]
    assert 800 not in [e["score"] for e in public]
