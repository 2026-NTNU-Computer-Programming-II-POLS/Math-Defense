def _register_and_token(client, name="player1"):
    res = client.post("/api/auth/register", json={
        "email": f"{name}@test.local", "password": "xQ7!aPm2#vKz9",
        "player_name": name,
    })
    return res.cookies.get("access_token")


def _create_session(client, token, level=1):
    return client.post(
        "/api/sessions",
        json={"star_rating": level},
        headers={"Authorization": f"Bearer {token}"},
    )


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ── Create Session ──

def test_create_session(client):
    token = _register_and_token(client, "sess_create")
    res = _create_session(client, token)
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "active"
    assert data["star_rating"] == 1
    assert data["current_wave"] == 0
    assert data["score"] == 0


def test_create_session_invalid_level(client):
    token = _register_and_token(client, "sess_invalid_level")
    res = client.post(
        "/api/sessions",
        json={"star_rating": 6},
        headers=_auth_headers(token),
    )
    assert res.status_code == 422


def test_create_session_abandons_existing(client):
    token = _register_and_token(client, "sess_abandon")
    res1 = _create_session(client, token)
    session1_id = res1.json()["id"]

    res2 = _create_session(client, token, level=2)
    assert res2.status_code == 201
    assert res2.json()["id"] != session1_id


def test_create_session_requires_auth(client):
    res = client.post("/api/sessions", json={"star_rating": 1})
    assert res.status_code in (401, 403)


# ── Star-5 unlock gate (spec §5) ──

