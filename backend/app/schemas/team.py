from pydantic import BaseModel


class TeamCreate(BaseModel):
    organization_id: str
    name: str
    short_name: str | None = None
    logo_url: str | None = None
    city: str | None = None
    colors: dict | None = None


class TeamUpdate(BaseModel):
    name: str | None = None
    short_name: str | None = None
    logo_url: str | None = None
    city: str | None = None
    colors: dict | None = None


class TeamResponse(BaseModel):
    id: str
    organization_id: str
    name: str
    short_name: str | None
    logo_url: str | None
    city: str | None
    colors: dict | None

    model_config = {"from_attributes": True}


class TournamentTeamCreate(BaseModel):
    tournament_age_group_id: str
    team_id: str
    contact_name: str | None = None
    contact_email: str | None = None
    notes: str | None = None


class TournamentTeamResponse(BaseModel):
    id: str
    tournament_age_group_id: str
    team_id: str
    contact_name: str | None
    contact_email: str | None
    notes: str | None

    model_config = {"from_attributes": True}
