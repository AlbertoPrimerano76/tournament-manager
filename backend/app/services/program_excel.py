from __future__ import annotations

import re
from io import BytesIO
from zoneinfo import ZoneInfo

from app.schemas.program import (
    AgeGroupProgramResponse,
    ProgramGroupResponse,
    ProgramMatchResponse,
    ProgramPhaseResponse,
)

# ── Column layout (A=0 … O=14) ────────────────────────────────────────────────
# A   B      C  D          E          F  G    H          I          J  K  L  M      N      O
# ORA CAMPO  -  COD_HOME   NOME_HOME  -  vs   COD_AWAY   NOME_AWAY  -  -  -  METE_H METE_A ARBITRO
_NCOLS = 15
_COL_ORA      = 0
_COL_CAMPO    = 1
_COL_COD_HOME = 3
_COL_NOM_HOME = 4
_COL_VS       = 6
_COL_COD_AWAY = 7
_COL_NOM_AWAY = 8
_COL_METE_H   = 12
_COL_METE_A   = 13
_COL_ARBITRO  = 14


def _safe_filename(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return normalized.strip("-") or "categoria"


def _safe_sheet_name(value: str) -> str:
    cleaned = re.sub(r"[\\/*?:\[\]]", "", value).strip()
    return cleaned[:31] or "Foglio"


def _format_time(value, tournament_timezone: str, fallback: str = "") -> str:
    if value is None:
        return fallback
    try:
        tz = ZoneInfo(tournament_timezone)
    except Exception:
        tz = ZoneInfo("Europe/Rome")
    if getattr(value, "tzinfo", None) is None:
        return value.strftime("%H:%M")
    return value.astimezone(tz).strftime("%H:%M")


def _field_label(match: ProgramMatchResponse) -> str:
    if not match.field_name:
        return ""
    parts = [match.field_name]
    if match.field_number is not None:
        parts.append(f"Campo {match.field_number}")
    return " · ".join(parts)


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


# ── Styling helpers ────────────────────────────────────────────────────────────

def _apply_styles(wb):
    """Import openpyxl styling – called lazily so import errors are caught by the route."""
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    return Font, PatternFill, Alignment, Border, Side


def _style_title(ws, row: int, last_col: int = _NCOLS):
    from openpyxl.styles import Font, Alignment
    cell = ws.cell(row=row, column=1)
    cell.font = Font(bold=True, size=14)
    cell.alignment = Alignment(horizontal="center")
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=last_col)


def _style_subtitle(ws, row: int, last_col: int = _NCOLS):
    from openpyxl.styles import Font, Alignment
    cell = ws.cell(row=row, column=1)
    cell.font = Font(bold=True, size=11)
    cell.alignment = Alignment(horizontal="center")
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=last_col)


def _style_section_header(ws, row: int, hex_bg: str = "DBEAFE"):
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    thin = Side(style="thin", color="CBD5E1")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    fill = PatternFill("solid", fgColor=hex_bg)
    for col in range(1, _NCOLS + 1):
        c = ws.cell(row=row, column=col)
        c.font = Font(bold=True, size=9)
        c.fill = fill
        c.border = border
        c.alignment = Alignment(horizontal="center", vertical="center")


def _style_match_row(ws, row: int, alt: bool):
    from openpyxl.styles import PatternFill, Alignment, Border, Side
    thin = Side(style="thin", color="CBD5E1")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    fill = PatternFill("solid", fgColor="F8FAFC" if alt else "FFFFFF")
    for col in range(1, _NCOLS + 1):
        c = ws.cell(row=row, column=col)
        c.fill = fill
        c.border = border
        c.alignment = Alignment(vertical="center")
    # Center ORA, CAMPO, codes, vs, mete columns
    for col in [_COL_ORA + 1, _COL_CAMPO + 1, _COL_COD_HOME + 1, _COL_VS + 1, _COL_COD_AWAY + 1,
                _COL_METE_H + 1, _COL_METE_A + 1]:
        ws.cell(row=row, column=col).alignment = Alignment(horizontal="center", vertical="center")


