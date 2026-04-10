from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.schemas.program import (
    AgeGroupProgramResponse,
    ProgramDayResponse,
    ProgramGroupResponse,
    ProgramMatchResponse,
    ProgramPhaseResponse,
    ProgramTeamSlotResponse,
)
from app.services.program_pdf import _build_phase_section, build_age_group_program_pdf


def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 4, 10, hour, minute, tzinfo=ZoneInfo("Europe/Rome"))


def _mixed_phase() -> ProgramPhaseResponse:
    return ProgramPhaseResponse(
        id="phase-1",
        name="Gironi e finali",
        phase_type="GROUP_STAGE",
        phase_order=1,
        scheduled_date=date(2026, 4, 10),
        configured_start_at=_dt(9, 0),
        phase_start_at=_dt(9, 0),
        estimated_end_at=_dt(10, 0),
        groups=[
            ProgramGroupResponse(
                id="group-a",
                name="Girone A",
                order=1,
                teams=[ProgramTeamSlotResponse(label="Squadra A")],
                matches=[
                    ProgramMatchResponse(
                        id="match-1",
                        phase_id="phase-1",
                        phase_name="Gironi e finali",
                        phase_type="GROUP_STAGE",
                        group_id="group-a",
                        group_name="Girone A",
                        scheduled_at=_dt(9, 0),
                        actual_end_at=None,
                        status="SCHEDULED",
                        field_name="Campo Nord",
                        field_number=1,
                        home_label="Squadra A",
                        away_label="Squadra B",
                    ),
                ],
            ),
        ],
        knockout_matches=[
            ProgramMatchResponse(
                id="match-ko",
                phase_id="phase-1",
                phase_name="Gironi e finali",
                phase_type="GROUP_STAGE",
                bracket_round="Finale",
                bracket_position=1,
                scheduled_at=_dt(9, 20),
                actual_end_at=None,
                status="SCHEDULED",
                field_name="Campo Finale",
                field_number=1,
                home_label="1 Girone A",
                away_label="2 Girone B",
            ),
        ],
    )


def test_build_phase_section_includes_group_and_knockout_blocks():
    phase = _mixed_phase()

    blocks = _build_phase_section(phase)
    paragraph_texts = [block.getPlainText() for block in blocks if hasattr(block, "getPlainText")]

    assert "Girone A" in paragraph_texts
    assert "Tabellone" in paragraph_texts


def test_build_program_pdf_handles_mixed_phase_content():
    program = AgeGroupProgramResponse(
        age_group_id="age-group-1",
        age_group="U8",
        display_name="Under 8",
        participant_count=8,
        generated=True,
        days=[
            ProgramDayResponse(
                date=date(2026, 4, 10),
                label="10/04/2026",
                phases=[
                    _mixed_phase(),
                ],
            ),
        ],
    )

    payload, filename = build_age_group_program_pdf("Torneo Test", program)

    assert payload.startswith(b"%PDF")
    assert filename == "calendario-under-8.pdf"
