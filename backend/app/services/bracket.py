from dataclasses import dataclass
from typing import Optional
from app.services.standings import TeamStats


@dataclass
class BracketSlot:
    position: int
    team_id: Optional[str] = None  # None = TBD


@dataclass
class BracketRound:
    round_name: str
    round_order: int
    matches: list["BracketMatch"]


@dataclass
class BracketMatch:
    bracket_position: int
    home_slot: BracketSlot
    away_slot: BracketSlot
    winner_goes_to: Optional[int] = None  # position in next round
    loser_goes_to: Optional[int] = None   # for 3rd place match


def generate_bracket(
    num_teams: int,
    standings: list[TeamStats],
    seeding_rule: str = "rank_order",
    has_third_place_match: bool = False,
    groups: Optional[list[list[TeamStats]]] = None,
) -> list[BracketRound]:
    """
    Generate knockout bracket from standings.

    num_teams: must be power of 2 (4, 8, 16)
    standings: ordered list of qualified teams (from multiple groups combined)
    seeding_rule: "rank_order" | "cross_groups"
    groups: list of per-group standings (needed for cross_groups seeding)
    """
    if num_teams not in (2, 4, 8, 16):
        raise ValueError(f"num_teams must be 2, 4, 8, or 16, got {num_teams}")

    qualified = standings[:num_teams]
    seeded = _apply_seeding(qualified, seeding_rule, groups)

    rounds = []
    num_rounds = _log2(num_teams)

    for round_idx in range(num_rounds):
        round_num = round_idx + 1
        num_matches_this_round = num_teams // (2 ** round_num)

        round_name = _round_name(num_teams, round_num)

        matches = []
        for match_idx in range(num_matches_this_round):
            if round_idx == 0:
                # First round: assign seeded teams
                home_seed = match_idx * 2
                away_seed = match_idx * 2 + 1
                home_team = seeded[home_seed].team_id if home_seed < len(seeded) else None
                away_team = seeded[away_seed].team_id if away_seed < len(seeded) else None
            else:
                home_team = None  # TBD from previous round
                away_team = None

            matches.append(BracketMatch(
                bracket_position=match_idx + 1,
                home_slot=BracketSlot(position=match_idx * 2 + 1, team_id=home_team),
                away_slot=BracketSlot(position=match_idx * 2 + 2, team_id=away_team),
            ))

        rounds.append(BracketRound(
            round_name=round_name,
            round_order=round_num,
            matches=matches,
        ))

    if has_third_place_match and num_teams >= 4:
        semi_round = next((r for r in rounds if r.round_order == num_rounds - 1), None)
        if semi_round:
            rounds.insert(-1, BracketRound(
                round_name="Finale 3°/4° posto",
                round_order=num_rounds,
                matches=[BracketMatch(
                    bracket_position=1,
                    home_slot=BracketSlot(position=1, team_id=None),
                    away_slot=BracketSlot(position=2, team_id=None),
                )],
            ))
            # Adjust final round order
            rounds[-1].round_order = num_rounds + 1

    return rounds


def _apply_seeding(
    standings: list[TeamStats],
    rule: str,
    groups: Optional[list[list[TeamStats]]] = None,
) -> list[TeamStats]:
    """
    Apply seeding to produce match-up order.

    rank_order: 1st vs last, 2nd vs second-last, etc.
    cross_groups: 1st of group A vs 2nd of group B, etc.
    """
    if rule == "cross_groups" and groups and len(groups) >= 2:
        seeded = []
        # Interleave: 1st of group 0, 1st of group 1, 2nd of group 0, 2nd of group 1, etc.
        max_per_group = max(len(g) for g in groups)
        for pos in range(max_per_group):
            for g in groups:
                if pos < len(g):
                    seeded.append(g[pos])
        return seeded[:len(standings)]

    # Default rank_order: 1 vs N, 2 vs N-1, ...
    n = len(standings)
    seeded = []
    for i in range(n // 2):
        seeded.append(standings[i])
        seeded.append(standings[n - 1 - i])
    return seeded


def advance_winner(
    bracket_rounds: list[BracketRound],
    completed_round_order: int,
    match_position: int,
    winner_team_id: str,
) -> list[BracketRound]:
    """
    After a match is completed, advance winner to next round slot.
    Returns updated bracket rounds.
    """
    next_round = next((r for r in bracket_rounds if r.round_order == completed_round_order + 1), None)
    if not next_round:
        return bracket_rounds

    # Position in next round: ceil(match_position / 2)
    next_match_pos = (match_position + 1) // 2
    next_match = next((m for m in next_round.matches if m.bracket_position == next_match_pos), None)
    if not next_match:
        return bracket_rounds

    # Odd position -> home, even -> away
    if match_position % 2 == 1:
        next_match.home_slot.team_id = winner_team_id
    else:
        next_match.away_slot.team_id = winner_team_id

    return bracket_rounds


def _log2(n: int) -> int:
    result = 0
    while n > 1:
        n //= 2
        result += 1
    return result


def _round_name(total_teams: int, round_num: int) -> str:
    remaining = total_teams // (2 ** (round_num - 1))
    names = {
        16: "Ottavi di finale",
        8: "Quarti di finale",
        4: "Semifinali",
        2: "Finale",
    }
    return names.get(remaining, f"Round {round_num}")
