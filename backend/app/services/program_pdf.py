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

# ── Page geometry ──────────────────────────────────────────────────────────────
# A4 = 210mm wide; with 12mm margins each side → 186mm usable
# Schedule columns (mm): ORA | C | CASA | vs | OSPITE | Pt□ | Pt□ | ARB
_COL_WIDTHS_SCHED = [13, 8, 48, 5, 48, 16, 16, 32]  # total = 186mm

# Column indices
_C_ORA   = 0
_C_FIELD = 1
_C_HOME  = 2
_C_VS    = 3
_C_AWAY  = 4
_C_PT_H  = 5   # punti home (box)
_C_PT_A  = 6   # punti away (box)
_C_ARB   = 7


def _safe_filename(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return normalized.strip("-") or "categoria"


# ── Field mapping ──────────────────────────────────────────────────────────────

def _collect_field_map(program: AgeGroupProgramResponse) -> dict[str, str]:
    """
    Scan all matches in the program and assign short codes (C1, C2 …) to each
    unique (field_name, field_number) pair.
    Returns {canonical_key → "C1"} where key = f"{name}::{number}".
    """
    seen: list[tuple[str, int | None]] = []
    for day in program.days:
        for phase in day.phases:
            all_matches = [m for g in phase.groups for m in g.matches] + phase.knockout_matches
            for match in all_matches:
                if match.field_name:
                    key = (match.field_name, match.field_number)
                    if key not in seen:
                        seen.append(key)
    seen.sort(key=lambda x: (x[0] or "", x[1] if x[1] is not None else 0))
    return {f"{name}::{num}": f"C{i + 1}" for i, (name, num) in enumerate(seen)}


def _field_code(match: ProgramMatchResponse, field_map: dict[str, str]) -> str:
    if not match.field_name:
        return "-"
    return field_map.get(f"{match.field_name}::{match.field_number}", "-")


def _full_field_label(name: str, number: int | None) -> str:
    if number is not None:
        return f"{name} · Campo {number}"
    return name


# ── Entry point ────────────────────────────────────────────────────────────────

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

    field_map = _collect_field_map(program)

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
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=2,
    )
    subtitle_style = ParagraphStyle(
        "ProgramSubtitle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#475569"),
        spaceAfter=6,
    )

    story: list = [
        Paragraph(_escape_pdf_text(tournament_name), title_style),
        Paragraph(f"Calendario · {_escape_pdf_text(program.display_name or program.age_group)}", subtitle_style),
    ]

    # Global field legend (if any fields are defined)
    if field_map:
        story.append(_build_field_legend(field_map))
        story.append(Spacer(1, 8 * mm))

    for day in program.days:
        story.extend(_build_day_section(day.label, day.phases, tournament_timezone, field_map))
        story.append(Spacer(1, 4))

    document.build(story)
    filename = f"calendario-{_safe_filename(program.display_name or program.age_group)}.pdf"
    return buffer.getvalue(), filename


# ── Field legend ───────────────────────────────────────────────────────────────

