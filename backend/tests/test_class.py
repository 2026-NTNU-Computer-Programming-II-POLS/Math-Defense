"""Class subsystem integration tests — D-1."""
from __future__ import annotations

from datetime import datetime, timedelta, UTC

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
    _user, token = build_auth_service(db_session).register(
        email=f"{name}@test.local",
        password="secret123",
        player_name=name,
        role="teacher",
    )
    return token


def _register_admin(db_session, name):
    _user, token = build_auth_service(db_session).register(
        email=f"{name}@test.local",
        password="secret123",
        player_name=name,
        role="admin",
    )
    return token


def _create_class(client, token, name="Test Class"):
    return client.post("/api/classes", json={"name": name}, headers=_auth(token))


def _me(client, token):
    return client.get("/api/auth/me", headers=_auth(token)).json()


# ── Create ────────────────────────────────────────────────────────────────────

def test_teacher_creates_class(client, db_session):
    token = _register_teacher(db_session, "t_c1")
    res = _create_class(client, token)
    assert res.status_code == 201
    body = res.json()
    assert body["name"] == "Test Class"
    assert "join_code" in body


def test_student_cannot_create_class(client):
    token = _register_student(client, "s_nocreate")
    res = _create_class(client, token)
    assert res.status_code == 403


def test_duplicate_class_name_same_teacher_rejected(client, db_session):
    token = _register_teacher(db_session, "t_dupname")
    _create_class(client, token, "Dupe Class")
    res = _create_class(client, token, "Dupe Class")
    assert res.status_code == 409


# ── Cross-teacher access ──────────────────────────────────────────────────────

def test_other_teacher_cannot_view_class(client, db_session):
    t1 = _register_teacher(db_session, "t_view_own")
    t2 = _register_teacher(db_session, "t_view_other")
    class_id = _create_class(client, t1).json()["id"]
    assert client.get(f"/api/classes/{class_id}", headers=_auth(t2)).status_code == 403


def test_other_teacher_cannot_rename_class(client, db_session):
    t1 = _register_teacher(db_session, "t_rename_own")
    t2 = _register_teacher(db_session, "t_rename_other")
    class_id = _create_class(client, t1).json()["id"]
    res = client.put(f"/api/classes/{class_id}", json={"name": "Hijacked"}, headers=_auth(t2))
    assert res.status_code == 403


def test_other_teacher_cannot_delete_class(client, db_session):
    t1 = _register_teacher(db_session, "t_del_own")
    t2 = _register_teacher(db_session, "t_del_other")
    class_id = _create_class(client, t1).json()["id"]
    assert client.delete(f"/api/classes/{class_id}", headers=_auth(t2)).status_code == 403


def test_other_teacher_cannot_add_student_to_class(client, db_session):
    t1 = _register_teacher(db_session, "t_addstu_own")
    t2 = _register_teacher(db_session, "t_addstu_other")
    class_id = _create_class(client, t1).json()["id"]
    res = client.post(
        f"/api/classes/{class_id}/students",
        json={"email": "nobody@test.local"},
        headers=_auth(t2),
    )
    assert res.status_code == 403


# ── Join by code ──────────────────────────────────────────────────────────────

def test_student_joins_by_valid_code(client, db_session):
    teacher_token = _register_teacher(db_session, "t_join")
    student_token = _register_student(client, "s_join")
    join_code = _create_class(client, teacher_token).json()["join_code"]
    res = client.post("/api/classes/join", json={"code": join_code}, headers=_auth(student_token))
    assert res.status_code == 201


def test_student_joins_same_class_twice_conflicts(client, db_session):
    teacher_token = _register_teacher(db_session, "t_join2")
    student_token = _register_student(client, "s_join2")
    join_code = _create_class(client, teacher_token).json()["join_code"]
    client.post("/api/classes/join", json={"code": join_code}, headers=_auth(student_token))
    res = client.post("/api/classes/join", json={"code": join_code}, headers=_auth(student_token))
    assert res.status_code == 409


def test_invalid_join_code_returns_404(client):
    student_token = _register_student(client, "s_badjoin")
    res = client.post("/api/classes/join", json={"code": "XXXXXXXX"}, headers=_auth(student_token))
    assert res.status_code == 404


