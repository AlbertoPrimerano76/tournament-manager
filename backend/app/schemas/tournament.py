from datetime import date
from typing import Literal
from pydantic import BaseModel, field_validator
from app.models.tournament import AgeGroup

_ALLOWED_RANKING_CRITERIA = frozenset({
    "points",
    "head_to_head",
    "goal_diff",
    "goals_for",
    "try_diff",
    "tries_for",
    "distance_from_tournament",
})


class ScoringRules(BaseModel):
    win_points: int = 3
    draw_points: int = 1
    loss_points: int = 0
    try_bonus: bool = False
    bonus_threshold: int = 4
    ranking_criteria: list[str] = [
        "points",
        "head_to_head",
        "try_diff",
        "tries_for",
        "distance_from_tournament",
    ]

    @field_validator("ranking_criteria")
    @classmethod
    def validate_criteria(cls, value: list[str]) -> list[str]:
        invalid = [c for c in value if c not in _ALLOWED_RANKING_CRITERIA]
        if invalid:
            raise ValueError(f"Unknown ranking criteria: {invalid}")
        if "points" not in value:
            value = ["points", *value]
        return value

    def to_dict(self) -> dict:
        return self.model_dump()


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
    timezone: str = "Europe/Rome"
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
    timezone: str | None = None
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
    timezone: str
    is_published: bool
    sponsor_images: list[str]
    previous_slugs: list[str] = []
    description: str | None

    model_config = {"from_attributes": True}


class AgeGroupCreate(BaseModel):
    tournament_id: str
    age_group: AgeGroup
    display_name: str | None = None
    field_map_url: str | None = None
    scoring_rules: ScoringRules = ScoringRules()

    def scoring_rules_dict(self) -> dict:
        return self.scoring_rules.to_dict()


class AgeGroupUpdate(BaseModel):
    display_name: str | None = None
    field_map_url: str | None = None
    scoring_rules: ScoringRules | None = None


class AgeGroupResponse(BaseModel):
    id: str
    tournament_id: str
    age_group: AgeGroup
    display_name: str | None
    field_map_url: str | None
    structure_template_name: str | None
    structure_config: dict | None
    scoring_rules: dict

    model_config = {"from_attributes": True}
