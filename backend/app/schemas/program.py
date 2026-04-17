from datetime import datetime, date as date_type
from pydantic import BaseModel
from app.models.match import MatchStatus


class ProgramTeamSlotResponse(BaseModel):
    team_id: str | None = None
    tournament_team_id: str | None = None
    label: str
    team_logo_url: str | None = None
    is_placeholder: bool = False


class ProgramMatchResponse(BaseModel):
    id: str
    phase_id: str
    phase_name: str
    phase_type: str
    group_id: str | None = None
    group_name: str | None = None
    bracket_round: str | None = None
    bracket_round_order: int | None = None
    bracket_position: int | None = None
    scheduled_at: datetime | None = None
    original_scheduled_at: datetime | None = None
    actual_end_at: datetime | None = None
    status: MatchStatus
    field_name: str | None = None
    field_number: int | None = None
    home_team_id: str | None = None
    away_team_id: str | None = None
    home_label: str
    away_label: str
    home_logo_url: str | None = None
    away_logo_url: str | None = None
    home_score: int | None = None
    away_score: int | None = None
    home_tries: int | None = None
    away_tries: int | None = None
    referee: str | None = None
    notes: str | None = None


class ProgramGroupResponse(BaseModel):
    id: str
    name: str
    order: int
    teams: list[ProgramTeamSlotResponse]
    matches: list[ProgramMatchResponse]


class ProgramPhaseResponse(BaseModel):
    id: str
    name: str
    phase_type: str
    phase_order: int
    is_final_phase: bool = False
    scheduled_date: date_type | None = None
    configured_start_at: datetime | None = None
    phase_start_at: datetime | None = None
    estimated_end_at: datetime | None = None
    groups: list[ProgramGroupResponse]
    knockout_matches: list[ProgramMatchResponse]


class ProgramDayResponse(BaseModel):
    date: date_type | None = None
    label: str
    phases: list[ProgramPhaseResponse]


class AgeGroupProgramResponse(BaseModel):
    age_group_id: str
    age_group: str
    display_name: str | None = None
    field_map_url: str | None = None
    participant_count: int
    expected_teams: int | None = None
    hide_future_phases_until_complete: bool = False
    generated: bool
    days: list[ProgramDayResponse]


class TournamentProgramResponse(BaseModel):
    tournament_id: str
    tournament_name: str
    age_groups: list[AgeGroupProgramResponse]


class GroupTeamMoveRequest(BaseModel):
    target_group_id: str


class MatchParticipantsUpdate(BaseModel):
    home_team_id: str | None = None
    away_team_id: str | None = None
