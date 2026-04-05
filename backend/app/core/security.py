from datetime import datetime, timedelta, timezone
import re
from typing import Optional
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    try:
        return pwd_context.verify(plain, hashed)
    except (ValueError, TypeError):
        return False


def validate_password_strength(password: str) -> None:
    if len(password) < 8:
        raise ValueError("La password deve contenere almeno 8 caratteri")
    if not re.search(r"[A-Z]", password):
        raise ValueError("La password deve contenere almeno una lettera maiuscola")
    if not re.search(r"[a-z]", password):
        raise ValueError("La password deve contenere almeno una lettera minuscola")
    if not re.search(r"\d", password):
        raise ValueError("La password deve contenere almeno un numero")


def create_access_token(subject: str, role: str, token_version: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": subject, "role": role, "token_version": token_version, "exp": expire, "type": "access"},
        settings.JWT_SECRET,
        algorithm=ALGORITHM,
    )


def create_refresh_token(subject: str, token_version: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_EXPIRE_DAYS)
    return jwt.encode(
        {"sub": subject, "token_version": token_version, "exp": expire, "type": "refresh"},
        settings.JWT_SECRET,
        algorithm=ALGORITHM,
    )


def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        return None
