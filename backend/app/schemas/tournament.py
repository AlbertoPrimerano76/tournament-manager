from datetime import date
from pydantic import BaseModel
from app.models.tournament import AgeGroup


class TournamentCreate(BaseModel):
    organization_id: str
    name: str
    event_type: str = "TOURNAMENT"
    year: int
    slug: str
    edition: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    location: str | None = None
    venue_map_url: str | None = None
    logo_url: str | None = None
    theme_primary_color: str | None = None
    theme_accent_color: str | None = None
    is_published: bool = False
    description: str | None = None


class TournamentUpdate(BaseModel):
    name: str | None = None
    event_type: str | None = None
    edition: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    location: str | None = None
    venue_map_url: str | None = None
    logo_url: str | None = None
    theme_primary_color: str | None = None
    theme_accent_color: str | None = None
    is_published: bool | None = None
    description: str | None = None
    sponsor_images: list[str] | None = None


class TournamentResponse(BaseModel):
    id: str
    organization_id: str
    organization_name: str | None = None
    organization_slug: str | None = None
    organization_logo_url: str | None = None
    name: str
    event_type: str
    year: int
    slug: str
    edition: str | None
    start_date: date | None
    end_date: date | None
    location: str | None
    venue_map_url: str | None
    logo_url: str | None
    theme_primary_color: str | None
    theme_accent_color: str | None
    is_published: bool
    sponsor_images: list[str]
    previous_slugs: list[str] = []
    description: str | None

    model_config = {"from_attributes": True}


class AgeGroupCreate(BaseModel):
    tournament_id: str
    age_group: AgeGroup
    display_name: str | None = None
    scoring_rules: dict = {
        "win_points": 3, "draw_points": 1, "loss_points": 0,
        "try_bonus": False, "bonus_threshold": 4
    }


class AgeGroupUpdate(BaseModel):
    display_name: str | None = None
    scoring_rules: dict | None = None


class AgeGroupResponse(BaseModel):
    id: str
    tournament_id: str
    age_group: AgeGroup
    display_name: str | None
    structure_template_name: str | None
    structure_config: dict | None
    scoring_rules: dict

    model_config = {"from_attributes": True}
