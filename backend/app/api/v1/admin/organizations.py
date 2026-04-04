from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import require_creator, require_editor
from app.models.organization import Organization
from app.models.tournament import Tournament
from app.models.user import User
from app.schemas.organization import OrganizationCreate, OrganizationUpdate, OrganizationResponse

router = APIRouter()


@router.get("/organizations", response_model=list[OrganizationResponse])
async def list_organizations(
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Organization).order_by(Organization.name))
    return result.scalars().all()


@router.post("/organizations", response_model=OrganizationResponse, status_code=201)
async def create_organization(
    body: OrganizationCreate,
    _: User = Depends(require_creator),
    db: AsyncSession = Depends(get_db),
):
    org = Organization(**body.model_dump())
    db.add(org)
    await db.commit()
    await db.refresh(org)
    return org


@router.put("/organizations/{org_id}", response_model=OrganizationResponse)
async def update_organization(
    org_id: str,
    body: OrganizationUpdate,
    _: User = Depends(require_creator),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(org, k, v)
    await db.commit()
    await db.refresh(org)
    return org


@router.delete("/organizations/{org_id}", status_code=204)
async def delete_organization(
    org_id: str,
    _: User = Depends(require_creator),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    has_tournaments = await db.execute(select(Tournament.id).where(Tournament.organization_id == org_id).limit(1))
    if has_tournaments.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Impossibile eliminare: l'organizzazione ha dei tornei associati")
    await db.delete(org)
    await db.commit()
