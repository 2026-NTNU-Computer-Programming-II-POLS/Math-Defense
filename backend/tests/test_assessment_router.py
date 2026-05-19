"""Assessment router tests — Pedagogical_Backlog_Spec.md §9.5.

Auth matrix and the deterministic suggestion mapping. The pure-domain
suggestion table is exercised with closed-form Beta values directly so a
regression in the rule shows up here without HTTP plumbing.
"""
from __future__ import annotations

import pytest

from app.domain.assessment import (
    Beta,
    Competency,
    SUGGESTION_TABLE,
    lowest_competency,
    suggestion_for,
)
from app.factories import build_assessment_service
from tests.conftest import register_test_user


# ── HTTP test helpers ────────────────────────────────────────────────────────

def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _register_student(client, name):
    email = f"{name}@test.local"
    password = "xQ7!aPm2#vKz9"
    client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "player_name": name},
    )
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    return res.cookies.get("access_token")


def _register_teacher(db_session, name):
    _u, token, _r = register_test_user(
        db_session,
        email=f"{name}@test.local",
        password="xQ7!aPm2#vKz9",
        player_name=name,
        role="teacher",
    )
    return token


def _create_class(client, token, name="Class A"):
    return client.post("/api/classes", json={"name": name}, headers=_auth(token))


def _join(client, student_token, code):
    return client.post(
        "/api/classes/join", json={"code": code}, headers=_auth(student_token)
    )


# ── Pure-domain: suggestion mapping is deterministic ─────────────────────────

class TestSuggestionMapping:
    def test_table_covers_every_competency(self):
        assert set(SUGGESTION_TABLE.keys()) == set(Competency)

    def test_lowest_means_drives_suggestion(self):
        # LIMIT well below the rest → expect the LIMIT suggestion.
        posteriors = {c: Beta(5.0, 1.0) for c in Competency}
        posteriors[Competency.LIMIT] = Beta(1.0, 5.0)
        lowest, text = suggestion_for(posteriors)
        assert lowest == Competency.LIMIT
        assert text == SUGGESTION_TABLE[Competency.LIMIT]

    def test_uniform_prior_breaks_tie_by_enum_order(self):
        """All means equal → first competency in declaration order wins.
        MAGIC is first, so a fresh roster always gets the MAGIC suggestion."""
        posteriors = {c: Beta(1.0, 1.0) for c in Competency}
        assert lowest_competency(posteriors) == Competency.MAGIC

    @pytest.mark.parametrize("comp", list(Competency))
    def test_each_competency_maps_when_lowest(self, comp):
        posteriors = {c: Beta(5.0, 1.0) for c in Competency}
        posteriors[comp] = Beta(1.0, 9.0)
        lowest, text = suggestion_for(posteriors)
        assert lowest == comp
        assert text == SUGGESTION_TABLE[comp]


# ── HTTP: auth matrix ────────────────────────────────────────────────────────

def _post_evidence_for_student(db_session, student_id, event_id, success=True):
    """Drive one evidence event into the student's competency state via the
    application service so the dashboard has something to surface."""
    build_assessment_service(db_session).record_event(student_id, event_id, success)


def _student_id_from_token(client, token):
    return client.get("/api/auth/me", headers=_auth(token)).json()["id"]


class TestAssessmentRouterAuth:
    def test_student_gets_403(self, client, db_session):
        teacher_token = _register_teacher(db_session, "t_assess_a")
        class_id = _create_class(client, teacher_token).json()["id"]
        student_token = _register_student(client, "s_assess_a")
        res = client.get(
            f"/api/assessment/class/{class_id}/posteriors",
            headers=_auth(student_token),
        )
        assert res.status_code == 403

    def test_teacher_of_class_gets_200(self, client, db_session):
        teacher_token = _register_teacher(db_session, "t_assess_b")
        create_res = _create_class(client, teacher_token, "B")
        class_id = create_res.json()["id"]
        join_code = create_res.json()["join_code"]

        student_token = _register_student(client, "s_assess_b")
        _join(client, student_token, join_code)

        res = client.get(
            f"/api/assessment/class/{class_id}/posteriors",
            headers=_auth(teacher_token),
        )
        assert res.status_code == 200
        body = res.json()
        assert body["class_id"] == class_id
        assert len(body["students"]) == 1
        row = body["students"][0]
        assert row["student_name"] == "s_assess_b"
        assert set(row["posteriors"].keys()) == {c.value for c in Competency}
        # Uniform prior across the board → MAGIC wins on enum order.
        assert row["lowest_competency"] == Competency.MAGIC.value
        assert row["suggestion"] == SUGGESTION_TABLE[Competency.MAGIC]

    def test_other_teacher_gets_403(self, client, db_session):
        owner = _register_teacher(db_session, "t_assess_owner")
        intruder = _register_teacher(db_session, "t_assess_intruder")
        class_id = _create_class(client, owner, "Owned").json()["id"]
        res = client.get(
            f"/api/assessment/class/{class_id}/posteriors",
            headers=_auth(intruder),
        )
        assert res.status_code == 403

    def test_class_not_found(self, client, db_session):
        teacher_token = _register_teacher(db_session, "t_assess_404")
        res = client.get(
            "/api/assessment/class/does-not-exist/posteriors",
            headers=_auth(teacher_token),
        )
        assert res.status_code == 404

    def test_suggestion_reflects_recorded_evidence(self, client, db_session):
        """Drive a stream of LIMIT-failure events into one student so LIMIT
        becomes the lowest competency, then assert the dashboard suggestion
        matches §9.3."""
        teacher_token = _register_teacher(db_session, "t_assess_evi")
        create = _create_class(client, teacher_token, "Evidence")
        class_id = create.json()["id"]
        join_code = create.json()["join_code"]

        student_token = _register_student(client, "s_assess_evi")
        _join(client, student_token, join_code)
        student_id = _student_id_from_token(client, student_token)

        # Five LIMIT failures pushes mean(LIMIT) well below 0.5; every other
        # competency stays at the uniform prior 0.5.
        for _ in range(5):
            _post_evidence_for_student(
                db_session, student_id, "limit_correct", success=False
            )
        db_session.commit()

        res = client.get(
            f"/api/assessment/class/{class_id}/posteriors",
            headers=_auth(teacher_token),
        )
        assert res.status_code == 200
        row = res.json()["students"][0]
        assert row["lowest_competency"] == Competency.LIMIT.value
        assert row["suggestion"] == SUGGESTION_TABLE[Competency.LIMIT]
        assert row["posteriors"][Competency.LIMIT.value]["mean"] < 0.5
