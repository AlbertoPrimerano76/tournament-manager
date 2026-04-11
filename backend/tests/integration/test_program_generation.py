import uuid
from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.field import Field
from app.models.match import Match, MatchStatus
from app.models.organization import Organization
from app.models.phase import Group, GroupTeam, Phase, PhaseType
from app.models.team import Team, TournamentTeam
from app.models.tournament import Tournament, TournamentAgeGroup, AgeGroup
from app.services.program_builder import generate_age_group_program


def make_formula_configs() -> list[tuple[str, dict, dict[str, int]]]:
    default_schedule = {
        "start_time": "09:30",
        "match_duration_minutes": 12,
        "interval_minutes": 8,
        "playing_fields": [
            {"field_name": "Impianto Esempio", "field_number": 1},
            {"field_name": "Impianto Esempio", "field_number": 2},
            {"field_name": "Impianto Esempio", "field_number": 3},
            {"field_name": "Impianto Nord", "field_number": 1},
            {"field_name": "Impianto Nord", "field_number": 2},
            {"field_name": "Impianto Sud", "field_number": 1},
            {"field_name": "Impianto Sud", "field_number": 2},
            {"field_name": "Impianto Sud", "field_number": 3},
        ],
    }
    return [
        (
            "girone-unico",
            {
                "expected_teams": 20,
                "notes": "",
                "schedule": default_schedule,
                "phases": [
                    {
                        "id": "phase-1",
                        "name": "Girone unico",
                        "phase_type": "GROUP_STAGE",
                        "num_groups": 1,
                        "group_sizes": "20",
                        "qualifiers_per_group": 0,
                        "best_extra_teams": 0,
                        "next_phase_type": "",
                        "bracket_mode": "standard",
                        "notes": "",
                    },
                ],
            },
            {"phases": 1, "group_phases": 1, "knockout_phases": 0},
        ),
        (
            "gironi-finali",
            {
                "expected_teams": 20,
                "notes": "",
                "schedule": default_schedule,
                "phases": [
                    {
                        "id": "phase-1",
                        "name": "Gironi iniziali",
                        "phase_type": "GROUP_STAGE",
                        "num_groups": 4,
                        "group_sizes": "5,5,5,5",
                        "qualifiers_per_group": 2,
                        "best_extra_teams": 0,
                        "next_phase_type": "KNOCKOUT",
                        "bracket_mode": "standard",
                        "notes": "",
                        "group_field_assignments": {
                            "Girone A": [
                                {"field_name": "Impianto Nord", "field_number": 1},
                                {"field_name": "Impianto Nord", "field_number": 2},
                            ],
                            "Girone B": [
                                {"field_name": "Impianto Sud", "field_number": 1},
                                {"field_name": "Impianto Sud", "field_number": 2},
                            ],
                            "Girone C": [
                                {"field_name": "Impianto Est", "field_number": 1},
                                {"field_name": "Impianto Est", "field_number": 2},
                            ],
                            "Girone D": [
                                {"field_name": "Impianto Ovest", "field_number": 1},
                                {"field_name": "Impianto Ovest", "field_number": 2},
                            ],
                        },
                    },
                    {
                        "id": "phase-2",
                        "name": "Fase finale",
                        "phase_type": "KNOCKOUT",
                        "num_groups": None,
                        "group_sizes": "",
                        "qualifiers_per_group": None,
                        "best_extra_teams": None,
                        "next_phase_type": "",
                        "bracket_mode": "standard",
                        "notes": "",
                        "knockout_field_assignments": [
                            {"field_name": "Impianto Finale", "field_number": 1},
                            {"field_name": "Impianto Finale", "field_number": 2},
                        ],
                    },
                ],
            },
            {"phases": 2, "group_phases": 1, "knockout_phases": 1},
        ),
        (
            "gironi-piazzamenti",
            {
                "expected_teams": 20,
                "notes": "",
                "schedule": default_schedule,
                "phases": [
                    {
                        "id": "phase-1",
                        "name": "Gironi di qualificazione",
                        "phase_type": "GROUP_STAGE",
                        "num_groups": 4,
                        "group_sizes": "5,5,5,5",
                        "qualifiers_per_group": 1,
                        "best_extra_teams": 0,
                        "next_phase_type": "KNOCKOUT",
                        "bracket_mode": "placement",
                        "notes": "",
                        "group_field_assignments": {
                            "Girone A": [
                                {"field_name": "Impianto Nord", "field_number": 1},
                                {"field_name": "Impianto Nord", "field_number": 2},
                            ],
                            "Girone B": [
                                {"field_name": "Impianto Sud", "field_number": 1},
                                {"field_name": "Impianto Sud", "field_number": 2},
                            ],
                            "Girone C": [
                                {"field_name": "Impianto Est", "field_number": 1},
                                {"field_name": "Impianto Est", "field_number": 2},
                            ],
                            "Girone D": [
                                {"field_name": "Impianto Ovest", "field_number": 1},
                                {"field_name": "Impianto Ovest", "field_number": 2},
                            ],
                        },
                    },
                    {
                        "id": "phase-2",
                        "name": "Finali e piazzamenti",
                        "phase_type": "KNOCKOUT",
                        "num_groups": None,
                        "group_sizes": "",
                        "qualifiers_per_group": None,
                        "best_extra_teams": None,
                        "next_phase_type": "",
                        "bracket_mode": "placement",
                        "notes": "",
                        "knockout_field_assignments": [
                            {"field_name": "Impianto Finale", "field_number": 1},
                        ],
                    },
                ],
            },
            {"phases": 2, "group_phases": 1, "knockout_phases": 1},
        ),
        (
            "doppia-fase-gironi",
            {
                "expected_teams": 20,
                "notes": "",
                "schedule": default_schedule,
                "phases": [
                    {
                        "id": "phase-1",
                        "name": "Prima fase",
                        "phase_type": "GROUP_STAGE",
                        "num_groups": 4,
                        "group_sizes": "5,5,5,5",
                        "qualifiers_per_group": 2,
                        "best_extra_teams": 0,
                        "next_phase_type": "GROUP_STAGE",
                        "bracket_mode": "standard",
                        "notes": "",
                        "group_field_assignments": {
                            "Girone A": [
                                {"field_name": "Impianto Nord", "field_number": 1},
                                {"field_name": "Impianto Nord", "field_number": 2},
                            ],
                            "Girone B": [
                                {"field_name": "Impianto Sud", "field_number": 1},
                                {"field_name": "Impianto Sud", "field_number": 2},
                            ],
                            "Girone C": [
                                {"field_name": "Impianto Est", "field_number": 1},
                                {"field_name": "Impianto Est", "field_number": 2},
                            ],
                            "Girone D": [
                                {"field_name": "Impianto Ovest", "field_number": 1},
                                {"field_name": "Impianto Ovest", "field_number": 2},
                            ],
                        },
                    },
                    {
                        "id": "phase-2",
                        "name": "Seconda fase",
                        "phase_type": "GROUP_STAGE",
                        "num_groups": 2,
                        "group_sizes": "4,4",
                        "qualifiers_per_group": 0,
                        "best_extra_teams": 0,
                        "next_phase_type": "",
                        "bracket_mode": "standard",
                        "notes": "",
                        "group_field_assignments": {
                            "Girone A": [
                                {"field_name": "Impianto Finale", "field_number": 1},
                                {"field_name": "Impianto Finale", "field_number": 2},
                            ],
                            "Girone B": [
                                {"field_name": "Impianto Secondario", "field_number": 1},
                                {"field_name": "Impianto Secondario", "field_number": 2},
                            ],
                        },
                    },
                ],
            },
            {"phases": 2, "group_phases": 2, "knockout_phases": 0},
        ),
        (
            "gironi-gironi-finali",
            {
                "expected_teams": 20,
                "notes": "",
                "schedule": default_schedule,
                "phases": [
                    {
                        "id": "phase-1",
                        "name": "Qualificazione",
                        "phase_type": "GROUP_STAGE",
                        "num_groups": 4,
                        "group_sizes": "5,5,5,5",
                        "qualifiers_per_group": 2,
                        "best_extra_teams": 0,
                        "next_phase_type": "GROUP_STAGE",
                        "bracket_mode": "standard",
                        "notes": "",
                        "group_field_assignments": {
                            "Girone A": [
                                {"field_name": "Impianto Nord", "field_number": 1},
                                {"field_name": "Impianto Nord", "field_number": 2},
                            ],
                            "Girone B": [
                                {"field_name": "Impianto Sud", "field_number": 1},
                                {"field_name": "Impianto Sud", "field_number": 2},
                            ],
                            "Girone C": [
                                {"field_name": "Impianto Est", "field_number": 1},
                                {"field_name": "Impianto Est", "field_number": 2},
                            ],
                            "Girone D": [
                                {"field_name": "Impianto Ovest", "field_number": 1},
                                {"field_name": "Impianto Ovest", "field_number": 2},
                            ],
                        },
                    },
                    {
                        "id": "phase-2",
                        "name": "Elite",
                        "phase_type": "GROUP_STAGE",
                        "num_groups": 2,
                        "group_sizes": "4,4",
                        "qualifiers_per_group": 2,
                        "best_extra_teams": 0,
                        "next_phase_type": "KNOCKOUT",
                        "bracket_mode": "standard",
                        "notes": "",
                        "group_field_assignments": {
                            "Girone A": [
                                {"field_name": "Impianto Finale", "field_number": 1},
                                {"field_name": "Impianto Finale", "field_number": 2},
                            ],
                            "Girone B": [
                                {"field_name": "Impianto Secondario", "field_number": 1},
                                {"field_name": "Impianto Secondario", "field_number": 2},
                            ],
                        },
                    },
                    {
                        "id": "phase-3",
                        "name": "Finali",
                        "phase_type": "KNOCKOUT",
                        "num_groups": None,
                        "group_sizes": "",
                        "qualifiers_per_group": None,
                        "best_extra_teams": None,
                        "next_phase_type": "",
                        "bracket_mode": "standard",
                        "notes": "",
                        "knockout_field_assignments": [
                            {"field_name": "Impianto Finale", "field_number": 1},
                            {"field_name": "Impianto Finale", "field_number": 2},
                        ],
                    },
                ],
            },
            {"phases": 3, "group_phases": 2, "knockout_phases": 1},
        ),
    ]


