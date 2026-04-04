import uuid
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Boolean, Enum, ForeignKey, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class UserRole(str, PyEnum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ORG_ADMIN = "ORG_ADMIN"
    TOURNAMENT_EDITOR = "TOURNAMENT_EDITOR"
    SCORE_KEEPER = "SCORE_KEEPER"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.SCORE_KEEPER)
    organization_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization: Mapped["Organization"] = relationship("Organization", back_populates="users")  # type: ignore
    tournament_assignments: Mapped[list["UserTournamentAssignment"]] = relationship("UserTournamentAssignment", back_populates="user", cascade="all, delete-orphan")  # type: ignore
    password_reset_tokens: Mapped[list["PasswordResetToken"]] = relationship("PasswordResetToken", back_populates="user", cascade="all, delete-orphan")  # type: ignore
