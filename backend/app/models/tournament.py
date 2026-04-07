import uuid
from datetime import date
from enum import Enum as PyEnum
from sqlalchemy import String, Boolean, Date, Integer, ForeignKey, JSON, Enum, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class AgeGroup(str, PyEnum):
    U6 = "U6"
    U8 = "U8"
    U10 = "U10"
    U12 = "U12"
    U14 = "U14"
    U16 = "U16"
    U18 = "U18"
    U20 = "U20"


class EventType(str, PyEnum):
    TOURNAMENT = "TOURNAMENT"
    GATHERING = "GATHERING"


class Tournament(Base):
    __tablename__ = "tournaments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    organization_id: Mapped[str] = mapped_column(String(36), ForeignKey("organizations.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(20), nullable=False, default=EventType.TOURNAMENT.value)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    edition: Mapped[str | None] = mapped_column(String(100), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    venue_map_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    theme_primary_color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    theme_accent_color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    sponsor_images: Mapped[list] = mapped_column(JSON, default=list)
    previous_slugs: Mapped[list] = mapped_column(JSON, default=list)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    organization: Mapped["Organization"] = relationship("Organization", back_populates="tournaments")  # type: ignore
    age_groups: Mapped[list["TournamentAgeGroup"]] = relationship("TournamentAgeGroup", back_populates="tournament", cascade="all, delete-orphan")  # type: ignore
    fields: Mapped[list["Field"]] = relationship("Field", back_populates="tournament", cascade="all, delete-orphan")  # type: ignore
    user_assignments: Mapped[list["UserTournamentAssignment"]] = relationship("UserTournamentAssignment", back_populates="tournament", cascade="all, delete-orphan")  # type: ignore


class TournamentAgeGroup(Base):
    __tablename__ = "tournament_age_groups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tournament_id: Mapped[str] = mapped_column(String(36), ForeignKey("tournaments.id"), nullable=False)
    age_group: Mapped[AgeGroup] = mapped_column(Enum(AgeGroup), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    structure_template_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    structure_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    scoring_rules: Mapped[dict] = mapped_column(JSON, default=lambda: {
        "win_points": 3, "draw_points": 1, "loss_points": 0,
        "try_bonus": False, "bonus_threshold": 4,
        "ranking_criteria": [
            "points",
            "head_to_head",
            "try_diff",
            "tries_for",
            "distance_from_tournament",
        ],
    })

    tournament: Mapped[Tournament] = relationship("Tournament", back_populates="age_groups")
    phases: Mapped[list["Phase"]] = relationship("Phase", back_populates="tournament_age_group", cascade="all, delete-orphan", order_by="Phase.phase_order")  # type: ignore
    tournament_teams: Mapped[list["TournamentTeam"]] = relationship("TournamentTeam", back_populates="tournament_age_group", cascade="all, delete-orphan")  # type: ignore