async def create_tournament_with_teams(
    db: AsyncSession,
    *,
    slug_suffix: str,
    structure_config: dict,
) -> tuple[Tournament, TournamentAgeGroup]:
    org_specs = [
        ("Rugby Livorno", 2),
        ("Rugby Firenze", 2),
        ("Rugby Pisa", 2),
        ("Rugby Siena", 2),
        ("Rugby Prato", 1),
        ("Rugby Empoli", 1),
        ("Rugby Lucca", 1),
        ("Rugby Arezzo", 1),
        ("Rugby Massa", 1),
        ("Rugby Grosseto", 1),
        ("Rugby Cecina", 1),
        ("Rugby Pontedera", 1),
        ("Rugby Viareggio", 1),
        ("Rugby Pistoia", 1),
        ("Rugby Carrara", 1),
        ("Rugby Volterra", 1),
    ]

    organizations: list[Organization] = []
    teams: list[Team] = []
    team_counter = 1

    for org_index, (base_name, team_count) in enumerate(org_specs, start=1):
        org = Organization(
            name=f"{base_name} {slug_suffix}",
            slug=f"{base_name.lower().replace(' ', '-')}-{slug_suffix}-{org_index}",
            primary_color="#0f766e",
            accent_color="#f59e0b",
        )
        db.add(org)
        organizations.append(org)
    await db.flush()

    for org, (_, team_count) in zip(organizations, org_specs):
        for team_index in range(team_count):
            suffix = f" {team_index + 1}" if team_count > 1 else ""
            team = Team(
                organization_id=org.id,
                name=f"{org.name}{suffix}",
                short_name=None,
                city="Toscana",
            )
            db.add(team)
            teams.append(team)
            team_counter += 1
    await db.flush()

    tournament = Tournament(
        organization_id=organizations[0].id,
        name=f"Torneo Programma {slug_suffix}",
        year=2026,
        slug=f"torneo-programma-{slug_suffix}",
        is_published=True,
        start_date=date(2026, 5, 10),
        end_date=date(2026, 5, 10),
    )
    db.add(tournament)
    await db.flush()

    for field_name in ["Impianto Esempio", "Impianto Nord", "Impianto Sud", "Impianto Est", "Impianto Ovest", "Impianto Finale", "Impianto Secondario"]:
        db.add(Field(tournament_id=tournament.id, name=field_name))

    age_group = TournamentAgeGroup(
        tournament_id=tournament.id,
        age_group=AgeGroup.U10,
        display_name="Under 10",
        structure_config=structure_config,
    )
    db.add(age_group)
    await db.flush()

    for team in teams:
        db.add(TournamentTeam(
            tournament_age_group_id=age_group.id,
            team_id=team.id,
        ))

    await db.commit()
    await db.refresh(tournament)
    await db.refresh(age_group)
    return tournament, age_group


