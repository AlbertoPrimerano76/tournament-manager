import uuid
from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class UserTournamentAssignment(Base):
    __tablename__ = "user_tournament_assignments"
    __table_args__ = (
        UniqueConstraint("user_id", "tournament_id", name="uq_user_tournament_assignment"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    tournament_id: Mapped[str] = mapped_column(String(36), ForeignKey("tournaments.id"), nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="tournament_assignments")  # type: ignore
    tournament: Mapped["Tournament"] = relationship("Tournament", back_populates="user_assignments")  # type: ignore
