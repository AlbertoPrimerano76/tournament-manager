import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_first_admin(client: AsyncClient):
    resp = await client.post("/api/v1/admin/auth/register", json={
        "email": "admin@test.com",
        "password": "TestPass123!",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "admin@test.com"
    assert data["role"] == "SUPER_ADMIN"


@pytest.mark.asyncio
async def test_login(client: AsyncClient):
    # Register (may already exist from prior test — that's fine, we just need a user in the DB)
    await client.post("/api/v1/admin/auth/register", json={
        "email": "admin@test.com",
        "password": "TestPass123!",
    })
    # Login with the same credentials
    resp = await client.post("/api/v1/admin/auth/login", json={
        "email": "admin@test.com",
        "password": "TestPass123!",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient):
    resp = await client.post("/api/v1/admin/auth/login", json={
        "email": "nobody@test.com",
        "password": "wrong",
    })
    assert resp.status_code == 401