async def ensure_admin_headers(client: AsyncClient, email: str = "ops-admin@test.com", password: str = "TestPass123!") -> dict[str, str]:
    register_resp = await client.post("/api/v1/admin/auth/register", json={
        "email": email,
        "password": password,
    })
    assert register_resp.status_code in {201, 403}

    login_resp = await client.post("/api/v1/admin/auth/login", json={
        "email": email,
        "password": password,
    })
    if login_resp.status_code != 200:
        login_resp = await client.post("/api/v1/admin/auth/login", json={
            "email": "admin@test.com",
            "password": "TestPass123!",
        })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
@pytest.mark.parametrize(("slug_suffix", "structure_config", "expected"), make_formula_configs())
async def test_generate_program_for_various_formulas(
    db: AsyncSession,
    slug_suffix: str,
    structure_config: dict,
    expected: dict[str, int],
):
    tournament, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"{slug_suffix}-{uuid.uuid4().hex[:6]}",
        structure_config=structure_config,
    )

    await generate_age_group_program(age_group.id, db)

    result = await db.execute(
        select(Phase)
        .options(
            selectinload(Phase.groups),
            selectinload(Phase.matches),
        )
        .where(Phase.tournament_age_group_id == age_group.id)
        .order_by(Phase.phase_order)
    )
    phases = result.scalars().all()

    assert len(phases) == expected["phases"]
    assert sum(1 for phase in phases if phase.phase_type == PhaseType.GROUP_STAGE) == expected["group_phases"]
    assert sum(1 for phase in phases if phase.phase_type == PhaseType.KNOCKOUT) == expected["knockout_phases"]

    for phase in phases:
        if phase.phase_type == PhaseType.GROUP_STAGE:
            assert phase.groups, f"{tournament.name}: expected groups in group stage"
            assert phase.matches, f"{tournament.name}: expected matches in group stage"
        if phase.phase_type == PhaseType.KNOCKOUT:
            assert phase.matches, f"{tournament.name}: expected matches in knockout stage"


@pytest.mark.asyncio
async def test_public_program_endpoint_returns_generated_schedule(client: AsyncClient, db: AsyncSession):
    tournament, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"public-{uuid.uuid4().hex[:6]}",
        structure_config={
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
            },
            "phases": [
                {
                    "id": "phase-1",
                    "name": "Gironi iniziali",
                    "phase_type": "GROUP_STAGE",
                    "num_groups": 4,
                    "group_sizes": "5,5,5,5",
                    "qualifiers_per_group": 2,
                    "best_extra_teams": 0,
                    "next_phase_type": "KNOCKOUT",
                    "bracket_mode": "standard",
                    "notes": "",
                    "group_field_assignments": {
                        "Girone A": [
                            {"field_name": "Impianto Nord", "field_number": 1},
                            {"field_name": "Impianto Nord", "field_number": 2},
                        ],
                        "Girone B": [
                            {"field_name": "Impianto Sud", "field_number": 1},
                            {"field_name": "Impianto Sud", "field_number": 2},
                        ],
                        "Girone C": [
                            {"field_name": "Impianto Est", "field_number": 1},
                            {"field_name": "Impianto Est", "field_number": 2},
                        ],
                        "Girone D": [
                            {"field_name": "Impianto Ovest", "field_number": 1},
                            {"field_name": "Impianto Ovest", "field_number": 2},
                        ],
                    },
                },
                {
                    "id": "phase-2",
                    "name": "Finali",
                    "phase_type": "KNOCKOUT",
                    "num_groups": None,
                    "group_sizes": "",
                    "qualifiers_per_group": None,
                    "best_extra_teams": None,
                    "next_phase_type": "",
                    "bracket_mode": "standard",
                    "notes": "",
                    "knockout_field_assignments": [
                        {"field_name": "Impianto Finale", "field_number": 1},
                        {"field_name": "Impianto Finale", "field_number": 2},
                    ],
                },
            ],
        },
    )
    await generate_age_group_program(age_group.id, db)

    resp = await client.get(f"/api/v1/tournaments/{tournament.slug}/program")
    assert resp.status_code == 200
    data = resp.json()

    assert data["tournament_id"] == tournament.id
    assert len(data["age_groups"]) == 1
    assert data["age_groups"][0]["generated"] is True
    assert data["age_groups"][0]["participant_count"] == 20
    assert len(data["age_groups"][0]["days"]) >= 1


@pytest.mark.asyncio
async def test_referees_follow_group_assignments_when_configured(db: AsyncSession):
    _, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"refs-{uuid.uuid4().hex[:6]}",
        structure_config={
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [
                    {"field_name": "Impianto Nord", "field_number": 1},
                    {"field_name": "Impianto Sud", "field_number": 1},
                ],
            },
            "phases": [
                {
                    "id": "phase-1",
                    "name": "Gironi iniziali",
                    "phase_type": "GROUP_STAGE",
                    "num_groups": 2,
                    "group_sizes": "10,10",
                    "qualifiers_per_group": 0,
                    "best_extra_teams": 0,
                    "next_phase_type": "",
                    "bracket_mode": "standard",
                    "notes": "",
                    "group_field_assignments": {
                        "Girone A": [{"field_name": "Impianto Nord", "field_number": 1}],
                        "Girone B": [{"field_name": "Impianto Sud", "field_number": 1}],
                    },
                    "referee_group_assignments": {
                        "Girone A": ["Girone B"],
                        "Girone B": ["Girone A"],
                    },
                },
            ],
        },
    )

    await generate_age_group_program(age_group.id, db)

    result = await db.execute(
        select(Phase)
        .options(
            selectinload(Phase.groups).selectinload(Group.group_teams).selectinload(GroupTeam.tournament_team).selectinload(TournamentTeam.team),
            selectinload(Phase.matches),
        )
        .where(Phase.tournament_age_group_id == age_group.id)
    )
    phase = result.scalars().one()
    team_name_to_group_id = {
        group_team.tournament_team.team.name: group.id
        for group in phase.groups
        for group_team in group.group_teams
    }

    for match in phase.matches:
        assert match.referee
        if not match.group_id or match.referee.startswith("Staff torneo"):
            continue
        referee_group_id = team_name_to_group_id.get(match.referee)
        if referee_group_id is None:
            continue
        assert referee_group_id != match.group_id


