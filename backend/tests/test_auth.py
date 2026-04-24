def test_register(client):
    res = client.post("/api/auth/register", json={"username": "testuser", "password": "secret123"})
    assert res.status_code == 201
    data = res.json()
    assert "username" in data
    assert data["username"] == "testuser"


def test_register_duplicate(client):
    client.post("/api/auth/register", json={"username": "dupuser", "password": "secret123"})
    res = client.post("/api/auth/register", json={"username": "dupuser", "password": "secret123"})
    assert res.status_code == 409


def test_login(client):
    client.post("/api/auth/register", json={"username": "loginuser", "password": "secret123"})
    res = client.post("/api/auth/login", json={"username": "loginuser", "password": "secret123"})
    assert res.status_code == 200
    assert "username" in res.json()


def test_login_wrong_password(client):
    client.post("/api/auth/register", json={"username": "wpuser", "password": "correct1"})
    res = client.post("/api/auth/login", json={"username": "wpuser", "password": "wrong"})
    assert res.status_code == 401


def test_get_me(client):
    reg = client.post("/api/auth/register", json={"username": "meuser", "password": "secret123"})
    token = reg.cookies.get("access_token")
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["username"] == "meuser"
