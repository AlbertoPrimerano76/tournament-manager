from dataclasses import dataclass, field
from typing import Any


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
    bonus_points: int = 0
    points: int = 0

    @property
    def goal_diff(self) -> int:
        return self.goals_for - self.goals_against


@dataclass
class MatchResult:
    home_team_id: str
    away_team_id: str
    home_score: int
    away_score: int
    home_tries: int = 0
    away_tries: int = 0


def calculate_standings(
    team_ids: list[str],
    results: list[MatchResult],
    scoring_rules: dict[str, Any],
    criteria: list[str] | None = None,
) -> list[TeamStats]:
    """
    Calculate standings for a group of teams.

    scoring_rules: {win_points, draw_points, loss_points, try_bonus, bonus_threshold}
    criteria: ordering criteria, e.g. ["points", "goal_diff", "goals_for", "head_to_head"]
    """
    if criteria is None:
        criteria = ["points", "goal_diff", "goals_for", "head_to_head"]

    win_pts = scoring_rules.get("win_points", 3)
    draw_pts = scoring_rules.get("draw_points", 1)
    loss_pts = scoring_rules.get("loss_points", 0)
    try_bonus = scoring_rules.get("try_bonus", False)
    bonus_threshold = scoring_rules.get("bonus_threshold", 4)

    stats: dict[str, TeamStats] = {tid: TeamStats(team_id=tid) for tid in team_ids}

    for r in results:
        if r.home_team_id not in stats or r.away_team_id not in stats:
            continue

        home = stats[r.home_team_id]
        away = stats[r.away_team_id]

        home.played += 1
        away.played += 1
        home.goals_for += r.home_score
        home.goals_against += r.away_score
        away.goals_for += r.away_score
        away.goals_against += r.home_score
        home.tries_for += r.home_tries
        away.tries_for += r.away_tries

        if r.home_score > r.away_score:
            home.won += 1
            away.lost += 1
            home.points += win_pts
            away.points += loss_pts
        elif r.home_score < r.away_score:
            away.won += 1
            home.lost += 1
            away.points += win_pts
            home.points += loss_pts
        else:
            home.drawn += 1
            away.drawn += 1
            home.points += draw_pts
            away.points += draw_pts

        # Try bonus points
        if try_bonus:
            if r.home_tries >= bonus_threshold:
                home.bonus_points += 1
                home.points += 1
            if r.away_tries >= bonus_threshold:
                away.bonus_points += 1
                away.points += 1

    team_list = list(stats.values())
    return _sort_standings(team_list, results, criteria)


def _sort_standings(
    teams: list[TeamStats],
    results: list[MatchResult],
    criteria: list[str],
) -> list[TeamStats]:
    """Sort standings using configured criteria, handling ties with head-to-head."""

    def get_key(t: TeamStats, crit: str) -> Any:
        match crit:
            case "points":
                return t.points
            case "goal_diff":
                return t.goal_diff
            case "goals_for":
                return t.goals_for
            case "tries_for":
                return t.tries_for
            case _:
                return 0

    non_hth_criteria = [c for c in criteria if c != "head_to_head"]
    hth_position = criteria.index("head_to_head") if "head_to_head" in criteria else len(criteria)

    def primary_sort_key(t: TeamStats):
        # Only use criteria before head_to_head for primary sort
        pre_hth = [c for c in non_hth_criteria if criteria.index(c) < hth_position]
        return tuple(-get_key(t, c) for c in pre_hth)

    teams.sort(key=primary_sort_key)

    # Now resolve ties within groups using head-to-head if applicable
    if "head_to_head" in criteria:
        teams = _resolve_ties_with_hth(teams, results, criteria)

    return teams


def _resolve_ties_with_hth(
    teams: list[TeamStats],
    results: list[MatchResult],
    criteria: list[str],
) -> list[TeamStats]:
    """Find groups of tied teams and resolve using head-to-head sub-standings."""
    hth_position = criteria.index("head_to_head")
    pre_hth = [c for c in criteria if criteria.index(c) < hth_position]
    post_hth = [c for c in criteria if criteria.index(c) > hth_position and c != "head_to_head"]

    def pre_key(t):
        vals = []
        for c in pre_hth:
            if c == "points":
                vals.append(t.points)
            elif c == "goal_diff":
                vals.append(t.goal_diff)
            elif c == "goals_for":
                vals.append(t.goals_for)
        return tuple(vals)

    result_list = []
    teams_sorted = sorted(teams, key=lambda t: tuple(-v for v in pre_key(t)))

    i = 0
    while i < len(teams_sorted):
        # Find group with same pre-HtH values
        j = i + 1
        while j < len(teams_sorted) and pre_key(teams_sorted[j]) == pre_key(teams_sorted[i]):
            j += 1

        tied_group = teams_sorted[i:j]

        if len(tied_group) == 1:
            result_list.extend(tied_group)
        else:
            # Resolve tie using head-to-head
            tied_ids = {t.team_id for t in tied_group}
            hth_results = [r for r in results if r.home_team_id in tied_ids and r.away_team_id in tied_ids]

            # Use default scoring — head-to-head uses same win/draw/loss point logic
            scoring_rules_default = {"win_points": 3, "draw_points": 1, "loss_points": 0}
            hth_stats = calculate_standings(
                list(tied_ids), hth_results, scoring_rules_default,
                criteria=post_hth if post_hth else ["goals_for"]
            )

            # Map back to original TeamStats objects
            hth_order = {s.team_id: idx for idx, s in enumerate(hth_stats)}
            tied_group_sorted = sorted(tied_group, key=lambda t: hth_order.get(t.team_id, 999))
            result_list.extend(tied_group_sorted)

        i = j

    return result_list