@pytest.mark.asyncio
async def test_admin_score_entry_updates_match_and_standings(client: AsyncClient, db: AsyncSession):
    headers = await ensure_admin_headers(client)

    _, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"score-{uuid.uuid4().hex[:6]}",
        structure_config={
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [
                    {"field_name": "Impianto Nord", "field_number": 1},
                    {"field_name": "Impianto Sud", "field_number": 1},
                ],
            },
            "phases": [
                {
                    "id": "phase-1",
                    "name": "Gironi iniziali",
                    "phase_type": "GROUP_STAGE",
                    "num_groups": 2,
                    "group_sizes": "10,10",
                    "qualifiers_per_group": 0,
                    "best_extra_teams": 0,
                    "next_phase_type": "",
                    "bracket_mode": "standard",
                    "notes": "",
                    "group_field_assignments": {
                        "Girone A": [{"field_name": "Impianto Nord", "field_number": 1}],
                        "Girone B": [{"field_name": "Impianto Sud", "field_number": 1}],
                    },
                    "referee_group_assignments": {
                        "Girone A": ["Girone B"],
                        "Girone B": ["Girone A"],
                    },
                },
            ],
        },
    )

    await generate_age_group_program(age_group.id, db)

    phase_result = await db.execute(
        select(Phase)
        .options(selectinload(Phase.groups), selectinload(Phase.matches))
        .where(Phase.tournament_age_group_id == age_group.id)
    )
    phase = phase_result.scalars().one()
    match = next(item for item in phase.matches if item.group_id == phase.groups[0].id)

    score_resp = await client.post(
        f"/api/v1/admin/matches/{match.id}/score",
        headers=headers,
        json={
            "home_score": 3,
            "away_score": 1,
            "home_tries": 2,
            "away_tries": 1,
            "status": "COMPLETED",
        },
    )
    assert score_resp.status_code == 200
    assert score_resp.json()["status"] == "COMPLETED"
    assert score_resp.json()["home_score"] == 3
    assert score_resp.json()["away_score"] == 1

    standings_resp = await client.get(f"/api/v1/age-groups/{age_group.id}/standings")
    assert standings_resp.status_code == 200
    standings_data = standings_resp.json()
    rows = standings_data[phase.id]["groups"][phase.groups[0].id]
    assert rows[0]["points"] == 3
    assert rows[0]["played"] == 1
    assert rows[0]["team_name"]


@pytest.mark.asyncio
async def test_admin_can_move_team_between_groups(client: AsyncClient, db: AsyncSession):
    headers = await ensure_admin_headers(client)

    _, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"move-{uuid.uuid4().hex[:6]}",
        structure_config={
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [
                    {"field_name": "Impianto Nord", "field_number": 1},
                    {"field_name": "Impianto Sud", "field_number": 1},
                    {"field_name": "Impianto Est", "field_number": 1},
                    {"field_name": "Impianto Ovest", "field_number": 1},
                ],
            },
            "phases": [
                {
                    "id": "phase-1",
                    "name": "Gironi iniziali",
                    "phase_type": "GROUP_STAGE",
                    "num_groups": 4,
                    "group_sizes": "5,5,5,5",
                    "qualifiers_per_group": 0,
                    "best_extra_teams": 0,
                    "next_phase_type": "",
                    "bracket_mode": "standard",
                    "notes": "",
                    "group_field_assignments": {
                        "Girone A": [{"field_name": "Impianto Nord", "field_number": 1}],
                        "Girone B": [{"field_name": "Impianto Sud", "field_number": 1}],
                        "Girone C": [{"field_name": "Impianto Est", "field_number": 1}],
                        "Girone D": [{"field_name": "Impianto Ovest", "field_number": 1}],
                    },
                    "referee_group_assignments": {
                        "Girone A": ["Girone B"],
                        "Girone B": ["Girone A"],
                        "Girone C": ["Girone D"],
                        "Girone D": ["Girone C"],
                    },
                },
            ],
        },
    )
    await generate_age_group_program(age_group.id, db)

    result = await db.execute(
        select(Phase)
        .options(selectinload(Phase.groups).selectinload(Group.group_teams))
        .where(Phase.tournament_age_group_id == age_group.id)
    )
    phase = result.scalars().one()
    source_group = next(group for group in phase.groups if group.name == "Girone A")
    target_group = next(group for group in phase.groups if group.name == "Girone B")
    moved_team_id = source_group.group_teams[0].tournament_team_id

    resp = await client.post(
        f"/api/v1/admin/age-groups/{age_group.id}/groups/{source_group.id}/teams/{moved_team_id}/move",
        headers=headers,
        json={"target_group_id": target_group.id},
    )
    assert resp.status_code == 200

    moved_result = await db.execute(
        select(GroupTeam).where(GroupTeam.tournament_team_id == moved_team_id)
    )
    moved_group_team = moved_result.scalar_one()
    assert moved_group_team.group_id == target_group.id


