from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import require_editor
from app.models.phase import Phase, Group, GroupTeam
from app.models.user import User
from app.schemas.phase import PhaseCreate, PhaseUpdate, PhaseResponse, GroupCreate, GroupTeamAdd, GroupResponse

router = APIRouter()


@router.post("/phases", response_model=PhaseResponse, status_code=201)
async def create_phase(
    body: PhaseCreate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    phase = Phase(**body.model_dump())
    db.add(phase)
    await db.commit()
    await db.refresh(phase)
    return phase


@router.put("/phases/{phase_id}", response_model=PhaseResponse)
async def update_phase(
    phase_id: str,
    body: PhaseUpdate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Phase).where(Phase.id == phase_id))
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(phase, k, v)
    await db.commit()
    await db.refresh(phase)
    return phase


@router.delete("/phases/{phase_id}", status_code=204)
async def delete_phase(
    phase_id: str,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Phase).where(Phase.id == phase_id))
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    await db.delete(phase)
    await db.commit()


@router.post("/phases/{phase_id}/groups", response_model=GroupResponse, status_code=201)
async def create_group(
    phase_id: str,
    body: GroupCreate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    group = Group(phase_id=phase_id, name=body.name, group_order=body.group_order)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    return group


@router.post("/groups/{group_id}/teams", status_code=201)
async def add_team_to_group(
    group_id: str,
    body: GroupTeamAdd,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    gt = GroupTeam(group_id=group_id, tournament_team_id=body.tournament_team_id)
    db.add(gt)
    await db.commit()
    return {"status": "added"}


@router.delete("/groups/{group_id}/teams/{tournament_team_id}", status_code=204)
async def remove_team_from_group(
    group_id: str,
    tournament_team_id: str,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GroupTeam).where(
            GroupTeam.group_id == group_id,
            GroupTeam.tournament_team_id == tournament_team_id,
        )
    )
    gt = result.scalar_one_or_none()
    if not gt:
        raise HTTPException(status_code=404, detail="Team not in group")
    await db.delete(gt)
    await db.commit()
