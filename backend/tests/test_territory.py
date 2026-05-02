"""Territory integration tests — H-11 coverage.

Covers: activity creation, slot management, occupation seize/counter-seize,
own-slot improvement, territory cap enforcement, session replay prevention,
settlement (owner vs. non-owner), play-on-settled rejection, and ranking
computation.
"""
from datetime import datetime, timedelta, UTC

from app.domain.territory.aggregate import TERRITORY_CAP_PER_STUDENT
from app.factories import build_auth_service


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _register_student(client, name):
    res = client.post("/api/auth/register", json={
        "email": f"{name}@test.local",
        "password": "secret123",
        "player_name": name,
    })
    return res.cookies.get("access_token")


def _register_teacher(db_session, name):
    """Register a teacher via the service layer (HTTP only creates students)."""
    _user, token = build_auth_service(db_session).register(
        email=f"{name}@test.local",
        password="secret123",
        player_name=name,
        role="teacher",
    )
    return token


def _future_deadline(days=30):
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def _create_activity(client, token, slots=None, title="Test Activity"):
    if slots is None:
        slots = [{"star_rating": 1}]
    return client.post(
        "/api/activities",
        json={"title": title, "deadline": _future_deadline(), "slots": slots},
        headers=_auth(token),
    )


def _complete_session(client, token, level=1, score=500, kills=30, waves_survived=3):
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


def _slots_for(client, teacher_token, activity_id):
    return client.get(
        f"/api/activities/{activity_id}",
        headers=_auth(teacher_token),
    ).json()["slots"]


def _play(client, student_token, activity_id, slot_id, session_id):
    return client.post(
        f"/api/activities/{activity_id}/slots/{slot_id}/play",
        json={"session_id": session_id},
        headers=_auth(student_token),
    )


# ── Activity creation ────────────────────────────────────────────────────────

def test_teacher_can_create_activity(client, db_session):
    token = _register_teacher(db_session, "t_create")
    res = _create_activity(client, token)
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "Test Activity"
    assert data["settled"] is False


def test_student_cannot_create_activity(client):
    token = _register_student(client, "s_nocreate")
    res = _create_activity(client, token)
    assert res.status_code == 403


def test_create_activity_requires_auth(client):
    res = client.post(
        "/api/activities",
        json={"title": "No Auth", "deadline": _future_deadline(), "slots": [{"star_rating": 1}]},
    )
    assert res.status_code in (401, 403)


def test_create_activity_slot_star_rating_bounds(client, db_session):
    token = _register_teacher(db_session, "t_bounds")
    bad = client.post(
        "/api/activities",
        json={"title": "Bad", "deadline": _future_deadline(), "slots": [{"star_rating": 6}]},
        headers=_auth(token),
    )
    assert bad.status_code == 422


# ── Slot management ──────────────────────────────────────────────────────────

def test_activity_detail_returns_correct_slots(client, db_session):
    token = _register_teacher(db_session, "t_slots_detail")
    slots_def = [{"star_rating": 1}, {"star_rating": 3}, {"star_rating": 5}]
    activity_id = _create_activity(client, token, slots=slots_def).json()["id"]

    res = client.get(f"/api/activities/{activity_id}", headers=_auth(token))
    assert res.status_code == 200
    returned_stars = sorted(s["star_rating"] for s in res.json()["slots"])
    assert returned_stars == [1, 3, 5]


def test_slot_index_is_sequential(client, db_session):
    token = _register_teacher(db_session, "t_slot_idx")
    slots_def = [{"star_rating": 2}] * 3
    activity_id = _create_activity(client, token, slots=slots_def).json()["id"]
    slots = _slots_for(client, token, activity_id)
    assert sorted(s["slot_index"] for s in slots) == [0, 1, 2]


# ── Seize empty slot ─────────────────────────────────────────────────────────

def test_seize_empty_slot_succeeds(client, db_session):
    teacher_token = _register_teacher(db_session, "t_seize_empty")
    student_token = _register_student(client, "s_seize_empty")

    activity_id = _create_activity(client, teacher_token).json()["id"]
    slot_id = _slots_for(client, teacher_token, activity_id)[0]["id"]

    session_id = _complete_session(client, student_token, level=1, score=500)
    res = _play(client, student_token, activity_id, slot_id, session_id)

    assert res.status_code == 200
    assert res.json()["seized"] is True
    assert res.json()["occupation"]["score"] == 500.0


# ── Session replay prevention ─────────────────────────────────────────────────

def test_session_replay_rejected(client, db_session):
    teacher_token = _register_teacher(db_session, "t_replay")
    student_token = _register_student(client, "s_replay")

    activity_id = _create_activity(
        client, teacher_token, slots=[{"star_rating": 1}, {"star_rating": 1}]
    ).json()["id"]
    slots = _slots_for(client, teacher_token, activity_id)

    session_id = _complete_session(client, student_token, level=1, score=500)

    _play(client, student_token, activity_id, slots[0]["id"], session_id)

    res = _play(client, student_token, activity_id, slots[1]["id"], session_id)
    assert res.status_code == 422