@pytest.mark.asyncio
async def test_admin_can_update_match_participants(client: AsyncClient, db: AsyncSession):
    headers = await ensure_admin_headers(client)

    _, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"match-{uuid.uuid4().hex[:6]}",
        structure_config={
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [
                    {"field_name": "Impianto Nord", "field_number": 1},
                    {"field_name": "Impianto Sud", "field_number": 1},
                ],
            },
            "phases": [
                {
                    "id": "phase-1",
                    "name": "Gironi iniziali",
                    "phase_type": "GROUP_STAGE",
                    "num_groups": 2,
                    "group_sizes": "10,10",
                    "qualifiers_per_group": 0,
                    "best_extra_teams": 0,
                    "next_phase_type": "",
                    "bracket_mode": "standard",
                    "notes": "",
                    "group_field_assignments": {
                        "Girone A": [{"field_name": "Impianto Nord", "field_number": 1}],
                        "Girone B": [{"field_name": "Impianto Sud", "field_number": 1}],
                    },
                    "referee_group_assignments": {
                        "Girone A": ["Girone B"],
                        "Girone B": ["Girone A"],
                    },
                },
            ],
        },
    )
    await generate_age_group_program(age_group.id, db)

    result = await db.execute(
        select(Phase)
        .options(selectinload(Phase.groups).selectinload(Group.group_teams), selectinload(Phase.matches))
        .where(Phase.tournament_age_group_id == age_group.id)
    )
    phase = result.scalars().one()
    group = phase.groups[0]
    match = next(item for item in phase.matches if item.group_id == group.id)
    new_home = group.group_teams[2].tournament_team_id
    new_away = group.group_teams[3].tournament_team_id

    resp = await client.put(
        f"/api/v1/admin/matches/{match.id}/participants",
        headers=headers,
        json={"home_team_id": new_home, "away_team_id": new_away},
    )
    assert resp.status_code == 200

    updated_match_result = await db.execute(select(Match).where(Match.id == match.id))
    updated_match = updated_match_result.scalar_one()
    assert updated_match.home_team_id == new_home
    assert updated_match.away_team_id == new_away


@pytest.mark.asyncio
async def test_knockout_final_ranking_is_returned_in_standings(client: AsyncClient, db: AsyncSession):
    tournament, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"ranking-{uuid.uuid4().hex[:6]}",
        structure_config={
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [
                    {"field_name": "Impianto Nord", "field_number": 1},
                    {"field_name": "Impianto Sud", "field_number": 1},
                    {"field_name": "Impianto Finale", "field_number": 1},
                ],
            },
            "phases": [
                {
                    "id": "phase-1",
                    "name": "Gironi iniziali",
                    "phase_type": "GROUP_STAGE",
                    "num_groups": 4,
                    "group_sizes": "5,5,5,5",
                    "qualifiers_per_group": 1,
                    "best_extra_teams": 0,
                    "next_phase_type": "KNOCKOUT",
                    "bracket_mode": "standard",
                    "notes": "",
                    "group_field_assignments": {
                        "Girone A": [{"field_name": "Impianto Nord", "field_number": 1}],
                        "Girone B": [{"field_name": "Impianto Sud", "field_number": 1}],
                        "Girone C": [{"field_name": "Impianto Nord", "field_number": 1}],
                        "Girone D": [{"field_name": "Impianto Sud", "field_number": 1}],
                    },
                    "referee_group_assignments": {
                        "Girone A": ["Girone B"],
                        "Girone B": ["Girone A"],
                        "Girone C": ["Girone D"],
                        "Girone D": ["Girone C"],
                    },
                },
                {
                    "id": "phase-2",
                    "name": "Finali",
                    "phase_type": "KNOCKOUT",
                    "num_groups": None,
                    "group_sizes": "",
                    "qualifiers_per_group": None,
                    "best_extra_teams": None,
                    "next_phase_type": "",
                    "bracket_mode": "standard",
                    "notes": "",
                    "knockout_field_assignments": [
                        {"field_name": "Impianto Finale", "field_number": 1},
                    ],
                },
            ],
        },
    )
    await generate_age_group_program(age_group.id, db)

    phase_result = await db.execute(
        select(Phase)
        .options(selectinload(Phase.matches), selectinload(Phase.tournament_age_group).selectinload(TournamentAgeGroup.tournament_teams))
        .where(Phase.tournament_age_group_id == age_group.id)
        .order_by(Phase.phase_order)
    )
    phases = phase_result.scalars().all()
    knockout_phase = next(phase for phase in phases if phase.phase_type == PhaseType.KNOCKOUT)
    knockout_matches = sorted(knockout_phase.matches, key=lambda item: ((item.bracket_round_order or 0), (item.bracket_position or 0)))
    tournament_team_ids = [team.id for team in knockout_phase.tournament_age_group.tournament_teams[:4]]
    semifinal_one, semifinal_two, final_match = knockout_matches

    semifinal_one.home_team_id = tournament_team_ids[0]
    semifinal_one.away_team_id = tournament_team_ids[1]
    semifinal_one.status = MatchStatus.COMPLETED
    semifinal_one.home_score = 4
    semifinal_one.away_score = 1

    semifinal_two.home_team_id = tournament_team_ids[2]
    semifinal_two.away_team_id = tournament_team_ids[3]
    semifinal_two.status = MatchStatus.COMPLETED
    semifinal_two.home_score = 3
    semifinal_two.away_score = 1

    final_match.home_team_id = tournament_team_ids[0]
    final_match.away_team_id = tournament_team_ids[2]
    final_match.status = MatchStatus.COMPLETED
    final_match.home_score = 2
    final_match.away_score = 1
    await db.commit()

    resp = await client.get(f"/api/v1/age-groups/{age_group.id}/standings")
    assert resp.status_code == 200
    data = resp.json()
    assert knockout_phase.id in data
    final_ranking = data[knockout_phase.id]["final_ranking"]
    assert len(final_ranking) == 4
    assert final_ranking[0]["position"] == 1
    assert final_ranking[1]["position"] == 2
    assert final_ranking[0]["team_id"] == tournament_team_ids[0]
    assert final_ranking[1]["team_id"] == tournament_team_ids[2]
    assert "team_logo_url" in final_ranking[0]
    assert "team_logo_url" in final_ranking[1]


