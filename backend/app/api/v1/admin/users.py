from sqlalchemy import select
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.deps import require_admin
from app.core.security import hash_password, validate_password_strength
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User
from app.models.user_tournament_assignment import UserTournamentAssignment
from app.schemas.user import UserCreate, UserUpdate, UserResponse, PasswordReset
from app.services.security_questions_service import security_questions_configured

router = APIRouter()


def serialize_user(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        organization_id=user.organization_id,
        is_active=user.is_active,
        security_questions_configured=security_questions_configured(user.security_questions),
        assigned_tournament_ids=[assignment.tournament_id for assignment in user.tournament_assignments],
    )


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .options(selectinload(User.tournament_assignments), selectinload(User.security_questions))
        .order_by(User.email)
    )
    return [serialize_user(user) for user in result.scalars().all()]


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    body: UserCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        validate_password_strength(body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        role=body.role,
        organization_id=body.organization_id,
        updated_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    for tournament_id in body.assigned_tournament_ids:
        db.add(UserTournamentAssignment(user_id=user.id, tournament_id=tournament_id))
    await db.commit()
    await db.refresh(user)
    user = (
        await db.execute(
            select(User)
            .options(selectinload(User.tournament_assignments), selectinload(User.security_questions))
            .where(User.id == user.id)
        )
    ).scalar_one()
    return serialize_user(user)


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    body: UserUpdate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .options(selectinload(User.tournament_assignments), selectinload(User.security_questions))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    payload = body.model_dump(exclude_none=True)
    assigned_tournament_ids = payload.pop("assigned_tournament_ids", None)
    for k, v in payload.items():
        setattr(user, k, v)
    if assigned_tournament_ids is not None:
        for assignment in list(user.tournament_assignments):
            await db.delete(assignment)
        await db.flush()
        for tournament_id in assigned_tournament_ids:
            db.add(UserTournamentAssignment(user_id=user.id, tournament_id=tournament_id))
    await db.commit()
    user = (
        await db.execute(
            select(User)
            .options(selectinload(User.tournament_assignments), selectinload(User.security_questions))
            .where(User.id == user.id)
        )
    ).scalar_one()
    return serialize_user(user)


@router.post("/users/{user_id}/reset-password", status_code=204)
async def reset_password(
    user_id: str,
    body: PasswordReset,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        validate_password_strength(body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(body.password)
    user.token_version += 1
    user.updated_at = datetime.now(timezone.utc)
    await db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    await db.commit()


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(
    user_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User)
        .options(selectinload(User.tournament_assignments), selectinload(User.security_questions))
        .where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for assignment in list(user.tournament_assignments):
        await db.delete(assignment)
    await db.delete(user)
    await db.commit()
