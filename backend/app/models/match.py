import uuid
from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import String, Integer, Boolean, ForeignKey, DateTime, Text, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class MatchStatus(str, PyEnum):
    SCHEDULED = "SCHEDULED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    POSTPONED = "POSTPONED"


class Match(Base):
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    phase_id: Mapped[str] = mapped_column(String(36), ForeignKey("phases.id"), nullable=False)
    group_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("groups.id"), nullable=True)

    bracket_round: Mapped[str | None] = mapped_column(String(100), nullable=True)
    bracket_position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    bracket_round_order: Mapped[int | None] = mapped_column(Integer, nullable=True)

    home_team_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("tournament_teams.id"), nullable=True)
    away_team_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("tournament_teams.id"), nullable=True)

    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    original_scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    actual_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    match_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    field_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    field_number: Mapped[int | None] = mapped_column(Integer, nullable=True)

    status: Mapped[MatchStatus] = mapped_column(Enum(MatchStatus), default=MatchStatus.SCHEDULED)

    home_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    home_tries: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_tries: Mapped[int | None] = mapped_column(Integer, nullable=True)

    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    referee: Mapped[str | None] = mapped_column(String(255), nullable=True)
    result_entered_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    result_entered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    phase: Mapped["Phase"] = relationship("Phase", back_populates="matches")  # type: ignore
    group: Mapped["Group | None"] = relationship("Group")  # type: ignore
    home_team: Mapped["TournamentTeam | None"] = relationship("TournamentTeam", foreign_keys=[home_team_id])  # type: ignore
    away_team: Mapped["TournamentTeam | None"] = relationship("TournamentTeam", foreign_keys=[away_team_id])  # type: ignore
