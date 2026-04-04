import uuid
from sqlalchemy import String, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Field(Base):
    __tablename__ = "fields"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=True)
    tournament_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("tournaments.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)          # "Campo 1"
    address: Mapped[str | None] = mapped_column(String(500), nullable=True) # indirizzo completo
    maps_url: Mapped[str | None] = mapped_column(String(1000), nullable=True) # Google Maps link/embed
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization | None"] = relationship("Organization", back_populates="fields")  # type: ignore
    tournament: Mapped["Tournament | None"] = relationship("Tournament", back_populates="fields")  # type: ignore
