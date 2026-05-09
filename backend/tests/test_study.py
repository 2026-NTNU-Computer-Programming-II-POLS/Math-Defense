"""Empirical Validity Probe tests (Pedagogical_Backlog_Spec.md §27)."""
from __future__ import annotations

import pytest

from app.domain.errors import DomainValueError
from app.domain.study import StudyGroup, assign_group, is_valid_study_id
from app.factories import build_auth_service


# ── Domain: deterministic group assignment ──────────────────────────────────


def test_group_assignment_is_deterministic():
    g1 = assign_group("user-abc", "study-2026Q2")
    g2 = assign_group("user-abc", "study-2026Q2")
    assert g1 is g2
    assert g1 in (StudyGroup.A, StudyGroup.B)


def test_group_assignment_uses_both_arms_across_users():
    """With many user_ids the two-arm bucket should split roughly 50/50.

    A weak property test: at N=200 the chance of all-A or all-B under a
    fair hash is < 2^-199. We just check both groups appear at least once.
    """
    seen = set()
    for i in range(200):
        seen.add(assign_group(f"u-{i}", "study"))
    assert seen == {StudyGroup.A, StudyGroup.B}


def test_group_assignment_independent_across_studies():
    """The same user can land in opposite groups for different studies.

    If we ever get the same group for both, it's coincidence; we need a
    user_id that disagrees across at least one (study1, study2) pair.
    """
    disagreements = 0
    for i in range(50):
        a = assign_group(f"u-{i}", "study-A")
        b = assign_group(f"u-{i}", "study-B")
        if a is not b:
            disagreements += 1
    assert disagreements > 0


def test_group_assignment_rejects_bad_inputs():
    with pytest.raises(DomainValueError):
        assign_group("", "study")
    with pytest.raises(DomainValueError):
        assign_group("user", "bad/study")
    with pytest.raises(DomainValueError):
        assign_group("user", "")


def test_is_valid_study_id():
    assert is_valid_study_id("study-1")
    assert is_valid_study_id("ABC_xyz_2026")
    assert not is_valid_study_id("a/b")
    assert not is_valid_study_id("")
    assert not is_valid_study_id("a" * 65)


# ── Router: probe + affect + export ──────────────────────────────────────────


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_student(client, name: str) -> str:
    res = client.post(
        "/api/auth/register",
        json={
            "email": f"{name}@test.local",
            "password": "xQ7!aPm2#vKz9",
            "player_name": name,
        },
    )
    return res.cookies.get("access_token")


def _register_admin(db_session, name: str) -> str:
    _u, token, _r = build_auth_service(db_session).register(
        email=f"{name}@test.local",
        password="xQ7!aPm2#vKz9",
        player_name=name,
        role="admin",
    )
    return token


def _register_student_via_service(db_session, name: str) -> str:
    """Register a student via the application service so no auth cookie is
    set on the TestClient. Necessary when a single test exercises multiple
    users — TestClient retains cookies across requests, and the auth
    middleware prefers the cookie over the Bearer header, so HTTP-based
    registration of two students would silently mis-attribute later
    requests."""
    _u, token, _r = build_auth_service(db_session).register(
        email=f"{name}@test.local",
        password="xQ7!aPm2#vKz9",
        player_name=name,
        role="student",
    )
    return token


def _ten_correct_responses(form: str) -> list[dict]:
    """Probe answer keys are stubbed to "A" for every item — see
    `app/domain/study/probe_keys.py`. A perfect-score submission therefore
    selects "A" 10 times."""
    return [{"item_id": f"{form}:{i}", "selected": "A"} for i in range(1, 11)]


def test_student_can_enroll(client):
    token = _register_student(client, "study_s1")
    res = client.post("/api/study/enroll?study_id=demo", headers=_auth(token))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["group"] in {"A", "B"}

    # Idempotent: second call returns the same group.
    res2 = client.post("/api/study/enroll?study_id=demo", headers=_auth(token))
    assert res2.status_code == 200
    assert res2.json()["group"] == body["group"]


