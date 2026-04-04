from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient

from app.services import password_reset_service


async def ensure_admin_headers(client: AsyncClient) -> dict[str, str]:
    register_resp = await client.post("/api/v1/admin/auth/register", json={
        "email": "admin@test.com",
        "password": "TestPass123!",
    })
    assert register_resp.status_code in (201, 403)

    login_resp = await client.post("/api/v1/admin/auth/login", json={
        "email": "admin@test.com",
        "password": "TestPass123!",
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_password_reset_flow_revokes_old_tokens(client: AsyncClient, monkeypatch: pytest.MonkeyPatch):
    sent_reset_urls: list[str] = []

    async def fake_send_password_reset_email(to_email: str, reset_url: str) -> None:
        sent_reset_urls.append(reset_url)

    monkeypatch.setattr(password_reset_service, "send_password_reset_email", fake_send_password_reset_email)

    admin_headers = await ensure_admin_headers(client)
    create_user_resp = await client.post("/api/v1/admin/users", json={
        "email": "admin-reset@test.com",
        "password": "TestPass123!",
        "role": "SCORE_KEEPER",
        "assigned_tournament_ids": [],
    }, headers=admin_headers)
    assert create_user_resp.status_code == 201

    login_resp = await client.post("/api/v1/admin/auth/login", json={
        "email": "admin-reset@test.com",
        "password": "TestPass123!",
    })
    old_refresh_token = login_resp.json()["refresh_token"]

    forgot_resp = await client.post("/api/v1/admin/auth/forgot-password", json={
        "email": "admin-reset@test.com",
    })
    assert forgot_resp.status_code == 202
    assert len(sent_reset_urls) == 1

    token = parse_qs(urlparse(sent_reset_urls[0]).query)["token"][0]

    reset_resp = await client.post("/api/v1/admin/auth/reset-password", json={
        "token": token,
        "password": "NewPass456!",
    })
    assert reset_resp.status_code == 204

    old_login_resp = await client.post("/api/v1/admin/auth/login", json={
        "email": "admin-reset@test.com",
        "password": "TestPass123!",
    })
    assert old_login_resp.status_code == 401

    new_login_resp = await client.post("/api/v1/admin/auth/login", json={
        "email": "admin-reset@test.com",
        "password": "NewPass456!",
    })
    assert new_login_resp.status_code == 200

    refresh_resp = await client.post("/api/v1/admin/auth/refresh", json={
        "refresh_token": old_refresh_token,
    })
    assert refresh_resp.status_code == 401


@pytest.mark.asyncio
async def test_password_reset_rejects_weak_password(client: AsyncClient, monkeypatch: pytest.MonkeyPatch):
    sent_reset_urls: list[str] = []

    async def fake_send_password_reset_email(to_email: str, reset_url: str) -> None:
        sent_reset_urls.append(reset_url)

    monkeypatch.setattr(password_reset_service, "send_password_reset_email", fake_send_password_reset_email)

    admin_headers = await ensure_admin_headers(client)
    create_user_resp = await client.post("/api/v1/admin/users", json={
        "email": "admin-weak@test.com",
        "password": "TestPass123!",
        "role": "SCORE_KEEPER",
        "assigned_tournament_ids": [],
    }, headers=admin_headers)
    assert create_user_resp.status_code == 201

    await client.post("/api/v1/admin/auth/forgot-password", json={
        "email": "admin-weak@test.com",
    })
    token = parse_qs(urlparse(sent_reset_urls[0]).query)["token"][0]

    reset_resp = await client.post("/api/v1/admin/auth/reset-password", json={
        "token": token,
        "password": "weak",
    })
    assert reset_resp.status_code == 400
