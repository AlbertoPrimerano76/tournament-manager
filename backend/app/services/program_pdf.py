from __future__ import annotations

from io import BytesIO
import re

from app.schemas.program import AgeGroupProgramResponse, ProgramMatchResponse, ProgramPhaseResponse


def _safe_filename(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return normalized.strip("-") or "categoria"


def build_age_group_program_pdf(
    tournament_name: str,
    program: AgeGroupProgramResponse,
) -> tuple[bytes, str]:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = styles["Heading1"]
    title_style.fontName = "Helvetica-Bold"
    title_style.fontSize = 18
    title_style.leading = 22

    subtitle_style = ParagraphStyle(
        "CategorySubtitle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#475569"),
    )
    heading_style = ParagraphStyle(
        "PhaseHeading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=6,
    )
    small_style = ParagraphStyle(
        "Small",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#475569"),
    )

    story = [
        Paragraph(tournament_name, title_style),
        Paragraph(f"Calendario completo · {program.display_name or program.age_group}", subtitle_style),
        Spacer(1, 8),
    ]

    for day in program.days:
        story.append(Paragraph(day.label, heading_style))
        for phase in day.phases:
            story.extend(_build_phase_section(phase, styles, small_style))
            story.append(Spacer(1, 8))
        story.append(Spacer(1, 4))

    document.build(story)
    filename = f"calendario-{_safe_filename(program.display_name or program.age_group)}.pdf"
    return buffer.getvalue(), filename


def _build_phase_section(
    phase: ProgramPhaseResponse,
    styles,
    small_style,
):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    phase_title = phase.name
    if phase.phase_start_at or phase.estimated_end_at:
        start_label = phase.phase_start_at.strftime("%H:%M") if phase.phase_start_at else "--:--"
        end_label = phase.estimated_end_at.strftime("%H:%M") if phase.estimated_end_at else "--:--"
        phase_title = f"{phase_title} · {start_label} - {end_label}"

    blocks = [Paragraph(phase_title, styles["Heading3"])]
    rows = [["Ora", "Campo", "Fase", "Partita"]]

    matches = _phase_matches(phase)
    for match in matches:
        rows.append([
            match.scheduled_at.strftime("%H:%M") if match.scheduled_at else "Da definire",
            _format_field(match),
            _format_match_context(match),
            f"{match.home_label} - {match.away_label}",
        ])

    if len(rows) == 1:
        rows.append(["Da definire", "-", phase.name, "Partite non ancora programmate"])

    table = Table(rows, repeatRows=1, colWidths=[22 * mm, 34 * mm, 42 * mm, 82 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("LEADING", (0, 0), (-1, -1), 11),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    blocks.extend([
        Paragraph(
            "Include anche partite future programmate con slot placeholder come 1 Girone A o 2 Girone B.",
            small_style,
        ),
        Spacer(1, 4),
        table,
    ])
    return blocks


def _phase_matches(phase: ProgramPhaseResponse) -> list[ProgramMatchResponse]:
    matches = [*phase.knockout_matches]
    for group in phase.groups:
        matches.extend(group.matches)
    return sorted(
        matches,
        key=lambda match: (
            match.scheduled_at.isoformat() if match.scheduled_at else "9999-12-31T23:59:59",
            match.group_name or "",
            match.bracket_position or 0,
        ),
    )


def _format_field(match: ProgramMatchResponse) -> str:
    if not match.field_name:
        return "-"
    if match.field_number is None:
        return match.field_name
    return f"{match.field_name} #{match.field_number}"


def _format_match_context(match: ProgramMatchResponse) -> str:
    if match.group_name:
        return match.group_name
    if match.bracket_round:
        return match.bracket_round
    return match.phase_name
