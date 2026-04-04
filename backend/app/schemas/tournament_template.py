from pydantic import BaseModel


class TournamentTemplateCreate(BaseModel):
    name: str
    description: str | None = None
    organization_id: str | None = None
    config: dict
    is_system: bool = False


class TournamentTemplateResponse(BaseModel):
    id: str
    name: str
    description: str | None
    organization_id: str | None
    config: dict
    is_system: bool

    model_config = {"from_attributes": True}
