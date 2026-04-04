from pydantic import BaseModel
from app.models.phase import PhaseType, PhaseStatus


class PhaseCreate(BaseModel):
    tournament_age_group_id: str
    phase_order: int
    name: str
    phase_type: PhaseType
    num_groups: int | None = None
    teams_per_group: int | None = None
    advancement_config: dict | None = None
    num_teams: int | None = None
    has_third_place_match: bool = False
    seeding_source: dict | None = None


class PhaseUpdate(BaseModel):
    phase_order: int | None = None
    name: str | None = None
    status: PhaseStatus | None = None
    num_groups: int | None = None
    teams_per_group: int | None = None
    advancement_config: dict | None = None
    num_teams: int | None = None
    has_third_place_match: bool | None = None
    seeding_source: dict | None = None


class GroupCreate(BaseModel):
    phase_id: str
    name: str
    group_order: int = 0


class GroupTeamAdd(BaseModel):
    tournament_team_id: str


class GroupResponse(BaseModel):
    id: str
    phase_id: str
    name: str
    group_order: int

    model_config = {"from_attributes": True}


class PhaseResponse(BaseModel):
    id: str
    tournament_age_group_id: str
    phase_order: int
    name: str
    phase_type: PhaseType
    status: PhaseStatus
    num_groups: int | None
    teams_per_group: int | None
    advancement_config: dict | None
    num_teams: int | None
    has_third_place_match: bool
    seeding_source: dict | None

    model_config = {"from_attributes": True}
