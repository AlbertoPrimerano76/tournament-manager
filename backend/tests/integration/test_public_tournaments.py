import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization
from app.models.tournament import Tournament


async def login_first_admin(client: AsyncClient, email: str = "admin@test.com") -> dict[str, str]:
    password = "TestPass123!"
    register_resp = await client.post("/api/v1/admin/auth/register", json={
        "email": email,
        "password": password,
    })
    login_email = email if register_resp.status_code == 201 else "admin@test.com"
    login_resp = await client.post("/api/v1/admin/auth/login", json={
        "email": login_email,
        "password": password,
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def create_organization_and_tournament(db: AsyncSession, *, published: bool = True, slug_suffix: str = "demo") -> tuple[Organization, Tournament]:
    org = Organization(
        name=f"Rugby Test {slug_suffix}",
        slug=f"rugby-test-{slug_suffix}",
        primary_color="#0f766e",
        accent_color="#d97706",
    )
    db.add(org)
    await db.flush()

    tournament = Tournament(
        organization_id=org.id,
        name=f"Torneo Test {slug_suffix}",
        year=2026,
        slug=f"torneo-test-{slug_suffix}",
        edition="Spring Cup",
        location="Livorno",
        logo_url="https://example.com/logo.png",
        venue_map_url="https://example.com/map.png",
        theme_primary_color="#14532d",
        theme_accent_color="#f59e0b",
        sponsor_images=[
            "https://example.com/sponsor-1.png",
            "https://example.com/sponsor-2.png",
        ],
        is_published=published,
    )
    db.add(tournament)
    await db.commit()
    await db.refresh(org)
    await db.refresh(tournament)
    return org, tournament


@pytest.mark.asyncio
async def test_list_tournaments_empty(client: AsyncClient):
    resp = await client.get("/api/v1/tournaments", params={"year": 2099})
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_public_tournament_returns_branding_fields(client: AsyncClient, db: AsyncSession):
    _, tournament = await create_organization_and_tournament(db, slug_suffix="branding")

    resp = await client.get(f"/api/v1/tournaments/{tournament.slug}")
    assert resp.status_code == 200
    data = resp.json()

    assert data["name"] == tournament.name
    assert data["theme_primary_color"] == "#14532d"
    assert data["theme_accent_color"] == "#f59e0b"
    assert data["sponsor_images"] == [
        "https://example.com/sponsor-1.png",
        "https://example.com/sponsor-2.png",
    ]


@pytest.mark.asyncio
async def test_list_tournaments_filters_by_organization_and_only_published(client: AsyncClient, db: AsyncSession):
    org_a, published_tournament = await create_organization_and_tournament(db, slug_suffix="org-a", published=True)
    _, _draft_tournament = await create_organization_and_tournament(db, slug_suffix="org-b", published=False)

    filtered_resp = await client.get("/api/v1/tournaments", params={"organization_slug": org_a.slug})
    assert filtered_resp.status_code == 200
    filtered_data = filtered_resp.json()

    assert len(filtered_data) == 1
    assert filtered_data[0]["slug"] == published_tournament.slug

    all_resp = await client.get("/api/v1/tournaments")
    assert all_resp.status_code == 200
    all_slugs = {item["slug"] for item in all_resp.json()}
    assert published_tournament.slug in all_slugs
    assert "torneo-test-org-b" not in all_slugs


@pytest.mark.asyncio
async def test_admin_can_update_tournament_branding_and_sponsors(client: AsyncClient, db: AsyncSession):
    headers = await login_first_admin(client)
    _, tournament = await create_organization_and_tournament(db, slug_suffix="admin-branding")

    resp = await client.put(
        f"/api/v1/admin/tournaments/{tournament.id}",
        headers=headers,
        json={
            "theme_primary_color": "#1d4ed8",
            "theme_accent_color": "#fb7185",
            "sponsor_images": [
                "https://example.com/new-sponsor-1.png",
                "https://example.com/new-sponsor-2.png",
                "https://example.com/new-sponsor-3.png",
            ],
            "description": "Torneo aggiornato con branding completo",
        },
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["theme_primary_color"] == "#1d4ed8"
    assert payload["theme_accent_color"] == "#fb7185"
    assert len(payload["sponsor_images"]) == 3
    assert payload["description"] == "Torneo aggiornato con branding completo"

    public_resp = await client.get(f"/api/v1/tournaments/{tournament.slug}")
    assert public_resp.status_code == 200
    public_payload = public_resp.json()
    assert public_payload["theme_primary_color"] == "#1d4ed8"
    assert public_payload["theme_accent_color"] == "#fb7185"
    assert public_payload["sponsor_images"][-1] == "https://example.com/new-sponsor-3.png"


@pytest.mark.asyncio
async def test_public_cache_is_invalidated_after_admin_update(client: AsyncClient, db: AsyncSession):
    headers = await login_first_admin(client, email="cache-admin@test.com")
    _, tournament = await create_organization_and_tournament(db, slug_suffix="cache-check")

    first_public_resp = await client.get(f"/api/v1/tournaments/{tournament.slug}")
    assert first_public_resp.status_code == 200
    assert first_public_resp.json()["theme_primary_color"] == "#14532d"

    update_resp = await client.put(
        f"/api/v1/admin/tournaments/{tournament.id}",
        headers=headers,
        json={
            "theme_primary_color": "#7c3aed",
            "theme_accent_color": "#f97316",
            "sponsor_images": ["https://example.com/cache-refresh.png"],
        },
    )
    assert update_resp.status_code == 200

    second_public_resp = await client.get(f"/api/v1/tournaments/{tournament.slug}")
    assert second_public_resp.status_code == 200
    second_payload = second_public_resp.json()
    assert second_payload["theme_primary_color"] == "#7c3aed"
    assert second_payload["theme_accent_color"] == "#f97316"
    assert second_payload["sponsor_images"] == ["https://example.com/cache-refresh.png"]


@pytest.mark.asyncio
async def test_admin_create_gathering_generates_slug_with_org_and_date(client: AsyncClient, db: AsyncSession):
    headers = await login_first_admin(client)
    org = Organization(
        name="Rugby Livorno",
        slug="rugby-livorno",
        primary_color="#0f766e",
        accent_color="#d97706",
    )
    db.add(org)
    await db.commit()
    await db.refresh(org)

    resp = await client.post(
        "/api/v1/admin/tournaments",
        headers=headers,
        json={
            "organization_id": org.id,
            "name": "Raggruppamento Under 8",
            "event_type": "GATHERING",
            "year": 2026,
            "slug": "placeholder",
            "start_date": "2026-04-03",
            "location": "Livorno",
            "is_published": True,
        },
    )

    assert resp.status_code == 201
    payload = resp.json()
    assert payload["event_type"] == "GATHERING"
    assert payload["organization_name"] == "Rugby Livorno"
    assert payload["organization_slug"] == "rugby-livorno"
    assert payload["slug"] == "rugby-livorno-raggruppamento-under-8-2026-04-03"
