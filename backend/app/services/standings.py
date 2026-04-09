from dataclasses import dataclass
from math import atan2, cos, radians, sin, sqrt
import re
from typing import Any

from app.config.city_coordinates import CITY_COORDINATES


DEFAULT_RANKING_CRITERIA = [
    "points",
    "head_to_head",
    "try_diff",
    "tries_for",
    "distance_from_tournament",
]


@dataclass
class TeamStats:
    team_id: str
    team_name: str | None = None
    played: int = 0
    won: int = 0
    drawn: int = 0
    lost: int = 0
    goals_for: int = 0
    goals_against: int = 0
    tries_for: int = 0
    tries_against: int = 0
    bonus_points: int = 0
    points: int = 0
    distance_km: float | None = None

    @property
    def goal_diff(self) -> int:
        return self.goals_for - self.goals_against

    @property
    def try_diff(self) -> int:
        return self.tries_for - self.tries_against


@dataclass
class MatchResult:
    home_team_id: str
    away_team_id: str
    home_score: int
    away_score: int
    home_tries: int = 0
    away_tries: int = 0


def normalize_scoring_rules(raw_rules: dict[str, Any] | None) -> dict[str, Any]:
    rules = raw_rules or {}
    return {
        "win_points": int(rules.get("win_points", 3)),
        "draw_points": int(rules.get("draw_points", 1)),
        "loss_points": int(rules.get("loss_points", 0)),
        "try_bonus": bool(rules.get("try_bonus", False)),
        "bonus_threshold": int(rules.get("bonus_threshold", 4)),
        "ranking_criteria": normalize_ranking_criteria(rules.get("ranking_criteria")),
    }


def normalize_ranking_criteria(raw_criteria: Any) -> list[str]:
    allowed = {
        "points",
        "head_to_head",
        "goal_diff",
        "goals_for",
        "try_diff",
        "tries_for",
        "distance_from_tournament",
    }
    if not isinstance(raw_criteria, list):
        return DEFAULT_RANKING_CRITERIA.copy()

    criteria: list[str] = ["points"]
    for item in raw_criteria:
        if not isinstance(item, str):
            continue
        if item not in allowed or item == "points" or item in criteria:
            continue
        criteria.append(item)

    return criteria if len(criteria) > 1 else DEFAULT_RANKING_CRITERIA.copy()


def calculate_standings(
    team_ids: list[str],
    results: list[MatchResult],
    scoring_rules: dict[str, Any],
    criteria: list[str] | None = None,
    team_metadata: dict[str, dict[str, Any]] | None = None,
    tournament_location: str | None = None,
) -> list[TeamStats]:
    rules = normalize_scoring_rules(scoring_rules)
    normalized_criteria = normalize_ranking_criteria(criteria or rules.get("ranking_criteria"))
    stats = _build_stats(team_ids, results, rules, team_metadata, tournament_location)
    return sort_team_stats(stats, results, rules, normalized_criteria, team_metadata, tournament_location)


def sort_team_stats(
    teams: list[TeamStats],
    results: list[MatchResult],
    scoring_rules: dict[str, Any],
    criteria: list[str] | None = None,
    team_metadata: dict[str, dict[str, Any]] | None = None,
    tournament_location: str | None = None,
) -> list[TeamStats]:
    rules = normalize_scoring_rules(scoring_rules)
    normalized_criteria = normalize_ranking_criteria(criteria or rules.get("ranking_criteria"))
    return _sort_by_criteria(
        teams=list(teams),
        results=results,
        criteria=normalized_criteria,
        scoring_rules=rules,
        team_metadata=team_metadata,
        tournament_location=tournament_location,
    )


