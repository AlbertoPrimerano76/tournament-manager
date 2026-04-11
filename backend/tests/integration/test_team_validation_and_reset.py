from datetime import date, datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.match import Match, MatchStatus
from app.models.organization import Organization
from app.models.phase import Phase, PhaseType
from app.models.team import Team, TournamentTeam
from app.models.tournament import Tournament, TournamentAgeGroup, AgeGroup
from app.services.program_builder import generate_age_group_program


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
    return {"Authorization": f"Bearer {login_resp.json()['access_token']}"}


async def seed_tournament_context(db: AsyncSession) -> tuple[Organization, Tournament, TournamentAgeGroup, TournamentAgeGroup]:
    organization = Organization(
        name="Rugby Livorno",
        slug="rugby-livorno",
        primary_color="#14532d",
        accent_color="#f59e0b",
    )
    tournament = Tournament(
        organization=organization,
        name="Spring Cup",
        year=2026,
        slug="spring-cup-2026",
        start_date=date(2026, 4, 11),
        is_published=True,
    )
    age_group_u10 = TournamentAgeGroup(
        tournament=tournament,
        age_group=AgeGroup.U10,
        display_name="Under 10",
        structure_config={
            "expected_teams": 2,
            "schedule": {
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [{"field_name": "Campo centrale", "field_number": 1}],
            },
            "phases": [{
                "id": "phase-1",
                "name": "Girone unico",
                "phase_type": "GROUP_STAGE",
                "num_groups": 1,
                "group_sizes": "2",
                "notes": "",
            }],
        },
    )
    age_group_u12 = TournamentAgeGroup(
        tournament=tournament,
        age_group=AgeGroup.U12,
        display_name="Under 12",
    )
    db.add_all([organization, tournament, age_group_u10, age_group_u12])
    await db.commit()
    await db.refresh(organization)
    await db.refresh(tournament)
    await db.refresh(age_group_u10)
    await db.refresh(age_group_u12)
    return organization, tournament, age_group_u10, age_group_u12


@pytest.mark.asyncio
async def test_prevent_duplicate_team_name_in_same_tournament_age_group(client: AsyncClient, db: AsyncSession):
    headers = await login_first_admin(client)
    organization, tournament, age_group_u10, age_group_u12 = await seed_tournament_context(db)

    team_a = Team(organization_id=organization.id, tournament_id=tournament.id, name="Lions")
    team_b = Team(organization_id=organization.id, tournament_id=tournament.id, name="Lions")
    db.add_all([team_a, team_b])
    await db.commit()
    await db.refresh(team_a)
    await db.refresh(team_b)

    first_enroll = await client.post(
        "/api/v1/admin/tournament-teams",
        headers=headers,
        json={"tournament_age_group_id": age_group_u10.id, "team_id": team_a.id},
    )
    assert first_enroll.status_code == 201

    duplicate_same_group = await client.post(
        "/api/v1/admin/tournament-teams",
        headers=headers,
        json={"tournament_age_group_id": age_group_u10.id, "team_id": team_b.id},
    )
    assert duplicate_same_group.status_code == 409
    assert "stessa categoria" in duplicate_same_group.json()["detail"]

    duplicate_other_group = await client.post(
        "/api/v1/admin/tournament-teams",
        headers=headers,
        json={"tournament_age_group_id": age_group_u12.id, "team_id": team_b.id},
    )
    assert duplicate_other_group.status_code == 201


@pytest.mark.asyncio
async def test_prevent_renaming_team_to_duplicate_name_within_same_age_group(client: AsyncClient, db: AsyncSession):
    headers = await login_first_admin(client)
    organization, tournament, age_group_u10, _ = await seed_tournament_context(db)

    team_a = Team(organization_id=organization.id, tournament_id=tournament.id, name="Lions")
    team_b = Team(organization_id=organization.id, tournament_id=tournament.id, name="Tigers")
    db.add_all([team_a, team_b])
    await db.commit()
    await db.refresh(team_a)
    await db.refresh(team_b)

    db.add_all([
        TournamentTeam(tournament_age_group_id=age_group_u10.id, team_id=team_a.id),
        TournamentTeam(tournament_age_group_id=age_group_u10.id, team_id=team_b.id),
    ])
    await db.commit()

    rename_resp = await client.put(
        f"/api/v1/admin/teams/{team_b.id}",
        headers=headers,
        json={"name": "Lions"},
    )
    assert rename_resp.status_code == 409
    assert "stessa categoria" in rename_resp.json()["detail"]


@pytest.mark.asyncio
async def test_reset_tournament_results_restores_scores_and_schedule(client: AsyncClient, db: AsyncSession):
    headers = await login_first_admin(client)
    organization, tournament, age_group_u10, _ = await seed_tournament_context(db)

    team_a = Team(organization_id=organization.id, tournament_id=tournament.id, name="Lions")
    team_b = Team(organization_id=organization.id, tournament_id=tournament.id, name="Tigers")
    db.add_all([team_a, team_b])
    await db.commit()
    await db.refresh(team_a)
    await db.refresh(team_b)

    db.add_all([
        TournamentTeam(tournament_age_group_id=age_group_u10.id, team_id=team_a.id),
        TournamentTeam(tournament_age_group_id=age_group_u10.id, team_id=team_b.id),
    ])
    await db.commit()

    await generate_age_group_program(age_group_u10.id, db)

    match = (
      await db.execute(
          select(Match)
          .join(Phase, Phase.id == Match.phase_id)
          .where(Phase.tournament_age_group_id == age_group_u10.id, Phase.phase_type == PhaseType.GROUP_STAGE)
      )
    ).scalar_one()
    initial_schedule = match.scheduled_at
    assert initial_schedule is not None

    match.original_scheduled_at = initial_schedule
    match.scheduled_at = initial_schedule.replace(minute=initial_schedule.minute + 3)
    match.actual_end_at = datetime.now(timezone.utc)
    match.home_score = 12
    match.away_score = 7
    match.home_tries = 2
    match.away_tries = 1
    match.status = MatchStatus.COMPLETED
    await db.commit()

    reset_resp = await client.post(
        f"/api/v1/admin/tournaments/{tournament.id}/reset-results",
        headers=headers,
    )
    assert reset_resp.status_code == 200
    assert reset_resp.json()["reset_age_groups"] == 1

    refreshed_match = (
      await db.execute(
          select(Match)
          .join(Phase, Phase.id == Match.phase_id)
          .where(Phase.tournament_age_group_id == age_group_u10.id, Phase.phase_type == PhaseType.GROUP_STAGE)
      )
    ).scalar_one()
    assert refreshed_match.home_score is None
    assert refreshed_match.away_score is None
    assert refreshed_match.home_tries is None
    assert refreshed_match.away_tries is None
    assert refreshed_match.status == MatchStatus.SCHEDULED
    assert refreshed_match.actual_end_at is None
    assert refreshed_match.scheduled_at == initial_schedule
    assert refreshed_match.original_scheduled_at == initial_schedule
