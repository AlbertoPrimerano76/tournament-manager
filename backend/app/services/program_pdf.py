from __future__ import annotations

from functools import lru_cache
from io import BytesIO
from pathlib import Path
import re
from urllib.parse import urlparse
from urllib.request import urlopen

from app.schemas.program import (
    AgeGroupProgramResponse,
    ProgramGroupResponse,
    ProgramMatchResponse,
    ProgramPhaseResponse,
    ProgramTeamSlotResponse,
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
            blocks.append(Spacer(1, 8))
    if phase.knockout_matches:
        blocks.extend(_build_knockout_section(phase))

    return blocks


def _build_group_section(group: ProgramGroupResponse):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    styles = getSampleStyleSheet()
    group_style = ParagraphStyle(
        "ProgramGroup",
        parent=styles["Heading4"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=3,
    )
    small_style = ParagraphStyle(
        "ProgramSmall",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#475569"),
    )
    field_style = ParagraphStyle(
        "ProgramFieldInfo",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13,
        textColor=colors.HexColor("#0f172a"),
        alignment=1,
    )

    matches = _sort_matches(group.matches)
    field_summary = ", ".join(_unique_field_labels(matches)) or "Campo da definire"

    field_card = Table(
        [[Paragraph(f"Campi di gioco: {field_summary}", field_style)]],
        colWidths=[186 * mm],
    )
    field_card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#ecfeff")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#67e8f9")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))

    team_rows = [[Paragraph("<b>Logo</b>", small_style), Paragraph("<b>Squadre partecipanti</b>", small_style)]]
    for team in group.teams:
        team_rows.append([_team_logo_cell(team), Paragraph(_escape_pdf_text(team.label), small_style)])
    if len(team_rows) == 1:
        team_rows.append(["", Paragraph("Squadre da definire", small_style)])

    teams_table = Table(team_rows, repeatRows=1, colWidths=[18 * mm, 168 * mm])
    teams_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef2ff")),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#0f172a")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    schedule_rows = [["Ora", "Campo", "Partita", "Punteggio"]]
    for match in matches:
        schedule_rows.append([
            match.scheduled_at.strftime("%H:%M") if match.scheduled_at else "Da definire",
            _short_field_label(match),
            f"{_escape_pdf_text(match.home_label)} - {_escape_pdf_text(match.away_label)}",
            _schedule_score_cell(match),
        ])
    if len(schedule_rows) == 1:
        schedule_rows.append(["Da definire", "-", "Partite non ancora programmate", ""])

    schedule_table = Table(schedule_rows, repeatRows=1, colWidths=[20 * mm, 48 * mm, 86 * mm, 32 * mm])
    schedule_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#dbeafe")),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#0f172a")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    return [
        Paragraph(group.name, group_style),
        field_card,
        Spacer(1, 5),
        teams_table,
        Spacer(1, 5),
        schedule_table,
    ]


def _build_knockout_section(phase: ProgramPhaseResponse):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
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
    field_style = ParagraphStyle(
        "ProgramKnockoutFieldInfo",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13,
        textColor=colors.HexColor("#78350f"),
        alignment=1,
    )

    matches = _sort_matches(phase.knockout_matches)
    field_summary = ", ".join(_unique_field_labels(matches)) or "Campo da definire"
    field_card = Table(
        [[Paragraph(f"Campi di gioco: {field_summary}", field_style)]],
        colWidths=[186 * mm],
    )
    field_card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fffbeb")),
        ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#fbbf24")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))

    rows = [["Ora", "Campo", "Turno", "Partita", "Punteggio"]]
    for match in matches:
        rows.append([
            match.scheduled_at.strftime("%H:%M") if match.scheduled_at else "Da definire",
            _short_field_label(match),
            match.bracket_round or phase.name,
            f"{_escape_pdf_text(match.home_label)} - {_escape_pdf_text(match.away_label)}",
            _schedule_score_cell(match),
        ])
    if len(rows) == 1:
        rows.append(["Da definire", "-", phase.name, "Partite non ancora programmate", ""])

    table = Table(rows, repeatRows=1, colWidths=[18 * mm, 38 * mm, 44 * mm, 58 * mm, 28 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fef3c7")),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#0f172a")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fffaf0")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d6d3d1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))

    return [
        Paragraph("Tabellone", block_style),
        field_card,
        Spacer(1, 5),
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


def _schedule_score_cell(match: ProgramMatchResponse) -> str:
    if match.home_score is not None and match.away_score is not None:
        return f"{match.home_score} - {match.away_score}"
    return "____ - ____"


def _escape_pdf_text(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _team_logo_cell(team: ProgramTeamSlotResponse):
    from reportlab.lib.units import mm
    from reportlab.platypus import Image, Spacer

    image_bytes = _load_image_bytes(team.team_logo_url)
    if not image_bytes:
        return Spacer(10 * mm, 10 * mm)
    return Image(BytesIO(image_bytes), width=10 * mm, height=10 * mm)


@lru_cache(maxsize=256)
def _load_image_bytes(source: str | None) -> bytes | None:
    if not source:
        return None

    parsed = urlparse(source)
    try:
        if parsed.scheme in {"http", "https"}:
            with urlopen(source, timeout=3) as response:
                return response.read()

        candidate = source
        if source.startswith("/"):
            candidate = source[1:]
        path = Path(candidate)
        if path.exists():
            return path.read_bytes()
    except Exception:
        return None

    return None
