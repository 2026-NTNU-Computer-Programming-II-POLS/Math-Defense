"""Smoke tests for the Tier-C class management surface — archive, transfer,
bulk add, pending invites, co-teachers, groups, leaderboard, and QR.

These do not exhaustively cover edge cases; the goal is to wire the new
endpoints end-to-end so a regression on the happy path fails loudly.
"""
from __future__ import annotations

from tests.conftest import register_test_user


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _register_student(client, name):
    email = f"{name}@test.local"
    password = "xQ7!aPm2#vKz9"
    client.post("/api/auth/register", json={
        "email": email,
        "password": password,
        "player_name": name,
    })
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    return res.cookies.get("access_token"), email


def _register_teacher(db_session, name):
    _u, token, _r = register_test_user(
        db_session,
        email=f"{name}@test.local",
        password="xQ7!aPm2#vKz9",
        player_name=name,
        role="teacher",
    )
    return _u, token


def _create_class(client, token, name="C"):
    return client.post("/api/classes", json={"name": name}, headers=_auth(token))


# ── B1 / schema: rejects 6-char codes ──────────────────────────────────────────


def test_six_char_join_code_rejected_by_schema(client):
    student_token, _ = _register_student(client, "s_six")
    res = client.post("/api/classes/join", json={"code": "ABCDEF"}, headers=_auth(student_token))
    # 422 from Pydantic — code length must be 8
    assert res.status_code == 422


# ── M1 + O8 / archive ──────────────────────────────────────────────────────────


def test_archive_blocks_new_joins(client, db_session):
    _t, teacher_token = _register_teacher(db_session, "t_archive")
    student_token, _ = _register_student(client, "s_archive")
    res = _create_class(client, teacher_token, "Arch")
    class_id = res.json()["id"]
    code = res.json()["join_code"]

    arch = client.post(f"/api/classes/{class_id}/archive", headers=_auth(teacher_token))
    assert arch.status_code == 200
    assert arch.json()["archived_at"] is not None

    # New join attempt with the archived class's code must 404 (we mask
    # archived classes behind InvalidJoinCode so probing can't enumerate them).
    res = client.post("/api/classes/join", json={"code": code}, headers=_auth(student_token))
    assert res.status_code == 404


def test_unarchive_restores_joins(client, db_session):
    _t, teacher_token = _register_teacher(db_session, "t_unar")
    student_token, _ = _register_student(client, "s_unar")
    res = _create_class(client, teacher_token, "Unar")
    class_id = res.json()["id"]
    code = res.json()["join_code"]
    client.post(f"/api/classes/{class_id}/archive", headers=_auth(teacher_token))
    client.post(f"/api/classes/{class_id}/unarchive", headers=_auth(teacher_token))
    res = client.post("/api/classes/join", json={"code": code}, headers=_auth(student_token))
    assert res.status_code == 201


# ── B3 / transfer ─────────────────────────────────────────────────────────────


def test_transfer_class_to_another_teacher(client, db_session):
    t1, t1_token = _register_teacher(db_session, "t_tx_from")
    t2, t2_token = _register_teacher(db_session, "t_tx_to")
    class_id = _create_class(client, t1_token, "TX").json()["id"]
    res = client.post(
        f"/api/classes/{class_id}/transfer",
        json={"new_teacher_id": t2.id},
        headers=_auth(t1_token),
    )
    assert res.status_code == 200
    assert res.json()["teacher_id"] == t2.id
    # The new teacher can now see the class
    res = client.get("/api/classes", headers=_auth(t2_token))
    assert any(c["id"] == class_id for c in res.json())
    # The previous owner cannot rename it any more
    res = client.put(
        f"/api/classes/{class_id}", json={"name": "Re-Hijack"}, headers=_auth(t1_token),
    )
    assert res.status_code == 403


# ── M3 / bulk add + pending invites ────────────────────────────────────────────


def test_bulk_add_mixes_existing_and_pending(client, db_session):
    _t, teacher_token = _register_teacher(db_session, "t_bulk")
    existing_token, existing_email = _register_student(client, "s_bulk_existing")
    class_id = _create_class(client, teacher_token, "Bulk").json()["id"]

    res = client.post(
        f"/api/classes/{class_id}/students/bulk",
        json={"emails": [existing_email, "future@test.local"]},
        headers=_auth(teacher_token),
    )
    assert res.status_code == 200
    body = res.json()
    assert len(body["added"]) == 1
    assert body["added"][0]["email"] == existing_email
    assert len(body["invited"]) == 1
    assert body["invited"][0]["email"] == "future@test.local"


def test_pending_invite_auto_claimed_on_register(client, db_session):
    _t, teacher_token = _register_teacher(db_session, "t_inv")
    class_id = _create_class(client, teacher_token, "Inv").json()["id"]
    # Pre-invite an email that has no account yet.
    client.post(
        f"/api/classes/{class_id}/students/bulk",
        json={"emails": ["incoming@test.local"]},
        headers=_auth(teacher_token),
    )
    # Now the student registers — auto-claim should attach them.
    client.post("/api/auth/register", json={
        "email": "incoming@test.local",
        "password": "xQ7!aPm2#vKz9",
        "player_name": "incoming",
    })
    res = client.post("/api/auth/login", json={
        "email": "incoming@test.local", "password": "xQ7!aPm2#vKz9",
    })
    student_token = res.cookies.get("access_token")
    res = client.get("/api/classes", headers=_auth(student_token))
    assert any(c["id"] == class_id for c in res.json())


