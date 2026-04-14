from datetime import datetime, timedelta, timezone
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization
from app.models.phase import Phase, PhaseType
from app.models.match import Match, MatchStatus
from app.models.tournament import Tournament, TournamentAgeGroup, AgeGroup


async def ensure_admin_headers(client: AsyncClient) -> dict[str, str]:
    register_resp = await client.post("/api/v1/admin/auth/register", json={
        "email": "admin-scope@test.com",
        "password": "TestPass123!",
    })
    assert register_resp.status_code in (201, 403)

    login_resp = await client.post("/api/v1/admin/auth/login", json={
        "email": "admin-scope@test.com",
        "password": "TestPass123!",
    })
    assert login_resp.status_code == 200
    return {"Authorization": f"Bearer {login_resp.json()['access_token']}"}


@pytest.mark.asyncio
async def test_scorekeeper_can_be_limited_to_specific_age_groups(client: AsyncClient, db: AsyncSession):
    organization = Organization(
        id=str(uuid.uuid4()),
        name="Org Scope",
        slug=f"org-scope-{uuid.uuid4().hex[:6]}",
    )
    tournament = Tournament(
        id=str(uuid.uuid4()),
        organization_id=organization.id,
        name="Torneo Scope",
        slug=f"torneo-scope-{uuid.uuid4().hex[:6]}",
        year=2026,
        is_published=True,
    )
    allowed_age_group = TournamentAgeGroup(
        id=str(uuid.uuid4()),
        tournament_id=tournament.id,
        age_group=AgeGroup.U8,
        display_name="Under 8",
    )
    blocked_age_group = TournamentAgeGroup(
        id=str(uuid.uuid4()),
        tournament_id=tournament.id,
        age_group=AgeGroup.U10,
        display_name="Under 10",
    )
    allowed_phase = Phase(
        id=str(uuid.uuid4()),
        tournament_age_group_id=allowed_age_group.id,
        phase_order=1,
        name="Fase U8",
        phase_type=PhaseType.GROUP_STAGE,
    )
    blocked_phase = Phase(
        id=str(uuid.uuid4()),
        tournament_age_group_id=blocked_age_group.id,
        phase_order=1,
        name="Fase U10",
        phase_type=PhaseType.GROUP_STAGE,
    )
    scheduled_at = datetime.now(timezone.utc).replace(hour=9, minute=0, second=0, microsecond=0)
    allowed_match = Match(
        id=str(uuid.uuid4()),
        phase_id=allowed_phase.id,
        status=MatchStatus.SCHEDULED,
        scheduled_at=scheduled_at,
        field_name="Campo Nord",
        field_number=1,
    )
    blocked_match = Match(
        id=str(uuid.uuid4()),
        phase_id=blocked_phase.id,
        status=MatchStatus.SCHEDULED,
        scheduled_at=scheduled_at + timedelta(minutes=20),
        field_name="Campo Sud",
        field_number=1,
    )
    db.add_all([organization, tournament, allowed_age_group, blocked_age_group, allowed_phase, blocked_phase, allowed_match, blocked_match])
    await db.commit()

    admin_headers = await ensure_admin_headers(client)
    create_user_resp = await client.post("/api/v1/admin/users", json={
        "email": "scorekeeper-scope@test.com",
        "password": "TestPass123!",
        "role": "SCORE_KEEPER",
        "assigned_tournament_ids": [],
        "assigned_age_group_ids": [allowed_age_group.id],
    }, headers=admin_headers)
    assert create_user_resp.status_code == 201
    assert create_user_resp.json()["assigned_age_group_ids"] == [allowed_age_group.id]

    login_resp = await client.post("/api/v1/admin/auth/login", json={
        "email": "scorekeeper-scope@test.com",
        "password": "TestPass123!",
    })
    assert login_resp.status_code == 200
    scorer_headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

    today_matches_resp = await client.get("/api/v1/admin/matches/today", headers=scorer_headers)
    assert today_matches_resp.status_code == 200
    body = today_matches_resp.json()
    assert len(body) == 1
    assert body[0]["age_group_id"] == allowed_age_group.id

    allowed_program_resp = await client.get(f"/api/v1/admin/age-groups/{allowed_age_group.id}/program", headers=scorer_headers)
    assert allowed_program_resp.status_code == 200

    blocked_program_resp = await client.get(f"/api/v1/admin/age-groups/{blocked_age_group.id}/program", headers=scorer_headers)
    assert blocked_program_resp.status_code == 403


@pytest.mark.asyncio
async def test_user_assignment_update_deduplicates_direct_and_age_group_tournament_links(client: AsyncClient, db: AsyncSession):
    organization = Organization(
        id=str(uuid.uuid4()),
        name="Org Assignments",
        slug=f"org-assignments-{uuid.uuid4().hex[:6]}",
    )
    tournament = Tournament(
        id=str(uuid.uuid4()),
        organization_id=organization.id,
        name="Torneo Assignments",
        slug=f"torneo-assignments-{uuid.uuid4().hex[:6]}",
        year=2026,
        is_published=True,
    )
    age_group = TournamentAgeGroup(
        id=str(uuid.uuid4()),
        tournament_id=tournament.id,
        age_group=AgeGroup.U8,
        display_name="Under 8",
    )
    db.add_all([organization, tournament, age_group])
    await db.commit()

    admin_headers = await ensure_admin_headers(client)
    create_user_resp = await client.post("/api/v1/admin/users", json={
        "email": "scorekeeper-dedupe@test.com",
        "password": "TestPass123!",
        "role": "SCORE_KEEPER",
        "assigned_tournament_ids": [tournament.id],
        "assigned_age_group_ids": [age_group.id],
    }, headers=admin_headers)
    assert create_user_resp.status_code == 201
    created_user = create_user_resp.json()
    assert created_user["assigned_tournament_ids"] == [tournament.id]
    assert created_user["assigned_age_group_ids"] == [age_group.id]

    update_user_resp = await client.put(f"/api/v1/admin/users/{created_user['id']}", json={
        "assigned_tournament_ids": [tournament.id],
        "assigned_age_group_ids": [age_group.id],
    }, headers=admin_headers)
    assert update_user_resp.status_code == 200
    updated_user = update_user_resp.json()
    assert updated_user["assigned_tournament_ids"] == [tournament.id]
    assert updated_user["assigned_age_group_ids"] == [age_group.id]
