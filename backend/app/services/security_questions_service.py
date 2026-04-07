import random
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.user_security_question import UserSecurityQuestion
from app.security_questions import SECURITY_QUESTION_COUNT, SECURITY_QUESTION_OPTIONS


QUESTION_LABEL_BY_KEY = {item["key"]: item["label"] for item in SECURITY_QUESTION_OPTIONS}


def normalize_security_answer(answer: str) -> str:
    return " ".join(answer.strip().lower().split())


def get_security_question_catalog() -> list[dict[str, str]]:
    return SECURITY_QUESTION_OPTIONS


async def ensure_user_security_questions(db: AsyncSession, user_id: str) -> list[UserSecurityQuestion]:
    result = await db.execute(
        select(UserSecurityQuestion)
        .where(UserSecurityQuestion.user_id == user_id)
        .order_by(UserSecurityQuestion.position)
    )
    rows = result.scalars().all()
    if len(rows) == SECURITY_QUESTION_COUNT:
        return rows

    if rows:
        await db.execute(delete(UserSecurityQuestion).where(UserSecurityQuestion.user_id == user_id))

    selected = random.sample(SECURITY_QUESTION_OPTIONS, SECURITY_QUESTION_COUNT)
    created: list[UserSecurityQuestion] = []
    for index, item in enumerate(selected):
      row = UserSecurityQuestion(
          user_id=user_id,
          question_key=item["key"],
          position=index,
          answer_hash=None,
          updated_at=None,
      )
      db.add(row)
      created.append(row)
    await db.flush()
    return created


def serialize_security_questions(rows: list[UserSecurityQuestion]) -> list[dict[str, str | int]]:
    return [
        {
            "position": row.position,
            "question_key": row.question_key,
            "question_label": QUESTION_LABEL_BY_KEY[row.question_key],
        }
        for row in sorted(rows, key=lambda item: item.position)
    ]


def security_questions_configured(rows: list[UserSecurityQuestion]) -> bool:
    return len(rows) == SECURITY_QUESTION_COUNT and all(row.answer_hash for row in rows)


async def set_security_answers(db: AsyncSession, user_id: str, answers: list[dict[str, str]]) -> list[UserSecurityQuestion]:
    rows = await ensure_user_security_questions(db, user_id)
    by_key = {row.question_key: row for row in rows}
    if len(answers) != SECURITY_QUESTION_COUNT:
        raise ValueError("Devi rispondere a tutte e tre le domande di sicurezza")

    for item in answers:
        row = by_key.get(item["question_key"])
        if not row:
            raise ValueError("Domanda di sicurezza non valida")
        normalized = normalize_security_answer(item["answer"])
        if not normalized:
            raise ValueError("Ogni risposta di sicurezza e' obbligatoria")
        row.answer_hash = hash_password(normalized)
        row.updated_at = datetime.now(timezone.utc)

    await db.flush()
    return rows


async def verify_security_answers(db: AsyncSession, user_id: str, answers: list[dict[str, str]]) -> bool:
    result = await db.execute(
        select(UserSecurityQuestion)
        .where(UserSecurityQuestion.user_id == user_id)
        .order_by(UserSecurityQuestion.position)
    )
    rows = result.scalars().all()
    if not security_questions_configured(rows):
        return False

    answer_map = {item["question_key"]: normalize_security_answer(item["answer"]) for item in answers}
    for row in rows:
        candidate = answer_map.get(row.question_key, "")
        if not candidate or not row.answer_hash or not verify_password(candidate, row.answer_hash):
            return False
    return True