def test_teacher_cannot_join_class_by_code(client, db_session):
    t1 = _register_teacher(db_session, "t_jointeacher1")
    t2 = _register_teacher(db_session, "t_jointeacher2")
    join_code = _create_class(client, t1).json()["join_code"]
    res = client.post("/api/classes/join", json={"code": join_code}, headers=_auth(t2))
    assert res.status_code == 403


# ── Direct student add ────────────────────────────────────────────────────────

def test_add_nonexistent_student_email_returns_404(client, db_session):
    teacher_token = _register_teacher(db_session, "t_addnone")
    class_id = _create_class(client, teacher_token).json()["id"]
    res = client.post(
        f"/api/classes/{class_id}/students",
        json={"email": "ghost@nowhere.test"},
        headers=_auth(teacher_token),
    )
    assert res.status_code == 404


def test_add_teacher_as_student_returns_400(client, db_session):
    t1 = _register_teacher(db_session, "t_addteacher1")
    t2_email = "t_addteacher2@test.local"
    build_auth_service(db_session).register(
        email=t2_email, password="secret123", player_name="t_addteacher2", role="teacher",
    )
    class_id = _create_class(client, t1).json()["id"]
    res = client.post(
        f"/api/classes/{class_id}/students",
        json={"email": t2_email},
        headers=_auth(t1),
    )
    assert res.status_code == 400


# ── Listings ──────────────────────────────────────────────────────────────────

def test_admin_sees_all_classes(client, db_session):
    t1 = _register_teacher(db_session, "t_list_a")
    t2 = _register_teacher(db_session, "t_list_b")
    admin = _register_admin(db_session, "a_list")
    _create_class(client, t1, "Alpha Class")
    _create_class(client, t2, "Beta Class")
    res = client.get("/api/classes", headers=_auth(admin))
    assert res.status_code == 200
    names = {c["name"] for c in res.json()}
    assert "Alpha Class" in names
    assert "Beta Class" in names


def test_student_only_sees_enrolled_classes(client, db_session):
    t1 = _register_teacher(db_session, "t_scope1")
    t2 = _register_teacher(db_session, "t_scope2")
    student_token = _register_student(client, "s_scope")
    c1 = _create_class(client, t1, "Enrolled Class")
    c2 = _create_class(client, t2, "Other Class")
    client.post("/api/classes/join", json={"code": c1.json()["join_code"]}, headers=_auth(student_token))
    res = client.get("/api/classes", headers=_auth(student_token))
    assert res.status_code == 200
    ids = {c["id"] for c in res.json()}
    assert c1.json()["id"] in ids
    assert c2.json()["id"] not in ids


def test_student_response_omits_join_code(client, db_session):
    teacher_token = _register_teacher(db_session, "t_joincode_hide")
    student_token = _register_student(client, "s_joincode_hide")
    join_code = _create_class(client, teacher_token).json()["join_code"]
    client.post("/api/classes/join", json={"code": join_code}, headers=_auth(student_token))
    res = client.get("/api/classes", headers=_auth(student_token))
    for entry in res.json():
        assert "join_code" not in entry


# ── Regenerate code ───────────────────────────────────────────────────────────

def test_regenerate_code_invalidates_old_code(client, db_session):
    teacher_token = _register_teacher(db_session, "t_regen")
    s1 = _register_student(client, "s_regen1")
    s2 = _register_student(client, "s_regen2")
    class_res = _create_class(client, teacher_token)
    class_id = class_res.json()["id"]
    old_code = class_res.json()["join_code"]

    regen_res = client.post(f"/api/classes/{class_id}/regenerate-code", headers=_auth(teacher_token))
    assert regen_res.status_code == 200
    new_code = regen_res.json()["join_code"]
    assert new_code != old_code

    assert client.post("/api/classes/join", json={"code": old_code}, headers=_auth(s1)).status_code == 404
    assert client.post("/api/classes/join", json={"code": new_code}, headers=_auth(s2)).status_code == 201


# ── Cascade on membership removal ─────────────────────────────────────────────

