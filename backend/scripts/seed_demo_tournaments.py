import asyncio
from datetime import date
from pathlib import Path
import sys

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.database import AsyncSessionLocal  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.field import Field  # noqa: E402
from app.models.match import Match, MatchStatus  # noqa: E402
from app.models.phase import Group, GroupTeam, Phase, PhaseType  # noqa: E402
from app.models.team import Team, TournamentTeam  # noqa: E402
from app.models.tournament import Tournament, TournamentAgeGroup, AgeGroup  # noqa: E402
from app.services.phase_engine import get_phase_standings  # noqa: E402
from app.services.program_builder import decode_seed_note, generate_age_group_program  # noqa: E402


ORG_SPECS = [
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


FORMULAS: list[tuple[str, str, dict]] = [
    (
        "demo-girone-unico",
        "Demo Girone Unico",
        {
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
    ),
    (
        "demo-gironi-finali",
        "Demo Gironi e Finali",
        {
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [
                    {"field_name": "Impianto Nord", "field_number": 1},
                    {"field_name": "Impianto Nord", "field_number": 2},
                    {"field_name": "Impianto Sud", "field_number": 1},
                    {"field_name": "Impianto Sud", "field_number": 2},
                    {"field_name": "Impianto Est", "field_number": 1},
                    {"field_name": "Impianto Est", "field_number": 2},
                    {"field_name": "Impianto Ovest", "field_number": 1},
                    {"field_name": "Impianto Ovest", "field_number": 2},
                ],
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
    ),
    (
        "demo-gironi-piazzamenti",
        "Demo Gironi e Piazzamenti",
        {
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [
                    {"field_name": "Impianto Nord", "field_number": 1},
                    {"field_name": "Impianto Nord", "field_number": 2},
                    {"field_name": "Impianto Sud", "field_number": 1},
                    {"field_name": "Impianto Sud", "field_number": 2},
                    {"field_name": "Impianto Est", "field_number": 1},
                    {"field_name": "Impianto Est", "field_number": 2},
                    {"field_name": "Impianto Ovest", "field_number": 1},
                    {"field_name": "Impianto Ovest", "field_number": 2},
                ],
            },
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
    ),
    (
        "demo-doppia-fase-gironi",
        "Demo Doppia Fase a Gironi",
        {
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [
                    {"field_name": "Impianto Nord", "field_number": 1},
                    {"field_name": "Impianto Nord", "field_number": 2},
                    {"field_name": "Impianto Sud", "field_number": 1},
                    {"field_name": "Impianto Sud", "field_number": 2},
                    {"field_name": "Impianto Est", "field_number": 1},
                    {"field_name": "Impianto Est", "field_number": 2},
                    {"field_name": "Impianto Ovest", "field_number": 1},
                    {"field_name": "Impianto Ovest", "field_number": 2},
                ],
            },
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
    ),
    (
        "demo-gironi-gironi-finali",
        "Demo Gironi, Gironi e Finali",
        {
            "expected_teams": 20,
            "notes": "",
            "schedule": {
                "start_time": "09:30",
                "match_duration_minutes": 12,
                "interval_minutes": 8,
                "playing_fields": [
                    {"field_name": "Impianto Nord", "field_number": 1},
                    {"field_name": "Impianto Nord", "field_number": 2},
                    {"field_name": "Impianto Sud", "field_number": 1},
                    {"field_name": "Impianto Sud", "field_number": 2},
                    {"field_name": "Impianto Est", "field_number": 1},
                    {"field_name": "Impianto Est", "field_number": 2},
                    {"field_name": "Impianto Ovest", "field_number": 1},
                    {"field_name": "Impianto Ovest", "field_number": 2},
                ],
            },
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
    ),
]


async def get_or_create_orgs_and_teams():
    async with AsyncSessionLocal() as db:
        organizations: list[Organization] = []
        teams: list[Team] = []

        for index, (base_name, team_count) in enumerate(ORG_SPECS, start=1):
            slug = f"{base_name.lower().replace(' ', '-')}-demo"
            result = await db.execute(select(Organization).where(Organization.slug == slug))
            org = result.scalar_one_or_none()
            if not org:
                org = Organization(
                    name=f"{base_name} Demo",
                    slug=slug,
                    primary_color="#0f766e",
                    accent_color="#f59e0b",
                )
                db.add(org)
                await db.flush()
            organizations.append(org)

            for team_index in range(team_count):
                suffix = f" {team_index + 1}" if team_count > 1 else ""
                team_name = f"{org.name}{suffix}"
                result = await db.execute(
                    select(Team).where(
                        Team.organization_id == org.id,
                        Team.name == team_name,
                    )
                )
                team = result.scalar_one_or_none()
                if not team:
                    team = Team(
                        organization_id=org.id,
                        name=team_name,
                        short_name=None,
                        city="Toscana",
                    )
                    db.add(team)
                    await db.flush()
                elif team.short_name:
                    team.short_name = None
                teams.append(team)

        await db.commit()
        return organizations, teams


async def recreate_demo_tournament(
    slug: str,
    name: str,
    structure_config: dict,
    organization_id: str,
    teams: list[Team],
):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Tournament)
            .options(selectinload(Tournament.age_groups))
            .where(Tournament.slug == slug)
        )
        existing = result.scalar_one_or_none()
        if existing:
            await db.delete(existing)
            await db.commit()

        tournament = Tournament(
            organization_id=organization_id,
            name=name,
            year=2026,
            slug=slug,
            edition="Demo",
            is_published=True,
            description="Torneo demo generato automaticamente per verificare formule e calendari.",
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

        for team in teams[:20]:
            db.add(TournamentTeam(
                tournament_age_group_id=age_group.id,
                team_id=team.id,
            ))

        await db.commit()
        await generate_age_group_program(age_group.id, db)
        await populate_demo_results(age_group.id, db)
        return tournament.name


def _bucket_name(round_name: str | None) -> str:
    if not round_name:
        return "Tabellone principale"
    if " · " in round_name:
        return round_name.split(" · ", maxsplit=1)[0]
    return "Tabellone principale"


async def populate_demo_results(age_group_id: str, db):
    result = await db.execute(
        select(TournamentAgeGroup)
        .options(
            selectinload(TournamentAgeGroup.tournament_teams).selectinload(TournamentTeam.team),
            selectinload(TournamentAgeGroup.phases).selectinload(Phase.groups).selectinload(Group.group_teams),
            selectinload(TournamentAgeGroup.phases).selectinload(Phase.matches),
        )
        .where(TournamentAgeGroup.id == age_group_id)
    )
    age_group = result.scalar_one()

    for phase in sorted(age_group.phases, key=lambda item: item.phase_order):
        if phase.phase_type == PhaseType.GROUP_STAGE:
            await _hydrate_group_phase_from_previous_results(age_group, phase, db)
            await _complete_group_phase(phase, db)
        elif phase.phase_type == PhaseType.KNOCKOUT:
            await _complete_knockout_phase(phase, age_group.tournament_teams, db)

    await db.commit()


async def _complete_group_phase(phase: Phase, db):
    matches_result = await db.execute(
        select(Match)
        .where(Match.phase_id == phase.id, Match.group_id.is_not(None))
        .order_by(Match.group_id.asc(), Match.bracket_position.asc(), Match.scheduled_at.asc().nulls_last())
    )
    matches = matches_result.scalars().all()
    for index, match in enumerate(matches, start=1):
        if not match.home_team_id or not match.away_team_id:
            continue
        match.status = MatchStatus.COMPLETED
        match.home_score = 2 + (index % 4)
        match.away_score = 1 + (index % 2)
        if match.home_score == match.away_score:
            match.home_score += 1
        match.home_tries = 1 + (index % 3)
        match.away_tries = index % 2


async def _hydrate_group_phase_from_previous_results(age_group: TournamentAgeGroup, phase: Phase, db):
    groups_result = await db.execute(
        select(Group)
        .options(selectinload(Group.group_teams))
        .where(Group.phase_id == phase.id)
        .order_by(Group.group_order)
    )
    groups = groups_result.scalars().all()
    if not groups or any(group.group_teams for group in groups) or phase.phase_order <= 1:
        return

    previous_phase = next((item for item in age_group.phases if item.phase_order == phase.phase_order - 1), None)
    if not previous_phase:
        return

    standings = await get_phase_standings(previous_phase.id, db)
    label_to_team_id: dict[str, str] = {}
    previous_groups_result = await db.execute(
        select(Group).where(Group.phase_id == previous_phase.id).order_by(Group.group_order)
    )
    previous_groups = previous_groups_result.scalars().all()
    for previous_group in previous_groups:
        rows = standings.get(previous_group.id, [])
        for index, row in enumerate(rows, start=1):
            label_to_team_id[f"{index}a {previous_group.name}"] = row.team_id

    for group in groups:
        slot_labels = (phase.advancement_config or {}).get("group_slot_labels", {}).get(group.id, [])
        assigned_team_ids: list[str] = []
        for label in slot_labels:
            team_id = label_to_team_id.get(label)
            if not team_id:
                continue
            assigned_team_ids.append(team_id)
            db.add(GroupTeam(group_id=group.id, tournament_team_id=team_id))
        await db.flush()

        group_matches_result = await db.execute(
            select(Match)
            .where(Match.phase_id == phase.id, Match.group_id == group.id)
            .order_by(Match.bracket_position.asc(), Match.scheduled_at.asc().nulls_last())
        )
        group_matches = group_matches_result.scalars().all()
        for match in group_matches:
            home_label, away_label, _ = decode_seed_note(match.notes)
            if home_label:
                match.home_team_id = label_to_team_id.get(home_label)
            if away_label:
                match.away_team_id = label_to_team_id.get(away_label)


async def _complete_knockout_phase(phase: Phase, tournament_teams: list[TournamentTeam], db):
    matches_result = await db.execute(
        select(Match)
        .where(Match.phase_id == phase.id, Match.group_id.is_(None))
        .order_by(Match.bracket_round_order.asc().nulls_last(), Match.bracket_position.asc())
    )
    matches = matches_result.scalars().all()
    if not matches:
        return

    team_pool = [team.id for team in sorted(tournament_teams, key=lambda item: item.team.name.lower())]
    bucket_matches: dict[str, list[Match]] = {}
    for match in matches:
        bucket_matches.setdefault(_bucket_name(match.bracket_round), []).append(match)

    team_cursor = 0
    for _, bucket in sorted(bucket_matches.items(), key=lambda item: item[0]):
        rounds = sorted({match.bracket_round_order or 0 for match in bucket})
        if not rounds:
            continue

        round_matches = {
            round_order: [match for match in bucket if (match.bracket_round_order or 0) == round_order]
            for round_order in rounds
        }

        first_round = rounds[0]
        initial_matches = round_matches[first_round]
        bucket_team_count = len(initial_matches) * 2
        bucket_team_ids = team_pool[team_cursor: team_cursor + bucket_team_count]
        team_cursor += bucket_team_count

        previous_winners: list[str] = []
        for match_index, match in enumerate(initial_matches):
            home_team_id = bucket_team_ids[match_index * 2]
            away_team_id = bucket_team_ids[match_index * 2 + 1] if (match_index * 2 + 1) < len(bucket_team_ids) else None
            match.home_team_id = home_team_id
            match.away_team_id = away_team_id
            match.status = MatchStatus.COMPLETED
            match.home_score = 3 + (match_index % 2)
            match.away_score = 1 if away_team_id else None
            match.home_tries = 2
            match.away_tries = 1 if away_team_id else None
            previous_winners.append(home_team_id)

        for round_order in rounds[1:]:
            current_round_matches = round_matches[round_order]
            current_winners: list[str] = []
            for match_index, match in enumerate(current_round_matches):
                home_team_id = previous_winners[match_index * 2] if (match_index * 2) < len(previous_winners) else None
                away_team_id = previous_winners[match_index * 2 + 1] if (match_index * 2 + 1) < len(previous_winners) else None
                match.home_team_id = home_team_id
                match.away_team_id = away_team_id
                if home_team_id and away_team_id:
                    match.status = MatchStatus.COMPLETED
                    match.home_score = 2 + round_order
                    match.away_score = 1
                    match.home_tries = 2
                    match.away_tries = 1
                    current_winners.append(home_team_id)
                elif home_team_id:
                    match.status = MatchStatus.COMPLETED
                    match.home_score = 1
                    match.away_score = 0
                    match.home_tries = 1
                    match.away_tries = 0
                    current_winners.append(home_team_id)
            previous_winners = current_winners


async def main():
    organizations, teams = await get_or_create_orgs_and_teams()
    created_names: list[str] = []

    for slug, name, formula in FORMULAS:
        tournament_name = await recreate_demo_tournament(
            slug=slug,
            name=name,
            structure_config=formula,
            organization_id=organizations[0].id,
            teams=teams,
        )
        created_names.append(tournament_name)

    print("Tornei demo creati/aggiornati:")
    for name in created_names:
        print(f"- {name}")


if __name__ == "__main__":
    asyncio.run(main())
