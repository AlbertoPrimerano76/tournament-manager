from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import (
    verify_password,
    hash_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    validate_password_strength,
)
from app.models.user import User, UserRole
from app.models.password_reset_token import PasswordResetToken
from app.schemas.user import (
    LoginRequest,
    TokenResponse,
    RefreshRequest,
    UserCreate,
    UserResponse,
    PasswordResetConfirm,
)
from app.schemas.security_questions import ForgotPasswordStartRequest, ForgotPasswordVerifyRequest
from app.models.user_security_question import UserSecurityQuestion
from app.services.password_reset_service import consume_password_reset_token, issue_password_setup_token
from app.services.security_questions_service import (
    ensure_user_security_questions,
    security_questions_configured,
    serialize_security_questions,
    verify_security_answers,
)

router = APIRouter()


def issue_tokens(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id, user.role, user.token_version),
        refresh_token=create_refresh_token(user.id, user.token_version),
    )


@router.post("/auth/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disattivato")
    if not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password non impostata. Usa il recupero password.",
        )
    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return issue_tokens(user)


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if payload.get("token_version") != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token revoked")

    return issue_tokens(user)


@router.post("/auth/register", response_model=UserResponse, status_code=201)
async def register_first_admin(body: UserCreate, db: AsyncSession = Depends(get_db)):
    """Register first SUPER_ADMIN — only works if no users exist."""
    count_result = await db.execute(select(User))
    existing = count_result.scalars().all()
    if existing:
        raise HTTPException(status_code=403, detail="Admin already exists. Use user management.")
    try:
        validate_password_strength(body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        role=UserRole.SUPER_ADMIN,
        updated_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordStartRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if user and user.is_active:
        rows = await ensure_user_security_questions(db, user.id)
        await db.commit()
        if not user.hashed_password:
            raw_token = await issue_password_setup_token(db, user)
            await db.commit()
            return {"message": "Primo accesso disponibile", "reset_token": raw_token, "first_access": True}
        if not security_questions_configured(rows):
            raise HTTPException(status_code=400, detail="Domande di sicurezza non configurate per questo account")
        return {
            "message": "Rispondi alle domande di sicurezza per continuare",
            "configured": True,
            "questions": serialize_security_questions(rows),
        }

    return {"message": "Account non disponibile", "configured": False, "questions": []}


@router.post("/auth/forgot-password/verify")
async def verify_forgot_password(body: ForgotPasswordVerifyRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Account non disponibile")
    ok = await verify_security_answers(
        db,
        user.id,
        [{"question_key": item.question_key, "answer": item.answer} for item in body.answers],
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Risposte di sicurezza non corrette")
    raw_token = await issue_password_setup_token(db, user)
    await db.commit()
    return {"reset_token": raw_token}


@router.post("/auth/reset-password", status_code=204)
async def reset_password(body: PasswordResetConfirm, db: AsyncSession = Depends(get_db)):
    try:
        validate_password_strength(body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    reset_token = await consume_password_reset_token(db, body.token)
    if not reset_token:
        raise HTTPException(status_code=400, detail="Token di reset non valido o scaduto")

    result = await db.execute(select(User).where(User.id == reset_token.user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Utente non disponibile")

    user.hashed_password = hash_password(body.password)
    user.token_version += 1
    user.updated_at = datetime.now(timezone.utc)
    reset_token.used_at = datetime.now(timezone.utc)
    await db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
    await db.commit()
