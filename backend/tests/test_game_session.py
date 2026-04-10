def _register_and_token(client, username="player1"):
    res = client.post("/api/auth/register", json={"username": username, "password": "secret123"})
    return res.json()["access_token"]


def _create_session(client, token, level=1):
    return client.post(
        "/api/sessions",
        json={"level": level},
        headers={"Authorization": f"Bearer {token}"},
    )


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ── Create Session ──

def test_create_session(client):
    token = _register_and_token(client, "sess_create")
    res = _create_session(client, token)
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "active"
    assert data["level"] == 1
    assert data["current_wave"] == 0
    assert data["score"] == 0


def test_create_session_invalid_level(client):
    token = _register_and_token(client, "sess_invalid_level")
    res = client.post(
        "/api/sessions",
        json={"level": 5},
        headers=_auth_headers(token),
    )
    assert res.status_code == 422


def test_create_session_abandons_existing(client):
    token = _register_and_token(client, "sess_abandon")
    res1 = _create_session(client, token)
    session1_id = res1.json()["id"]

    res2 = _create_session(client, token, level=2)
    assert res2.status_code == 201
    assert res2.json()["id"] != session1_id


def test_create_session_requires_auth(client):
    res = client.post("/api/sessions", json={"level": 1})
    assert res.status_code in (401, 403)


# ── Update Session ──

def test_update_session(client):
    token = _register_and_token(client, "sess_update")
    session_id = _create_session(client, token).json()["id"]

    res = client.patch(
        f"/api/sessions/{session_id}",
        json={"current_wave": 3, "gold": 500, "hp": 80, "score": 1200},
        headers=_auth_headers(token),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["current_wave"] == 3
    assert data["gold"] == 500
    assert data["hp"] == 80
    assert data["score"] == 1200


def test_update_ended_session_returns_409(client):
    token = _register_and_token(client, "sess_update_ended")
    session_id = _create_session(client, token).json()["id"]

    # End it first
    client.post(
        f"/api/sessions/{session_id}/end",
        json={"score": 100, "kills": 5, "waves_survived": 2},
        headers=_auth_headers(token),
    )

    res = client.patch(
        f"/api/sessions/{session_id}",
        json={"gold": 999},
        headers=_auth_headers(token),
    )
    assert res.status_code == 409


def test_update_nonexistent_session(client):
    token = _register_and_token(client, "sess_update_404")
    res = client.patch(
        "/api/sessions/nonexistent",
        json={"gold": 100},
        headers=_auth_headers(token),
    )
    assert res.status_code == 404


# ── End Session ──

def test_end_session(client):
    token = _register_and_token(client, "sess_end")
    session_id = _create_session(client, token).json()["id"]

    res = client.post(
        f"/api/sessions/{session_id}/end",
        json={"score": 2500, "kills": 40, "waves_survived": 8},
        headers=_auth_headers(token),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "completed"
    assert data["score"] == 2500
    assert data["ended_at"] is not None


def test_end_session_twice_returns_409(client):
    token = _register_and_token(client, "sess_end_twice")
    session_id = _create_session(client, token).json()["id"]

    client.post(
        f"/api/sessions/{session_id}/end",
        json={"score": 100, "kills": 5, "waves_survived": 2},
        headers=_auth_headers(token),
    )

    res = client.post(
        f"/api/sessions/{session_id}/end",
        json={"score": 200, "kills": 10, "waves_survived": 4},
        headers=_auth_headers(token),
    )
    assert res.status_code == 409


def test_end_session_creates_leaderboard_entry(client):
    token = _register_and_token(client, "sess_leaderboard")
    session_id = _create_session(client, token).json()["id"]

    client.post(
        f"/api/sessions/{session_id}/end",
        json={"score": 3000, "kills": 50, "waves_survived": 10},
        headers=_auth_headers(token),
    )

    res = client.get("/api/leaderboard")
    entries = res.json()["entries"]
    scores = [e["score"] for e in entries]
    assert 3000 in scores


# ── Cross-user isolation ──

def test_cannot_update_other_users_session(client):
    token1 = _register_and_token(client, "user_a")
    token2 = _register_and_token(client, "user_b")
    session_id = _create_session(client, token1).json()["id"]

    res = client.patch(
        f"/api/sessions/{session_id}",
        json={"gold": 9999},
        headers=_auth_headers(token2),
    )
    assert res.status_code == 404
