from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.match import Match, MatchStatus
from app.models.organization import Organization
from app.models.phase import Phase
from app.models.team import TournamentTeam
from app.models.tournament import Tournament, TournamentAgeGroup
from app.models.user import User, UserRole
from app.models.user_tournament_assignment import UserTournamentAssignment
from app.schemas.dashboard import DashboardSummaryResponse, DashboardTournamentItem, LiveMatchItem

router = APIRouter()


@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Tournament)
        .options(
            selectinload(Tournament.organization),
            selectinload(Tournament.age_groups)
            .selectinload(TournamentAgeGroup.phases)
            .selectinload(Phase.matches)
            .selectinload(Match.home_team)
            .selectinload(TournamentTeam.team),
            selectinload(Tournament.age_groups)
            .selectinload(TournamentAgeGroup.phases)
            .selectinload(Phase.matches)
            .selectinload(Match.away_team)
            .selectinload(TournamentTeam.team),
        )
    )
    if user.role == UserRole.SCORE_KEEPER:
        query = query.join(
            UserTournamentAssignment,
            UserTournamentAssignment.tournament_id == Tournament.id,
        ).where(UserTournamentAssignment.user_id == user.id)

    tournaments = (await db.execute(query.order_by(Tournament.start_date.asc().nulls_last(), Tournament.name.asc()))).scalars().unique().all()
    today = date.today()

    tournament_items: list[DashboardTournamentItem] = []
    live_matches: list[LiveMatchItem] = []
    total_matches = 0
    completed_matches = 0
    scheduled_matches = 0
    in_progress_matches = 0
    matches_today = 0

    for tournament in tournaments:
        for age_group in tournament.age_groups:
            for phase in age_group.phases:
                for match in phase.matches:
                    if match.status == MatchStatus.IN_PROGRESS:
                        home_label = (match.home_team.team.name if match.home_team and match.home_team.team else None) or "?"
                        away_label = (match.away_team.team.name if match.away_team and match.away_team.team else None) or "?"
                        live_matches.append(LiveMatchItem(
                            match_id=match.id,
                            tournament_name=tournament.name,
                            tournament_id=tournament.id,
                            age_group_id=age_group.id,
                            age_group_name=age_group.display_name or age_group.age_group,
                            home_label=home_label,
                            away_label=away_label,
                            home_score=match.home_score,
                            away_score=match.away_score,
                            field_name=match.field_name,
                            field_number=match.field_number,
                        ))

        tournament_matches = [
            match
            for age_group in tournament.age_groups
            for phase in age_group.phases
            for match in phase.matches
        ]
        tournament_total = len(tournament_matches)
        tournament_completed = sum(1 for match in tournament_matches if match.status == MatchStatus.COMPLETED)
        tournament_today = sum(
            1 for match in tournament_matches
            if match.scheduled_at and match.scheduled_at.astimezone().date() == today
        )
        total_matches += tournament_total
        completed_matches += tournament_completed
        scheduled_matches += sum(1 for match in tournament_matches if match.status == MatchStatus.SCHEDULED)
        in_progress_matches += sum(1 for match in tournament_matches if match.status == MatchStatus.IN_PROGRESS)
        matches_today += tournament_today
        tournament_items.append(
            DashboardTournamentItem(
                id=tournament.id,
                name=tournament.name,
                slug=tournament.slug,
                organization_name=tournament.organization.name if tournament.organization else None,
                start_date=tournament.start_date.isoformat() if tournament.start_date else None,
                end_date=tournament.end_date.isoformat() if tournament.end_date else None,
                is_published=tournament.is_published,
                total_matches=tournament_total,
                completed_matches=tournament_completed,
                today_matches=tournament_today,
            )
        )

    quick_access = next((item for item in tournament_items if item.today_matches > 0), None) or (tournament_items[0] if tournament_items else None)
    organizations_count = (
        await db.execute(select(Organization.id))
    ).scalars().all()

    return DashboardSummaryResponse(
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
        published_tournaments=sum(1 for tournament in tournaments if tournament.is_published),
        organizations_count=len(organizations_count),
        matches_today=matches_today,
        total_matches=total_matches,
        completed_matches=completed_matches,
        scheduled_matches=scheduled_matches,
        in_progress_matches=in_progress_matches,
        tournaments=tournament_items,
        live_matches=live_matches,
        quick_access_tournament_id=quick_access.id if quick_access else None,
        quick_access_tournament_slug=quick_access.slug if quick_access else None,
    )
