import uuid
from sqlalchemy import String, ForeignKey, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(10), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    colors: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    organization: Mapped["Organization"] = relationship("Organization", back_populates="teams")  # type: ignore
    tournament_teams: Mapped[list["TournamentTeam"]] = relationship("TournamentTeam", back_populates="team")


class TournamentTeam(Base):
    __tablename__ = "tournament_teams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tournament_age_group_id: Mapped[str] = mapped_column(String(36), ForeignKey("tournament_age_groups.id"), nullable=False)
    team_id: Mapped[str] = mapped_column(String(36), ForeignKey("teams.id"), nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    tournament_age_group: Mapped["TournamentAgeGroup"] = relationship("TournamentAgeGroup", back_populates="tournament_teams")  # type: ignore
    team: Mapped[Team] = relationship("Team", back_populates="tournament_teams")
    group_teams: Mapped[list["GroupTeam"]] = relationship("GroupTeam", back_populates="tournament_team")  # type: ignore
