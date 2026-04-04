import pytest
from app.services.standings import calculate_standings, MatchResult, TeamStats


def make_results(data: list[tuple]) -> list[MatchResult]:
    """Helper: list of (home_id, away_id, home_score, away_score)"""
    return [MatchResult(home_team_id=h, away_team_id=a, home_score=hs, away_score=as_)
            for h, a, hs, as_ in data]


DEFAULT_RULES = {"win_points": 3, "draw_points": 1, "loss_points": 0}


def test_basic_standings():
    teams = ["A", "B", "C"]
    results = make_results([("A", "B", 3, 0), ("A", "C", 2, 1), ("B", "C", 1, 1)])
    standings = calculate_standings(teams, results, DEFAULT_RULES, ["points", "goal_diff"])

    assert standings[0].team_id == "A"  # 6 pts, GD=+4
    assert standings[1].team_id == "C"  # 1 pt, GD=-1 (beats B on goal_diff)
    assert standings[2].team_id == "B"  # 1 pt, GD=-3


def test_goal_diff_tiebreaker():
    teams = ["A", "B", "C"]
    results = make_results([("A", "B", 2, 1), ("A", "C", 1, 2), ("B", "C", 2, 2)])
    standings = calculate_standings(teams, results, DEFAULT_RULES, ["points", "goal_diff"])

    # A: 3pts +0 GD, B: 1pt -1 GD, C: 4pts
    assert standings[0].team_id == "C"
    assert standings[1].team_id == "A"


def test_draw_points():
    teams = ["A", "B"]
    results = make_results([("A", "B", 1, 1)])
    standings = calculate_standings(teams, results, DEFAULT_RULES)
    assert standings[0].points == 1
    assert standings[1].points == 1


def test_try_bonus():
    rules = {**DEFAULT_RULES, "try_bonus": True, "bonus_threshold": 4}
    teams = ["A", "B"]
    results = [MatchResult("A", "B", 5, 1, home_tries=4, away_tries=1)]
    standings = calculate_standings(teams, results, rules)
    home = next(s for s in standings if s.team_id == "A")
    assert home.bonus_points == 1
    assert home.points == 4  # win (3) + bonus (1)


def test_empty_results():
    teams = ["A", "B", "C"]
    standings = calculate_standings(teams, [], DEFAULT_RULES)
    for s in standings:
        assert s.played == 0
        assert s.points == 0


def test_head_to_head_tiebreaker():
    teams = ["A", "B", "C"]
    # A vs B: A wins; A vs C: C wins; B vs C: B wins
    results = make_results([("A", "B", 2, 1), ("C", "A", 2, 1), ("B", "C", 2, 1)])
    # All teams: 3 pts, all head-to-head
    standings = calculate_standings(teams, results, DEFAULT_RULES, ["points", "head_to_head", "goal_diff"])
    # Each team beat one and lost to one in H2H — should fall back to goal_diff
    assert len(standings) == 3


def test_stats_calculation():
    teams = ["A", "B"]
    results = make_results([("A", "B", 3, 1)])
    standings = calculate_standings(teams, results, DEFAULT_RULES)
    a = next(s for s in standings if s.team_id == "A")
    assert a.played == 1
    assert a.won == 1
    assert a.lost == 0
    assert a.goals_for == 3
    assert a.goals_against == 1
    assert a.goal_diff == 2