def _set_col_widths(ws):
    widths = {
        "A": 8,   # ORA
        "B": 28,  # CAMPO
        "C": 4,   # spacer
        "D": 5,   # code home
        "E": 26,  # nome home
        "F": 2,   # spacer
        "G": 4,   # vs
        "H": 5,   # code away
        "I": 26,  # nome away
        "J": 2,
        "K": 2,
        "L": 2,
        "M": 9,   # mete home
        "N": 9,   # mete away
        "O": 22,  # ARBITRO
    }
    for col_letter, width in widths.items():
        ws.column_dimensions[col_letter].width = width


# ── Group sheet ────────────────────────────────────────────────────────────────

def _write_group_sheet(
    ws,
    tournament_name: str,
    age_group_label: str,
    group: ProgramGroupResponse,
    group_num: int,
    phase_name: str,
    tournament_timezone: str,
) -> None:
    # team code map: tournament_team_id -> (code, label)
    team_code: dict[str, tuple[str, str]] = {}
    for pos, team in enumerate(group.teams):
        code = f"{chr(65 + pos)}{group_num}"
        if team.tournament_team_id:
            team_code[team.tournament_team_id] = (code, team.label)

    _set_col_widths(ws)
    ws.row_dimensions[1].height = 22
    ws.row_dimensions[2].height = 18
    ws.freeze_panes = "A11"

    # Row 1 – tournament title
    ws.cell(row=1, column=1, value=tournament_name)
    _style_title(ws, 1)

    # Row 2 – age group + phase
    ws.cell(row=2, column=1, value=f"{age_group_label}  ·  {phase_name}")
    _style_subtitle(ws, 2)

    ws.append([])  # row 3

    # Row 4 – group name
    ws.cell(row=4, column=1, value=group.name)
    _style_subtitle(ws, 4)

    # Row 5 – teams header
    teams_header = [""] * _NCOLS
    teams_header[0] = "Squadre"
    ws.append(teams_header)
    _style_section_header(ws, 5, "EEF2FF")

    # Rows 6+ – team list
    for pos, team in enumerate(group.teams):
        code = f"{chr(65 + pos)}{group_num}"
        row_data = [""] * _NCOLS
        row_data[0] = code
        row_data[1] = team.label
        ws.append(row_data)
        _style_match_row(ws, ws.max_row, pos % 2 == 1)

    ws.append([])  # spacer

    # Schedule header
    header = [""] * _NCOLS
    header[_COL_ORA]     = "ORA"
    header[_COL_CAMPO]   = "CAMPO"
    header[_COL_COD_HOME] = ""
    header[_COL_VS]       = ""
    header[_COL_METE_H]  = "METE"
    header[_COL_METE_A]  = "METE"
    header[_COL_ARBITRO] = "ARBITRO"
    ws.append(header)
    _style_section_header(ws, ws.max_row, "DBEAFE")

    # Match rows
    matches = _sort_matches(group.matches)
    for i, match in enumerate(matches):
        h_code, h_name = team_code.get(match.home_team_id or "", ("", match.home_label))
        a_code, a_name = team_code.get(match.away_team_id or "", ("", match.away_label))
        row_data = [""] * _NCOLS
        row_data[_COL_ORA]      = _format_time(match.scheduled_at, tournament_timezone)
        row_data[_COL_CAMPO]    = _field_label(match)
        row_data[_COL_COD_HOME] = h_code
        row_data[_COL_NOM_HOME] = h_name
        row_data[_COL_VS]       = "vs"
        row_data[_COL_COD_AWAY] = a_code
        row_data[_COL_NOM_AWAY] = a_name
        row_data[_COL_METE_H]   = match.home_tries if match.home_tries is not None else ""
        row_data[_COL_METE_A]   = match.away_tries if match.away_tries is not None else ""
        row_data[_COL_ARBITRO]  = match.referee or ""
        ws.append(row_data)
        _style_match_row(ws, ws.max_row, i % 2 == 1)