# ── Counter-seize ─────────────────────────────────────────────────────────────

def test_counter_seize_with_higher_score(client, db_session):
    teacher_token = _register_teacher(db_session, "t_counter_hi")
    s1_token = _register_student(client, "s_counter_hi1")
    s2_token = _register_student(client, "s_counter_hi2")

    activity_id = _create_activity(client, teacher_token).json()["id"]
    slot_id = _slots_for(client, teacher_token, activity_id)[0]["id"]

    s1_session = _complete_session(client, s1_token, level=1, score=500)
    _play(client, s1_token, activity_id, slot_id, s1_session)

    s2_session = _complete_session(client, s2_token, level=1, score=1000)
    res = _play(client, s2_token, activity_id, slot_id, s2_session)

    assert res.status_code == 200
    assert res.json()["seized"] is True
    assert res.json()["occupation"]["score"] == 1000.0


def test_counter_seize_with_lower_score_not_seized(client, db_session):
    teacher_token = _register_teacher(db_session, "t_counter_lo")
    s1_token = _register_student(client, "s_counter_lo1")
    s2_token = _register_student(client, "s_counter_lo2")

    activity_id = _create_activity(client, teacher_token).json()["id"]
    slot_id = _slots_for(client, teacher_token, activity_id)[0]["id"]

    s1_session = _complete_session(client, s1_token, level=1, score=1000)
    _play(client, s1_token, activity_id, slot_id, s1_session)

    s2_session = _complete_session(client, s2_token, level=1, score=500)
    res = _play(client, s2_token, activity_id, slot_id, s2_session)

    assert res.status_code == 200
    assert res.json()["seized"] is False


def test_own_slot_improvement_accepted(client, db_session):
    teacher_token = _register_teacher(db_session, "t_improve")
    student_token = _register_student(client, "s_improve")

    activity_id = _create_activity(client, teacher_token).json()["id"]
    slot_id = _slots_for(client, teacher_token, activity_id)[0]["id"]

    s1 = _complete_session(client, student_token, level=1, score=500)
    _play(client, student_token, activity_id, slot_id, s1)

    s2 = _complete_session(client, student_token, level=1, score=800)
    res = _play(client, student_token, activity_id, slot_id, s2)

    assert res.status_code == 200
    assert res.json()["seized"] is True
    assert res.json()["occupation"]["score"] == 800.0


def test_own_slot_lower_score_rejected(client, db_session):
    teacher_token = _register_teacher(db_session, "t_improve_lo")
    student_token = _register_student(client, "s_improve_lo")

    activity_id = _create_activity(client, teacher_token).json()["id"]
    slot_id = _slots_for(client, teacher_token, activity_id)[0]["id"]

    s1 = _complete_session(client, student_token, level=1, score=800)
    _play(client, student_token, activity_id, slot_id, s1)

    s2 = _complete_session(client, student_token, level=1, score=500)
    res = _play(client, student_token, activity_id, slot_id, s2)

    assert res.status_code == 200
    assert res.json()["seized"] is False


# ── Session-slot difficulty mismatch ─────────────────────────────────────────

def test_session_difficulty_must_match_slot_star_rating(client, db_session):
    teacher_token = _register_teacher(db_session, "t_diff_mismatch")
    student_token = _register_student(client, "s_diff_mismatch")

    activity_id = _create_activity(
        client, teacher_token, slots=[{"star_rating": 3}]
    ).json()["id"]
    slot_id = _slots_for(client, teacher_token, activity_id)[0]["id"]

    session_id = _complete_session(client, student_token, level=1, score=500)
    res = _play(client, student_token, activity_id, slot_id, session_id)
    assert res.status_code == 422


# ── Territory cap ─────────────────────────────────────────────────────────────

def test_territory_cap_enforced(client, db_session):
    teacher_token = _register_teacher(db_session, "t_cap")
    student_token = _register_student(client, "s_cap")

    slots_def = [{"star_rating": 1}] * (TERRITORY_CAP_PER_STUDENT + 1)
    activity_id = _create_activity(client, teacher_token, slots=slots_def).json()["id"]
    slots = _slots_for(client, teacher_token, activity_id)

    for i in range(TERRITORY_CAP_PER_STUDENT):
        sid = _complete_session(client, student_token, level=1, score=500)
        res = _play(client, student_token, activity_id, slots[i]["id"], sid)
        assert res.status_code == 200
        assert res.json()["seized"] is True

    extra_sid = _complete_session(client, student_token, level=1, score=500)
    res = _play(client, student_token, activity_id, slots[TERRITORY_CAP_PER_STUDENT]["id"], extra_sid)
    assert res.status_code == 409


