import pytest
from httpx import AsyncClient


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
    assert login_resp.status_code == 200
    user_token = login_resp.json()["access_token"]
    user_headers = {"Authorization": f"Bearer {user_token}"}
    old_refresh_token = login_resp.json()["refresh_token"]

    setup_questions_resp = await client.get("/api/v1/admin/auth/security-questions", headers=user_headers)
    assert setup_questions_resp.status_code == 200
    questions = setup_questions_resp.json()["questions"]

    save_questions_resp = await client.post("/api/v1/admin/auth/security-questions", json={
        "answers": [
            {"question_key": question["question_key"], "answer": f"secret-answer-{index}"}
            for index, question in enumerate(questions)
        ]
    }, headers=user_headers)
    assert save_questions_resp.status_code == 204

    forgot_resp = await client.post("/api/v1/admin/auth/forgot-password", json={
        "email": "admin-reset@test.com",
    })
    assert forgot_resp.status_code == 200
    assert len(forgot_resp.json()["questions"]) == 3

    verify_resp = await client.post("/api/v1/admin/auth/forgot-password/verify", json={
        "email": "admin-reset@test.com",
        "answers": [
            {"question_key": question["question_key"], "answer": f"secret-answer-{index}"}
            for index, question in enumerate(forgot_resp.json()["questions"])
        ]
    })
    assert verify_resp.status_code == 200
    token = verify_resp.json()["reset_token"]

    reset_resp = await client.post("/api/v1/admin/auth/reset-password", json={
        "token": token,
        "password": "NewPass456!X",
    })
    assert reset_resp.status_code == 204

    old_login_resp = await client.post("/api/v1/admin/auth/login", json={
        "email": "admin-reset@test.com",
        "password": "TestPass123!",
    })
    assert old_login_resp.status_code == 401

    new_login_resp = await client.post("/api/v1/admin/auth/login", json={
        "email": "admin-reset@test.com",
        "password": "NewPass456!X",
    })
    assert new_login_resp.status_code == 200

    refresh_resp = await client.post("/api/v1/admin/auth/refresh", json={
        "refresh_token": old_refresh_token,
    })
    assert refresh_resp.status_code == 401


@pytest.mark.asyncio
async def test_password_reset_rejects_weak_password(client: AsyncClient, monkeypatch: pytest.MonkeyPatch):
    admin_headers = await ensure_admin_headers(client)
    create_user_resp = await client.post("/api/v1/admin/users", json={
        "email": "admin-weak@test.com",
        "password": "TestPass123!",
        "role": "SCORE_KEEPER",
        "assigned_tournament_ids": [],
    }, headers=admin_headers)
    assert create_user_resp.status_code == 201

    user_login_resp = await client.post("/api/v1/admin/auth/login", json={
        "email": "admin-weak@test.com",
        "password": "TestPass123!",
    })
    assert user_login_resp.status_code == 200
    user_headers = {"Authorization": f"Bearer {user_login_resp.json()['access_token']}"}

    setup_questions_resp = await client.get("/api/v1/admin/auth/security-questions", headers=user_headers)
    questions = setup_questions_resp.json()["questions"]
    await client.post("/api/v1/admin/auth/security-questions", json={
        "answers": [
            {"question_key": question["question_key"], "answer": f"weak-answer-{index}"}
            for index, question in enumerate(questions)
        ]
    }, headers=user_headers)

    forgot_resp = await client.post("/api/v1/admin/auth/forgot-password", json={
        "email": "admin-weak@test.com",
    })
    verify_resp = await client.post("/api/v1/admin/auth/forgot-password/verify", json={
        "email": "admin-weak@test.com",
        "answers": [
            {"question_key": question["question_key"], "answer": f"weak-answer-{index}"}
            for index, question in enumerate(forgot_resp.json()["questions"])
        ]
    })
    token = verify_resp.json()["reset_token"]

    reset_resp = await client.post("/api/v1/admin/auth/reset-password", json={
        "token": token,
        "password": "weak",
    })
    assert reset_resp.status_code == 400
