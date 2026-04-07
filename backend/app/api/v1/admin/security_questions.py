from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models.user import User
from app.models.user_security_question import UserSecurityQuestion
from app.schemas.security_questions import SecurityQuestionSetupRequest
from app.services.security_questions_service import (
    ensure_user_security_questions,
    security_questions_configured,
    serialize_security_questions,
    set_security_answers,
)

router = APIRouter()


@router.get("/auth/security-questions")
async def get_my_security_questions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await ensure_user_security_questions(db, user.id)
    await db.commit()
    return {
        "configured": security_questions_configured(rows),
        "questions": serialize_security_questions(rows),
    }


@router.post("/auth/security-questions", status_code=204)
async def save_my_security_questions(
    body: SecurityQuestionSetupRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await set_security_answers(
            db,
            user.id,
            [{"question_key": item.question_key, "answer": item.answer} for item in body.answers],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await db.commit()


@router.get("/users/{user_id}/security-questions")
async def get_user_security_questions(
    user_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await ensure_user_security_questions(db, user_id)
    await db.commit()
    result = await db.execute(
        select(UserSecurityQuestion).where(UserSecurityQuestion.user_id == user_id).order_by(UserSecurityQuestion.position)
    )
    rows = result.scalars().all()
    return {
        "configured": security_questions_configured(rows),
        "questions": serialize_security_questions(rows),
    }


@router.post("/users/{user_id}/security-questions", status_code=204)
async def save_user_security_questions(
    user_id: str,
    body: SecurityQuestionSetupRequest,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    try:
        await set_security_answers(
            db,
            user_id,
            [{"question_key": item.question_key, "answer": item.answer} for item in body.answers],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await db.commit()