def test_enroll_rejects_invalid_study_id(client):
    token = _register_student(client, "study_s_bad")
    res = client.post("/api/study/enroll?study_id=a/b", headers=_auth(token))
    assert res.status_code == 422


def test_student_submits_probe(client):
    token = _register_student(client, "study_s2")
    res = client.post(
        "/api/study/probe",
        json={
            "study_id": "demo",
            "form": "pre",
            "responses": _ten_correct_responses("pre"),
        },
        headers=_auth(token),
    )
    assert res.status_code == 200, res.text
    assert res.json() == {"score": 10, "total": 10}


def test_probe_double_submit_rejected(client):
    token = _register_student(client, "study_s3")
    payload = {
        "study_id": "demo",
        "form": "pre",
        "responses": _ten_correct_responses("pre"),
    }
    assert client.post("/api/study/probe", json=payload, headers=_auth(token)).status_code == 200
    res2 = client.post("/api/study/probe", json=payload, headers=_auth(token))
    assert res2.status_code == 422


def test_probe_rejects_wrong_item_count(client):
    token = _register_student(client, "study_s4")
    res = client.post(
        "/api/study/probe",
        json={
            "study_id": "demo",
            "form": "pre",
            "responses": _ten_correct_responses("pre")[:5],
        },
        headers=_auth(token),
    )
    assert res.status_code == 422


def test_student_submits_affect(client):
    token = _register_student(client, "study_s5")
    res = client.post(
        "/api/study/affect",
        json={
            "study_id": "demo",
            "phase": "pre",
            "anxiety_items": [3, 4, 2, 5, 3],
            "motivation_items": [4, 4, 3, 5, 4],
        },
        headers=_auth(token),
    )
    assert res.status_code == 204


def test_affect_rejects_out_of_range(client):
    token = _register_student(client, "study_s6")
    res = client.post(
        "/api/study/affect",
        json={
            "study_id": "demo",
            "phase": "pre",
            "anxiety_items": [3, 6],
            "motivation_items": [4],
        },
        headers=_auth(token),
    )
    assert res.status_code == 422


def test_export_requires_admin(client):
    student_token = _register_student(client, "study_export_student")
    res = client.get("/api/study/export?study_id=demo", headers=_auth(student_token))
    assert res.status_code == 403


def test_export_returns_csv_with_header_and_rows(client, db_session):
    # Two students enroll + submit; admin exports. Register via the service
    # (not HTTP) so neither student leaves a cookie on the TestClient that
    # would later override the Bearer header.
    s1 = _register_student_via_service(db_session, "study_e1")
    s2 = _register_student_via_service(db_session, "study_e2")
    for tok, form in [(s1, "pre"), (s1, "post"), (s2, "pre")]:
        client.post(
            "/api/study/probe",
            json={
                "study_id": "demo",
                "form": form,
                "responses": _ten_correct_responses(form),
            },
            headers=_auth(tok),
        )
    client.post(
        "/api/study/affect",
        json={
            "study_id": "demo",
            "phase": "pre",
            "anxiety_items": [2, 3],
            "motivation_items": [4, 5],
        },
        headers=_auth(s1),
    )
    admin_token = _register_admin(db_session, "study_admin")
    res = client.get("/api/study/export?study_id=demo", headers=_auth(admin_token))
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")

    body = res.text.strip().splitlines()
    assert body[0] == (
        "user_id,group,pre_score,post_score,delay_score,"
        "dosage_seconds,anxiety_pre,anxiety_post"
    )
    # One row per enrolled student.
    assert len(body) == 1 + 2

    # Both rows show pre_score=10 (correct submission); s1 also has post_score.
    cells = [r.split(",") for r in body[1:]]
    pre_scores = [c[2] for c in cells]
    assert set(pre_scores) == {"10"}
    post_scores = [c[3] for c in cells]
    assert "10" in post_scores  # at least one student took post
    # Group cell is "A" or "B".
    for c in cells:
        assert c[1] in {"A", "B"}
