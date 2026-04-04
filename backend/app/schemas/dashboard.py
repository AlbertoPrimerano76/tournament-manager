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
    quick_access_tournament_id: str | None = None
    quick_access_tournament_slug: str | None = None
