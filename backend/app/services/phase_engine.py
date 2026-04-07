import re

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.phase import Phase, PhaseStatus, PhaseType, Group, GroupTeam
from app.models.match import Match, MatchStatus
from app.models.tournament import Tournament, TournamentAgeGroup
from app.models.team import TournamentTeam, Team
from app.models.organization import Organization
from app.services.standings import (
    MatchResult,
    TeamStats,
    calculate_standings,
    normalize_ranking_criteria,
    normalize_scoring_rules,
    sort_team_stats,
)


def _match_winner_loser(match: Match) -> tuple[str | None, str | None]:
    if (
        match.status != MatchStatus.COMPLETED
        or match.home_team_id is None
        or match.away_team_id is None
        or match.home_score is None
        or match.away_score is None
    ):
        return None, None
    if match.home_score > match.away_score:
        return match.home_team_id, match.away_team_id
    if match.away_score > match.home_score:
        return match.away_team_id, match.home_team_id
    return None, None


def _bucket_sort_key(round_name: str | None) -> tuple[int, str]:
    if not round_name:
        return (0, "")
    if round_name.startswith("Piazzamento "):
        match = re.match(r"Piazzamento (\d+)a", round_name)
        if match:
            return (int(match.group(1)), round_name)
    return (0, round_name)


async def get_knockout_final_ranking(phase_id: str, db: AsyncSession) -> list[dict[str, str | int | None]]:
    phase_result = await db.execute(select(Phase).where(Phase.id == phase_id))
    phase = phase_result.scalar_one_or_none()
    if not phase or phase.phase_type != PhaseType.KNOCKOUT:
        return []

    matches_result = await db.execute(
        select(Match)
        .where(Match.phase_id == phase_id, Match.group_id.is_(None))
        .order_by(Match.bracket_round_order.desc(), Match.bracket_position.asc())
    )
    matches = matches_result.scalars().all()
    if not matches:
        return []

    team_name_result = await db.execute(
        select(TournamentTeam.id, Team.name)
        .join(Team, Team.id == TournamentTeam.team_id)
        .where(
            TournamentTeam.id.in_([
                team_id
                for match in matches
                for team_id in [match.home_team_id, match.away_team_id]
                if team_id
            ])
        )
    )
    team_name_map = {team_id: team_name for team_id, team_name in team_name_result.all()}

    bucketed_matches: dict[str, list[Match]] = {}
    for match in matches:
        if match.bracket_round and match.bracket_round.startswith("Piazzamento "):
            bucket_name = match.bracket_round.split(" · ", maxsplit=1)[0]
        else:
            bucket_name = "Tabellone principale"
        bucketed_matches.setdefault(bucket_name, []).append(match)

    ranking_rows: list[dict[str, str | int | None]] = []
    next_position = 1

    for bucket_name, bucket_matches in sorted(bucketed_matches.items(), key=lambda item: _bucket_sort_key(item[0])):
        ranked_team_ids: list[str] = []
        rounds = sorted({match.bracket_round_order or 0 for match in bucket_matches}, reverse=True)
        for round_order in rounds:
            round_matches = [match for match in bucket_matches if (match.bracket_round_order or 0) == round_order]
            if round_order == max(rounds):
                for match in round_matches:
                    winner_id, loser_id = _match_winner_loser(match)
                    for team_id in [winner_id, loser_id]:
                        if team_id and team_id not in ranked_team_ids:
                            ranked_team_ids.append(team_id)
            else:
                for match in round_matches:
                    _, loser_id = _match_winner_loser(match)
                    if loser_id and loser_id not in ranked_team_ids:
                        ranked_team_ids.append(loser_id)

        for team_id in ranked_team_ids:
            ranking_rows.append({
                "position": next_position,
                "team_id": team_id,
                "team_name": team_name_map.get(team_id),
                "bucket": bucket_name,
            })
            next_position += 1

    return ranking_rows