# ── M2 / co-teachers ───────────────────────────────────────────────────────────


def test_co_teacher_can_see_class(client, db_session):
    t1, t1_token = _register_teacher(db_session, "t_co_owner")
    t2, t2_token = _register_teacher(db_session, "t_co_helper")
    class_id = _create_class(client, t1_token, "CoClass").json()["id"]
    res = client.post(
        f"/api/classes/{class_id}/co-teachers",
        json={"email": t2.email},
        headers=_auth(t1_token),
    )
    assert res.status_code == 201
    # The co-teacher now sees the class in their list.
    res = client.get("/api/classes", headers=_auth(t2_token))
    assert any(c["id"] == class_id for c in res.json())


def test_co_teacher_cannot_delete_class(client, db_session):
    t1, t1_token = _register_teacher(db_session, "t_co_own2")
    t2, t2_token = _register_teacher(db_session, "t_co_help2")
    class_id = _create_class(client, t1_token, "CoNoDel").json()["id"]
    client.post(
        f"/api/classes/{class_id}/co-teachers",
        json={"email": t2.email},
        headers=_auth(t1_token),
    )
    res = client.delete(f"/api/classes/{class_id}", headers=_auth(t2_token))
    assert res.status_code == 403


# ── M4 / groups + student move ─────────────────────────────────────────────────


def test_groups_crud_and_membership(client, db_session):
    _t, teacher_token = _register_teacher(db_session, "t_grp")
    student_token, _ = _register_student(client, "s_grp")
    res = _create_class(client, teacher_token, "GrpClass")
    class_id = res.json()["id"]
    code = res.json()["join_code"]
    client.post("/api/classes/join", json={"code": code}, headers=_auth(student_token))

    # Create group
    g = client.post(
        f"/api/classes/{class_id}/groups",
        json={"name": "Alpha", "color": "#abc"},
        headers=_auth(teacher_token),
    )
    assert g.status_code == 201
    group_id = g.json()["id"]

    # Get student id
    me = client.get("/api/auth/me", headers=_auth(student_token)).json()
    student_id = me["id"]

    # Add to group
    res = client.post(
        f"/api/classes/{class_id}/groups/{group_id}/members/{student_id}",
        headers=_auth(teacher_token),
    )
    assert res.status_code == 201

    # List confirms
    members = client.get(
        f"/api/classes/{class_id}/groups/{group_id}/members",
        headers=_auth(teacher_token),
    ).json()
    assert any(m["student_id"] == student_id for m in members)


def test_move_student_between_classes(client, db_session):
    _t, teacher_token = _register_teacher(db_session, "t_move")
    student_token, _ = _register_student(client, "s_move")
    src = _create_class(client, teacher_token, "Src").json()
    dst = _create_class(client, teacher_token, "Dst").json()
    client.post("/api/classes/join", json={"code": src["join_code"]}, headers=_auth(student_token))
    student_id = client.get("/api/auth/me", headers=_auth(student_token)).json()["id"]
    res = client.post(
        f"/api/classes/{src['id']}/students/{student_id}/move",
        json={"target_class_id": dst["id"]},
        headers=_auth(teacher_token),
    )
    assert res.status_code == 200
    # Student is now only in destination.
    res = client.get("/api/classes", headers=_auth(student_token))
    ids = {c["id"] for c in res.json()}
    assert dst["id"] in ids
    assert src["id"] not in ids


# ── M5 / leaderboard + report ──────────────────────────────────────────────────


def test_class_leaderboard_lists_members(client, db_session):
    _t, teacher_token = _register_teacher(db_session, "t_lb")
    student_token, _ = _register_student(client, "s_lb")
    res = _create_class(client, teacher_token, "LBClass")
    class_id = res.json()["id"]
    client.post("/api/classes/join", json={"code": res.json()["join_code"]}, headers=_auth(student_token))
    res = client.get(f"/api/classes/{class_id}/leaderboard", headers=_auth(teacher_token))
    assert res.status_code == 200
    assert len(res.json()) == 1


def test_class_report_csv_downloads(client, db_session):
    _t, teacher_token = _register_teacher(db_session, "t_rep")
    class_id = _create_class(client, teacher_token, "Rep").json()["id"]
    res = client.get(f"/api/classes/{class_id}/report.csv", headers=_auth(teacher_token))
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]
    assert "student_id" in res.text  # header row present


# ── M6 / QR endpoint ───────────────────────────────────────────────────────────


def test_qr_endpoint_returns_join_url(client, db_session):
    _t, teacher_token = _register_teacher(db_session, "t_qr")
    res = _create_class(client, teacher_token, "QRClass")
    class_id = res.json()["id"]
    code = res.json()["join_code"]
    res = client.get(f"/api/classes/{class_id}/qr", headers=_auth(teacher_token))
    assert res.status_code == 200
    body = res.json()
    assert body["code"] == code
    assert code in body["join_url"]
