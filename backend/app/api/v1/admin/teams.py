from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.core.database import get_db
from app.core.deps import require_editor
from app.models.organization import Organization
from app.models.team import Team, TournamentTeam
from app.models.phase import GroupTeam
from app.models.match import Match
from app.models.tournament import TournamentAgeGroup
from app.models.user import User
from app.schemas.team import TeamCreate, TeamUpdate, TeamResponse, TournamentTeamCreate, TournamentTeamResponse

router = APIRouter()


@router.get("/teams", response_model=list[TeamResponse])
async def list_teams(
    organization_id: str | None = None,
    tournament_id: str | None = None,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    query = select(Team)
    if organization_id:
        query = query.where(Team.organization_id == organization_id)
    if tournament_id:
        query = query.where(Team.tournament_id == tournament_id)
    else:
        query = query.where(Team.tournament_id.is_(None))
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
    age_group = await db.get(TournamentAgeGroup, body.tournament_age_group_id)
    if not age_group:
        raise HTTPException(status_code=404, detail="Categoria torneo non trovata")

    team = await db.get(Team, body.team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Squadra non trovata")
    if team.tournament_id != age_group.tournament_id:
        raise HTTPException(
            status_code=422,
            detail="Puoi aggiungere alla categoria solo squadre create per questo torneo.",
        )

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

    group_usage = await db.execute(
        select(GroupTeam.id).where(GroupTeam.tournament_team_id == tt.id).limit(1)
    )
    if group_usage.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail="La squadra non può essere rimossa perché è già assegnata a un girone. Cancella prima il programma della categoria.",
        )

    match_usage = await db.execute(
        select(Match.id).where(
            or_(
                Match.home_team_id == tt.id,
                Match.away_team_id == tt.id,
            )
        ).limit(1)
    )
    if match_usage.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=409,
            detail="La squadra non può essere rimossa perché è già presente nelle partite generate. Cancella prima il programma della categoria.",
        )

    team = await db.get(Team, tt.team_id)
    await db.delete(tt)
    await db.flush()
    if team and team.tournament_id:
        remaining_links = await db.execute(select(TournamentTeam.id).where(TournamentTeam.team_id == team.id).limit(1))
        if remaining_links.scalar_one_or_none() is None:
            await db.delete(team)
    await db.commit()
