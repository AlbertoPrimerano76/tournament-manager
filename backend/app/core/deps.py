from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import decode_token
from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.user_tournament_assignment import UserTournamentAssignment
from app.models.tournament import TournamentAgeGroup
from app.models.phase import Phase
from app.models.match import Match
from sqlalchemy import select

bearer = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    payload = decode_token(token)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    if payload.get("token_version") != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")
    return user


def require_role(*roles: UserRole):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user
    return checker


require_admin = require_role(UserRole.SUPER_ADMIN)
require_creator = require_role(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN)
require_editor = require_creator
require_scorer = require_role(UserRole.SUPER_ADMIN, UserRole.ORG_ADMIN, UserRole.SCORE_KEEPER)


async def get_assigned_tournament_ids(user: User, db: AsyncSession) -> set[str]:
    result = await db.execute(
        select(UserTournamentAssignment.tournament_id).where(UserTournamentAssignment.user_id == user.id)
    )
    return set(result.scalars().all())


async def get_direct_tournament_ids(user: User, db: AsyncSession) -> set[str]:
    result = await db.execute(
        select(UserTournamentAssignment.tournament_id).where(
            UserTournamentAssignment.user_id == user.id,
            UserTournamentAssignment.age_group_id.is_(None),
        )
    )
    return set(result.scalars().all())


async def get_assigned_age_group_ids(user: User, db: AsyncSession) -> set[str]:
    result = await db.execute(
        select(UserTournamentAssignment.age_group_id)
        .where(
            UserTournamentAssignment.user_id == user.id,
            UserTournamentAssignment.age_group_id.is_not(None),
        )
    )
    return {age_group_id for age_group_id in result.scalars().all() if age_group_id}


async def ensure_tournament_access(user: User, tournament_id: str, db: AsyncSession) -> None:
    if user.role != UserRole.SCORE_KEEPER:
        return
    assigned_ids = await get_assigned_tournament_ids(user, db)
    if tournament_id not in assigned_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tournament not assigned")


async def ensure_age_group_access(user: User, age_group_id: str, db: AsyncSession) -> str:
    result = await db.execute(select(TournamentAgeGroup.tournament_id).where(TournamentAgeGroup.id == age_group_id))
    tournament_id = result.scalar_one_or_none()
    if not tournament_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Age group not found")
    if user.role == UserRole.SCORE_KEEPER:
        assigned_age_group_ids = await get_assigned_age_group_ids(user, db)
        if assigned_age_group_ids and age_group_id in assigned_age_group_ids:
            return tournament_id
        direct_tournament_ids = await get_direct_tournament_ids(user, db)
        if tournament_id not in direct_tournament_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Age group not assigned")
    await ensure_tournament_access(user, tournament_id, db)
    return tournament_id


async def ensure_match_access(user: User, match_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(TournamentAgeGroup.tournament_id, TournamentAgeGroup.id)
        .join(Phase, Phase.tournament_age_group_id == TournamentAgeGroup.id)
        .join(Match, Match.phase_id == Phase.id)
        .where(Match.id == match_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Match not found")
    tournament_id, age_group_id = row
    if user.role == UserRole.SCORE_KEEPER:
        assigned_age_group_ids = await get_assigned_age_group_ids(user, db)
        if assigned_age_group_ids and age_group_id in assigned_age_group_ids:
            return tournament_id
        direct_tournament_ids = await get_direct_tournament_ids(user, db)
        if tournament_id not in direct_tournament_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Match not assigned")
    await ensure_tournament_access(user, tournament_id, db)
    return tournament_id
