"""Talent integration tests — H-12 coverage.

Covers: empty tree for new user, allocate (success, insufficient points,
prerequisite not met, max level), reset tree, modifier computation, and
cross-user isolation.
"""
from app.domain.talent.definitions import TALENT_NODE_DEFS


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _register(client, name):
    email = f"{name}@test.local"
    password = "xQ7!aPm2#vKz9"
    client.post("/api/auth/register", json={
        "email": email,
        "password": password,
        "player_name": name,
    })
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    return res.cookies.get("access_token")


def _complete_session(client, token, level=1, score=500, kills=10, waves_survived=2):
    sid = client.post(
        "/api/sessions",
        json={"star_rating": level},
        headers=_auth(token),
    ).json()["id"]
    # B-BUG-8: end_session derives waves_survived from the persisted event log
    # rather than trusting the request body. Post the matching waveEnd events
    # so the server-derived count agrees with the request — otherwise
    # achievements that gate on session_waves >= 1 never unlock and no talent
    # points are earned. (Mirrors test_achievement.py's helper.)
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


def _available_points(client, token) -> int:
    tree = client.get("/api/talents", headers=_auth(token)).json()
    return tree["points_available"]


def _earn_points(client, token, target_points: int):
    """Complete sessions until the user has at least target_points available."""
    while _available_points(client, token) < target_points:
        _complete_session(client, token, level=1, score=2500, kills=35, waves_survived=3)


# ── Initial state ─────────────────────────────────────────────────────────────