def test_remove_student_cascades_territory_occupations(client, db_session):
    teacher_token = _register_teacher(db_session, "t_rmcascade")
    student_token = _register_student(client, "s_rmcascade")

    class_res = _create_class(client, teacher_token, "Cascade Class")
    class_id = class_res.json()["id"]
    client.post("/api/classes/join", json={"code": class_res.json()["join_code"]}, headers=_auth(student_token))
    student_id = _me(client, student_token)["id"]

    deadline = (datetime.now(UTC) + timedelta(days=30)).isoformat()
    act_res = client.post(
        "/api/activities",
        json={"title": "Cascade Act", "deadline": deadline, "class_id": class_id, "slots": [{"star_rating": 1}]},
        headers=_auth(teacher_token),
    )
    assert act_res.status_code == 201
    activity_id = act_res.json()["id"]
    slot_id = client.get(f"/api/activities/{activity_id}", headers=_auth(teacher_token)).json()["slots"][0]["id"]

    sid = client.post("/api/sessions", json={"star_rating": 1}, headers=_auth(student_token)).json()["id"]
    client.post(f"/api/sessions/{sid}/end", json={"score": 500, "kills": 10, "waves_survived": 2, "total_score": 500.0}, headers=_auth(student_token))
    play_res = client.post(f"/api/activities/{activity_id}/slots/{slot_id}/play", json={"session_id": sid}, headers=_auth(student_token))
    assert play_res.json()["seized"] is True

    assert client.delete(f"/api/classes/{class_id}/students/{student_id}", headers=_auth(teacher_token)).status_code == 204

    detail = client.get(f"/api/activities/{activity_id}", headers=_auth(teacher_token)).json()
    assert detail["slots"][0]["occupation"] is None


# ── Delete class ──────────────────────────────────────────────────────────────

def test_delete_class_removes_it_from_teacher_list(client, db_session):
    teacher_token = _register_teacher(db_session, "t_delete")
    class_id = _create_class(client, teacher_token, "Doomed Class").json()["id"]

    assert client.delete(f"/api/classes/{class_id}", headers=_auth(teacher_token)).status_code == 204

    ids = {c["id"] for c in client.get("/api/classes", headers=_auth(teacher_token)).json()}
    assert class_id not in ids


def test_delete_class_removes_student_membership(client, db_session):
    teacher_token = _register_teacher(db_session, "t_delmem")
    student_token = _register_student(client, "s_delmem")

    class_res = _create_class(client, teacher_token, "Temp Class")
    class_id = class_res.json()["id"]
    client.post("/api/classes/join", json={"code": class_res.json()["join_code"]}, headers=_auth(student_token))

    before = {c["id"] for c in client.get("/api/classes", headers=_auth(student_token)).json()}
    assert class_id in before

    client.delete(f"/api/classes/{class_id}", headers=_auth(teacher_token))

    after = {c["id"] for c in client.get("/api/classes", headers=_auth(student_token)).json()}
    assert class_id not in after


# ── Concurrent join ───────────────────────────────────────────────────────────

def test_concurrent_join_exactly_one_succeeds(client, db_session):
    """Same student submits the join-code from two threads at the same instant.

    The unique constraint on (class_id, student_id) guarantees exactly one
    INSERT succeeds; the other must receive 409. We use a threading.Barrier
    to synchronise both threads so the race is as tight as possible.

    The client fixture is thread-safe at the HTTP layer: FastAPI's
    TestClient uses httpx under the hood and each call is independent.
    We share one client instance intentionally — the test DB connection
    is held by the fixture and the two threads each open their own
    SQLAlchemy session through `override_get_db`, so there is no
    connection-level sharing.
    """
    import threading

    teacher_token = _register_teacher(db_session, "t_concurrent")
    join_code = _create_class(client, teacher_token, "Concurrent Class").json()["join_code"]

    # Register ONE student — both threads will race to join as the same student
    student_token = _register_student(client, "s_concurrent")

    results: list[int] = []
    barrier = threading.Barrier(2)

    def join() -> None:
        barrier.wait()  # both threads reach here before either proceeds
        res = client.post(
            "/api/classes/join",
            json={"code": join_code},
            headers=_auth(student_token),
        )
        results.append(res.status_code)

    t1 = threading.Thread(target=join)
    t2 = threading.Thread(target=join)
    t1.start()
    t2.start()
    t1.join(timeout=10)
    t2.join(timeout=10)

    assert len(results) == 2, "Both threads must complete"
    assert sorted(results) == [201, 409], (
        f"Expected exactly one 201 and one 409, got {results}"
    )
