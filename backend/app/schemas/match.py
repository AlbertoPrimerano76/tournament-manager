from datetime import datetime
from pydantic import BaseModel
from app.models.match import MatchStatus


class MatchCreate(BaseModel):
    phase_id: str
    group_id: str | None = None
    bracket_round: str | None = None
    bracket_position: int | None = None
    bracket_round_order: int | None = None
    home_team_id: str | None = None
    away_team_id: str | None = None
    scheduled_at: datetime | None = None
    actual_end_at: datetime | None = None
    field_name: str | None = None
    field_number: int | None = None
    referee: str | None = None
    notes: str | None = None


class MatchUpdate(BaseModel):
    home_team_id: str | None = None
    away_team_id: str | None = None
    scheduled_at: datetime | None = None
    actual_end_at: datetime | None = None
    field_name: str | None = None
    field_number: int | None = None
    status: MatchStatus | None = None
    referee: str | None = None
    notes: str | None = None


class MatchScheduleUpdate(BaseModel):
    scheduled_at: datetime | None = None
    actual_end_at: datetime | None = None
    delay_minutes: int | None = None
    field_name: str | None = None
    field_number: int | None = None
    referee: str | None = None
    notes: str | None = None
    propagate_delay: bool = False


class ScoreEntry(BaseModel):
    home_score: int | None = None
    away_score: int | None = None
    home_tries: int | None = None
    away_tries: int | None = None
    status: MatchStatus | None = None
    clear_result: bool = False


class BulkGroupScheduleUpdate(BaseModel):
    start_at: datetime | None = None
    step_minutes: int | None = None
    field_name: str | None = None
    field_number: int | None = None
    referee: str | None = None


class MatchResponse(BaseModel):
    id: str
    phase_id: str
    group_id: str | None
    bracket_round: str | None
    bracket_position: int | None
    home_team_id: str | None
    away_team_id: str | None
    scheduled_at: datetime | None
    actual_end_at: datetime | None
    field_name: str | None
    field_number: int | None
    status: MatchStatus
    home_score: int | None
    away_score: int | None
    home_tries: int | None
    away_tries: int | None
    referee: str | None
    notes: str | None

    model_config = {"from_attributes": True}
