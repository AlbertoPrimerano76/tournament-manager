from datetime import datetime
from pydantic import BaseModel
from app.models.match import MatchStatus
from app.services.program_builder import decode_seed_note


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
    match_duration_minutes: int | None = None
    field_name: str | None = None
    field_number: int | None = None
    status: MatchStatus | None = None
    referee: str | None = None
    notes: str | None = None


class MatchScheduleUpdate(BaseModel):
    scheduled_at: datetime | None = None
    actual_end_at: datetime | None = None
    delay_minutes: int | None = None
    match_duration_minutes: int | None = None
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
    original_scheduled_at: datetime | None
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
    # Duration of the match in minutes (from age-group schedule config)
    match_duration_minutes: int | None = None

    @classmethod
    def from_match(cls, match: object, match_duration_minutes: int | None = None) -> "MatchResponse":
        data = {
            "id": getattr(match, "id"),
            "phase_id": getattr(match, "phase_id"),
            "group_id": getattr(match, "group_id"),
            "bracket_round": getattr(match, "bracket_round"),
            "bracket_position": getattr(match, "bracket_position"),
            "home_team_id": getattr(match, "home_team_id"),
            "away_team_id": getattr(match, "away_team_id"),
            "scheduled_at": getattr(match, "scheduled_at"),
            "original_scheduled_at": getattr(match, "original_scheduled_at", None),
            "actual_end_at": getattr(match, "actual_end_at"),
            "match_duration_minutes": getattr(match, "match_duration_minutes", None) if getattr(match, "match_duration_minutes", None) is not None else match_duration_minutes,
            "field_name": getattr(match, "field_name"),
            "field_number": getattr(match, "field_number"),
            "status": getattr(match, "status"),
            "home_score": getattr(match, "home_score"),
            "away_score": getattr(match, "away_score"),
            "home_tries": getattr(match, "home_tries"),
            "away_tries": getattr(match, "away_tries"),
            "referee": getattr(match, "referee"),
            "notes": getattr(match, "notes"),
            "home_label": None,
            "away_label": None,
            "home_logo_url": None,
            "away_logo_url": None,
        }

        match_dict = getattr(match, "__dict__", {})
        home_team = match_dict.get("home_team")
        away_team = match_dict.get("away_team")
        home_team_model = getattr(home_team, "__dict__", {}).get("team") if home_team is not None else None
        away_team_model = getattr(away_team, "__dict__", {}).get("team") if away_team is not None else None

        if home_team_model is not None:
            data["home_label"] = getattr(home_team_model, "name", None)
            data["home_logo_url"] = getattr(home_team_model, "logo_url", None)
        if away_team_model is not None:
            data["away_label"] = getattr(away_team_model, "name", None)
            data["away_logo_url"] = getattr(away_team_model, "logo_url", None)
        if data["home_label"] is None or data["away_label"] is None:
            seed_home, seed_away, _ = decode_seed_note(getattr(match, "notes", None))
            data["home_label"] = data["home_label"] or seed_home
            data["away_label"] = data["away_label"] or seed_away

        return cls.model_validate(data)

    model_config = {"from_attributes": True}


class TodayMatchItem(BaseModel):
    id: str
    tournament_id: str
    tournament_name: str
    age_group_id: str
    age_group_name: str
    scheduled_at: datetime | None
    original_scheduled_at: datetime | None = None
    field_name: str | None
    field_number: int | None
    status: MatchStatus
    home_label: str | None
    away_label: str | None
    home_score: int | None
    away_score: int | None
    home_tries: int | None
    away_tries: int | None