@pytest.mark.asyncio
async def test_knockout_results_propagate_winners_to_next_round(client: AsyncClient, db: AsyncSession):
    headers = await ensure_admin_headers(client)

    _, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"propagation-{uuid.uuid4().hex[:6]}",
        structure_config={
            "expected_teams": 4,
            "notes": "",
            "schedule": {
                "start_time": "10:00",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [
                    {"field_name": "Impianto Finale", "field_number": 1},
                ],
            },
            "phases": [
                {
                    "id": "phase-1",
                    "name": "Finali",
                    "phase_type": "KNOCKOUT",
                    "num_groups": None,
                    "group_sizes": "",
                    "qualifiers_per_group": None,
                    "best_extra_teams": None,
                    "next_phase_type": "",
                    "bracket_mode": "standard",
                    "notes": "",
                    "knockout_field_assignments": [
                        {"field_name": "Impianto Finale", "field_number": 1},
                    ],
                },
            ],
        },
    )
    await generate_age_group_program(age_group.id, db)

    phase_result = await db.execute(
        select(Phase)
        .options(
            selectinload(Phase.matches),
            selectinload(Phase.tournament_age_group).selectinload(TournamentAgeGroup.tournament_teams).selectinload(TournamentTeam.team),
        )
        .where(Phase.tournament_age_group_id == age_group.id, Phase.phase_type == PhaseType.KNOCKOUT)
    )
    knockout_phase = phase_result.scalar_one()
    knockout_matches = sorted(knockout_phase.matches, key=lambda item: ((item.bracket_round_order or 0), (item.bracket_position or 0)))
    first_round_matches = [match for match in knockout_matches if match.bracket_round_order == 1]
    semifinal_candidates = [match for match in knockout_matches if match.bracket_round_order == 2]
    assert len(first_round_matches) >= 2
    assert len(semifinal_candidates) >= 1
    semifinal_one = next(match for match in first_round_matches if match.home_team_id and match.away_team_id)

    semifinal_one_resp = await client.post(
        f"/api/v1/admin/matches/{semifinal_one.id}/score",
        headers=headers,
        json={
            "home_score": 12,
            "away_score": 5,
            "status": "COMPLETED",
        },
    )
    assert semifinal_one_resp.status_code == 200

    for match in semifinal_candidates:
        await db.refresh(match)
    propagated_match = next(
        match for match in semifinal_candidates
        if semifinal_one.home_team_id in {match.home_team_id, match.away_team_id}
    )

    program_resp = await client.get(f"/api/v1/age-groups/{age_group.id}/program")
    assert program_resp.status_code == 200
    data = program_resp.json()
    final_phase = data["days"][0]["phases"][0]
    final_program_match = next(match for match in final_phase["knockout_matches"] if match["id"] == propagated_match.id)

    winning_team_name = next(
        team.team.name
        for team in knockout_phase.tournament_age_group.tournament_teams
        if team.id == semifinal_one.home_team_id
    )
    assert final_program_match["home_label"] == winning_team_name
    assert "Vincente" not in final_program_match["home_label"]


@pytest.mark.asyncio
async def test_admin_can_regenerate_from_specific_phase(client: AsyncClient, db: AsyncSession):
    headers = await ensure_admin_headers(client)

    _, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"regen-{uuid.uuid4().hex[:6]}",
        structure_config={
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [
                    {"field_name": "Impianto Nord", "field_number": 1},
                    {"field_name": "Impianto Sud", "field_number": 1},
                    {"field_name": "Impianto Finale", "field_number": 1},
                ],
            },
            "phases": [
                {
                    "id": "phase-1",
                    "name": "Gironi iniziali",
                    "phase_type": "GROUP_STAGE",
                    "num_groups": 4,
                    "group_sizes": "5,5,5,5",
                    "qualifiers_per_group": 1,
                    "best_extra_teams": 0,
                    "next_phase_type": "KNOCKOUT",
                    "bracket_mode": "standard",
                    "notes": "",
                    "group_field_assignments": {
                        "Girone A": [{"field_name": "Impianto Nord", "field_number": 1}],
                        "Girone B": [{"field_name": "Impianto Sud", "field_number": 1}],
                        "Girone C": [{"field_name": "Impianto Nord", "field_number": 1}],
                        "Girone D": [{"field_name": "Impianto Sud", "field_number": 1}],
                    },
                    "referee_group_assignments": {
                        "Girone A": ["Girone B"],
                        "Girone B": ["Girone A"],
                        "Girone C": ["Girone D"],
                        "Girone D": ["Girone C"],
                    },
                },
                {
                    "id": "phase-2",
                    "name": "Finali",
                    "phase_type": "KNOCKOUT",
                    "num_groups": None,
                    "group_sizes": "",
                    "qualifiers_per_group": None,
                    "best_extra_teams": None,
                    "next_phase_type": "",
                    "bracket_mode": "standard",
                    "notes": "",
                    "knockout_field_assignments": [
                        {"field_name": "Impianto Finale", "field_number": 1},
                    ],
                },
            ],
        },
    )
    await generate_age_group_program(age_group.id, db)

    before_result = await db.execute(
        select(Phase)
        .options(selectinload(Phase.matches))
        .where(Phase.tournament_age_group_id == age_group.id)
        .order_by(Phase.phase_order)
    )
    before_phases = before_result.scalars().all()
    knockout_phase = next(phase for phase in before_phases if phase.phase_type == PhaseType.KNOCKOUT)
    old_knockout_match_ids = {match.id for match in knockout_phase.matches}

    resp = await client.post(
        f"/api/v1/admin/age-groups/{age_group.id}/phases/2/regenerate",
        headers=headers,
    )
    assert resp.status_code == 200

    after_result = await db.execute(
        select(Phase)
        .options(selectinload(Phase.matches))
        .where(Phase.tournament_age_group_id == age_group.id)
        .order_by(Phase.phase_order)
    )
    after_phases = after_result.scalars().all()
    regenerated_knockout_phase = next(phase for phase in after_phases if phase.phase_order == 2)
    new_knockout_match_ids = {match.id for match in regenerated_knockout_phase.matches}

    assert len(after_phases) == 2
    assert old_knockout_match_ids != new_knockout_match_ids


