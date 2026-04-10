from __future__ import annotations

from io import BytesIO
import re

from app.schemas.program import (
    AgeGroupProgramResponse,
    ProgramGroupResponse,
    ProgramMatchResponse,
    ProgramPhaseResponse,
)


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
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        leftMargin=12 * mm,
        rightMargin=12 * mm,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ProgramTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=3,
    )
    subtitle_style = ParagraphStyle(
        "ProgramSubtitle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#475569"),
        spaceAfter=8,
    )

    story = [
        Paragraph(tournament_name, title_style),
        Paragraph(f"Calendario completo · {program.display_name or program.age_group}", subtitle_style),
    ]

    for day in program.days:
        story.extend(_build_day_section(day.label, day.phases))
        story.append(Spacer(1, 4))

    document.build(story)
    filename = f"calendario-{_safe_filename(program.display_name or program.age_group)}.pdf"
    return buffer.getvalue(), filename


def _build_day_section(day_label: str, phases: list[ProgramPhaseResponse]):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.platypus import Paragraph, Spacer

    styles = getSampleStyleSheet()
    day_style = ParagraphStyle(
        "ProgramDay",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=6,
    )

    blocks = [Paragraph(day_label, day_style)]
    for phase in phases:
        blocks.extend(_build_phase_section(phase))
        blocks.append(Spacer(1, 8))
    return blocks


def _build_phase_section(phase: ProgramPhaseResponse):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.platypus import Paragraph, Spacer

    styles = getSampleStyleSheet()
    phase_style = ParagraphStyle(
        "ProgramPhase",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=3,
    )
    meta_style = ParagraphStyle(
        "ProgramMeta",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#475569"),
        spaceAfter=5,
    )

    blocks = [Paragraph(f"FASE {phase.phase_order} · {phase.name}", phase_style)]
    blocks.append(Paragraph(_format_phase_meta(phase), meta_style))

    if phase.groups:
        for group in phase.groups:
            blocks.extend(_build_group_section(group))
            blocks.append(Spacer(1, 6))
    if phase.knockout_matches:
        blocks.extend(_build_knockout_section(phase))

    return blocks


def _build_group_section(group: ProgramGroupResponse):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    styles = getSampleStyleSheet()
    group_style = ParagraphStyle(
        "ProgramGroup",
        parent=styles["Heading4"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=2,
    )
    small_style = ParagraphStyle(
        "ProgramSmall",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#475569"),
    )

    matches = _sort_matches(group.matches)
    field_summary = ", ".join(_unique_field_labels(matches)) or "Campo da definire"
    team_summary = ", ".join(team.label for team in group.teams) or "Squadre da definire"

    rows = [["Ora", "Campo", "Partita"]]
    for match in matches:
        rows.append([
            match.scheduled_at.strftime("%H:%M") if match.scheduled_at else "Da definire",
            _short_field_label(match),
            f"{match.home_label} - {match.away_label}",
        ])
    if len(rows) == 1:
        rows.append(["Da definire", "-", "Partite non ancora programmate"])

    table = Table(rows, repeatRows=1, colWidths=[22 * 2.83465, 40 * 2.83465, 104 * 2.83465])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dbeafe")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("LEADING", (0, 0), (-1, -1), 11),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    return [
        Paragraph(group.name, group_style),
        Paragraph(f"Campo: {field_summary}", small_style),
        Paragraph(f"Squadre: {team_summary}", small_style),
        Spacer(1, 4),
        table,
    ]


def _build_knockout_section(phase: ProgramPhaseResponse):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    styles = getSampleStyleSheet()
    block_style = ParagraphStyle(
        "ProgramBlock",
        parent=styles["Heading4"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=2,
    )
    small_style = ParagraphStyle(
        "ProgramSmallKnockout",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#475569"),
    )

    matches = _sort_matches(phase.knockout_matches)
    field_summary = ", ".join(_unique_field_labels(matches)) or "Campo da definire"
    rows = [["Ora", "Campo", "Turno", "Partita"]]
    for match in matches:
        rows.append([
            match.scheduled_at.strftime("%H:%M") if match.scheduled_at else "Da definire",
            _short_field_label(match),
            match.bracket_round or phase.name,
            f"{match.home_label} - {match.away_label}",
        ])
    if len(rows) == 1:
        rows.append(["Da definire", "-", phase.name, "Partite non ancora programmate"])

    table = Table(rows, repeatRows=1, colWidths=[20 * 2.83465, 34 * 2.83465, 42 * 2.83465, 70 * 2.83465])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fef3c7")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("LEADING", (0, 0), (-1, -1), 11),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fffaf0")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d6d3d1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    return [
        Paragraph("Tabellone", block_style),
        Paragraph(f"Campi: {field_summary}", small_style),
        Spacer(1, 4),
        table,
    ]


def _format_phase_meta(phase: ProgramPhaseResponse) -> str:
    configured = phase.configured_start_at.strftime("%H:%M") if phase.configured_start_at else "--:--"
    actual = phase.phase_start_at.strftime("%H:%M") if phase.phase_start_at else "--:--"
    estimated = phase.estimated_end_at.strftime("%H:%M") if phase.estimated_end_at else "--:--"
    if phase.configured_start_at and phase.phase_start_at and phase.phase_start_at != phase.configured_start_at:
        return f"Inizio previsto {configured} · Inizio aggiornato {actual} · Fine stimata {estimated}"
    return f"Inizio {actual} · Fine stimata {estimated}"


def _sort_matches(matches: list[ProgramMatchResponse]) -> list[ProgramMatchResponse]:
    return sorted(
        matches,
        key=lambda match: (
            match.scheduled_at.isoformat() if match.scheduled_at else "9999-12-31T23:59:59",
            match.field_name or "",
            match.field_number or 0,
            match.bracket_position or 0,
        ),
    )


def _unique_field_labels(matches: list[ProgramMatchResponse]) -> list[str]:
    labels: list[str] = []
    seen: set[str] = set()
    for match in matches:
        label = _short_field_label(match)
        if label in seen or label == "-":
            continue
        seen.add(label)
        labels.append(label)
    return labels


def _short_field_label(match: ProgramMatchResponse) -> str:
    if not match.field_name:
        return "-"
    compact_name = re.sub(r"\s+", " ", match.field_name).strip()
    if len(compact_name) > 28:
        compact_name = f"{compact_name[:25].rstrip()}..."
    if match.field_number is None:
        return compact_name
    return f"{compact_name} #{match.field_number}"
