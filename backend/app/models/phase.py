import uuid
from enum import Enum as PyEnum
from sqlalchemy import String, Integer, Boolean, ForeignKey, JSON, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class PhaseType(str, PyEnum):
    GROUP_STAGE = "GROUP_STAGE"
    KNOCKOUT = "KNOCKOUT"
    PLAYOFF = "PLAYOFF"
    ROUND_ROBIN = "ROUND_ROBIN"
    FINAL = "FINAL"


class PhaseStatus(str, PyEnum):
    NOT_STARTED = "NOT_STARTED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"


class Phase(Base):
    __tablename__ = "phases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tournament_age_group_id: Mapped[str] = mapped_column(String(36), ForeignKey("tournament_age_groups.id"), nullable=False)
    phase_order: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phase_type: Mapped[PhaseType] = mapped_column(Enum(PhaseType), nullable=False)
    status: Mapped[PhaseStatus] = mapped_column(Enum(PhaseStatus), default=PhaseStatus.NOT_STARTED)

    # GROUP_STAGE config
    num_groups: Mapped[int | None] = mapped_column(Integer, nullable=True)
    teams_per_group: Mapped[int | None] = mapped_column(Integer, nullable=True)
    advancement_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # KNOCKOUT config
    num_teams: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_third_place_match: Mapped[bool] = mapped_column(Boolean, default=False)
    seeding_source: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    tournament_age_group: Mapped["TournamentAgeGroup"] = relationship("TournamentAgeGroup", back_populates="phases")  # type: ignore
    groups: Mapped[list["Group"]] = relationship("Group", back_populates="phase", cascade="all, delete-orphan")
    matches: Mapped[list["Match"]] = relationship("Match", back_populates="phase", cascade="all, delete-orphan")  # type: ignore


class Group(Base):
    __tablename__ = "groups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    phase_id: Mapped[str] = mapped_column(String(36), ForeignKey("phases.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    group_order: Mapped[int] = mapped_column(Integer, default=0)

    phase: Mapped[Phase] = relationship("Phase", back_populates="groups")
    group_teams: Mapped[list["GroupTeam"]] = relationship("GroupTeam", back_populates="group", cascade="all, delete-orphan")


class GroupTeam(Base):
    __tablename__ = "group_teams"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    group_id: Mapped[str] = mapped_column(String(36), ForeignKey("groups.id"), nullable=False)
    tournament_team_id: Mapped[str] = mapped_column(String(36), ForeignKey("tournament_teams.id"), nullable=False)

    group: Mapped[Group] = relationship("Group", back_populates="group_teams")
    tournament_team: Mapped["TournamentTeam"] = relationship("TournamentTeam", back_populates="group_teams")  # type: ignore
