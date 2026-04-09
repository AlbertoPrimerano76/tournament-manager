from datetime import datetime
from pydantic import BaseModel, model_validator
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
    # Enriched team info (populated when relationships are eagerly loaded)
    home_label: str | None = None
    away_label: str | None = None
    home_logo_url: str | None = None
    away_logo_url: str | None = None

    @model_validator(mode='before')
    @classmethod
    def populate_team_labels(cls, v):
        if isinstance(v, dict):
            return v
        ht = getattr(v, 'home_team', None)
        at = getattr(v, 'away_team', None)
        try:
            if ht and getattr(ht, 'team', None):
                v.__dict__.setdefault('home_label', ht.team.name)
                v.__dict__.setdefault('home_logo_url', ht.team.logo_url)
            if at and getattr(at, 'team', None):
                v.__dict__.setdefault('away_label', at.team.name)
                v.__dict__.setdefault('away_logo_url', at.team.logo_url)
        except Exception:
            pass
        return v

    model_config = {"from_attributes": True}


class TodayMatchItem(BaseModel):
    id: str
    tournament_id: str
    tournament_name: str
    age_group_id: str
    age_group_name: str
    scheduled_at: datetime | None
    field_name: str | None
    field_number: int | None
    status: MatchStatus
    home_label: str | None
    away_label: str | None
    home_score: int | None
    away_score: int | None
    home_tries: int | None
    away_tries: int | None