def test_talent_tree_empty_for_new_user(client):
    token = _register(client, "tal_new")
    res = client.get("/api/talents", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()
    assert data["points_earned"] == 0
    assert data["points_spent"] == 0
    assert data["points_available"] == 0
    assert all(n["current_level"] == 0 for n in data["nodes"])


def test_talent_tree_lists_all_defined_nodes(client):
    token = _register(client, "tal_nodes")
    res = client.get("/api/talents", headers=_auth(token))
    assert res.status_code == 200
    node_ids = {n["id"] for n in res.json()["nodes"]}
    assert node_ids == set(TALENT_NODE_DEFS.keys())


def test_modifiers_empty_for_new_user(client):
    token = _register(client, "tal_mod_new")
    res = client.get("/api/talents/modifiers", headers=_auth(token))
    assert res.status_code == 200
    assert res.json()["modifiers"] == {}


def test_talent_requires_auth(client):
    res = client.get("/api/talents")
    assert res.status_code in (401, 403)


# ── Allocate point ────────────────────────────────────────────────────────────

def test_allocate_without_points_rejected(client):
    token = _register(client, "tal_no_pts")
    res = client.post("/api/talents/magic_zone_strength/allocate", headers=_auth(token))
    assert res.status_code == 409


def test_allocate_with_points_succeeds(client):
    token = _register(client, "tal_alloc_ok")
    _earn_points(client, token, 1)

    res = client.post("/api/talents/magic_zone_strength/allocate", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()
    node = next(n for n in data["nodes"] if n["id"] == "magic_zone_strength")
    assert node["current_level"] == 1
    assert data["points_spent"] == 1


def test_allocate_deducts_from_available(client):
    token = _register(client, "tal_deduct")
    _earn_points(client, token, 1)
    before = _available_points(client, token)

    client.post("/api/talents/magic_zone_strength/allocate", headers=_auth(token))

    after = _available_points(client, token)
    node_def = TALENT_NODE_DEFS["magic_zone_strength"]
    assert after == before - node_def.cost_per_level


def test_prerequisite_not_met_rejected(client):
    """magic_zone_width requires magic_zone_strength >= 1."""
    token = _register(client, "tal_prereq")
    _earn_points(client, token, 1)

    res = client.post("/api/talents/magic_zone_width/allocate", headers=_auth(token))
    assert res.status_code == 409


def test_allocate_after_prerequisite_met(client):
    token = _register(client, "tal_prereq_ok")
    _earn_points(client, token, 2)

    client.post("/api/talents/magic_zone_strength/allocate", headers=_auth(token))
    res = client.post("/api/talents/magic_zone_width/allocate", headers=_auth(token))
    assert res.status_code == 200
    node = next(n for n in res.json()["nodes"] if n["id"] == "magic_zone_width")
    assert node["current_level"] == 1


def test_max_level_rejected(client):
    """magic_zone_strength has max_level=3; a 4th allocate must be rejected."""
    token = _register(client, "tal_maxlvl")
    node_def = TALENT_NODE_DEFS["magic_zone_strength"]
    _earn_points(client, token, node_def.cost_per_level * (node_def.max_level + 1))

    for _ in range(node_def.max_level):
        client.post("/api/talents/magic_zone_strength/allocate", headers=_auth(token))

    res = client.post("/api/talents/magic_zone_strength/allocate", headers=_auth(token))
    assert res.status_code == 409


def test_unknown_node_rejected(client):
    token = _register(client, "tal_unknown")
    _earn_points(client, token, 1)
    res = client.post("/api/talents/nonexistent_node/allocate", headers=_auth(token))
    assert res.status_code == 409


# ── Modifiers ─────────────────────────────────────────────────────────────────

def test_modifier_reflects_allocated_node(client):
    token = _register(client, "tal_mod_alloc")
    _earn_points(client, token, 1)

    client.post("/api/talents/magic_zone_strength/allocate", headers=_auth(token))

    res = client.get("/api/talents/modifiers", headers=_auth(token))
    assert res.status_code == 200
    mods = res.json()["modifiers"]
    node_def = TALENT_NODE_DEFS["magic_zone_strength"]
    assert "magic" in mods
    assert "zone_strength" in mods["magic"]
    assert abs(mods["magic"]["zone_strength"] - node_def.effect_per_level) < 1e-9


def test_modifier_accumulates_across_levels(client):
    token = _register(client, "tal_mod_multi")
    node_def = TALENT_NODE_DEFS["magic_zone_strength"]
    _earn_points(client, token, node_def.cost_per_level * 2)

    client.post("/api/talents/magic_zone_strength/allocate", headers=_auth(token))
    client.post("/api/talents/magic_zone_strength/allocate", headers=_auth(token))

    mods = client.get("/api/talents/modifiers", headers=_auth(token)).json()["modifiers"]
    expected = node_def.effect_per_level * 2
    assert abs(mods["magic"]["zone_strength"] - expected) < 1e-9


# ── Reset tree ────────────────────────────────────────────────────────────────

def test_reset_clears_all_allocations(client):
    token = _register(client, "tal_reset")
    _earn_points(client, token, 1)
    client.post("/api/talents/magic_zone_strength/allocate", headers=_auth(token))

    res = client.post("/api/talents/reset", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()
    assert data["points_spent"] == 0
    assert all(n["current_level"] == 0 for n in data["nodes"])


def test_reset_restores_available_points(client):
    token = _register(client, "tal_reset_pts")
    _earn_points(client, token, 1)
    before = _available_points(client, token)
    client.post("/api/talents/magic_zone_strength/allocate", headers=_auth(token))

    client.post("/api/talents/reset", headers=_auth(token))
    after = _available_points(client, token)
    assert after == before


def test_reset_on_empty_tree_is_idempotent(client):
    token = _register(client, "tal_reset_empty")
    res = client.post("/api/talents/reset", headers=_auth(token))
    assert res.status_code == 200
    data = res.json()
    assert data["points_spent"] == 0


# ── Q10: calculus_pet_range replaces calculus_pet_hp ─────────────────────────


def test_calculus_pet_hp_is_removed_from_registry():
    """Phase 4 Q10: the old pet-HP talent must not appear in the definitions."""
    assert "calculus_pet_hp" not in TALENT_NODE_DEFS


def test_calculus_pet_range_definition_matches_spec():
    """pet_range: maxLevel=3, cost=1/lv, +20%/lv, prereq calculus_pet_speed."""
    node = TALENT_NODE_DEFS["calculus_pet_range"]
    assert node.attribute == "pet_range"
    assert node.max_level == 3
    assert node.cost_per_level == 1
    assert abs(node.effect_per_level - 0.20) < 1e-9
    assert node.prerequisites == ("calculus_pet_speed",)


def test_calculus_pet_range_requires_pet_speed_first(client):
    """Allocating pet_range without pet_speed must fail with 409."""
    token = _register(client, "tal_pet_range_prereq")
    _earn_points(client, token, 1)

    res = client.post("/api/talents/calculus_pet_range/allocate", headers=_auth(token))
    assert res.status_code == 409


def test_calculus_pet_range_allocates_after_prereq(client):
    token = _register(client, "tal_pet_range_ok")
    _earn_points(client, token, 2)

    client.post("/api/talents/calculus_pet_speed/allocate", headers=_auth(token))
    res = client.post("/api/talents/calculus_pet_range/allocate", headers=_auth(token))
    assert res.status_code == 200
    node = next(n for n in res.json()["nodes"] if n["id"] == "calculus_pet_range")
    assert node["current_level"] == 1


def test_calculus_pet_range_modifier_applied(client):
    token = _register(client, "tal_pet_range_mod")
    _earn_points(client, token, 2)

    client.post("/api/talents/calculus_pet_speed/allocate", headers=_auth(token))
    client.post("/api/talents/calculus_pet_range/allocate", headers=_auth(token))

    mods = client.get("/api/talents/modifiers", headers=_auth(token)).json()["modifiers"]
    assert "calculus" in mods
    assert abs(mods["calculus"]["pet_range"] - 0.20) < 1e-9


# ── Cross-user isolation ──────────────────────────────────────────────────────

def test_talent_allocation_isolated_between_users(client):
    token1 = _register(client, "tal_iso1")
    token2 = _register(client, "tal_iso2")
    _earn_points(client, token1, 1)

    client.post("/api/talents/magic_zone_strength/allocate", headers=_auth(token1))

    tree2 = client.get("/api/talents", headers=_auth(token2)).json()
    node2 = next(n for n in tree2["nodes"] if n["id"] == "magic_zone_strength")
    assert node2["current_level"] == 0
