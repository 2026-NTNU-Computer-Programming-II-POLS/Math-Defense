"""Profile-initials avatar — backend defense tests.

Covers the three layers behind PUT /api/auth/profile/initials:
1. Pydantic schema validation (early 422)
2. User aggregate invariants (canonical validation — the paired-set rule)
3. Route integration (auth + per-user persistence round-trip via GET /me)

The avatar (letters + colour) moved from a single global localStorage key to
the user row so two accounts on the same browser can't see each other's choice.
The pairing invariant — both fields set or both cleared, never half-filled — is
enforced at all three layers; these tests pin each one.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.domain.user.constraints import PROFILE_INITIALS_MAX_LETTERS
from app.schemas.auth import ProfileInitialsUpdateRequest


def _make_user() -> User:
    return User(
        id="test-user-id",
        email="initials@test.local",
        player_name="initials",
        role=Role.STUDENT,
        password_hash="x" * 60,
    )


# ── Pydantic schema layer ────────────────────────────────────────────────────

class TestSchemaValidation:
    def test_valid_pair_strips_letters(self):
        req = ProfileInitialsUpdateRequest(letters="  ab ", color="#a1b2c3")
        assert req.letters == "ab"
        assert req.color == "#a1b2c3"

    def test_both_null_is_valid(self):
        req = ProfileInitialsUpdateRequest(letters=None, color=None)
        assert req.letters is None
        assert req.color is None

    def test_letters_too_long_rejected(self):
        with pytest.raises(ValidationError):
            ProfileInitialsUpdateRequest(letters="ABC", color="#a1b2c3")

    def test_letters_empty_after_strip_rejected(self):
        with pytest.raises(ValidationError):
            ProfileInitialsUpdateRequest(letters="   ", color="#a1b2c3")

    @pytest.mark.parametrize("bad", ["a1b2c3", "#a1b2c", "#a1b2c3z", "#a1b2cg", "#GGGGGG"])
    def test_bad_color_rejected(self, bad):
        with pytest.raises(ValidationError):
            ProfileInitialsUpdateRequest(letters="A", color=bad)

    def test_extra_field_forbidden(self):
        with pytest.raises(ValidationError):
            ProfileInitialsUpdateRequest(letters="A", color="#a1b2c3", extra=1)

    def test_missing_field_rejected(self):
        # Both fields are required (move-together contract); a payload omitting
        # one is rejected rather than defaulted.
        with pytest.raises(ValidationError):
            ProfileInitialsUpdateRequest(letters="A")


# ── User aggregate layer ─────────────────────────────────────────────────────

class TestAggregateInvariants:
    def test_set_then_clear(self):
        user = _make_user()
        user.update_profile_initials("AB", "#a1b2c3")
        assert user.profile_initials_letters == "AB"
        assert user.profile_initials_color == "#a1b2c3"
        user.update_profile_initials(None, None)
        assert user.profile_initials_letters is None
        assert user.profile_initials_color is None

    def test_letters_stripped_but_case_preserved(self):
        # Case-normalisation is the FE's job; the aggregate only strips.
        user = _make_user()
        user.update_profile_initials("  Cd  ", "#FFFFFF")
        assert user.profile_initials_letters == "Cd"

    @pytest.mark.parametrize("args", [("AB", None), (None, "#a1b2c3")])
    def test_half_filled_rejected(self, args):
        user = _make_user()
        with pytest.raises(ValueError, match="set or cleared together"):
            user.update_profile_initials(*args)

    def test_letters_too_long_rejected(self):
        user = _make_user()
        with pytest.raises(ValueError, match="characters"):
            user.update_profile_initials("A" * (PROFILE_INITIALS_MAX_LETTERS + 1), "#a1b2c3")

    def test_empty_letters_rejected(self):
        user = _make_user()
        with pytest.raises(ValueError):
            user.update_profile_initials("   ", "#a1b2c3")

    @pytest.mark.parametrize("bad", ["a1b2c3", "#a1b2c", "#a1b2c3z", "#a1b2cg"])
    def test_bad_color_rejected(self, bad):
        user = _make_user()
        with pytest.raises(ValueError, match="hex"):
            user.update_profile_initials("A", bad)


# ── Route integration ────────────────────────────────────────────────────────

_REG_PASSWORD = "xQ7!aPm2#vKz9"


def _login(client, email: str):
    client.post("/api/auth/register", json={
        "email": email, "password": _REG_PASSWORD, "player_name": email.split("@")[0],
    })
    login = client.post(
        "/api/auth/login",
        json={"email": email, "password": _REG_PASSWORD},
    )
    return login.cookies.get("access_token")


class TestRouteIntegration:
    def test_round_trip_persists_via_me(self, client):
        token = _login(client, "initials-rt@test.local")
        headers = {"Authorization": f"Bearer {token}"}
        res = client.put(
            "/api/auth/profile/initials",
            json={"letters": "AB", "color": "#a1b2c3"},
            headers=headers,
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["profile_initials_letters"] == "AB"
        assert body["profile_initials_color"] == "#a1b2c3"

        me = client.get("/api/auth/me", headers=headers).json()
        assert me["profile_initials_letters"] == "AB"
        assert me["profile_initials_color"] == "#a1b2c3"

    def test_clear_round_trip(self, client):
        token = _login(client, "initials-clear@test.local")
        headers = {"Authorization": f"Bearer {token}"}
        client.put(
            "/api/auth/profile/initials",
            json={"letters": "AB", "color": "#a1b2c3"},
            headers=headers,
        )
        res = client.put(
            "/api/auth/profile/initials",
            json={"letters": None, "color": None},
            headers=headers,
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["profile_initials_letters"] is None
        assert body["profile_initials_color"] is None

        me = client.get("/api/auth/me", headers=headers).json()
        assert me["profile_initials_letters"] is None

    def test_does_not_leak_between_accounts(self, client):
        # The core bug this feature fixes: two accounts on one browser must not
        # share the avatar. Each /me hydrates only the signed-in user's pair.
        token_a = _login(client, "initials-a@test.local")
        headers_a = {"Authorization": f"Bearer {token_a}"}
        client.put(
            "/api/auth/profile/initials",
            json={"letters": "AA", "color": "#a1b2c3"},
            headers=headers_a,
        )

        token_b = _login(client, "initials-b@test.local")
        headers_b = {"Authorization": f"Bearer {token_b}"}
        me_b = client.get("/api/auth/me", headers=headers_b).json()
        # B never set an avatar — must be empty, not A's choice.
        assert me_b["profile_initials_letters"] is None
        assert me_b["profile_initials_color"] is None

        # A is unchanged after B's session.
        me_a = client.get("/api/auth/me", headers=headers_a).json()
        assert me_a["profile_initials_letters"] == "AA"

    def test_half_filled_returns_422(self, client):
        token = _login(client, "initials-422a@test.local")
        headers = {"Authorization": f"Bearer {token}"}
        res = client.put(
            "/api/auth/profile/initials",
            json={"letters": "AB", "color": None},
            headers=headers,
        )
        assert res.status_code == 422

    def test_bad_color_returns_422(self, client):
        token = _login(client, "initials-422b@test.local")
        headers = {"Authorization": f"Bearer {token}"}
        res = client.put(
            "/api/auth/profile/initials",
            json={"letters": "AB", "color": "not-a-hex"},
            headers=headers,
        )
        assert res.status_code == 422

    def test_letters_too_long_returns_422(self, client):
        token = _login(client, "initials-422c@test.local")
        headers = {"Authorization": f"Bearer {token}"}
        res = client.put(
            "/api/auth/profile/initials",
            json={"letters": "ABC", "color": "#a1b2c3"},
            headers=headers,
        )
        assert res.status_code == 422

    def test_unauthenticated_rejected(self, client):
        res = client.put(
            "/api/auth/profile/initials",
            json={"letters": "AB", "color": "#a1b2c3"},
        )
        assert res.status_code in (401, 403)