async def get_phase_standings(phase_id: str, db: AsyncSession) -> dict[str, list[TeamStats]]:
    """Return standings per group for a GROUP_STAGE phase."""
    phase_result = await db.execute(
        select(Phase)
        .options(
            selectinload(Phase.tournament_age_group).selectinload(TournamentAgeGroup.tournament)
        )
        .where(Phase.id == phase_id)
    )
    phase = phase_result.scalar_one_or_none()
    age_group = phase.tournament_age_group if phase else None
    tournament = age_group.tournament if age_group else None
    scoring_rules = normalize_scoring_rules(age_group.scoring_rules if age_group else None)
    criteria = normalize_ranking_criteria(
        (phase.advancement_config or {}).get("criteria") if phase else scoring_rules.get("ranking_criteria")
    )

    result = await db.execute(
        select(Group).where(Group.phase_id == phase_id)
    )
    groups = result.scalars().all()

    standings = {}
    for group in groups:
        gt_result = await db.execute(
            select(GroupTeam)
            .join(TournamentTeam, TournamentTeam.id == GroupTeam.tournament_team_id)
            .join(Team, Team.id == TournamentTeam.team_id)
            .join(Organization, Organization.id == Team.organization_id)
            .where(GroupTeam.group_id == group.id)
        )
        group_teams = gt_result.scalars().all()
        team_ids = [gt.tournament_team_id for gt in group_teams]
        team_metadata_result = await db.execute(
            select(TournamentTeam.id, Team.name, Team.city, Organization.city)
            .join(Team, Team.id == TournamentTeam.team_id)
            .join(Organization, Organization.id == Team.organization_id)
            .where(TournamentTeam.id.in_(team_ids))
        )
        team_metadata = {
            team_id: {
                "team_name": team_name,
                "city": team_city or organization_city,
            }
            for team_id, team_name, team_city, organization_city in team_metadata_result.all()
        }

        match_result = await db.execute(
            select(Match).where(
                Match.group_id == group.id,
                Match.status == MatchStatus.COMPLETED,
            )
        )
        matches = match_result.scalars().all()

        results = [
            MatchResult(
                home_team_id=m.home_team_id,
                away_team_id=m.away_team_id,
                home_score=m.home_score or 0,
                away_score=m.away_score or 0,
                home_tries=m.home_tries or 0,
                away_tries=m.away_tries or 0,
            )
            for m in matches
            if m.home_team_id and m.away_team_id
        ]

        group_standings = calculate_standings(
            team_ids,
            results,
            scoring_rules,
            criteria,
            team_metadata=team_metadata,
            tournament_location=tournament.location if tournament else None,
        )

        standings[group.id] = group_standings

    return standings


async def check_phase_completion(phase_id: str, db: AsyncSession) -> bool:
    """Check if all matches in a phase are completed."""
    result = await db.execute(
        select(Match).where(
            Match.phase_id == phase_id,
            Match.status.notin_([MatchStatus.COMPLETED, MatchStatus.CANCELLED]),
        )
    )
    remaining = result.scalars().all()
    return len(remaining) == 0


async def get_qualified_teams(phase: Phase, db: AsyncSession) -> list[str]:
    """Get list of team IDs that qualified from a GROUP_STAGE phase."""
    if phase.phase_type != PhaseType.GROUP_STAGE:
        return []

    standings_by_group = await get_phase_standings(phase.id, db)
    config = phase.advancement_config or {}
    top_n = config.get("top_n_per_group", 2)
    best_third_count = config.get("best_third_count", 0)
    criteria = normalize_ranking_criteria(config.get("criteria"))
    age_group_result = await db.execute(
        select(TournamentAgeGroup)
        .options(selectinload(TournamentAgeGroup.tournament))
        .where(TournamentAgeGroup.id == phase.tournament_age_group_id)
    )
    age_group = age_group_result.scalar_one_or_none()
    scoring_rules = normalize_scoring_rules(age_group.scoring_rules if age_group else None)

    qualifiers = []
    thirds = []

    for group_id, standings in standings_by_group.items():
        qualifiers.extend([s.team_id for s in standings[:top_n]])
        if best_third_count > 0 and len(standings) > top_n:
            thirds.append(standings[top_n])

    # Sort thirds by points/goal_diff and take top N
    if best_third_count > 0 and thirds:
        thirds = sort_team_stats(
            thirds,
            [],
            scoring_rules,
            criteria,
            tournament_location=age_group.tournament.location if age_group and age_group.tournament else None,
        )
        qualifiers.extend([t.team_id for t in thirds[:best_third_count]])

    return qualifiers