def test_cap_does_not_count_slot_already_held_by_student(client, db_session):
    """Re-seizing own slot must not consume a cap slot — count stays below cap."""
    teacher_token = _register_teacher(db_session, "t_cap_own")
    student_token = _register_student(client, "s_cap_own")

    slots_def = [{"star_rating": 1}] * TERRITORY_CAP_PER_STUDENT
    activity_id = _create_activity(client, teacher_token, slots=slots_def).json()["id"]
    slots = _slots_for(client, teacher_token, activity_id)

    for i in range(TERRITORY_CAP_PER_STUDENT):
        sid = _complete_session(client, student_token, level=1, score=500 + i * 100)
        _play(client, student_token, activity_id, slots[i]["id"], sid)

    improve_sid = _complete_session(client, student_token, level=1, score=4999)
    res = _play(client, student_token, activity_id, slots[0]["id"], improve_sid)
    assert res.status_code == 200
    assert res.json()["seized"] is True


# ── Settlement ────────────────────────────────────────────────────────────────

def test_teacher_can_settle_own_activity(client, db_session):
    teacher_token = _register_teacher(db_session, "t_settle")
    activity_id = _create_activity(client, teacher_token).json()["id"]

    res = client.post(f"/api/activities/{activity_id}/settle", headers=_auth(teacher_token))
    assert res.status_code == 204


def test_other_teacher_cannot_settle_activity(client, db_session):
    owner_token = _register_teacher(db_session, "t_settle_owner")
    other_token = _register_teacher(db_session, "t_settle_other")
    activity_id = _create_activity(client, owner_token).json()["id"]

    res = client.post(f"/api/activities/{activity_id}/settle", headers=_auth(other_token))
    assert res.status_code == 403


def test_student_cannot_settle_activity(client, db_session):
    teacher_token = _register_teacher(db_session, "t_settle2")
    student_token = _register_student(client, "s_settle2")
    activity_id = _create_activity(client, teacher_token).json()["id"]

    res = client.post(f"/api/activities/{activity_id}/settle", headers=_auth(student_token))
    assert res.status_code == 403


def test_play_on_settled_activity_rejected(client, db_session):
    teacher_token = _register_teacher(db_session, "t_play_settled")
    student_token = _register_student(client, "s_play_settled")

    activity_id = _create_activity(client, teacher_token).json()["id"]
    slot_id = _slots_for(client, teacher_token, activity_id)[0]["id"]

    client.post(f"/api/activities/{activity_id}/settle", headers=_auth(teacher_token))

    session_id = _complete_session(client, student_token, level=1, score=500)
    res = _play(client, student_token, activity_id, slot_id, session_id)
    assert res.status_code == 409


def test_settle_already_settled_activity_rejected(client, db_session):
    teacher_token = _register_teacher(db_session, "t_double_settle")
    activity_id = _create_activity(client, teacher_token).json()["id"]

    client.post(f"/api/activities/{activity_id}/settle", headers=_auth(teacher_token))
    res = client.post(f"/api/activities/{activity_id}/settle", headers=_auth(teacher_token))
    assert res.status_code == 409


# ── Ranking computation ───────────────────────────────────────────────────────

def test_rankings_order_by_star_value(client, db_session):
    teacher_token = _register_teacher(db_session, "t_rank")
    s1_token = _register_student(client, "s_rank1")
    s2_token = _register_student(client, "s_rank2")

    slots_def = [{"star_rating": 3}, {"star_rating": 1}, {"star_rating": 1}]
    activity_id = _create_activity(client, teacher_token, slots=slots_def).json()["id"]
    slots = sorted(_slots_for(client, teacher_token, activity_id), key=lambda s: s["star_rating"])

    s1_sid = _complete_session(client, s1_token, level=3, score=500, kills=30, waves_survived=3)
    _play(client, s1_token, activity_id, slots[2]["id"], s1_sid)

    s2a = _complete_session(client, s2_token, level=1, score=500)
    s2b = _complete_session(client, s2_token, level=1, score=500)
    _play(client, s2_token, activity_id, slots[0]["id"], s2a)
    _play(client, s2_token, activity_id, slots[1]["id"], s2b)

    res = client.get(f"/api/activities/{activity_id}/rankings", headers=_auth(teacher_token))
    assert res.status_code == 200
    rankings = res.json()
    assert len(rankings) == 2
    assert rankings[0]["rank"] == 1
    assert rankings[0]["territory_value"] == 3.0
    assert rankings[1]["rank"] == 2
    assert rankings[1]["territory_value"] == 2.0


def test_rankings_empty_when_no_occupations(client, db_session):
    teacher_token = _register_teacher(db_session, "t_empty_rank")
    activity_id = _create_activity(client, teacher_token).json()["id"]

    res = client.get(f"/api/activities/{activity_id}/rankings", headers=_auth(teacher_token))
    assert res.status_code == 200
    assert res.json() == []


def test_list_activities_returns_created(client, db_session):
    teacher_token = _register_teacher(db_session, "t_list")
    _create_activity(client, teacher_token, title="Activity Alpha")
    _create_activity(client, teacher_token, title="Activity Beta")

    res = client.get("/api/activities", headers=_auth(teacher_token))
    assert res.status_code == 200
    titles = [a["title"] for a in res.json()]
    assert "Activity Alpha" in titles
    assert "Activity Beta" in titles
