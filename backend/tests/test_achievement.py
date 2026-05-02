"""Achievement integration tests — H-12 coverage.

Covers: empty list for new user, summary counts, achievement unlock after
session completion, duplicate unlock prevention, and a representative sample
of condition types.
"""
from app.domain.achievement.definitions import ACHIEVEMENT_DEFS


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _register(client, name):
    res = client.post("/api/auth/register", json={
        "email": f"{name}@test.local",
        "password": "xQ7!aPm2#vKz9",
        "player_name": name,
    })
    return res.cookies.get("access_token")


def _complete_session(client, token, level=1, score=500, kills=10, waves_survived=2):
    sid = client.post(
        "/api/sessions",
        json={"star_rating": level},
        headers=_auth(token),
    ).json()["id"]
    client.post(
        f"/api/sessions/{sid}/end",
        json={"score": score, "kills": kills, "waves_survived": waves_survived},
        headers=_auth(token),
    )
    return sid


# ── Initial state ─────────────────────────────────────────────────────────────

def test_achievements_empty_for_new_user(client):
    token = _register(client, "ach_new")
    res = client.get("/api/achievements", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()
    assert len(data) == len(ACHIEVEMENT_DEFS)
    assert all(not entry["unlocked"] for entry in data)


def test_achievement_summary_zero_for_new_user(client):
    token = _register(client, "ach_sum_zero")
    res = client.get("/api/achievements/summary", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()
    assert data["unlocked"] == 0
    assert data["total"] == len(ACHIEVEMENT_DEFS)
    assert data["talent_points_earned"] == 0


def test_achievements_requires_auth(client):
    res = client.get("/api/achievements")
    assert res.status_code in (401, 403)


# ── Unlock on session completion ─────────────────────────────────────────────

def test_explore_star_1_unlocked_after_completing_level_1(client):
    token = _register(client, "ach_star1")
    _complete_session(client, token, level=1, score=500, kills=10, waves_survived=2)

    res = client.get("/api/achievements", headers=_auth(token))
    assert res.status_code == 200
    entry = next((e for e in res.json() if e["id"] == "explore_star_1"), None)
    assert entry is not None
    assert entry["unlocked"] is True
    assert entry["unlocked_at"] is not None


def test_summary_increments_after_unlock(client):
    token = _register(client, "ach_sum_incr")
    _complete_session(client, token, level=1, score=500, kills=10, waves_survived=2)

    res = client.get("/api/achievements/summary", headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["unlocked"] >= 1
    assert res.json()["talent_points_earned"] >= 1


def test_talent_points_in_summary_match_unlocked_definitions(client):
    token = _register(client, "ach_tp_match")
    _complete_session(client, token, level=1, score=2500, kills=35, waves_survived=3)

    achievements = client.get("/api/achievements", headers=_auth(token)).json()
    unlocked = [e for e in achievements if e["unlocked"]]
    expected_points = sum(e["talent_points"] for e in unlocked)

    summary = client.get("/api/achievements/summary", headers=_auth(token)).json()
    assert summary["talent_points_earned"] == expected_points


# ── Duplicate unlock prevention ───────────────────────────────────────────────

def test_same_achievement_not_unlocked_twice(client):
    token = _register(client, "ach_dedup")
    _complete_session(client, token, level=1, score=500, kills=10, waves_survived=2)
    _complete_session(client, token, level=1, score=500, kills=10, waves_survived=2)

    achievements = client.get("/api/achievements", headers=_auth(token)).json()
    explore_star_1_entries = [e for e in achievements if e["id"] == "explore_star_1"]
    assert len(explore_star_1_entries) == 1


# ── Condition type sampling ───────────────────────────────────────────────────

def test_single_session_kills_achievement(client):
    """combat_single_30: kill 30 enemies in one session."""
    token = _register(client, "ach_kills_30")
    _complete_session(client, token, level=1, score=500, kills=30, waves_survived=3)

    achievements = client.get("/api/achievements", headers=_auth(token)).json()
    entry = next((e for e in achievements if e["id"] == "combat_single_30"), None)
    assert entry is not None
    assert entry["unlocked"] is True


def test_waves_survived_achievement(client):
    """survival_waves_3: survive 3 waves in one session."""
    token = _register(client, "ach_waves")
    _complete_session(client, token, level=1, score=500, kills=10, waves_survived=3)

    achievements = client.get("/api/achievements", headers=_auth(token)).json()
    entry = next((e for e in achievements if e["id"] == "survival_waves_3"), None)
    assert entry is not None
    assert entry["unlocked"] is True


def test_explore_star_3_requires_level_3_session(client):
    """explore_star_3 must not unlock from a level-1 session."""
    token = _register(client, "ach_star3_no")
    _complete_session(client, token, level=1, score=500, kills=10, waves_survived=2)

    achievements = client.get("/api/achievements", headers=_auth(token)).json()
    entry = next((e for e in achievements if e["id"] == "explore_star_3"), None)
    assert entry is not None
    assert entry["unlocked"] is False


def test_explore_star_3_unlocked_by_level_3_session(client):
    token = _register(client, "ach_star3_yes")
    _complete_session(client, token, level=3, score=500, kills=10, waves_survived=3)

    achievements = client.get("/api/achievements", headers=_auth(token)).json()
    entry = next((e for e in achievements if e["id"] == "explore_star_3"), None)
    assert entry is not None
    assert entry["unlocked"] is True


def test_high_single_session_score_achievement(client):
    """score_single_2000: score > 2000 in one session."""
    token = _register(client, "ach_score_hi")
    _complete_session(client, token, level=1, score=2500, kills=10, waves_survived=2)

    achievements = client.get("/api/achievements", headers=_auth(token)).json()
    entry = next((e for e in achievements if e["id"] == "score_single_2000"), None)
    assert entry is not None
    assert entry["unlocked"] is True


def test_sessions_count_achievement_accumulates(client):
    """explore_sessions_5: requires 5 completed sessions."""
    token = _register(client, "ach_5sessions")
    for _ in range(5):
        _complete_session(client, token, level=1, score=500, kills=10, waves_survived=2)

    achievements = client.get("/api/achievements", headers=_auth(token)).json()
    entry = next((e for e in achievements if e["id"] == "explore_sessions_5"), None)
    assert entry is not None
    assert entry["unlocked"] is True


def test_sessions_count_achievement_not_unlocked_early(client):
    token = _register(client, "ach_4sessions")
    for _ in range(4):
        _complete_session(client, token, level=1, score=500, kills=10, waves_survived=2)

    achievements = client.get("/api/achievements", headers=_auth(token)).json()
    entry = next((e for e in achievements if e["id"] == "explore_sessions_5"), None)
    assert entry is not None
    assert entry["unlocked"] is False


def test_achievements_isolated_between_users(client):
    token1 = _register(client, "ach_iso1")
    token2 = _register(client, "ach_iso2")

    _complete_session(client, token1, level=1, score=2500, kills=35, waves_survived=3)

    achievements2 = client.get("/api/achievements", headers=_auth(token2)).json()
    assert all(not e["unlocked"] for e in achievements2)
