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
        "password": "xQ7!aPm2#vKz9",
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


def _create_activity(client, token, slots=None, title="Test Activity", class_id=None):
    if slots is None:
        slots = [{"star_rating": 1}]
    body = {"title": title, "deadline": _future_deadline(), "slots": slots}
    if class_id is not None:
        body["class_id"] = class_id
    return client.post(
        "/api/activities",
        json=body,
        headers=_auth(token),
    )


def _complete_session(client, token, level=1, score=500, kills=30, waves_survived=3):
    """Complete a game session and return the session ID.

    Passes ``total_score=score`` so that _validate_session's non-None guard
    is satisfied without requiring the full V2 scoring formula inputs.
    """
    sid = client.post(
        "/api/sessions",
        json={"star_rating": level},
        headers=_auth(token),
    ).json()["id"]
    client.post(
        f"/api/sessions/{sid}/end",
        json={
            "score": score,
            "kills": kills,
            "waves_survived": waves_survived,
            "total_score": float(score),
        },
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
    teacher1_token = _register_teacher(db_session, "t_settle_1")
    teacher2_token = _register_teacher(db_session, "t_settle_2")
    
    # Must be a class-scoped activity to be owned by teacher1
    from tests.test_class import _create_class
    cls_id = _create_class(client, teacher1_token, "T1 Class").json()["id"]
    
    act_id = _create_activity(client, teacher1_token, class_id=cls_id).json()["id"]

    res = client.post(f"/api/activities/{act_id}/settle", headers=_auth(teacher2_token))
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


# ── Inter-class scope (D-2) ───────────────────────────────────────────────────

def test_null_class_activity_visible_to_student_without_class(client, db_session):
    teacher_token = _register_teacher(db_session, "t_nullscope_nc")
    student_token = _register_student(client, "s_nullscope_nc")
    activity_id = _create_activity(client, teacher_token, title="Null Scope NC").json()["id"]
    res = client.get("/api/activities", headers=_auth(student_token))
    assert res.status_code == 200
    assert any(a["id"] == activity_id for a in res.json())


def test_null_class_activity_visible_to_student_in_class(client, db_session):
    teacher_token = _register_teacher(db_session, "t_nullscope_ic")
    student_token = _register_student(client, "s_nullscope_ic")
    join_code = client.post("/api/classes", json={"name": "NC IC"}, headers=_auth(teacher_token)).json()["join_code"]
    client.post("/api/classes/join", json={"code": join_code}, headers=_auth(student_token))
    activity_id = _create_activity(client, teacher_token, title="Null Scope IC").json()["id"]
    res = client.get("/api/activities", headers=_auth(student_token))
    assert any(a["id"] == activity_id for a in res.json())


def test_student_sees_null_class_activity_once_across_two_classes(client, db_session):
    t1_token = _register_teacher(db_session, "t_nc_once1")
    t2_token = _register_teacher(db_session, "t_nc_once2")
    student_token = _register_student(client, "s_nc_once")

    c1_code = client.post("/api/classes", json={"name": "NC Dup A"}, headers=_auth(t1_token)).json()["join_code"]
    c2_code = client.post("/api/classes", json={"name": "NC Dup B"}, headers=_auth(t2_token)).json()["join_code"]
    client.post("/api/classes/join", json={"code": c1_code}, headers=_auth(student_token))
    client.post("/api/classes/join", json={"code": c2_code}, headers=_auth(student_token))

    activity_id = _create_activity(client, t1_token, title="Shared Null Act").json()["id"]

    res = client.get("/api/activities", headers=_auth(student_token))
    ids = [a["id"] for a in res.json()]
    assert ids.count(activity_id) == 1


def test_teacher_a_cannot_create_activity_for_teacher_b_class(client, db_session):
    t1_token = _register_teacher(db_session, "t_scope_a")
    t2_token = _register_teacher(db_session, "t_scope_b")
    class_id = client.post("/api/classes", json={"name": "B Class"}, headers=_auth(t2_token)).json()["id"]
    res = client.post(
        "/api/activities",
        json={"title": "Intruder", "deadline": _future_deadline(), "class_id": class_id, "slots": [{"star_rating": 1}]},
        headers=_auth(t1_token),
    )
    assert res.status_code == 404


def test_play_territory_rejects_student_not_in_class(client, db_session):
    teacher_token = _register_teacher(db_session, "t_play_reject")
    student_token = _register_student(client, "s_play_reject")

    class_id = client.post("/api/classes", json={"name": "Private Class"}, headers=_auth(teacher_token)).json()["id"]
    act_res = client.post(
        "/api/activities",
        json={"title": "Private Act", "deadline": _future_deadline(), "class_id": class_id, "slots": [{"star_rating": 1}]},
        headers=_auth(teacher_token),
    )
    activity_id = act_res.json()["id"]
    slot_id = _slots_for(client, teacher_token, activity_id)[0]["id"]

    session_id = _complete_session(client, student_token, level=1, score=500)
    res = _play(client, student_token, activity_id, slot_id, session_id)
    assert res.status_code == 404


def test_play_after_deadline_rejected(client, db_session):
    from sqlalchemy import text
    teacher_token = _register_teacher(db_session, "t_play_deadline")
    student_token = _register_student(client, "s_play_deadline")

    activity_id = _create_activity(client, teacher_token, title="Deadline Test").json()["id"]
    slot_id = _slots_for(client, teacher_token, activity_id)[0]["id"]

    db_session.execute(
        text("UPDATE grabbing_territory_activities SET deadline = NOW() - INTERVAL '1 hour' WHERE id = :id"),
        {"id": activity_id},
    )
    db_session.commit()

    session_id = _complete_session(client, student_token, level=1, score=500)
    res = _play(client, student_token, activity_id, slot_id, session_id)
    assert res.status_code == 409


def test_score_tie_not_seized(client, db_session):
    teacher_token = _register_teacher(db_session, "t_tie")
    s1_token = _register_student(client, "s_tie1")
    s2_token = _register_student(client, "s_tie2")

    activity_id = _create_activity(client, teacher_token).json()["id"]
    slot_id = _slots_for(client, teacher_token, activity_id)[0]["id"]

    s1_session = _complete_session(client, s1_token, level=1, score=500)
    _play(client, s1_token, activity_id, slot_id, s1_session)

    s2_session = _complete_session(client, s2_token, level=1, score=500)
    res = _play(client, s2_token, activity_id, slot_id, s2_session)
    assert res.status_code == 200
    assert res.json()["seized"] is False


# ── Remaining D-2 gaps ────────────────────────────────────────────────────────

def test_settle_expired_idempotent_when_already_manually_settled(client, db_session):
    """settle_expired() must silently skip an activity that was already
    settled manually — i.e. the scheduler and the teacher both running at
    the same time must not raise or double-count.

    Approach: back-date the deadline so the activity is 'expired', then
    call the HTTP settle endpoint, then invoke settle_expired() via the
    application service directly and assert it returns 0 (nothing settled)
    and the activity remains settled=True.
    """
    from sqlalchemy import text
    from app.factories import build_territory_service

    teacher_token = _register_teacher(db_session, "t_settle_idem")

    activity_id = _create_activity(client, teacher_token, title="Idem Settle").json()["id"]

    # Back-date the deadline so settle_expired considers this activity expired
    db_session.execute(
        text(
            "UPDATE grabbing_territory_activities "
            "SET deadline = NOW() - INTERVAL '1 hour' WHERE id = :id"
        ),
        {"id": activity_id},
    )
    db_session.commit()

    # Teacher manually settles first
    res = client.post(f"/api/activities/{activity_id}/settle", headers=_auth(teacher_token))
    assert res.status_code == 204

    # Now run the scheduler settle — must return 0 and not raise
    svc = build_territory_service(db_session)
    settled_count = svc.settle_expired()
    assert settled_count == 0, (
        f"settle_expired should skip already-settled activity, got count={settled_count}"
    )


def test_session_reuse_after_counter_seize_rejected(client, db_session):
    """After s1's slot is counter-seized by s2, s1's old session_id must
    be recorded in territory_session_uses and therefore rejected if s1
    tries to play another slot with the same session.

    This is the regression test for bug B-C-2 (the fix uses a durable
    territory_session_uses table rather than the occupation row itself).
    """
    teacher_token = _register_teacher(db_session, "t_reuse_cs")
    s1_token = _register_student(client, "s_reuse_cs1")
    s2_token = _register_student(client, "s_reuse_cs2")

    # Two slots so s1 has a second target to replay against
    activity_id = _create_activity(
        client, teacher_token,
        slots=[{"star_rating": 1}, {"star_rating": 1}],
        title="Reuse CS",
    ).json()["id"]
    slots = _slots_for(client, teacher_token, activity_id)
    slot_a_id, slot_b_id = slots[0]["id"], slots[1]["id"]

    # s1 seizes slot A — session recorded in territory_session_uses
    s1_session = _complete_session(client, s1_token, level=1, score=500)
    seize = _play(client, s1_token, activity_id, slot_a_id, s1_session)
    assert seize.json()["seized"] is True

    # s2 counter-seizes slot A with a higher score
    s2_session = _complete_session(client, s2_token, level=1, score=1000)
    counter = _play(client, s2_token, activity_id, slot_a_id, s2_session)
    assert counter.json()["seized"] is True

    # s1 tries to replay the old session against slot B — must be rejected
    res = _play(client, s1_token, activity_id, slot_b_id, s1_session)
    assert res.status_code == 422, (
        "Session already used for territory; reuse after counter-seize must be rejected"
    )


def test_effective_occupation_count_at_cap_counter_seize(client, db_session):
    """Verify effective_occupation_count logic when a student is exactly at
    cap and an opponent counter-seizes one of their slots.

    Scenario:
    - s1 fills all CAP slots → effective count = CAP.
    - s2 counter-seizes slot[0] with a higher score → s1 now holds CAP-1.
    - s1 can still seize a brand-new empty slot (CAP-1 < CAP).
    - s1 cannot exceed CAP by holding the new slot AND re-seizing slot[0]
      in the same test (that would require yet another session).
    """
    teacher_token = _register_teacher(db_session, "t_eff_cap")
    s1_token = _register_student(client, "s_eff_cap1")
    s2_token = _register_student(client, "s_eff_cap2")

    # CAP + 1 slots: s1 will fill slots[0..CAP-1], then there is one spare
    slots_def = [{"star_rating": 1}] * (TERRITORY_CAP_PER_STUDENT + 1)
    activity_id = _create_activity(client, teacher_token, slots=slots_def).json()["id"]
    slots = _slots_for(client, teacher_token, activity_id)

    # s1 fills CAP slots (indices 0 … CAP-1)
    for i in range(TERRITORY_CAP_PER_STUDENT):
        sid = _complete_session(client, s1_token, level=1, score=500 + i)
        res = _play(client, s1_token, activity_id, slots[i]["id"], sid)
        assert res.json()["seized"] is True

    # At cap — s1 cannot seize the spare slot
    over_sid = _complete_session(client, s1_token, level=1, score=999)
    res_over = _play(client, s1_token, activity_id, slots[TERRITORY_CAP_PER_STUDENT]["id"], over_sid)
    assert res_over.status_code == 409, "s1 at cap cannot seize an additional slot"

    # s2 counter-seizes slot[0] — s1 drops to CAP-1 held slots
    s2_sid = _complete_session(client, s2_token, level=1, score=2_000)
    counter = _play(client, s2_token, activity_id, slots[0]["id"], s2_sid)
    assert counter.json()["seized"] is True

    # s1 now has CAP-1 slots; the spare slot (index CAP) must be seizable
    spare_sid = _complete_session(client, s1_token, level=1, score=600)
    res_spare = _play(client, s1_token, activity_id, slots[TERRITORY_CAP_PER_STUDENT]["id"], spare_sid)
    assert res_spare.json()["seized"] is True, (
        "After being displaced, s1 should be able to seize a new empty slot "
        "(effective count is now CAP-1)"
    )


def test_path_config_round_trip(client, db_session):
    """path_config stored on a slot must survive round-trip through the DB
    and be returned verbatim in GET /api/activities/{id}.

    Also validates: a non-dict path_config is rejected with 422 at the
    schema layer before anything reaches the application service.
    """
    teacher_token = _register_teacher(db_session, "t_pathcfg")

    path_cfg = {
        "enemy_types": ["goblin", "orc"],
        "map": "forest",
        "wave_count": 3,
        "bonus": {"multiplier": 1.5},
    }

    res = client.post(
        "/api/activities",
        json={
            "title": "Path Config Test",
            "deadline": _future_deadline(),
            "slots": [{"star_rating": 2, "path_config": path_cfg}],
        },
        headers=_auth(teacher_token),
    )
    assert res.status_code == 201
    activity_id = res.json()["id"]

    detail = client.get(f"/api/activities/{activity_id}", headers=_auth(teacher_token)).json()
    assert len(detail["slots"]) == 1
    returned_cfg = detail["slots"][0]["path_config"]
    assert returned_cfg == path_cfg, (
        f"path_config round-trip failed: stored {path_cfg!r}, got {returned_cfg!r}"
    )

    # Schema must reject a non-dict path_config (e.g. a raw string)
    bad_res = client.post(
        "/api/activities",
        json={
            "title": "Bad Path Config",
            "deadline": _future_deadline(),
            "slots": [{"star_rating": 1, "path_config": "not-a-dict"}],
        },
        headers=_auth(teacher_token),
    )
    assert bad_res.status_code == 422, (
        "Non-dict path_config must be rejected by the schema validator"
    )


def test_class_id_filter_does_not_leak_other_class_activities(client, db_session):
    """A student in class C1 must receive 404 (not a member) when they
    request GET /api/activities?class_id={c2_id}.

    This is the regression test for B-C-6 / C-17: the list_activities path
    previously returned activities of any class before checking membership.
    """
    t1_token = _register_teacher(db_session, "t_leak_c1")
    t2_token = _register_teacher(db_session, "t_leak_c2")
    student_token = _register_student(client, "s_leak")

    # Student joins only C1
    c1_code = client.post("/api/classes", json={"name": "Leak C1"}, headers=_auth(t1_token)).json()["join_code"]
    c2_id = client.post("/api/classes", json={"name": "Leak C2"}, headers=_auth(t2_token)).json()["id"]
    client.post("/api/classes/join", json={"code": c1_code}, headers=_auth(student_token))

    # Teacher 2 creates an activity scoped to C2
    _create_activity(client, t2_token, title="C2 Private Act")

    # Student must be denied C2's activity list
    res = client.get(f"/api/activities?class_id={c2_id}", headers=_auth(student_token))
    assert res.status_code == 404, (
        f"Student not in C2 must get 404 for ?class_id={c2_id}, got {res.status_code}"
    )


def test_settle_expired_path_locks_out_plays(client, db_session):
    """Activities settled through settle_expired() (the scheduler path) must
    reject subsequent play attempts with 409, just as manually-settled ones do.
    """
    from sqlalchemy import text
    from app.factories import build_territory_service

    teacher_token = _register_teacher(db_session, "t_exp_lock")
    student_token = _register_student(client, "s_exp_lock")

    activity_id = _create_activity(client, teacher_token, title="Exp Lock").json()["id"]
    slot_id = _slots_for(client, teacher_token, activity_id)[0]["id"]

    # Back-date deadline so settle_expired picks this up
    db_session.execute(
        text(
            "UPDATE grabbing_territory_activities "
            "SET deadline = NOW() - INTERVAL '1 hour' WHERE id = :id"
        ),
        {"id": activity_id},
    )
    db_session.commit()

    # Run scheduler settle
    svc = build_territory_service(db_session)
    settled_count = svc.settle_expired()
    assert settled_count == 1

    # Play must now be rejected
    session_id = _complete_session(client, student_token, level=1, score=500)
    res = _play(client, student_token, activity_id, slot_id, session_id)
    assert res.status_code == 409, (
        "Plays against an activity settled by the scheduler must return 409"
    )
