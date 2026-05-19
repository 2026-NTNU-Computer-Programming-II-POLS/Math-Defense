"""Adaptive Star / Talent Recommender tests — Pedagogical_Backlog_Spec §28.5.

Splits into:
  * pure star-mapping tests over each posterior-range boundary (the rule
    is the contract — a future tweak must edit both the spec and this test);
  * aggregate tests that drive the service against an in-memory repository
    fake so the §28.4 acceptance criteria are exercised end-to-end without
    standing up the database;
  * an HTTP smoke test that confirms the route is wired and authenticated.
"""
from __future__ import annotations

import pytest

from app.application.recommender_service import (
    Recommendation,
    RecommenderApplicationService,
    _star_for_mean,
)
from app.domain.assessment import Beta, Competency, CompetencyState


class _FakeRepo:
    """In-memory ``CompetencyState`` repo for unit-level recommender tests.

    The recommender only reads, so a write-through fake is overkill — this
    just returns whatever the test seeded.
    """

    def __init__(self, state: CompetencyState | None = None) -> None:
        self._state = state

    def find_by_user(self, user_id: str) -> CompetencyState:
        return self._state if self._state is not None else CompetencyState.empty(user_id)


# ── Pure star-mapping rule ───────────────────────────────────────────────────

class TestStarMapping:
    """Spec §28.3 boundaries:
        < 0.30 → 1; < 0.50 → 2; < 0.70 → 3; < 0.85 → 4; ≥ 0.85 → 5
    """

    @pytest.mark.parametrize(
        "weighted_mean,expected_star",
        [
            (0.00, 1),
            (0.29999, 1),
            (0.30, 2),
            (0.49999, 2),
            (0.50, 3),
            (0.69999, 3),
            (0.70, 4),
            (0.84999, 4),
            (0.85, 5),
            (0.999, 5),
            (1.00, 5),
        ],
    )
    def test_each_band(self, weighted_mean, expected_star):
        assert _star_for_mean(weighted_mean) == expected_star

    def test_uniform_prior_lands_on_star_3(self):
        """§28.4 acceptance criterion — new user with mean 0.5 → Star 3."""
        assert _star_for_mean(0.5) == 3


# ── Service: posterior → recommendation ──────────────────────────────────────

class TestRecommenderService:
    def test_new_user_uniform_prior_gets_star_3(self):
        """§28.4: new user (uniform prior) sees Suggested: Star 3."""
        svc = RecommenderApplicationService(competency_repo=_FakeRepo())
        rec = svc.get_recommendation("u_new")
        assert isinstance(rec, Recommendation)
        assert rec.star == 3
        assert rec.weighted_mean == pytest.approx(0.5)

    def test_recommend_star_thin_wrapper(self):
        svc = RecommenderApplicationService(competency_repo=_FakeRepo())
        assert svc.recommend_star("u_new") == 3

    def test_low_limit_recommends_limit_root(self):
        """§28.4: player with low LIMIT competency sees the LIMIT-tower
        talent root highlighted."""
        # Push LIMIT well below the rest while leaving the others near the prior.
        rows = {c: Beta(5.0, 1.0) for c in Competency}
        rows[Competency.LIMIT] = Beta(1.0, 9.0)
        state = CompetencyState.from_rows("u_lim", rows)
        svc = RecommenderApplicationService(competency_repo=_FakeRepo(state))
        rec = svc.get_recommendation("u_lim")
        assert rec.lowest_competency == Competency.LIMIT
        assert rec.talent_node_id == "limit_damage"

    @pytest.mark.parametrize(
        "competency,expected_node",
        [
            (Competency.MAGIC, "magic_zone_strength"),
            (Competency.RADAR, "radar_a_range"),
            (Competency.MATRIX, "matrix_range"),
            (Competency.LIMIT, "limit_damage"),
            (Competency.CALCULUS, "calculus_pet_speed"),
            (Competency.CHAIN_RULE, "calculus_pet_speed"),
            (Competency.PROBABILITY, None),
        ],
    )
    def test_lowest_competency_maps_to_talent_root(self, competency, expected_node):
        rows = {c: Beta(5.0, 1.0) for c in Competency}
        rows[competency] = Beta(1.0, 9.0)
        state = CompetencyState.from_rows("u", rows)
        svc = RecommenderApplicationService(competency_repo=_FakeRepo(state))
        assert svc.recommend_talent_node("u") == expected_node

    def test_recommend_talent_node_thin_wrapper(self):
        rows = {c: Beta(1.0, 1.0) for c in Competency}
        rows[Competency.MATRIX] = Beta(1.0, 9.0)
        state = CompetencyState.from_rows("u", rows)
        svc = RecommenderApplicationService(competency_repo=_FakeRepo(state))
        assert svc.recommend_talent_node("u") == "matrix_range"

    def test_uniform_prior_breaks_lowest_tie_by_enum_order(self):
        """All means equal → MAGIC wins because it is first in the enum.
        Same tie-break rule as the teacher-dashboard suggestion (§9)."""
        svc = RecommenderApplicationService(competency_repo=_FakeRepo())
        rec = svc.get_recommendation("u_tie")
        assert rec.lowest_competency == Competency.MAGIC
        assert rec.talent_node_id == "magic_zone_strength"

    def test_high_competency_climbs_star_band(self):
        # Weight all competencies high enough to clear the 0.85 threshold.
        rows = {c: Beta(20.0, 1.0) for c in Competency}
        state = CompetencyState.from_rows("u_hi", rows)
        svc = RecommenderApplicationService(competency_repo=_FakeRepo(state))
        assert svc.recommend_star("u_hi") == 5


# ── HTTP smoke: route is wired and authenticated ─────────────────────────────

def _register_student(client, name):
    email = f"{name}@test.local"
    password = "xQ7!aPm2#vKz9"
    client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "player_name": name},
    )
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    return res.cookies.get("access_token")


class TestRecommendationRouter:
    def test_unauthenticated_returns_401(self, client):
        res = client.get("/api/recommendation/me")
        assert res.status_code == 401

    def test_new_user_gets_star_3(self, client):
        token = _register_student(client, "rec_new")
        res = client.get(
            "/api/recommendation/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["star"] == 3
        assert body["weighted_mean"] == pytest.approx(0.5)
        # Fresh user — every competency at the prior, MAGIC wins enum-order tie.
        assert body["lowest_competency"] == Competency.MAGIC.value
        assert body["talent_node_id"] == "magic_zone_strength"
