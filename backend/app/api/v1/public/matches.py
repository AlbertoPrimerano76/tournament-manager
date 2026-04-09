from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.match import Match
from app.models.phase import Phase
from app.models.team import TournamentTeam
from app.schemas.match import MatchResponse
from datetime import date

router = APIRouter()

_team_loads = [
    selectinload(Match.home_team).selectinload(TournamentTeam.team),
    selectinload(Match.away_team).selectinload(TournamentTeam.team),
]


@router.get("/age-groups/{age_group_id}/matches", response_model=list[MatchResponse])
async def get_age_group_matches(
    age_group_id: str,
    match_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Match)
        .join(Phase)
        .where(Phase.tournament_age_group_id == age_group_id)
        .options(*_team_loads)
        .order_by(Match.scheduled_at)
    )

    result = await db.execute(query)
    matches = result.scalars().all()

    if match_date:
        matches = [m for m in matches if m.scheduled_at and m.scheduled_at.date() == match_date]

    return [MatchResponse.from_match(match) for match in matches]


@router.get("/matches/{match_id}", response_model=MatchResponse)
async def get_match(match_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Match).where(Match.id == match_id).options(*_team_loads)
    )
    m = result.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Match not found")
    return MatchResponse.from_match(m)
