import asyncio
import hashlib
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from urllib.parse import quote

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.password_reset_token import PasswordResetToken
from app.models.user import User


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _password_reset_email_configured() -> bool:
    required = [
        settings.SMTP_HOST,
        settings.SMTP_USERNAME,
        settings.SMTP_PASSWORD,
        settings.SMTP_FROM_EMAIL,
        settings.FRONTEND_URL,
    ]
    return all(required)


def _send_email_sync(to_email: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = (
        f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        if settings.SMTP_FROM_NAME
        else settings.SMTP_FROM_EMAIL
    )
    message["To"] = to_email
    message.set_content(body)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as smtp:
        if settings.SMTP_USE_TLS:
            smtp.starttls()
        smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        smtp.send_message(message)


async def send_password_reset_email(to_email: str, reset_url: str) -> None:
    if not _password_reset_email_configured():
        if settings.is_production:
            raise RuntimeError("Password reset email is not configured for production")
        print(f"[dev] Password reset link for {to_email}: {reset_url}")
        return

    body = (
        "Hai richiesto il reset della password per Rugby Event Manager.\n\n"
        f"Apri questo link per impostare una nuova password:\n{reset_url}\n\n"
        f"Il link scade tra {settings.RESET_TOKEN_EXPIRE_MINUTES} minuti.\n"
        "Se non hai richiesto tu questa operazione, puoi ignorare questa email.\n"
    )
    await asyncio.to_thread(_send_email_sync, to_email, "Reset password Rugby Event Manager", body)


async def issue_password_reset_token(db: AsyncSession, user: User) -> tuple[str, PasswordResetToken]:
    raw_token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)

    await db.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))

    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=_token_hash(raw_token),
        expires_at=expires_at,
    )
    db.add(reset_token)
    await db.flush()
    return raw_token, reset_token


async def build_and_send_password_reset_email(db: AsyncSession, user: User) -> None:
    raw_token, _ = await issue_password_reset_token(db, user)
    frontend_url = (settings.FRONTEND_URL or "").rstrip("/")
    reset_url = f"{frontend_url}/admin/reset-password?token={quote(raw_token)}"
    await send_password_reset_email(user.email, reset_url)


async def consume_password_reset_token(db: AsyncSession, raw_token: str) -> PasswordResetToken | None:
    result = await db.execute(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == _token_hash(raw_token))
    )
    reset_token = result.scalar_one_or_none()
    if not reset_token:
        return None

    now = datetime.now(timezone.utc)
    expires_at = reset_token.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if reset_token.used_at is not None or expires_at < now:
        return None
    return reset_token
