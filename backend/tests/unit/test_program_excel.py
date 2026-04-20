from app.schemas.program import ProgramMatchResponse
from app.services.program_excel import _round_duration_suffix


def _match(duration: int | None) -> ProgramMatchResponse:
    return ProgramMatchResponse(
        id="match-1",
        phase_id="phase-1",
        phase_name="Finali piazzamento",
        phase_type="KNOCKOUT",
        bracket_round="Piazzamento 1-2 · Finale",
        status="SCHEDULED",
        home_label="1 Girone A",
        away_label="1 Girone B",
        match_duration_minutes=duration,
    )


def test_round_duration_suffix_uses_halves_details_for_top_placement_final():
    suffix = _round_duration_suffix(
        [_match(10)],
        round_name="Piazzamento 1-2 · Finale",
        default_duration_minutes=10,
        num_halves=2,
        half_duration_minutes=5,
    )

    assert suffix == "  ·  2 tempi da 5 minuti -> 10 min/partita"


def test_round_duration_suffix_falls_back_to_simple_minutes_for_other_rounds():
    suffix = _round_duration_suffix(
        [_match(10)],
        round_name="Piazzamento 3-4 · Finale",
        default_duration_minutes=10,
        num_halves=2,
        half_duration_minutes=5,
    )

    assert suffix == "  ·  10 min/partita"
