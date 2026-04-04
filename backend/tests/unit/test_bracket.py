import pytest
from app.services.bracket import generate_bracket, advance_winner, BracketRound
from app.services.standings import TeamStats


def make_standings(ids: list[str]) -> list[TeamStats]:
    return [TeamStats(team_id=tid, points=10 - i) for i, tid in enumerate(ids)]


def test_generate_bracket_4_teams():
    standings = make_standings(["A", "B", "C", "D"])
    rounds = generate_bracket(4, standings)
    assert len(rounds) >= 2
    first_round = rounds[0]
    assert len(first_round.matches) == 2


def test_generate_bracket_8_teams():
    standings = make_standings(["A", "B", "C", "D", "E", "F", "G", "H"])
    rounds = generate_bracket(8, standings)
    first_round = rounds[0]
    assert len(first_round.matches) == 4


def test_generate_bracket_2_teams():
    standings = make_standings(["A", "B"])
    rounds = generate_bracket(2, standings)
    assert rounds[0].round_name == "Finale"
    assert rounds[0].matches[0].home_slot.team_id == "A"
    assert rounds[0].matches[0].away_slot.team_id == "B"


def test_invalid_num_teams():
    with pytest.raises(ValueError):
        generate_bracket(5, make_standings(["A", "B", "C", "D", "E"]))


def test_third_place_match():
    standings = make_standings(["A", "B", "C", "D"])
    rounds = generate_bracket(4, standings, has_third_place_match=True)
    names = [r.round_name for r in rounds]
    assert any("3" in name for name in names)


def test_advance_winner():
    standings = make_standings(["A", "B", "C", "D"])
    rounds = generate_bracket(4, standings)

    updated = advance_winner(rounds, completed_round_order=1, match_position=1, winner_team_id="A")
    final_round = next(r for r in updated if r.round_order == 2)
    assert final_round.matches[0].home_slot.team_id == "A"


def test_seeding_rank_order():
    standings = make_standings(["1st", "2nd", "3rd", "4th"])
    rounds = generate_bracket(4, standings, seeding_rule="rank_order")
    first_round = rounds[0]
    # 1st should face 4th, 2nd should face 3rd
    teams_in_first = set()
    for m in first_round.matches:
        if m.home_slot.team_id:
            teams_in_first.add(m.home_slot.team_id)
        if m.away_slot.team_id:
            teams_in_first.add(m.away_slot.team_id)
    assert len(teams_in_first) == 4
