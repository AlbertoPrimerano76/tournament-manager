from __future__ import annotations

from functools import lru_cache
from io import BytesIO
from pathlib import Path
import re
from urllib.parse import urlparse
from urllib.request import urlopen
from zoneinfo import ZoneInfo

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
    tournament_timezone: str = "Europe/Rome",
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
        story.extend(_build_day_section(day.label, day.phases, tournament_timezone))
        story.append(Spacer(1, 4))

    document.build(story)
    filename = f"calendario-{_safe_filename(program.display_name or program.age_group)}.pdf"
    return buffer.getvalue(), filename


def _build_day_section(day_label: str, phases: list[ProgramPhaseResponse], tournament_timezone: str = "Europe/Rome"):
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
        blocks.extend(_build_phase_section(phase, tournament_timezone))
        blocks.append(Spacer(1, 8))
    return blocks


def _build_phase_section(phase: ProgramPhaseResponse, tournament_timezone: str = "Europe/Rome"):
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
    blocks.append(Paragraph(_format_phase_meta(phase, tournament_timezone), meta_style))

    if phase.groups:
        for group in phase.groups:
            blocks.extend(_build_group_section(group, tournament_timezone))
            blocks.append(Spacer(1, 8))
    if phase.knockout_matches:
        blocks.extend(_build_knockout_section(phase, tournament_timezone))

    return blocks


def _build_group_section(group: ProgramGroupResponse, tournament_timezone: str = "Europe/Rome"):
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

    schedule_rows = [["Ora", "Campo", "Partita"]]
    for match in matches:
        schedule_rows.append([
            _format_time(match.scheduled_at, tournament_timezone),
            _short_field_label(match),
            f"{_escape_pdf_text(match.home_label)} - {_escape_pdf_text(match.away_label)}",
        ])
    if len(schedule_rows) == 1:
        schedule_rows.append(["Da definire", "-", "Partite non ancora programmate"])

    schedule_table = Table(schedule_rows, repeatRows=1, colWidths=[20 * mm, 44 * mm, 122 * mm])
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


def _build_knockout_section(phase: ProgramPhaseResponse, tournament_timezone: str = "Europe/Rome"):
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

    turn_style = ParagraphStyle(
        "ProgramKnockoutTurn",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13,
        textColor=colors.HexColor("#92400e"),
        spaceAfter=4,
        leftIndent=2,
    )
    cell_style = ParagraphStyle(
        "ProgramKnockoutCell",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#0f172a"),
    )
    match_style = ParagraphStyle(
        "ProgramKnockoutMatchCell",
        parent=cell_style,
        fontName="Helvetica-Bold",
        fontSize=9.2,
        leading=11.5,
    )
    empty_style = ParagraphStyle(
        "ProgramKnockoutEmptyCell",
        parent=cell_style,
        textColor=colors.HexColor("#64748b"),
        alignment=1,
    )

    round_blocks = [
        Paragraph("Tabellone", block_style),
        field_card,
        Spacer(1, 5),
    ]

    matches_by_round: dict[str, list[ProgramMatchResponse]] = {}
    for match in matches:
        round_name = match.bracket_round or phase.name
        matches_by_round.setdefault(round_name, []).append(match)

    if not matches_by_round:
        matches_by_round[phase.name] = []

    for round_name, round_matches in matches_by_round.items():
        round_blocks.append(Paragraph(round_name, turn_style))
        rows = [["Ora", "Campo", "Partita"]]
        for match in round_matches:
            rows.append([
                Paragraph(_escape_pdf_text(_format_time(match.scheduled_at, tournament_timezone)), cell_style),
                Paragraph(_escape_pdf_text(_short_field_label(match)), cell_style),
                Paragraph(f"{_escape_pdf_text(match.home_label)}<br/>{_escape_pdf_text(match.away_label)}", match_style),
            ])
        if len(rows) == 1:
            rows.append([
                Paragraph("Da definire", empty_style),
                Paragraph("-", empty_style),
                Paragraph("Partite non ancora programmate", empty_style),
            ])

        table = Table(rows, repeatRows=1, colWidths=[22 * mm, 44 * mm, 120 * mm])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fef3c7")),
            ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#0f172a")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fffaf0")]),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d6d3d1")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ("ALIGN", (0, 0), (1, -1), "CENTER"),
        ]))
        round_blocks.append(table)
        round_blocks.append(Spacer(1, 8))

    return round_blocks


def _format_phase_meta(phase: ProgramPhaseResponse, tournament_timezone: str = "Europe/Rome") -> str:
    configured = _format_time(phase.configured_start_at, tournament_timezone, "--:--")
    actual = _format_time(phase.phase_start_at, tournament_timezone, configured)
    estimated = _format_time(phase.estimated_end_at, tournament_timezone, "--:--")
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


def _format_time(value, tournament_timezone: str, fallback: str = "Da definire") -> str:
    if value is None:
        return fallback
    try:
        timezone = ZoneInfo(tournament_timezone)
    except Exception:
        timezone = ZoneInfo("Europe/Rome")
    if getattr(value, "tzinfo", None) is None:
        return value.strftime("%H:%M")
    return value.astimezone(timezone).strftime("%H:%M")


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
