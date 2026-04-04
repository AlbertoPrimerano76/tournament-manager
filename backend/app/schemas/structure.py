from pydantic import BaseModel


class StructureTemplateCreate(BaseModel):
    name: str
    description: str | None = None
    organization_id: str | None = None
    age_group: str | None = None
    config: dict
    is_system: bool = False


class StructureTemplateResponse(BaseModel):
    id: str
    name: str
    description: str | None
    organization_id: str | None
    age_group: str | None
    config: dict
    is_system: bool

    model_config = {"from_attributes": True}


class AgeGroupStructureUpdate(BaseModel):
    structure_template_name: str | None = None
    structure_config: dict


class TournamentParticipantResponse(BaseModel):
    id: str
    tournament_age_group_id: str
    team_id: str
    team_name: str
    team_short_name: str | None
    team_logo_url: str | None
    city: str | None
    contact_name: str | None
    contact_email: str | None
    notes: str | None