def _build_field_legend(field_map: dict[str, str]) -> object:
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Table, TableStyle

    styles = getSampleStyleSheet()
    code_style = ParagraphStyle(
        "LegendCode",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#0f172a"),
    )
    name_style = ParagraphStyle(
        "LegendName",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#334155"),
    )

    # Reverse the map: code → full label
    inv: list[tuple[str, str]] = []
    for canonical, code in sorted(field_map.items(), key=lambda kv: kv[1]):
        parts = canonical.rsplit("::", 1)
        name = parts[0]
        try:
            number = int(parts[1]) if parts[1] != "None" else None
        except (IndexError, ValueError):
            number = None
        inv.append((code, _full_field_label(name, number)))

    # Two-column layout: [code, label, code, label, ...]
    rows: list[list] = []
    col_pairs = 2  # pairs per row
    for i in range(0, len(inv), col_pairs):
        row: list = []
        for j in range(col_pairs):
            if i + j < len(inv):
                code, label = inv[i + j]
                row.extend([
                    Table([[code_style.__class__.__name__]], colWidths=[0]),  # placeholder
                ])
        rows.append(row)

    # Rebuild as flat cells: code | name | code | name
    flat_rows: list[list] = [["Legenda campi", "", "", ""]]
    for i in range(0, len(inv), col_pairs):
        row = []
        for j in range(col_pairs):
            if i + j < len(inv):
                code, label = inv[i + j]
                row.extend([
                    Table([[code]], colWidths=[18 * mm]).setStyle(
                        TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")])
                    ) if False else code,
                    _escape_pdf_text(label),
                ])
            else:
                row.extend(["", ""])
        flat_rows.append(row)

    table = Table(flat_rows, colWidths=[18 * mm, 75 * mm, 18 * mm, 75 * mm])
    table.setStyle(TableStyle([
        # Header row
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 10),
        ("SPAN", (0, 0), (-1, 0)),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        # Code columns
        ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#3b82f6")),
        ("BACKGROUND", (2, 1), (2, -1), colors.HexColor("#3b82f6")),
        ("TEXTCOLOR", (0, 1), (0, -1), colors.white),
        ("TEXTCOLOR", (2, 1), (2, -1), colors.white),
        ("FONTNAME", (0, 1), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 1), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 1), (-1, -1), 10),
        ("ALIGN", (0, 1), (0, -1), "CENTER"),
        ("ALIGN", (2, 1), (2, -1), "CENTER"),
        # Name columns
        ("BACKGROUND", (1, 1), (1, -1), colors.HexColor("#eff6ff")),
        ("BACKGROUND", (3, 1), (3, -1), colors.HexColor("#eff6ff")),
        ("TEXTCOLOR", (1, 1), (-1, -1), colors.HexColor("#0f172a")),
        # Grid
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


# ── Day / Phase sections ───────────────────────────────────────────────────────

def _build_day_section(
    day_label: str,
    phases: list[ProgramPhaseResponse],
    tournament_timezone: str,
    field_map: dict[str, str],
):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.platypus import Paragraph, Spacer

    styles = getSampleStyleSheet()
    day_style = ParagraphStyle(
        "ProgramDay",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=17,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=6,
    )

    blocks: list = [Paragraph(_escape_pdf_text(day_label), day_style)]
    for phase in phases:
        blocks.extend(_build_phase_section(phase, tournament_timezone, field_map))
        blocks.append(Spacer(1, 10))
    return blocks


def _build_phase_section(
    phase: ProgramPhaseResponse,
    tournament_timezone: str,
    field_map: dict[str, str],
):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    styles = getSampleStyleSheet()
    phase_style = ParagraphStyle(
        "ProgramPhase",
        parent=styles["Heading3"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.white,
        spaceAfter=0,
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

    # Phase header as a colored banner
    phase_banner = Table(
        [[Paragraph(f"FASE {phase.phase_order} · {_escape_pdf_text(phase.name)}", phase_style)]],
        colWidths=[sum(_COL_WIDTHS_SCHED) * mm],
    )
    phase_banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#1e40af")),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))

    blocks: list = [
        phase_banner,
        Paragraph(_format_phase_meta(phase, tournament_timezone), meta_style),
    ]

    if phase.groups:
        for group in phase.groups:
            blocks.extend(_build_group_section(group, tournament_timezone, field_map))
            blocks.append(Spacer(1, 8))
    if phase.knockout_matches:
        blocks.extend(_build_knockout_section(phase, tournament_timezone, field_map))

    return blocks


# ── Group section ──────────────────────────────────────────────────────────────

def _build_group_section(
    group: ProgramGroupResponse,
    tournament_timezone: str,
    field_map: dict[str, str],
):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    styles = getSampleStyleSheet()
    group_style = ParagraphStyle(
        "ProgramGroup",
        parent=styles["Heading4"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=colors.white,
        spaceAfter=0,
    )
    small_style = ParagraphStyle(
        "ProgramSmall",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#0f172a"),
    )
    small_bold_style = ParagraphStyle(
        "ProgramSmallBold",
        parent=small_style,
        fontName="Helvetica-Bold",
    )

    group_banner = Table(
        [[Paragraph(_escape_pdf_text(group.name), group_style)]],
        colWidths=[sum(_COL_WIDTHS_SCHED) * mm],
    )
    group_banner.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#0369a1")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ]))

    # Teams table
    team_rows = [
        [Paragraph("<b>Logo</b>", small_bold_style), Paragraph("<b>Squadre partecipanti</b>", small_bold_style)],
    ]
    for team in group.teams:
        team_rows.append([_team_logo_cell(team), Paragraph(_escape_pdf_text(team.label), small_style)])
    if len(team_rows) == 1:
        team_rows.append(["", Paragraph("Squadre da definire", small_style)])

    teams_table = Table(team_rows, repeatRows=1, colWidths=[16 * mm, 170 * mm])
    teams_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e0f2fe")),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#0f172a")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f9ff")]),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#bae6fd")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))

    matches = _sort_matches(group.matches)
    schedule_table = _build_schedule_table(matches, tournament_timezone, field_map, is_knockout=False)

    return [
        group_banner,
        Spacer(1, 3),
        teams_table,
        Spacer(1, 5),
        schedule_table,
    ]


