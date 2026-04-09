from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import require_editor
from app.models.field import Field
from app.models.organization import Organization
from app.models.tournament import Tournament
from app.models.user import User
from app.schemas.field import FieldCreate, FieldUpdate, FieldResponse

router = APIRouter()


@router.get("/tournaments/{tournament_id}/fields", response_model=list[FieldResponse])
async def list_fields(
    tournament_id: str,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    tournament = (
        await db.execute(select(Tournament).where(Tournament.id == tournament_id))
    ).scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")
    result = await db.execute(
        select(Field).where(
            (Field.organization_id == tournament.organization_id) | (Field.tournament_id == tournament_id)
        )
    )
    return result.scalars().all()


@router.get("/organizations/{organization_id}/fields", response_model=list[FieldResponse])
async def list_organization_fields(
    organization_id: str,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    organization = (
        await db.execute(select(Organization).where(Organization.id == organization_id))
    ).scalar_one_or_none()
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")
    result = await db.execute(select(Field).where(Field.organization_id == organization_id))
    return result.scalars().all()


@router.post("/fields", response_model=FieldResponse, status_code=201)
async def create_field(
    body: FieldCreate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    payload = body.model_dump()
    organization_id = payload.get("organization_id")
    tournament_id = payload.get("tournament_id")

    if not organization_id and tournament_id:
        tournament = (
            await db.execute(select(Tournament).where(Tournament.id == tournament_id))
        ).scalar_one_or_none()
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")
        organization_id = tournament.organization_id
        payload["organization_id"] = organization_id

    if not organization_id:
        raise HTTPException(status_code=400, detail="Organization is required")

    field = Field(**payload)
    db.add(field)
    await db.commit()
    await db.refresh(field)
    return field


@router.put("/fields/{field_id}", response_model=FieldResponse)
async def update_field(
    field_id: str,
    body: FieldUpdate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Field).where(Field.id == field_id))
    field = result.scalar_one_or_none()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(field, k, v)
    await db.commit()
    await db.refresh(field)
    return field


@router.delete("/fields/{field_id}", status_code=204)
async def delete_field(
    field_id: str,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Field).where(Field.id == field_id))
    field = result.scalar_one_or_none()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
    await db.delete(field)
    await db.commit()