# ── Knockout sheet ─────────────────────────────────────────────────────────────

def _write_knockout_sheet(
    ws,
    tournament_name: str,
    age_group_label: str,
    phase: ProgramPhaseResponse,
    tournament_timezone: str,
) -> None:
    _set_col_widths(ws)
    ws.freeze_panes = "A6"

    ws.cell(row=1, column=1, value=tournament_name)
    _style_title(ws, 1)

    ws.cell(row=2, column=1, value=f"{age_group_label}  ·  {phase.name}")
    _style_subtitle(ws, 2)

    ws.append([])  # row 3

    matches = _sort_matches(phase.knockout_matches)
    matches_by_round: dict[str, list[ProgramMatchResponse]] = {}
    for m in matches:
        rname = m.bracket_round or phase.name
        matches_by_round.setdefault(rname, []).append(m)

    row_offset = 4
    for round_name, round_matches in matches_by_round.items():
        # Round sub-header
        ws.cell(row=row_offset, column=1, value=round_name)
        _style_subtitle(ws, row_offset)
        row_offset += 1

        # Column header
        header = [""] * _NCOLS
        header[_COL_ORA]     = "ORA"
        header[_COL_CAMPO]   = "CAMPO"
        header[_COL_NOM_HOME] = "SQUADRA CASA"
        header[_COL_VS]       = ""
        header[_COL_NOM_AWAY] = "SQUADRA OSPITE"
        header[_COL_METE_H]  = "METE"
        header[_COL_METE_A]  = "METE"
        header[_COL_ARBITRO] = "ARBITRO"
        ws.append(header)
        _style_section_header(ws, ws.max_row, "FEF3C7")
        row_offset += 1

        for i, match in enumerate(round_matches):
            row_data = [""] * _NCOLS
            row_data[_COL_ORA]      = _format_time(match.scheduled_at, tournament_timezone)
            row_data[_COL_CAMPO]    = _field_label(match)
            row_data[_COL_NOM_HOME] = match.home_label
            row_data[_COL_VS]       = "vs"
            row_data[_COL_NOM_AWAY] = match.away_label
            row_data[_COL_METE_H]   = match.home_tries if match.home_tries is not None else ""
            row_data[_COL_METE_A]   = match.away_tries if match.away_tries is not None else ""
            row_data[_COL_ARBITRO]  = match.referee or ""
            ws.append(row_data)
            _style_match_row(ws, ws.max_row, i % 2 == 1)
            row_offset += 1

        ws.append([])
        row_offset += 1


# ── Public entry point ─────────────────────────────────────────────────────────

def build_age_group_program_excel(
    tournament_name: str,
    program: AgeGroupProgramResponse,
    tournament_timezone: str = "Europe/Rome",
) -> tuple[bytes, str]:
    from openpyxl import Workbook

    age_group_label = program.display_name or program.age_group
    wb = Workbook()
    wb.remove(wb.active)  # drop the default empty sheet

    for day in program.days:
        for phase in day.phases:
            if phase.groups:
                for gi, group in enumerate(phase.groups):
                    sheet_name = _safe_sheet_name(
                        f"G{gi + 1} - {phase.name}" if len(phase.groups) > 1 else phase.name
                    )
                    ws = wb.create_sheet(title=sheet_name)
                    _write_group_sheet(ws, tournament_name, age_group_label, group, gi + 1, phase.name, tournament_timezone)

            if phase.knockout_matches:
                ws = wb.create_sheet(title=_safe_sheet_name(phase.name))
                _write_knockout_sheet(ws, tournament_name, age_group_label, phase, tournament_timezone)

    if not wb.sheetnames:
        wb.create_sheet("Programma")

    buffer = BytesIO()
    wb.save(buffer)
    filename = f"gironi-{_safe_filename(age_group_label)}.xlsx"
    return buffer.getvalue(), filename