# ── Knockout section ───────────────────────────────────────────────────────────

def _build_knockout_section(
    phase: ProgramPhaseResponse,
    tournament_timezone: str,
    field_map: dict[str, str],
):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

    styles = getSampleStyleSheet()
    round_style = ParagraphStyle(
        "ProgramKORound",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.white,
        spaceAfter=0,
    )

    matches = _sort_matches(phase.knockout_matches)
    matches_by_round: dict[str, list[ProgramMatchResponse]] = {}
    for match in matches:
        rname = match.bracket_round or phase.name
        matches_by_round.setdefault(rname, []).append(match)
    if not matches_by_round:
        matches_by_round[phase.name] = []

    blocks: list = []
    for round_name, round_matches in matches_by_round.items():
        banner = Table(
            [[Paragraph(_escape_pdf_text(round_name), round_style)]],
            colWidths=[sum(_COL_WIDTHS_SCHED) * mm],
        )
        banner.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#92400e")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ]))
        blocks.append(banner)
        blocks.append(Spacer(1, 3))
        blocks.append(_build_schedule_table(round_matches, tournament_timezone, field_map, is_knockout=True))
        blocks.append(Spacer(1, 8))

    return blocks


# ── Unified schedule table ─────────────────────────────────────────────────────

def _build_schedule_table(
    matches: list[ProgramMatchResponse],
    tournament_timezone: str,
    field_map: dict[str, str],
    is_knockout: bool,
):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, Table, TableStyle

    styles = getSampleStyleSheet()
    hdr_style = ParagraphStyle(
        "SchedHdr",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#0f172a"),
    )
    cell_style = ParagraphStyle(
        "SchedCell",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=12,
        textColor=colors.HexColor("#0f172a"),
    )
    bold_cell = ParagraphStyle(
        "SchedCellBold",
        parent=cell_style,
        fontName="Helvetica-Bold",
    )
    center_cell = ParagraphStyle(
        "SchedCellCenter",
        parent=cell_style,
        alignment=1,
    )
    dim_style = ParagraphStyle(
        "SchedDim",
        parent=cell_style,
        textColor=colors.HexColor("#94a3b8"),
        alignment=1,
    )

    col_w = [w * mm for w in _COL_WIDTHS_SCHED]

    # Header row
    header = [
        Paragraph("ORA", hdr_style),
        Paragraph("C.", hdr_style),
        Paragraph("CASA", hdr_style),
        Paragraph("vs", hdr_style),
        Paragraph("OSPITE", hdr_style),
        Paragraph("Pt\nCasa", hdr_style),
        Paragraph("Pt\nOsp.", hdr_style),
        Paragraph("ARBITRO", hdr_style),
    ]
    rows: list[list] = [header]

    if not matches:
        rows.append([
            Paragraph("—", dim_style), Paragraph("—", dim_style),
            Paragraph("Partite non ancora programmate", dim_style),
            "", "", "", "", "",
        ])
    else:
        for match in matches:
            time_str = _format_time(match.scheduled_at, tournament_timezone, "—")
            code = _field_code(match, field_map)
            # Pre-fill scores if already entered
            pt_h = str(match.home_score) if match.home_score is not None else ""
            pt_a = str(match.away_score) if match.away_score is not None else ""
            arb  = _escape_pdf_text(match.referee or "")

            rows.append([
                Paragraph(_escape_pdf_text(time_str), bold_cell),
                Paragraph(code, center_cell),
                Paragraph(_escape_pdf_text(match.home_label), cell_style),
                Paragraph("vs", center_cell),
                Paragraph(_escape_pdf_text(match.away_label), cell_style),
                Paragraph(pt_h, center_cell),
                Paragraph(pt_a, center_cell),
                Paragraph(arb, cell_style),
            ])

    header_bg = colors.HexColor("#fef3c7") if is_knockout else colors.HexColor("#dbeafe")
    header_text = colors.HexColor("#0f172a")
    row_alt    = colors.HexColor("#fffaf0") if is_knockout else colors.HexColor("#f0f9ff")
    box_border = colors.HexColor("#0f172a")
    box_bg     = colors.white

    table = Table(rows, repeatRows=1, colWidths=col_w)
    style_cmds = [
        # Header
        ("BACKGROUND",    (0, 0),  (-1, 0),  header_bg),
        ("TEXTCOLOR",     (0, 0),  (-1, 0),  header_text),
        ("FONTNAME",      (0, 0),  (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0),  (-1, 0),  8),
        ("ALIGN",         (0, 0),  (-1, 0),  "CENTER"),
        ("VALIGN",        (0, 0),  (-1, 0),  "MIDDLE"),
        # Body rows
        ("ROWBACKGROUNDS",(0, 1),  (-1, -1), [colors.white, row_alt]),
        ("FONTSIZE",      (0, 1),  (-1, -1), 9.5),
        ("VALIGN",        (0, 1),  (-1, -1), "MIDDLE"),
        # Outer grid
        ("GRID",          (0, 0),  (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
        # Padding
        ("TOPPADDING",    (0, 0),  (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0),  (-1, -1), 6),
        ("LEFTPADDING",   (0, 0),  (-1, -1), 5),
        ("RIGHTPADDING",  (0, 0),  (-1, -1), 5),
        # Center: time, field code, vs, score boxes
        ("ALIGN", (_C_ORA,   1), (_C_ORA,   -1), "CENTER"),
        ("ALIGN", (_C_FIELD, 1), (_C_FIELD, -1), "CENTER"),
        ("ALIGN", (_C_VS,    1), (_C_VS,    -1), "CENTER"),
        ("ALIGN", (_C_PT_H,  1), (_C_PT_H,  -1), "CENTER"),
        ("ALIGN", (_C_PT_A,  1), (_C_PT_A,  -1), "CENTER"),
        # Score box columns: thicker border + white background + extra padding for handwriting
        ("BACKGROUND",    (_C_PT_H, 1), (_C_PT_A, -1), box_bg),
        ("BOX",           (_C_PT_H, 1), (_C_PT_H, -1), 1.2, box_border),
        ("BOX",           (_C_PT_A, 1), (_C_PT_A, -1), 1.2, box_border),
        ("TOPPADDING",    (_C_PT_H, 1), (_C_PT_A, -1), 10),
        ("BOTTOMPADDING", (_C_PT_H, 1), (_C_PT_A, -1), 10),
    ]
    table.setStyle(TableStyle(style_cmds))
    return table


# ── Helpers ────────────────────────────────────────────────────────────────────

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
        key=lambda m: (
            m.scheduled_at.isoformat() if m.scheduled_at else "9999-12-31T23:59:59",
            m.field_name or "",
            m.field_number or 0,
            m.bracket_position or 0,
        ),
    )


def _format_time(value, tournament_timezone: str, fallback: str = "—") -> str:
    if value is None:
        return fallback
    try:
        tz = ZoneInfo(tournament_timezone)
    except Exception:
        tz = ZoneInfo("Europe/Rome")
    if getattr(value, "tzinfo", None) is None:
        return value.strftime("%H:%M")
    return value.astimezone(tz).strftime("%H:%M")


def _escape_pdf_text(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _team_logo_cell(team: ProgramTeamSlotResponse):
    from reportlab.lib.units import mm
    from reportlab.platypus import Image, Spacer

    image_bytes = _load_image_bytes(team.team_logo_url)
    if not image_bytes:
        return Spacer(12 * mm, 12 * mm)
    return Image(BytesIO(image_bytes), width=12 * mm, height=12 * mm)


@lru_cache(maxsize=256)
def _load_image_bytes(source: str | None) -> bytes | None:
    if not source:
        return None
    parsed = urlparse(source)
    try:
        if parsed.scheme in {"http", "https"}:
            with urlopen(source, timeout=3) as response:
                return response.read()
        candidate = source[1:] if source.startswith("/") else source
        path = Path(candidate)
        if path.exists():
            return path.read_bytes()
    except Exception:
        return None
    return None
