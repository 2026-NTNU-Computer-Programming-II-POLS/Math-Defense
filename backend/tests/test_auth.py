def _reg(email, password="xQ7!aPm2#vKz9", player_name=None):
    return {
        "email": email,
        "password": password,
        "player_name": player_name or email.split("@")[0],
    }


def test_register(client):
    # M-05: registration returns a fixed 202 acknowledgement with no identity
    # fields or auth cookies. A genuine sign-in requires POST /login.
    res = client.post("/api/auth/register", json=_reg("testuser@test.local"))
    assert res.status_code == 202
    body = res.json()
    assert "detail" in body
    assert body.keys() == {"detail"}
    assert "access_token" not in res.cookies
    assert "refresh_token" not in res.cookies


def test_register_duplicate_is_indistinguishable(client):
    # M-05 anti-enumeration: the new-user and existing-user responses must be
    # byte-identical so an attacker cannot probe which emails are registered.
    first = client.post("/api/auth/register", json=_reg("dupuser@test.local"))
    second = client.post("/api/auth/register", json=_reg("dupuser@test.local"))
    assert first.status_code == 202
    assert second.status_code == 202
    assert first.json() == second.json()
    assert "access_token" not in first.cookies
    assert "access_token" not in second.cookies


def test_login(client):
    client.post("/api/auth/register", json=_reg("loginuser@test.local"))
    res = client.post("/api/auth/login", json={"email": "loginuser@test.local", "password": "xQ7!aPm2#vKz9"})
    assert res.status_code == 200
    assert "email" in res.json()


def test_login_wrong_password(client):
    client.post("/api/auth/register", json=_reg("wpuser@test.local"))
    res = client.post("/api/auth/login", json={"email": "wpuser@test.local", "password": "wrong"})
    assert res.status_code == 401


def test_get_me(client):
    client.post("/api/auth/register", json=_reg("meuser@test.local"))
    # Register no longer auto-issues an access token — sign in to obtain one.
    login = client.post(
        "/api/auth/login",
        json={"email": "meuser@test.local", "password": "xQ7!aPm2#vKz9"},
    )
    token = login.cookies.get("access_token")
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["email"] == "meuser@test.local"
