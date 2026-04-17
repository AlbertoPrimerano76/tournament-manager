from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from fastapi.responses import Response
from app.core.database import get_db
from app.models.match import Match
from app.models.phase import Phase
from app.models.tournament import TournamentAgeGroup
from app.models.team import TournamentTeam
from app.schemas.match import MatchResponse
from datetime import date
from app.services.public_api_cache import public_api_cache

router = APIRouter()
PUBLIC_CACHE_TTL_SECONDS = 300   # 5 min fresh  (was 2 min)
PUBLIC_CACHE_STALE_SECONDS = 1800  # 30 min stale (was 10 min)

_team_loads = [
    selectinload(Match.home_team).selectinload(TournamentTeam.team),
    selectinload(Match.away_team).selectinload(TournamentTeam.team),
]


def _duration_from_age_group(age_group: TournamentAgeGroup | None, phase: Phase | None = None) -> int | None:
    """Return match_duration_minutes, checking per-phase config before global schedule."""
    if not age_group:
        return None
    structure = age_group.structure_config if isinstance(age_group.structure_config, dict) else {}
    if not isinstance(structure, dict):
        return None
    # Per-phase override: find the phase config by phase_order
    if phase is not None:
        phases_config = structure.get("phases", [])
        if isinstance(phases_config, list):
            phase_index = (phase.phase_order or 1) - 1
            if 0 <= phase_index < len(phases_config):
                pc = phases_config[phase_index]
                if isinstance(pc, dict):
                    num_halves = pc.get("num_halves")
                    half_dur = pc.get("half_duration_minutes")
                    if num_halves and half_dur:
                        return max(int(num_halves) * int(half_dur), 1)
    # Fall back to global schedule duration
    schedule = structure.get("schedule", {})
    raw = schedule.get("match_duration_minutes") if isinstance(schedule, dict) else None
    return int(raw) if raw and int(raw) > 0 else None


@router.get("/age-groups/{age_group_id}/matches", response_model=list[MatchResponse])
async def get_age_group_matches(
    age_group_id: str,
    match_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"public:age-groups:matches:{age_group_id}:{match_date.isoformat() if match_date else 'all'}"

    async def load() -> list[dict]:
        # Load the age group once to extract match duration
        ag_result = await db.execute(select(TournamentAgeGroup).where(TournamentAgeGroup.id == age_group_id))
        age_group = ag_result.scalar_one_or_none()
        duration = _duration_from_age_group(age_group)

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

        return [MatchResponse.from_match(match, match_duration_minutes=duration).model_dump(mode="json") for match in matches]

    payload = await public_api_cache.get_json_bytes_or_set(cache_key, PUBLIC_CACHE_TTL_SECONDS, load, PUBLIC_CACHE_STALE_SECONDS)
    return Response(content=payload, media_type="application/json")


@router.get("/matches/{match_id}", response_model=MatchResponse)
async def get_match(match_id: str, db: AsyncSession = Depends(get_db)):
    async def load() -> dict:
        result = await db.execute(
            select(Match)
            .where(Match.id == match_id)
            .options(
                *_team_loads,
                selectinload(Match.phase).selectinload(Phase.tournament_age_group),
            )
        )
        m = result.scalar_one_or_none()
        if not m:
            raise HTTPException(status_code=404, detail="Match not found")
        age_group = m.phase.tournament_age_group if m.phase else None
        duration = _duration_from_age_group(age_group, m.phase)
        return MatchResponse.from_match(m, match_duration_minutes=duration).model_dump(mode="json")

    payload = await public_api_cache.get_json_bytes_or_set(f"public:matches:{match_id}", PUBLIC_CACHE_TTL_SECONDS, load, PUBLIC_CACHE_STALE_SECONDS)
    return Response(content=payload, media_type="application/json")
