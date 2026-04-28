def _register_and_token(client, name="player1"):
    res = client.post("/api/auth/register", json={
        "email": f"{name}@test.local", "password": "secret123",
        "player_name": name, "role": "student",
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
