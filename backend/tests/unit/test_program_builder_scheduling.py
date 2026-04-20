from app.services.program_builder import _group_stage_rounds, _optimize_single_lane_round_sequence


def _flatten(rounds):
    return [pair for round_pairs in rounds for pair in round_pairs]


def _pair_key(pair):
    home, away = pair
    ids = sorted(
        [
            str(home.get("tournament_team_id") or home.get("label")),
            str(away.get("tournament_team_id") or away.get("label")),
        ]
    )
    return tuple(ids)


def _consecutive_count(pairs):
    consecutive = 0
    previous = set()
    for pair in pairs:
        teams = {
            str(team_id)
            for team_id in (pair[0].get("tournament_team_id"), pair[1].get("tournament_team_id"))
            if team_id
        }
        if previous.intersection(teams):
            consecutive += 1
        previous = teams
    return consecutive


def test_optimize_single_lane_round_sequence_reduces_back_to_back_matches():
    slots = [
        {"label": "A", "tournament_team_id": "A"},
        {"label": "B", "tournament_team_id": "B"},
        {"label": "C", "tournament_team_id": "C"},
        {"label": "D", "tournament_team_id": "D"},
        {"label": "E", "tournament_team_id": "E"},
    ]
    rounds = _group_stage_rounds(slots, {})

    original_pairs = _flatten(rounds)
    optimized_pairs = _flatten(_optimize_single_lane_round_sequence(rounds))

    assert sorted(_pair_key(pair) for pair in optimized_pairs) == sorted(_pair_key(pair) for pair in original_pairs)
    assert _consecutive_count(optimized_pairs) <= _consecutive_count(original_pairs)
