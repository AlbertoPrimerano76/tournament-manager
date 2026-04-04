import uuid
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    primary_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#1a1a2e")
    accent_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#c0392b")

    tournaments: Mapped[list["Tournament"]] = relationship("Tournament", back_populates="organization")  # type: ignore
    teams: Mapped[list["Team"]] = relationship("Team", back_populates="organization")  # type: ignore
    users: Mapped[list["User"]] = relationship("User", back_populates="organization")  # type: ignore
    fields: Mapped[list["Field"]] = relationship("Field", back_populates="organization")  # type: ignore
