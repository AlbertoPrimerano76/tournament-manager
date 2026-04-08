from pydantic import BaseModel


class FieldCreate(BaseModel):
    organization_id: str | None = None
    tournament_id: str | None = None
    name: str
    age_group: str | None = None
    address: str | None = None
    maps_url: str | None = None
    photo_url: str | None = None
    notes: str | None = None


class FieldUpdate(BaseModel):
    name: str | None = None
    age_group: str | None = None
    address: str | None = None
    maps_url: str | None = None
    photo_url: str | None = None
    notes: str | None = None


class FieldResponse(BaseModel):
    id: str
    organization_id: str | None
    tournament_id: str | None
    name: str
    age_group: str | None
    address: str | None
    maps_url: str | None
    photo_url: str | None
    notes: str | None

    model_config = {"from_attributes": True}
