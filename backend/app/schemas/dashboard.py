from pydantic import BaseModel


class DashboardTournamentItem(BaseModel):
    id: str
    name: str
    slug: str
    organization_name: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    is_published: bool
    total_matches: int
    completed_matches: int
    today_matches: int


class LiveMatchItem(BaseModel):
    match_id: str
    tournament_name: str
    tournament_id: str
    age_group_id: str
    age_group_name: str
    home_label: str
    away_label: str
    home_score: int | None
    away_score: int | None
    field_name: str | None
    field_number: int | None


class DashboardSummaryResponse(BaseModel):
    role: str
    published_tournaments: int
    organizations_count: int
    matches_today: int
    total_matches: int
    completed_matches: int
    scheduled_matches: int
    in_progress_matches: int
    tournaments: list[DashboardTournamentItem]
    live_matches: list[LiveMatchItem] = []
    quick_access_tournament_id: str | None = None
    quick_access_tournament_slug: str | None = None
