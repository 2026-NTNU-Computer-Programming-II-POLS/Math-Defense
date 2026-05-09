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
    # B-BUG-8: end_session now derives waves_survived from the persisted
    # event log rather than trusting the request body. Post the matching
    # waveEnd events so the server-derived count agrees with what the test
    # asserts on; otherwise achievements that gate on session_waves >= 1
    # never unlock.
    if waves_survived > 0:
        client.post(
            f"/api/sessions/{sid}/events",
            json={"events": [
                {"seq": i + 1, "ts": float(i + 1), "event_type": "waveEnd", "payload": None}
                for i in range(waves_survived)
            ]},
            headers=_auth(token),
        )
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


def test_achievement_unlocks_curve_families(client):
    """Pedagogical_Backlog_Spec.md §6 — curve-family achievements gate the magic
    tower's trig/log functions. Star-1 unlocks trig; Star-2 unlocks log.
    """
    token = _register(client, "ach_curve_unlocks")

    # Pre-condition: neither curve-family unlock is granted.
    before = client.get("/api/achievements", headers=_auth(token)).json()
    by_id = {e["id"]: e for e in before}
    assert by_id["unlock_trig_curves"]["unlocked"] is False
    assert by_id["unlock_log_curves"]["unlocked"] is False

    # Star-1 clear → trig unlocks, log stays locked.
    _complete_session(client, token, level=1, score=500, kills=10, waves_survived=2)
    after_star1 = client.get("/api/achievements", headers=_auth(token)).json()
    by_id = {e["id"]: e for e in after_star1}
    assert by_id["unlock_trig_curves"]["unlocked"] is True
    assert by_id["unlock_log_curves"]["unlocked"] is False

    # Star-2 clear → log unlocks too.
    _complete_session(client, token, level=2, score=500, kills=10, waves_survived=2)
    after_star2 = client.get("/api/achievements", headers=_auth(token)).json()
    by_id = {e["id"]: e for e in after_star2}
    assert by_id["unlock_log_curves"]["unlocked"] is True


def test_achievements_isolated_between_users(client):
    token1 = _register(client, "ach_iso1")
    token2 = _register(client, "ach_iso2")

    _complete_session(client, token1, level=1, score=2500, kills=35, waves_survived=3)

    achievements2 = client.get("/api/achievements", headers=_auth(token2)).json()
    assert all(not e["unlocked"] for e in achievements2)


# ── Seasonal achievement sets — Pedagogical_Backlog_Spec.md §22 ──────────────

def _seed_seasonal_def(monkeypatch, season_id="spring_2026"):
    """Tag an existing achievement def as part of a season for the duration of
    the test. Patches the frozen dataclass via dataclasses.replace and re-binds
    the registry so neither persists past the test.
    """
    import dataclasses

    from app.domain.achievement import definitions as defs_mod

    target = defs_mod.ACHIEVEMENT_DEFS["explore_star_1"]
    seasoned = dataclasses.replace(target, season_id=season_id)
    patched = dict(defs_mod.ACHIEVEMENT_DEFS)
    patched["explore_star_1"] = seasoned
    monkeypatch.setattr(defs_mod, "ACHIEVEMENT_DEFS", patched)
    return seasoned


def _set_season_window(client, season_id, starts_at, ends_at):
    """Insert a Season row directly through the repository. The admin endpoint
    requires Role.ADMIN, which the test fixtures don't seed; using the repo
    keeps the test focused on the multiplier behaviour."""
    from app.db.database import get_db

    from app.domain.season.aggregate import Season
    from app.infrastructure.persistence.season_repository import SqlAlchemySeasonRepository

    override = client.app.dependency_overrides[get_db]
    gen = override()
    db = next(gen)
    try:
        SqlAlchemySeasonRepository(db).save(
            Season(season_id=season_id, name=season_id, starts_at=starts_at, ends_at=ends_at)
        )
        db.commit()
    finally:
        try:
            next(gen)
        except StopIteration:
            pass


def test_season_award_doubled(client, monkeypatch):
    """Unlock during an active season grants 2x talent points (Spec §22.3)."""
    from datetime import datetime, timedelta, UTC

    seasoned = _seed_seasonal_def(monkeypatch)
    now = datetime.now(UTC)
    _set_season_window(
        client, "spring_2026", now - timedelta(days=1), now + timedelta(days=7)
    )

    token = _register(client, "ach_season_active")
    _complete_session(client, token, level=1, score=500, kills=10, waves_survived=2)

    summary = client.get("/api/achievements/summary", headers=_auth(token)).json()
    achievements = client.get("/api/achievements", headers=_auth(token)).json()
    star1 = next(e for e in achievements if e["id"] == "explore_star_1")
    assert star1["unlocked"] is True
    assert star1["season_id"] == "spring_2026"
    assert star1["season_active"] is True
    # Stored reward must reflect the 2x multiplier — base talent_points=1 → 2.
    other_unlocked = sum(
        e["talent_points"] for e in achievements
        if e["unlocked"] and e["id"] != "explore_star_1"
    )
    assert summary["talent_points_earned"] == other_unlocked + seasoned.talent_points * 2


def test_season_inactive_normal_award(client, monkeypatch):
    """Outside the season window, no multiplier applies (Spec §22.4)."""
    from datetime import datetime, timedelta, UTC

    seasoned = _seed_seasonal_def(monkeypatch)
    # Window already closed.
    now = datetime.now(UTC)
    _set_season_window(
        client, "spring_2026", now - timedelta(days=14), now - timedelta(days=1)
    )

    token = _register(client, "ach_season_past")
    _complete_session(client, token, level=1, score=500, kills=10, waves_survived=2)

    summary = client.get("/api/achievements/summary", headers=_auth(token)).json()
    achievements = client.get("/api/achievements", headers=_auth(token)).json()
    star1 = next(e for e in achievements if e["id"] == "explore_star_1")
    assert star1["unlocked"] is True
    assert star1["season_active"] is False
    other_unlocked = sum(
        e["talent_points"] for e in achievements
        if e["unlocked"] and e["id"] != "explore_star_1"
    )
    # No multiplier — points equal the def's base value.
    assert summary["talent_points_earned"] == other_unlocked + seasoned.talent_points