@pytest.mark.asyncio
async def test_admin_can_bulk_schedule_group_matches(client: AsyncClient, db: AsyncSession):
    headers = await ensure_admin_headers(client)

    _, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"bulk-{uuid.uuid4().hex[:6]}",
        structure_config={
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [
                    {"field_name": "Impianto Nord", "field_number": 1},
                    {"field_name": "Impianto Sud", "field_number": 1},
                ],
            },
            "phases": [
                {
                    "id": "phase-1",
                    "name": "Gironi iniziali",
                    "phase_type": "GROUP_STAGE",
                    "num_groups": 2,
                    "group_sizes": "10,10",
                    "qualifiers_per_group": 0,
                    "best_extra_teams": 0,
                    "next_phase_type": "",
                    "bracket_mode": "standard",
                    "notes": "",
                    "group_field_assignments": {
                        "Girone A": [{"field_name": "Impianto Nord", "field_number": 1}],
                        "Girone B": [{"field_name": "Impianto Sud", "field_number": 1}],
                    },
                    "referee_group_assignments": {
                        "Girone A": ["Girone B"],
                        "Girone B": ["Girone A"],
                    },
                },
            ],
        },
    )
    await generate_age_group_program(age_group.id, db)

    phase_result = await db.execute(
        select(Phase)
        .options(selectinload(Phase.groups), selectinload(Phase.matches))
        .where(Phase.tournament_age_group_id == age_group.id)
    )
    phase = phase_result.scalars().one()
    group = phase.groups[0]

    resp = await client.post(
        f"/api/v1/admin/groups/{group.id}/bulk-schedule",
        headers=headers,
        json={
            "start_at": "2026-05-10T11:00:00Z",
            "step_minutes": 15,
            "field_name": "Impianto Finale",
            "field_number": 1,
            "referee": "Staff centrale",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] > 0

    updated_result = await db.execute(
        select(Match)
        .where(Match.group_id == group.id)
        .order_by(Match.scheduled_at.asc(), Match.bracket_position.asc())
    )
    updated_matches = updated_result.scalars().all()
    assert updated_matches[0].field_name == "Impianto Finale"
    assert updated_matches[0].field_number == 1
    assert updated_matches[0].referee == "Staff centrale"
    assert updated_matches[0].scheduled_at.isoformat().startswith("2026-05-10T11:00:00")
    assert updated_matches[1].scheduled_at.isoformat().startswith("2026-05-10T11:15:00")


@pytest.mark.asyncio
async def test_admin_can_bulk_schedule_knockout_phase_matches(client: AsyncClient, db: AsyncSession):
    headers = await ensure_admin_headers(client)

    _, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"bulk-ko-{uuid.uuid4().hex[:6]}",
        structure_config={
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [
                    {"field_name": "Impianto Nord", "field_number": 1},
                    {"field_name": "Impianto Sud", "field_number": 1},
                    {"field_name": "Impianto Finale", "field_number": 1},
                ],
            },
            "phases": [
                {
                    "id": "phase-1",
                    "name": "Gironi iniziali",
                    "phase_type": "GROUP_STAGE",
                    "num_groups": 4,
                    "group_sizes": "5,5,5,5",
                    "qualifiers_per_group": 1,
                    "best_extra_teams": 0,
                    "next_phase_type": "KNOCKOUT",
                    "bracket_mode": "standard",
                    "notes": "",
                    "group_field_assignments": {
                        "Girone A": [{"field_name": "Impianto Nord", "field_number": 1}],
                        "Girone B": [{"field_name": "Impianto Sud", "field_number": 1}],
                        "Girone C": [{"field_name": "Impianto Nord", "field_number": 1}],
                        "Girone D": [{"field_name": "Impianto Sud", "field_number": 1}],
                    },
                    "referee_group_assignments": {
                        "Girone A": ["Girone B"],
                        "Girone B": ["Girone A"],
                        "Girone C": ["Girone D"],
                        "Girone D": ["Girone C"],
                    },
                },
                {
                    "id": "phase-2",
                    "name": "Finali",
                    "phase_type": "KNOCKOUT",
                    "num_groups": None,
                    "group_sizes": "",
                    "qualifiers_per_group": None,
                    "best_extra_teams": None,
                    "next_phase_type": "",
                    "bracket_mode": "standard",
                    "notes": "",
                    "knockout_field_assignments": [
                        {"field_name": "Impianto Finale", "field_number": 1},
                    ],
                },
            ],
        },
    )
    await generate_age_group_program(age_group.id, db)

    phase_result = await db.execute(
        select(Phase)
        .options(selectinload(Phase.matches))
        .where(Phase.tournament_age_group_id == age_group.id)
    )
    phases = phase_result.scalars().all()
    knockout_phase = next(phase for phase in phases if phase.phase_type == PhaseType.KNOCKOUT)

    resp = await client.post(
        f"/api/v1/admin/phases/{knockout_phase.id}/bulk-schedule",
        headers=headers,
        json={
            "start_at": "2026-05-10T14:00:00Z",
            "step_minutes": 20,
            "field_name": "Impianto Finale",
            "field_number": 2,
            "referee": "Staff finale",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] > 0

    updated_result = await db.execute(
        select(Match)
        .where(Match.phase_id == knockout_phase.id, Match.group_id.is_(None))
        .order_by(Match.bracket_round_order.asc(), Match.bracket_position.asc())
    )
    updated_matches = updated_result.scalars().all()
    assert updated_matches[0].field_name == "Impianto Finale"
    assert updated_matches[0].field_number == 2
    assert updated_matches[0].referee == "Staff finale"
    assert updated_matches[0].scheduled_at.isoformat().startswith("2026-05-10T14:00:00")


@pytest.mark.asyncio
async def test_admin_can_apply_delay_and_propagate_to_future_matches_on_same_field(client: AsyncClient, db: AsyncSession):
    headers = await ensure_admin_headers(client)

    _, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"delay-{uuid.uuid4().hex[:6]}",
        structure_config={
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [
                    {"field_name": "Impianto Nord", "field_number": 1},
                ],
            },
            "phases": [
                {
                    "id": "phase-1",
                    "name": "Girone unico",
                    "phase_type": "GROUP_STAGE",
                    "num_groups": 1,
                    "group_sizes": "6",
                    "qualifiers_per_group": 0,
                    "best_extra_teams": 0,
                    "next_phase_type": "",
                    "bracket_mode": "standard",
                    "notes": "",
                    "group_field_assignments": {
                        "Girone A": [{"field_name": "Impianto Nord", "field_number": 1}],
                    },
                },
            ],
        },
    )
    await generate_age_group_program(age_group.id, db)

    phase_result = await db.execute(
        select(Phase)
        .options(selectinload(Phase.matches))
        .where(Phase.tournament_age_group_id == age_group.id)
    )
    phase = phase_result.scalars().one()
    ordered_matches = sorted(
        phase.matches,
        key=lambda item: (
            item.scheduled_at.isoformat() if item.scheduled_at else "",
            item.bracket_position or 0,
        ),
    )
    assert len(ordered_matches) >= 2
    first_match = ordered_matches[0]
    second_match = ordered_matches[1]
    original_first_time = first_match.scheduled_at
    original_second_time = second_match.scheduled_at

    resp = await client.post(
        f"/api/v1/admin/matches/{first_match.id}/schedule",
        headers=headers,
        json={
            "delay_minutes": 15,
            "field_name": first_match.field_name,
            "field_number": first_match.field_number,
            "referee": first_match.referee,
            "propagate_delay": True,
        },
    )
    assert resp.status_code == 200

    updated_matches_result = await db.execute(
        select(Match)
        .where(Match.phase_id == phase.id)
        .order_by(Match.scheduled_at.asc(), Match.bracket_position.asc())
    )
    updated_matches = updated_matches_result.scalars().all()
    updated_first = next(match for match in updated_matches if match.id == first_match.id)
    updated_second = next(match for match in updated_matches if match.id == second_match.id)

    assert updated_first.scheduled_at == original_first_time + timedelta(minutes=15)
    assert updated_second.scheduled_at == original_second_time + timedelta(minutes=15)