def test_create_session_star_5_locked(client):
    """A fresh user who has never cleared the Initial-Answer phase is forbidden
    from starting a Star-5 session. Backend returns 403 with the STAR_5_LOCKED
    detail so the frontend can render the unlock tooltip."""
    token = _register_and_token(client, "star5_locked")
    res = client.post(
        "/api/sessions",
        json={"star_rating": 5},
        headers=_auth_headers(token),
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "STAR_5_LOCKED"


def test_create_session_star_5_unlocked_after_correct_ia(client):
    """One IA-correct session at any star rating unlocks Star-5 for the user."""
    token = _register_and_token(client, "star5_unlock")
    # Trip the unlock at Star-1 with initial_answer=True.
    seed = client.post(
        "/api/sessions",
        json={"star_rating": 1, "initial_answer": True},
        headers=_auth_headers(token),
    )
    assert seed.status_code == 201
    # Star-5 now reachable; the prior active session is auto-abandoned by the
    # one-active-per-user rule, which is unrelated to the unlock check.
    res = client.post(
        "/api/sessions",
        json={"star_rating": 5},
        headers=_auth_headers(token),
    )
    assert res.status_code == 201
    assert res.json()["star_rating"] == 5


def test_create_session_star_5_locked_for_ia_incorrect_sessions(client):
    """A session created with initial_answer=False must not satisfy the gate."""
    token = _register_and_token(client, "star5_ia_wrong")
    s1 = client.post(
        "/api/sessions",
        json={"star_rating": 1, "initial_answer": False},
        headers=_auth_headers(token),
    )
    assert s1.status_code == 201
    res = client.post(
        "/api/sessions",
        json={"star_rating": 5},
        headers=_auth_headers(token),
    )
    assert res.status_code == 403
    assert res.json()["detail"] == "STAR_5_LOCKED"


def test_ia_rolling_accuracy_updates_correctly(client):
    """Rolling-10 IA accuracy on the User aggregate is recomputed at session
    end and surfaced via /api/auth/me. New players default to 0.0; after
    completed sessions the value reflects the fraction of the most-recent
    ≤10 sessions whose Initial-Answer phase was correct (spec §17)."""
    token = _register_and_token(client, "ia_rolling")
    headers = _auth_headers(token)

    before = client.get("/api/auth/me", headers=headers).json()
    assert before["ia_recent_accuracy"] == 0.0

    def _play(initial_answer: bool) -> None:
        create_res = client.post(
            "/api/sessions",
            json={"star_rating": 1, "initial_answer": initial_answer},
            headers=headers,
        )
        assert create_res.status_code == 201
        session_id = create_res.json()["id"]
        end_res = client.post(
            f"/api/sessions/{session_id}/end",
            json={"score": 1, "kills": 0, "waves_survived": 1},
            headers=headers,
        )
        assert end_res.status_code == 200

    # 1 correct out of 3 sessions → 1/3.
    _play(True)
    _play(False)
    _play(False)
    after_three = client.get("/api/auth/me", headers=headers).json()
    assert abs(after_three["ia_recent_accuracy"] - 1 / 3) < 1e-6

    # Bring the rolling window to 10 with mixed outcomes:
    # already played: T, F, F (3 sessions, 1 correct)
    # add 7 more: T, T, T, T, T, T, T → window has 8 T + 2 F → 0.8.
    for _ in range(7):
        _play(True)
    after_ten = client.get("/api/auth/me", headers=headers).json()
    assert abs(after_ten["ia_recent_accuracy"] - 0.8) < 1e-6

    # An 11th correct session evicts the oldest (T) and brings window to
    # 8 T + 2 F still → 0.8 unchanged. A 12th correct evicts the oldest F
    # and the window becomes 9 T + 1 F → 0.9.
    _play(True)
    eleven = client.get("/api/auth/me", headers=headers).json()
    assert abs(eleven["ia_recent_accuracy"] - 0.8) < 1e-6
    _play(True)
    twelve = client.get("/api/auth/me", headers=headers).json()
    assert abs(twelve["ia_recent_accuracy"] - 0.9) < 1e-6


def test_me_reports_ia_unlock_earned(client):
    """/api/auth/me derives ia_unlock_earned from session history so the
    frontend can render the disabled Star-5 button on first paint."""
    token = _register_and_token(client, "ia_me")
    headers = _auth_headers(token)

    before = client.get("/api/auth/me", headers=headers).json()
    assert before["ia_unlock_earned"] is False

    seed = client.post(
        "/api/sessions",
        json={"star_rating": 1, "initial_answer": True},
        headers=headers,
    )
    assert seed.status_code == 201

    after = client.get("/api/auth/me", headers=headers).json()
    assert after["ia_unlock_earned"] is True


# ── Update Session ──

def test_update_session(client):
    token = _register_and_token(client, "sess_update")
    session_id = _create_session(client, token).json()["id"]

    res = client.patch(
        f"/api/sessions/{session_id}",
        json={"current_wave": 3, "gold": 500, "hp": 80, "score": 1200},
        headers=_auth_headers(token),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["current_wave"] == 3
    assert data["gold"] == 500
    assert data["hp"] == 80
    assert data["score"] == 1200


def test_update_ended_session_returns_409(client):
    token = _register_and_token(client, "sess_update_ended")
    session_id = _create_session(client, token).json()["id"]

    # End it first
    client.post(
        f"/api/sessions/{session_id}/end",
        json={"score": 100, "kills": 5, "waves_survived": 2},
        headers=_auth_headers(token),
    )

    res = client.patch(
        f"/api/sessions/{session_id}",
        json={"gold": 999},
        headers=_auth_headers(token),
    )
    assert res.status_code == 409


def test_update_nonexistent_session(client):
    token = _register_and_token(client, "sess_update_404")
    res = client.patch(
        "/api/sessions/00000000-0000-0000-0000-000000000000",
        json={"gold": 100},
        headers=_auth_headers(token),
    )
    assert res.status_code == 404


# ── End Session ──

def test_end_session(client):
    token = _register_and_token(client, "sess_end")
    session_id = _create_session(client, token).json()["id"]

    res = client.post(
        f"/api/sessions/{session_id}/end",
        json={"score": 2500, "kills": 40, "waves_survived": 3},
        headers=_auth_headers(token),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "completed"
    assert data["score"] == 2500
    assert data["ended_at"] is not None


def test_end_session_twice_is_idempotent(client):
    """A retry after a successful end returns 200 with the stored completion state,
    so clients retrying on timeout don't have to special-case 409."""
    token = _register_and_token(client, "sess_end_twice")
    session_id = _create_session(client, token).json()["id"]

    first = client.post(
        f"/api/sessions/{session_id}/end",
        json={"score": 100, "kills": 5, "waves_survived": 2},
        headers=_auth_headers(token),
    )
    assert first.status_code == 200
    assert first.json()["score"] == 100

    retry = client.post(
        f"/api/sessions/{session_id}/end",
        json={"score": 200, "kills": 10, "waves_survived": 4},
        headers=_auth_headers(token),
    )
    assert retry.status_code == 200
    # The retry must surface the stored completion, not the retry payload —
    # otherwise a stale second client could rewrite a posted score.
    assert retry.json()["score"] == 100
    assert retry.json()["status"] == "completed"


def test_end_session_creates_leaderboard_entry(client):
    token = _register_and_token(client, "sess_leaderboard")
    session_id = _create_session(client, token).json()["id"]

    client.post(
        f"/api/sessions/{session_id}/end",
        json={"score": 3000, "kills": 18, "waves_survived": 3},
        headers=_auth_headers(token),
    )

    res = client.get("/api/leaderboard")
    entries = res.json()["entries"]
    scores = [e["score"] for e in entries]
    assert 3000 in scores


# ── Backlog §20: practice-mode (slider-fallback) ──


def test_create_session_practice_mode_flagged(client):
    """SessionCreate accepts practice_mode and SessionOut surfaces it so the
    HUD can render the badge."""
    token = _register_and_token(client, "practice_create")
    res = client.post(
        "/api/sessions",
        json={"star_rating": 1, "practice_mode": True},
        headers=_auth_headers(token),
    )
    assert res.status_code == 201
    body = res.json()
    assert body["practice_mode"] is True


def test_practice_mode_session_excluded_from_leaderboard(client):
    """Practice-mode runs must not produce a leaderboard entry, but the
    session itself completes normally."""
    token = _register_and_token(client, "practice_leaderboard")
    create_res = client.post(
        "/api/sessions",
        json={"star_rating": 1, "practice_mode": True},
        headers=_auth_headers(token),
    )
    session_id = create_res.json()["id"]
    end_res = client.post(
        f"/api/sessions/{session_id}/end",
        json={"score": 4242, "kills": 10, "waves_survived": 2},
        headers=_auth_headers(token),
    )
    assert end_res.status_code == 200
    assert end_res.json()["status"] == "completed"
    # Score 4242 must NOT be on the global leaderboard.
    board = client.get("/api/leaderboard").json()
    assert all(e["score"] != 4242 for e in board["entries"])


def test_normal_session_after_practice_still_lands_on_leaderboard(client):
    """A subsequent non-practice session for the same user is leaderboard-eligible.
    Guards against the practice flag bleeding into later runs via shared state."""
    token = _register_and_token(client, "practice_then_normal")
    headers = _auth_headers(token)

    # Practice run.
    p = client.post(
        "/api/sessions",
        json={"star_rating": 1, "practice_mode": True},
        headers=headers,
    ).json()
    client.post(
        f"/api/sessions/{p['id']}/end",
        json={"score": 1000, "kills": 5, "waves_survived": 2},
        headers=headers,
    )

    # Normal run — auto-abandons practice, lands on leaderboard.
    n = client.post(
        "/api/sessions",
        json={"star_rating": 1},
        headers=headers,
    ).json()
    assert n["practice_mode"] is False
    client.post(
        f"/api/sessions/{n['id']}/end",
        json={"score": 4500, "kills": 8, "waves_survived": 3},
        headers=headers,
    )
    board = client.get("/api/leaderboard").json()
    scores = [e["score"] for e in board["entries"]]
    assert 4500 in scores
    assert 1000 not in scores


# ── Cross-user isolation ──

def test_cannot_update_other_users_session(client):
    token1 = _register_and_token(client, "user_a")
    token2 = _register_and_token(client, "user_b")
    session_id = _create_session(client, token1).json()["id"]

    res = client.patch(
        f"/api/sessions/{session_id}",
        json={"gold": 9999},
        headers=_auth_headers(token2),
    )
    assert res.status_code == 404


# ── Reflection submission (Articulation Prompt, spec §2) ──

def _end_session(client, token, session_id, score=100, kills=5, waves=2):
    return client.post(
        f"/api/sessions/{session_id}/end",
        json={"score": score, "kills": kills, "waves_survived": waves},
        headers=_auth_headers(token),
    )


def test_post_reflection_on_completed_session(client):
    token = _register_and_token(client, "refl_ok")
    session_id = _create_session(client, token).json()["id"]
    _end_session(client, token, session_id)

    res = client.post(
        f"/api/sessions/{session_id}/reflection",
        json={"text": "Focused on chokepoints and saved gold for late towers."},
        headers=_auth_headers(token),
    )
    assert res.status_code == 200
    assert res.json()["status"] == "completed"


def test_post_reflection_404_on_unknown(client):
    token = _register_and_token(client, "refl_404")
    res = client.post(
        "/api/sessions/00000000-0000-0000-0000-000000000000/reflection",
        json={"text": "anything"},
        headers=_auth_headers(token),
    )
    assert res.status_code == 404


def test_post_reflection_403_on_other_user(client):
    """Cross-user access is blocked. The repo lookup is owner-scoped, so it
    surfaces as 404 rather than 403 — this matches the existing pattern in
    test_cannot_update_other_users_session and prevents leaking session ids."""
    owner = _register_and_token(client, "refl_owner")
    intruder = _register_and_token(client, "refl_intruder")
    session_id = _create_session(client, owner).json()["id"]
    _end_session(client, owner, session_id)

    res = client.post(
        f"/api/sessions/{session_id}/reflection",
        json={"text": "stolen"},
        headers=_auth_headers(intruder),
    )
    assert res.status_code == 404


def test_post_reflection_409_on_active_session(client):
    """Domain rule: reflections only valid after COMPLETED."""
    token = _register_and_token(client, "refl_active")
    session_id = _create_session(client, token).json()["id"]

    res = client.post(
        f"/api/sessions/{session_id}/reflection",
        json={"text": "too early"},
        headers=_auth_headers(token),
    )
    assert res.status_code == 409


def test_post_reflection_empty_text_allowed(client):
    """Empty submission is treated as a deliberate skip (spec §2.4)."""
    token = _register_and_token(client, "refl_empty")
    session_id = _create_session(client, token).json()["id"]
    _end_session(client, token, session_id)

    res = client.post(
        f"/api/sessions/{session_id}/reflection",
        json={"text": ""},
        headers=_auth_headers(token),
    )
    assert res.status_code == 200


def test_post_reflection_overwrites_previous(client):
    token = _register_and_token(client, "refl_overwrite")
    session_id = _create_session(client, token).json()["id"]
    _end_session(client, token, session_id)

    first = client.post(
        f"/api/sessions/{session_id}/reflection",
        json={"text": "first attempt"},
        headers=_auth_headers(token),
    )
    assert first.status_code == 200
    second = client.post(
        f"/api/sessions/{session_id}/reflection",
        json={"text": "revised reflection"},
        headers=_auth_headers(token),
    )
    assert second.status_code == 200


def test_post_reflection_too_long_returns_422(client):
    token = _register_and_token(client, "refl_long")
    session_id = _create_session(client, token).json()["id"]
    _end_session(client, token, session_id)

    res = client.post(
        f"/api/sessions/{session_id}/reflection",
        json={"text": "x" * 2001},
        headers=_auth_headers(token),
    )
    assert res.status_code == 422
