from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import require_editor
from app.models.organization import Organization
from app.models.team import Team, TournamentTeam
from app.models.user import User
from app.schemas.team import TeamCreate, TeamUpdate, TeamResponse, TournamentTeamCreate, TournamentTeamResponse

router = APIRouter()


@router.get("/teams", response_model=list[TeamResponse])
async def list_teams(
    organization_id: str | None = None,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    query = select(Team)
    if organization_id:
        query = query.where(Team.organization_id == organization_id)
    result = await db.execute(query.order_by(Team.name))
    return result.scalars().all()


@router.post("/teams", response_model=TeamResponse, status_code=201)
async def create_team(
    body: TeamCreate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    payload = body.model_dump()
    if not payload.get("logo_url"):
        org_result = await db.execute(select(Organization).where(Organization.id == body.organization_id))
        organization = org_result.scalar_one_or_none()
        if organization and organization.logo_url:
            payload["logo_url"] = organization.logo_url
        if organization and organization.city and not payload.get("city"):
            payload["city"] = organization.city

    team = Team(**payload)
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return team


@router.put("/teams/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: str,
    body: TeamUpdate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(team, k, v)
    await db.commit()
    await db.refresh(team)
    return team


@router.post("/tournament-teams", response_model=TournamentTeamResponse, status_code=201)
async def enroll_team(
    body: TournamentTeamCreate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    existing_result = await db.execute(
        select(TournamentTeam).where(
            TournamentTeam.tournament_age_group_id == body.tournament_age_group_id,
            TournamentTeam.team_id == body.team_id,
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Squadra già presente nella categoria")

    tt = TournamentTeam(**body.model_dump())
    db.add(tt)
    await db.commit()
    await db.refresh(tt)
    return tt


@router.delete("/tournament-teams/{tt_id}", status_code=204)
async def unenroll_team(
    tt_id: str,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TournamentTeam).where(TournamentTeam.id == tt_id))
    tt = result.scalar_one_or_none()
    if not tt:
        raise HTTPException(status_code=404, detail="Tournament team not found")
    await db.delete(tt)
    await db.commit()