@pytest.mark.asyncio
async def test_group_matches_receive_time_field_and_referee_assignments(db: AsyncSession):
    tournament, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"schedule-{uuid.uuid4().hex[:6]}",
        structure_config={
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
            },
            "phases": [
                {
                    "id": "phase-1",
                    "name": "Gironi iniziali",
                    "phase_type": "GROUP_STAGE",
                    "num_groups": 4,
                    "group_sizes": "5,5,5,5",
                    "qualifiers_per_group": 0,
                    "best_extra_teams": 0,
                    "next_phase_type": "",
                    "bracket_mode": "standard",
                    "notes": "",
                    "group_field_assignments": {
                        "Girone A": [
                            {"field_name": "Impianto Nord", "field_number": 1},
                            {"field_name": "Impianto Nord", "field_number": 2},
                        ],
                        "Girone B": [
                            {"field_name": "Impianto Sud", "field_number": 1},
                            {"field_name": "Impianto Sud", "field_number": 2},
                        ],
                        "Girone C": [
                            {"field_name": "Impianto Est", "field_number": 1},
                            {"field_name": "Impianto Est", "field_number": 2},
                        ],
                        "Girone D": [
                            {"field_name": "Impianto Ovest", "field_number": 1},
                            {"field_name": "Impianto Ovest", "field_number": 2},
                        ],
                    },
                },
            ],
        },
    )
    await generate_age_group_program(age_group.id, db)

    result = await db.execute(
        select(Phase)
        .options(
            selectinload(Phase.groups),
            selectinload(Phase.matches).selectinload(Match.home_team).selectinload(TournamentTeam.team),
            selectinload(Phase.matches).selectinload(Match.away_team).selectinload(TournamentTeam.team),
        )
        .where(Phase.tournament_age_group_id == age_group.id)
    )
    phase = result.scalar_one()

    matches = sorted(phase.matches, key=lambda match: (match.group_id or "", match.scheduled_at))
    assert matches
    assert all(match.scheduled_at is not None for match in matches)
    assert all(match.field_name is not None for match in matches)

    group_a_matches = [match for match in matches if any(group.name == "Girone A" and group.id == match.group_id for group in phase.groups)]
    first_slot = [match for match in group_a_matches if match.scheduled_at == group_a_matches[0].scheduled_at]
    assert len(first_slot) == 2
    assert {match.field_number for match in first_slot} == {1, 2}

    second_slot_time = sorted({match.scheduled_at for match in group_a_matches})[1]
    assert int((second_slot_time - group_a_matches[0].scheduled_at).total_seconds() / 60) == 20

    scheduled_team_ids_by_time = {}
    for match in matches:
        scheduled_team_ids_by_time.setdefault(match.scheduled_at, set()).update(
            {team_id for team_id in [match.home_team_id, match.away_team_id] if team_id}
        )

    team_name_by_tournament_team_id = {}
    for match in matches:
        if match.home_team_id and match.home_team:
            team_name_by_tournament_team_id[match.home_team_id] = match.home_team.team.name
        if match.away_team_id and match.away_team:
            team_name_by_tournament_team_id[match.away_team_id] = match.away_team.team.name

    for match in matches:
        assert match.referee is not None
        if match.referee.startswith("Staff torneo"):
            continue
        busy_team_names = {
            team_name_by_tournament_team_id[team_id]
            for team_id in scheduled_team_ids_by_time[match.scheduled_at]
            if team_id in team_name_by_tournament_team_id
        }
        assert match.referee not in busy_team_names


@pytest.mark.asyncio
async def test_single_group_uses_three_parallel_fields_without_team_overlap(db: AsyncSession):
    tournament, age_group = await create_tournament_with_teams(
        db,
        slug_suffix=f"single-group-{uuid.uuid4().hex[:6]}",
        structure_config={
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [
                    {"field_name": "Impianto Esempio", "field_number": 1},
                    {"field_name": "Impianto Esempio", "field_number": 2},
                    {"field_name": "Impianto Esempio", "field_number": 3},
                ],
            },
            "phases": [
                {
                    "id": "phase-1",
                    "name": "Girone unico",
                    "phase_type": "GROUP_STAGE",
                    "num_groups": 1,
                    "group_sizes": "20",
                    "qualifiers_per_group": 0,
                    "best_extra_teams": 0,
                    "next_phase_type": "",
                    "bracket_mode": "standard",
                    "notes": "",
                },
            ],
        },
    )
    await generate_age_group_program(age_group.id, db)

    result = await db.execute(
        select(Phase)
        .options(selectinload(Phase.matches))
        .where(Phase.tournament_age_group_id == age_group.id)
    )
    phase = result.scalar_one()
    matches = sorted(phase.matches, key=lambda match: (match.scheduled_at, match.field_number or 0))
    assert matches

    first_slot_time = matches[0].scheduled_at
    assert first_slot_time is not None
    first_slot_matches = [match for match in matches if match.scheduled_at == first_slot_time]
    assert len(first_slot_matches) == 3
    assert {match.field_number for match in first_slot_matches} == {1, 2, 3}

    team_ids_in_first_slot = [
      team_id
      for match in first_slot_matches
      for team_id in [match.home_team_id, match.away_team_id]
      if team_id
    ]
    assert len(team_ids_in_first_slot) == len(set(team_ids_in_first_slot))

    second_slot_time = sorted({match.scheduled_at for match in matches if match.scheduled_at})[1]
    assert int((second_slot_time - first_slot_time).total_seconds() / 60) == 20
    assert all(match.referee for match in first_slot_matches)
    assert len({match.referee for match in first_slot_matches}) == len(first_slot_matches)
