def _register_and_token(client, username="player1"):
    res = client.post("/api/auth/register", json={"username": username, "password": "secret123"})
    return res.json()["access_token"]


def test_get_leaderboard_empty(client):
    res = client.get("/api/leaderboard")
    assert res.status_code == 200
    assert "entries" in res.json()


def test_submit_score(client):
    token = _register_and_token(client, "scorer1")
    res = client.post(
        "/api/leaderboard",
        json={"level": 1, "score": 500, "kills": 30, "waves_survived": 3},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 201
    assert res.json()["score"] == 500


def test_leaderboard_filter_by_level(client):
    token = _register_and_token(client, "scorer2")
    client.post(
        "/api/leaderboard",
        json={"level": 2, "score": 800, "kills": 50, "waves_survived": 5},
        headers={"Authorization": f"Bearer {token}"},
    )
    res = client.get("/api/leaderboard?level=2")
    assert res.status_code == 200
    for entry in res.json()["entries"]:
        assert entry["level"] == 2
