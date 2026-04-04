from pydantic import BaseModel


class OrganizationCreate(BaseModel):
    name: str
    slug: str
    logo_url: str | None = None
    city: str | None = None
    website: str | None = None
    primary_color: str = "#1a1a2e"
    accent_color: str = "#c0392b"


class OrganizationUpdate(BaseModel):
    name: str | None = None
    logo_url: str | None = None
    city: str | None = None
    website: str | None = None
    primary_color: str | None = None
    accent_color: str | None = None


class OrganizationResponse(BaseModel):
    id: str
    name: str
    slug: str
    logo_url: str | None
    city: str | None
    website: str | None
    primary_color: str
    accent_color: str

    model_config = {"from_attributes": True}