def _build_stats(
    team_ids: list[str],
    results: list[MatchResult],
    scoring_rules: dict[str, Any],
    team_metadata: dict[str, dict[str, Any]] | None = None,
    tournament_location: str | None = None,
) -> list[TeamStats]:
    stats: dict[str, TeamStats] = {}
    for team_id in team_ids:
        metadata = team_metadata.get(team_id, {}) if team_metadata else {}
        stats[team_id] = TeamStats(
            team_id=team_id,
            team_name=metadata.get("team_name"),
            distance_km=_extract_distance_km(metadata, tournament_location),
        )

    for result in results:
        if result.home_team_id not in stats or result.away_team_id not in stats:
            continue

        home = stats[result.home_team_id]
        away = stats[result.away_team_id]

        home.played += 1
        away.played += 1
        home.goals_for += result.home_score
        home.goals_against += result.away_score
        away.goals_for += result.away_score
        away.goals_against += result.home_score
        home.tries_for += result.home_tries
        home.tries_against += result.away_tries
        away.tries_for += result.away_tries
        away.tries_against += result.home_tries

        if result.home_score > result.away_score:
            home.won += 1
            away.lost += 1
            home.points += scoring_rules["win_points"]
            away.points += scoring_rules["loss_points"]
        elif result.home_score < result.away_score:
            away.won += 1
            home.lost += 1
            away.points += scoring_rules["win_points"]
            home.points += scoring_rules["loss_points"]
        else:
            home.drawn += 1
            away.drawn += 1
            home.points += scoring_rules["draw_points"]
            away.points += scoring_rules["draw_points"]

        if scoring_rules["try_bonus"]:
            if result.home_tries >= scoring_rules["bonus_threshold"]:
                home.bonus_points += 1
                home.points += 1
            if result.away_tries >= scoring_rules["bonus_threshold"]:
                away.bonus_points += 1
                away.points += 1

    return list(stats.values())


def _sort_by_criteria(
    teams: list[TeamStats],
    results: list[MatchResult],
    criteria: list[str],
    scoring_rules: dict[str, Any],
    team_metadata: dict[str, dict[str, Any]] | None,
    tournament_location: str | None,
) -> list[TeamStats]:
    if len(teams) <= 1:
        return teams

    if not criteria:
        return sorted(teams, key=_final_sort_key)

    criterion = criteria[0]
    remaining = criteria[1:]

    if criterion == "head_to_head":
        return _sort_by_head_to_head(teams, results, remaining, scoring_rules, team_metadata, tournament_location)

    if criterion in {"try_diff", "tries_for"}:
        subset_results = _filter_results_for_team_ids(results, [team.team_id for team in teams])
        subset_stats = _build_stats(
            [team.team_id for team in teams],
            subset_results,
            scoring_rules,
            team_metadata,
            tournament_location,
        )
        subset_by_team = {team.team_id: team for team in subset_stats}

        return _sort_by_grouped_values(
            teams=teams,
            results=subset_results,
            criteria=criteria,
            values={
                team.team_id: _criterion_value(subset_by_team.get(team.team_id, team), criterion)
                for team in teams
            },
            scoring_rules=scoring_rules,
            team_metadata=team_metadata,
            tournament_location=tournament_location,
        )

    grouped: dict[float, list[TeamStats]] = {}
    for team in teams:
        value = _criterion_value(team, criterion)
        grouped.setdefault(value, []).append(team)

    ordered: list[TeamStats] = []
    for value in sorted(grouped.keys(), reverse=True):
        bucket = grouped[value]
        if len(bucket) == 1:
            ordered.extend(bucket)
        else:
            ordered.extend(
                _sort_by_criteria(bucket, results, remaining, scoring_rules, team_metadata, tournament_location)
            )

    return ordered


def _sort_by_grouped_values(
    *,
    teams: list[TeamStats],
    results: list[MatchResult],
    criteria: list[str],
    values: dict[str, float],
    scoring_rules: dict[str, Any],
    team_metadata: dict[str, dict[str, Any]] | None,
    tournament_location: str | None,
) -> list[TeamStats]:
    grouped: dict[float, list[TeamStats]] = {}
    for team in teams:
        grouped.setdefault(values.get(team.team_id, 0.0), []).append(team)

    ordered_values = sorted(grouped.keys(), reverse=True)
    if len(ordered_values) == 1:
        return _sort_by_criteria(
            teams,
            results,
            criteria[1:],
            scoring_rules,
            team_metadata,
            tournament_location,
        )

    top_value = ordered_values[0]
    top_bucket = grouped[top_value]
    top_ids = [team.team_id for team in top_bucket]
    top_results = _filter_results_for_team_ids(results, top_ids)

    if len(top_bucket) == 1:
        ordered = top_bucket.copy()
    else:
        ordered = _sort_by_criteria(
            top_bucket,
            top_results,
            criteria[1:],
            scoring_rules,
            team_metadata,
            tournament_location,
        )

    remaining_teams = [team for team in teams if team.team_id not in set(top_ids)]
    if not remaining_teams:
        return ordered

    remaining_results = _filter_results_for_team_ids(results, [team.team_id for team in remaining_teams])
    return ordered + _sort_by_criteria(
        remaining_teams,
        remaining_results,
        criteria,
        scoring_rules,
        team_metadata,
        tournament_location,
    )


