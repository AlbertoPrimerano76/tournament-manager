import uuid

import pytest
from sqlalchemy import select

from app.models.organization import Organization
from app.models.team import Team, TournamentTeam
from app.models.tournament import Tournament, TournamentAgeGroup, AgeGroup
from app.services.program_builder import generate_age_group_program
from .test_program_generation import create_tournament_with_teams, ensure_admin_headers, make_formula_configs


@pytest.mark.asyncio
async def test_remove_tournament_team_without_program_succeeds(client, db):
    _, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"remove-ok-{uuid.uuid4().hex[:6]}",
        structure_config=make_formula_configs()[0][1],
    )
    headers = await ensure_admin_headers(client)

    tournament_team = (
        await db.execute(
            select(TournamentTeam)
            .where(TournamentTeam.tournament_age_group_id == age_group.id)
            .limit(1)
        )
    ).scalar_one()

    resp = await client.delete(f"/api/v1/admin/tournament-teams/{tournament_team.id}", headers=headers)

    assert resp.status_code == 204
    deleted = await db.get(TournamentTeam, tournament_team.id)
    assert deleted is None


@pytest.mark.asyncio
async def test_remove_tournament_team_with_generated_program_returns_conflict(client, db):
    _, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"remove-blocked-{uuid.uuid4().hex[:6]}",
        structure_config=make_formula_configs()[0][1],
    )
    await generate_age_group_program(age_group.id, db)
    headers = await ensure_admin_headers(client)

    tournament_team = (
        await db.execute(
            select(TournamentTeam)
            .where(TournamentTeam.tournament_age_group_id == age_group.id)
            .limit(1)
        )
    ).scalar_one()

    resp = await client.delete(f"/api/v1/admin/tournament-teams/{tournament_team.id}", headers=headers)

    assert resp.status_code == 409
    assert "Cancella prima il programma della categoria" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_enroll_global_team_into_tournament_category_returns_validation_error(client, db):
    headers = await ensure_admin_headers(client)

    organization = Organization(name=f"Org {uuid.uuid4().hex[:6]}", slug=f"org-{uuid.uuid4().hex[:6]}")
    tournament = Tournament(
        organization=organization,
        name="Torneo test",
        event_type="TOURNAMENT",
        year=2026,
        slug=f"torneo-test-{uuid.uuid4().hex[:6]}",
    )
    age_group = TournamentAgeGroup(tournament=tournament, age_group=AgeGroup.U8, display_name="U8")
    shared_team = Team(
        organization=organization,
        name="Squadra condivisa",
        short_name="COND",
        tournament_id=None,
    )
    db.add_all([organization, tournament, age_group, shared_team])
    await db.commit()
    await db.refresh(age_group)
    await db.refresh(shared_team)

    resp = await client.post(
        "/api/v1/admin/tournament-teams",
        headers=headers,
        json={
            "tournament_age_group_id": age_group.id,
            "team_id": shared_team.id,
        },
    )

    assert resp.status_code == 422
    assert "solo squadre create per questo torneo" in resp.json()["detail"]
