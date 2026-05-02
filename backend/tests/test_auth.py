def _reg(email, password="secret123", player_name=None):
    return {
        "email": email,
        "password": password,
        "player_name": player_name or email.split("@")[0],
    }


def test_register(client):
    res = client.post("/api/auth/register", json=_reg("testuser@test.local"))
    assert res.status_code == 201
    data = res.json()
    assert data["email"] == "testuser@test.local"
    assert data["role"] == "student"


def test_register_duplicate(client):
    client.post("/api/auth/register", json=_reg("dupuser@test.local"))
    res = client.post("/api/auth/register", json=_reg("dupuser@test.local"))
    assert res.status_code == 422


def test_login(client):
    client.post("/api/auth/register", json=_reg("loginuser@test.local"))
    res = client.post("/api/auth/login", json={"email": "loginuser@test.local", "password": "secret123"})
    assert res.status_code == 200
    assert "email" in res.json()


def test_login_wrong_password(client):
    client.post("/api/auth/register", json=_reg("wpuser@test.local"))
    res = client.post("/api/auth/login", json={"email": "wpuser@test.local", "password": "wrong"})
    assert res.status_code == 401


def test_get_me(client):
    reg = client.post("/api/auth/register", json=_reg("meuser@test.local"))
    token = reg.cookies.get("access_token")
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["email"] == "meuser@test.local"