def _filter_results_for_team_ids(results: list[MatchResult], team_ids: list[str]) -> list[MatchResult]:
    if not team_ids:
        return []
    allowed = set(team_ids)
    return [
        result
        for result in results
        if result.home_team_id in allowed and result.away_team_id in allowed
    ]


def _sort_by_head_to_head(
    teams: list[TeamStats],
    results: list[MatchResult],
    remaining: list[str],
    scoring_rules: dict[str, Any],
    team_metadata: dict[str, dict[str, Any]] | None,
    tournament_location: str | None,
) -> list[TeamStats]:
    tied_ids = {team.team_id for team in teams}
    hth_results = [
        result
        for result in results
        if result.home_team_id in tied_ids and result.away_team_id in tied_ids
    ]
    if not hth_results:
        return _sort_by_criteria(teams, results, remaining, scoring_rules, team_metadata, tournament_location)

    hth_stats = _build_stats(list(tied_ids), hth_results, scoring_rules, team_metadata, tournament_location)
    ordered_hth = _sort_by_criteria(
        hth_stats,
        hth_results,
        ["points", *[criterion for criterion in remaining if criterion != "head_to_head"]],
        scoring_rules,
        team_metadata,
        tournament_location,
    )
    hth_by_team = {team.team_id: team for team in ordered_hth}
    hth_criteria = ["points", *[criterion for criterion in remaining if criterion != "head_to_head"]]

    grouped: dict[tuple[float, ...], list[TeamStats]] = {}
    for team in teams:
        hth_team = hth_by_team.get(team.team_id)
        if hth_team is None:
            key = tuple()
        else:
            key = tuple(_criterion_value(hth_team, criterion) for criterion in hth_criteria)
        grouped.setdefault(key, []).append(team)

    ordered: list[TeamStats] = []
    for key in sorted(grouped.keys(), reverse=True):
        bucket = grouped[key]
        if len(bucket) == 1:
            ordered.extend(bucket)
        else:
            ordered.extend(
                _sort_by_criteria(bucket, results, remaining, scoring_rules, team_metadata, tournament_location)
            )
    return ordered


def _criterion_value(team: TeamStats, criterion: str) -> float:
    match criterion:
        case "points":
            return float(team.points)
        case "goal_diff":
            return float(team.goal_diff)
        case "goals_for":
            return float(team.goals_for)
        case "try_diff":
            return float(team.try_diff)
        case "tries_for":
            return float(team.tries_for)
        case "distance_from_tournament":
            return float(team.distance_km or 0)
        case _:
            return 0.0


def _final_sort_key(team: TeamStats) -> tuple[str, str]:
    return ((team.team_name or "").lower(), team.team_id)


def _extract_distance_km(metadata: dict[str, Any], tournament_location: str | None) -> float | None:
    raw_distance = metadata.get("distance_km")
    if isinstance(raw_distance, (int, float)):
        return float(raw_distance)

    city = metadata.get("city")
    if not isinstance(city, str) or not city.strip() or not tournament_location:
        return None

    return _estimate_distance_km(city, tournament_location)


def _estimate_distance_km(origin: str, destination: str) -> float | None:
    origin_coords = _resolve_coordinates(origin)
    destination_coords = _resolve_coordinates(destination)
    if origin_coords is None or destination_coords is None:
        return None
    return _haversine_km(origin_coords, destination_coords)


def _resolve_coordinates(value: str) -> tuple[float, float] | None:
    normalized = _normalize_place_name(value)
    if not normalized:
        return None

    if normalized in CITY_COORDINATES:
        return CITY_COORDINATES[normalized]

    for part in re.split(r"[,/()-]", normalized):
        candidate = part.strip()
        if candidate in CITY_COORDINATES:
            return CITY_COORDINATES[candidate]

    for city, coords in CITY_COORDINATES.items():
        if city in normalized:
            return coords

    return None


def _normalize_place_name(value: str) -> str:
    cleaned = value.strip().lower()
    replacements = str.maketrans({
        "à": "a",
        "á": "a",
        "è": "e",
        "é": "e",
        "ì": "i",
        "í": "i",
        "ò": "o",
        "ó": "o",
        "ù": "u",
        "ú": "u",
        "'": "",
        "’": "",
        ".": " ",
    })
    cleaned = cleaned.translate(replacements)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.replace(" ", "")


def _haversine_km(origin: tuple[float, float], destination: tuple[float, float]) -> float:
    lat1, lon1 = origin
    lat2, lon2 = destination
    radius_km = 6371.0

    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = (
        sin(d_lat / 2) ** 2
        + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    )
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return round(radius_km * c, 1)
