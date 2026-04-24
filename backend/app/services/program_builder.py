from __future__ import annotations

from collections import defaultdict
from datetime import date as date_type, datetime, time, timedelta, timezone
import json
import math
import re
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.match import Match, MatchStatus
from app.models.phase import Group, GroupTeam, Phase, PhaseType
from app.models.team import TournamentTeam, Team
from app.models.tournament import Tournament, TournamentAgeGroup
from app.schemas.program import (
    AgeGroupProgramResponse,
    ProgramDayResponse,
    ProgramGroupResponse,
    ProgramMatchResponse,
    ProgramPhaseResponse,
    ProgramTeamSlotResponse,
    TournamentProgramResponse,
)


_SEED_TYPE_KEY = "_seed"
_LEGACY_SEED_PREFIX = "AUTOSEED::"
_DEFAULT_TIMEZONE = "Europe/Rome"
_PHASE_BREAK = timedelta(0)


def _tournament_tz(age_group: TournamentAgeGroup) -> ZoneInfo:
    tz_name = getattr(age_group.tournament, "timezone", None) or _DEFAULT_TIMEZONE
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo(_DEFAULT_TIMEZONE)


def _match_has_recorded_result(match: Match) -> bool:
    return (
        match.home_score is not None
        or match.away_score is not None
        or match.home_tries is not None
        or match.away_tries is not None
        or match.status == MatchStatus.COMPLETED
    )


def _lane_key(lane: dict[str, Any]) -> tuple[str | None, int | None]:
    return (
        str(lane.get("field_name")) if lane.get("field_name") is not None else None,
        int(lane.get("field_number")) if isinstance(lane.get("field_number"), int) else None,
    )


def _age_group_has_recorded_results(age_group: TournamentAgeGroup) -> bool:
    for phase in age_group.phases:
        for match in phase.matches:
            if _match_has_recorded_result(match):
                return True
    return False


def parse_group_sizes(raw: str | None, fallback_groups: int, total_teams: int) -> list[int]:
    values = [
        int(item.strip())
        for item in (raw or "").split(",")
        if item.strip().isdigit() and int(item.strip()) > 0
    ]
    if values:
      return values

    groups = max(fallback_groups, 1)
    base = total_teams // groups if total_teams else 0
    extra = total_teams % groups if total_teams else 0
    return [base + (1 if index < extra else 0) for index in range(groups)]


def _distribute_entries_across_groups(
    entries: list[dict[str, Any]],
    group_sizes: list[int],
) -> list[list[dict[str, Any]]]:
    groups: list[list[dict[str, Any] | None]] = [[None for _ in range(size)] for size in group_sizes]
    if not entries:
        return [[] for _ in group_sizes]

    remaining_entries: list[dict[str, Any]] = []
    for entry in entries:
        target_group_index = entry.get("target_group_index")
        target_group_position = entry.get("target_group_position")
        if isinstance(target_group_index, int) and isinstance(target_group_position, int):
            if 0 <= target_group_index < len(group_sizes) and 1 <= target_group_position <= group_sizes[target_group_index]:
                slot_index = target_group_position - 1
                if groups[target_group_index][slot_index] is None:
                    groups[target_group_index][slot_index] = entry
                    continue
        remaining_entries.append(entry)

    org_buckets: dict[str | None, list[dict[str, Any]]] = defaultdict(list)
    for entry in remaining_entries:
        org_buckets[entry.get("organization_id")].append(entry)

    ordered_entries = [
        entry
        for _, bucket_entries in sorted(
            org_buckets.items(),
            key=lambda item: (-len(item[1]), str(item[0] or "")),
        )
        for entry in bucket_entries
    ]

    for entry in ordered_entries:
        organization_id = entry.get("organization_id")
        candidate_indexes = [
            index
            for index, size in enumerate(group_sizes)
            if any(item is None for item in groups[index])
        ]
        if not candidate_indexes:
            break

        def group_sort_key(group_index: int) -> tuple[int, int, int]:
            assigned_items = [item for item in groups[group_index] if item is not None]
            same_org_count = sum(1 for item in assigned_items if item.get("organization_id") == organization_id)
            return (same_org_count, len(assigned_items), group_index)

        target_index = min(candidate_indexes, key=group_sort_key)
        slot_index = next((index for index, item in enumerate(groups[target_index]) if item is None), None)
        if slot_index is None:
            break
        groups[target_index][slot_index] = entry

    return [[item for item in group if item is not None] for group in groups]


def encode_seed_note(home_label: str, away_label: str, extra_note: str | None = None) -> str:
    """Encode placeholder team labels as a JSON seed note stored in match.notes."""
    payload: dict[str, Any] = {_SEED_TYPE_KEY: True, "home": home_label, "away": away_label}
    if extra_note:
        payload["note"] = extra_note
    return json.dumps(payload, ensure_ascii=False)


def decode_seed_note(note: str | None) -> tuple[str | None, str | None, str | None]:
    """Return (home_label, away_label, clean_notes).

    Handles both the current JSON format and the legacy AUTOSEED:: string format
    so that existing DB records continue to work without a migration.
    Returns (None, None, note) when the note is not a seed note.
    """
    if not note:
        return None, None, note

    # Current JSON format
    if note.startswith("{"):
        try:
            data = json.loads(note)
            if isinstance(data, dict) and data.get(_SEED_TYPE_KEY):
                return data.get("home"), data.get("away"), data.get("note")
        except (json.JSONDecodeError, AttributeError):
            pass
        return None, None, note

    # Legacy string format — kept for backward compatibility with existing rows
    if not note.startswith(_LEGACY_SEED_PREFIX):
        return None, None, note
    payload = note[len(_LEGACY_SEED_PREFIX):]
    parts = payload.split("||")
    home = parts[0] if len(parts) > 0 else None
    away = parts[1] if len(parts) > 1 else None
    extra = parts[2] if len(parts) > 2 else None
    return home, away, extra


def _default_phase_date(age_group: TournamentAgeGroup, phase_index: int) -> datetime | None:
    start_date = age_group.tournament.start_date or date_type.today()
    if age_group.tournament.end_date and age_group.tournament.end_date >= start_date:
        max_days = (age_group.tournament.end_date - start_date).days
        day_offset = min(phase_index, max_days)
    else:
        day_offset = phase_index
    return datetime.combine(start_date + timedelta(days=day_offset), time(hour=12), tzinfo=_tournament_tz(age_group))


def _team_label(tt: TournamentTeam) -> str:
    return tt.team.name


def _group_name(index: int) -> str:
    return f"Girone {chr(65 + index)}"


def _group_name_from_config(index: int, phase_config: dict[str, Any] | None) -> str:
    custom_names = (phase_config or {}).get("group_custom_names")
    if (
        isinstance(custom_names, list)
        and index < len(custom_names)
        and isinstance(custom_names[index], str)
        and custom_names[index].strip()
    ):
        return custom_names[index].strip()
    return _group_name(index)


def _parse_start_time(raw_value: Any) -> time:
    if isinstance(raw_value, str):
        try:
            hours, minutes = raw_value.split(":", maxsplit=1)
            return time(hour=int(hours), minute=int(minutes))
        except (TypeError, ValueError):
            pass
    return time(hour=9, minute=30)


def _schedule_settings(age_group: TournamentAgeGroup) -> dict[str, Any]:
    structure = age_group.structure_config if isinstance(age_group.structure_config, dict) else {}
    schedule = structure.get("schedule", {}) if isinstance(structure, dict) else {}
    return schedule if isinstance(schedule, dict) else {}


def _build_field_name(raw_name: str, category_label: str | None) -> str:
    """Incorporate category_label (e.g. 'U6', 'U8') into the field name so that
    fields with the same base name but different age-group labels are treated as
    distinct physical locations in conflict detection."""
    label = (category_label or "").strip()
    return f"{raw_name} · {label}" if label else raw_name


def _schedule_playing_fields(age_group: TournamentAgeGroup) -> list[dict[str, Any]]:
    schedule = _schedule_settings(age_group)
    raw_fields = schedule.get("playing_fields", [])
    if not isinstance(raw_fields, list):
        return []

    playing_fields: list[dict[str, Any]] = []
    seen: set[tuple[str, int | None]] = set()
    for raw_field in raw_fields:
        if not isinstance(raw_field, dict):
            continue
        field_name = raw_field.get("field_name") or raw_field.get("facility_name")
        field_number = raw_field.get("field_number")
        category_label = raw_field.get("category_label")
        if not field_name:
            continue
        effective_name = _build_field_name(str(field_name), category_label)
        normalized_field = {
            "field_name": effective_name,
            "field_number": int(field_number) if isinstance(field_number, int) else None,
        }
        field_key = (normalized_field["field_name"], normalized_field["field_number"])
        if field_key in seen:
            continue
        seen.add(field_key)
        playing_fields.append(normalized_field)
    return playing_fields


def _phase_start_datetime(age_group: TournamentAgeGroup, phase_index: int) -> datetime | None:
    base = _default_phase_date(age_group, phase_index)
    if not base:
        return None
    schedule = _schedule_settings(age_group)
    start = _parse_start_time(schedule.get("start_time"))
    return datetime.combine(base.date(), start, tzinfo=_tournament_tz(age_group))


def _phase_slot_duration(age_group: TournamentAgeGroup, phase_config: dict[str, Any] | None = None) -> timedelta:
    schedule = _schedule_settings(age_group)
    duration = _resolve_phase_duration_minutes(age_group, phase_config)
    interval = int(schedule.get("interval_minutes") or 8)
    return timedelta(minutes=max(duration, 1) + max(interval, 0))


def _estimate_phase_time_window(
    matches: list[ProgramMatchResponse],
    slot_duration: timedelta,
    interval_minutes: int = 8,
) -> tuple[datetime | None, datetime | None]:
    scheduled_matches = [match for match in matches if match.scheduled_at]
    if not scheduled_matches:
        return None, None

    phase_start_at = min(match.scheduled_at for match in scheduled_matches if match.scheduled_at)
    estimated_end_at = max(
        match.actual_end_at
        if match.actual_end_at and match.actual_end_at > match.scheduled_at
        else match.scheduled_at + (
            timedelta(minutes=match.match_duration_minutes + interval_minutes)
            if match.match_duration_minutes is not None
            else slot_duration
        )
        for match in scheduled_matches
        if match.scheduled_at
    )
    return phase_start_at, estimated_end_at


def _resolve_phase_date(
    age_group: TournamentAgeGroup,
    phase_index: int,
    phase_config: dict[str, Any],
) -> datetime | None:
    explicit_date = phase_config.get("phase_date")
    if isinstance(explicit_date, str) and explicit_date:
        try:
            parsed = datetime.strptime(explicit_date, "%Y-%m-%d").date()
            return datetime.combine(parsed, time(hour=12), tzinfo=_tournament_tz(age_group))
        except ValueError:
            pass
    return _default_phase_date(age_group, phase_index)


def _resolve_phase_start(
    age_group: TournamentAgeGroup,
    phase_index: int,
    phase_config: dict[str, Any],
    fallback_start: datetime | None,
) -> datetime | None:
    base = _resolve_phase_date(age_group, phase_index, phase_config)
    if not base:
        return fallback_start

    explicit_start = phase_config.get("start_time")
    if isinstance(explicit_start, str) and explicit_start:
        # User explicitly configured a start time — honour it as-is.
        return datetime.combine(base.date(), _parse_start_time(explicit_start), tzinfo=_tournament_tz(age_group))

    base_start = _phase_start_datetime(age_group, phase_index)
    if not fallback_start:
        return base_start
    if not base_start:
        return fallback_start

    # Knockout phases in chained eliminations should stay anchored to the configured
    # base hour (e.g. 11:30) and not drift by match-duration increments.
    phase_type = str(phase_config.get("phase_type") or "").upper()
    if phase_type == PhaseType.KNOCKOUT.value:
        return base_start

    # For non-knockout phases keep a minimum break from the previous phase.
    minimum_start = fallback_start + _PHASE_BREAK
    return minimum_start if base_start < minimum_start else base_start


def _resolve_phase_duration_minutes(age_group: TournamentAgeGroup, phase_config: dict[str, Any] | None = None) -> int:
    """Return the default category match duration in minutes."""
    schedule = _schedule_settings(age_group)
    return int(schedule.get("match_duration_minutes") or 12)


def _resolve_top_final_duration_override(phase_config: dict[str, Any] | None = None) -> int | None:
    if not phase_config:
        return None
    num_halves = phase_config.get("num_halves")
    half_duration = phase_config.get("half_duration_minutes")
    if num_halves and half_duration:
        return max(int(num_halves) * int(half_duration), 1)
    phase_duration = phase_config.get("match_duration_minutes")
    if phase_duration:
        return max(int(phase_duration), 1)
    return None


def _is_top_final_round(round_name: str | None) -> bool:
    if not round_name:
        return False
    normalized = str(round_name).strip().lower()
    return (
        normalized == "finale"
        or "piazzamento 1-2" in normalized
        or normalized == "tabellone principale · finale"
    )


def _resolve_generated_match_duration_minutes(
    age_group: TournamentAgeGroup,
    phase_config: dict[str, Any] | None,
    round_name: str | None,
) -> int | None:
    if _is_top_final_round(round_name):
        return _resolve_top_final_duration_override(phase_config)
    return None


def _slot_delta(age_group: TournamentAgeGroup, phase_config: dict[str, Any] | None = None) -> timedelta:
    schedule = _schedule_settings(age_group)
    duration = _resolve_phase_duration_minutes(age_group, phase_config)
    interval = int(schedule.get("interval_minutes") or 8)
    return timedelta(minutes=max(duration, 1) + max(interval, 0))


def _round_robin_rounds(slots: list[dict[str, Any]]) -> list[list[tuple[dict[str, Any], dict[str, Any]]]]:
    if len(slots) < 2:
        return []

    rotation = slots[:]
    if len(rotation) % 2 == 1:
        rotation.append({"label": "Riposo", "is_bye": True})

    rounds: list[list[tuple[dict[str, Any], dict[str, Any]]]] = []
    total_rounds = len(rotation) - 1

    for _ in range(total_rounds):
        half = len(rotation) // 2
        left = rotation[:half]
        right = list(reversed(rotation[half:]))
        round_pairs: list[tuple[dict[str, Any], dict[str, Any]]] = []

        for home, away in zip(left, right):
            if home.get("is_bye") or away.get("is_bye"):
                continue
            round_pairs.append((home, away))

        if round_pairs:
            rounds.append(round_pairs)

        fixed = rotation[0]
        rotating = rotation[1:]
        rotating = [rotating[-1], *rotating[:-1]]
        rotation = [fixed, *rotating]

    return rounds


def _group_stage_rounds(
    slots: list[dict[str, Any]],
    phase_config: dict[str, Any],
) -> list[list[tuple[dict[str, Any], dict[str, Any]]]]:
    rounds = _round_robin_rounds(slots)
    if phase_config.get("round_trip_mode") != "double":
        return _rebalance_round_openers(rounds)

    reverse_rounds = [
        [(away_entry, home_entry) for home_entry, away_entry in round_pairs]
        for round_pairs in rounds
    ]
    return _rebalance_round_openers(rounds + reverse_rounds)


def _rebalance_round_openers(
    rounds: list[list[tuple[dict[str, Any], dict[str, Any]]]],
) -> list[list[tuple[dict[str, Any], dict[str, Any]]]]:
    """Reduce opener back-to-back teams between adjacent rounds when possible.

    If the first match of the current round includes a team that played
    in the last match of the previous round, swap the opener with the first
    non-conflicting match available in the round.
    """
    if len(rounds) < 2:
        return rounds

    rebalanced_rounds: list[list[tuple[dict[str, Any], dict[str, Any]]]] = []

    for round_pairs in rounds:
        rebalanced_rounds.append(list(round_pairs))

    for round_index in range(1, len(rebalanced_rounds)):
        previous_round = rebalanced_rounds[round_index - 1]
        current_round = rebalanced_rounds[round_index]
        if not previous_round or len(current_round) < 2:
            continue

        previous_teams = {
            team_id
            for entry in previous_round[-1]
            for team_id in (entry.get("tournament_team_id"),)
            if team_id
        }
        if not previous_teams:
            continue

        opener_teams = {
            team_id
            for entry in current_round[0]
            for team_id in (entry.get("tournament_team_id"),)
            if team_id
        }
        if not (opener_teams & previous_teams):
            continue

        replacement_index: int | None = None
        for match_index in range(1, len(current_round)):
            candidate_teams = {
                team_id
                for entry in current_round[match_index]
                for team_id in (entry.get("tournament_team_id"),)
                if team_id
            }
            if candidate_teams and not (candidate_teams & previous_teams):
                replacement_index = match_index
                break

        if replacement_index is not None:
            current_round[0], current_round[replacement_index] = current_round[replacement_index], current_round[0]

    return rebalanced_rounds


def _group_lanes(
    age_group: TournamentAgeGroup,
    phase_config: dict[str, Any],
    group_name: str,
    group_index: int,
    total_groups: int,
) -> list[dict[str, Any]]:
    raw_assignments = phase_config.get("group_field_assignments", {})
    if not isinstance(raw_assignments, dict):
        raw_assignments = {}
    raw_lanes = raw_assignments.get(group_name, [])
    lanes: list[dict[str, Any]] = []
    seen: set[tuple[str, int | None]] = set()
    if isinstance(raw_lanes, list):
        for lane in raw_lanes:
            if not isinstance(lane, dict):
                continue
            field_name = lane.get("field_name")
            field_number = lane.get("field_number")
            category_label = lane.get("category_label")
            if not field_name:
                continue
            effective_name = _build_field_name(str(field_name), category_label)
            normalized_lane = {
                "field_name": effective_name,
                "field_number": int(field_number) if isinstance(field_number, int) else None,
            }
            lane_key = (normalized_lane["field_name"], normalized_lane["field_number"])
            if lane_key in seen:
                continue
            seen.add(lane_key)
            lanes.append(normalized_lane)
    if lanes:
        return lanes

    playing_fields = _schedule_playing_fields(age_group)
    if not playing_fields:
        return []
    if total_groups <= 1:
        return playing_fields

    chunk_size = max(math.ceil(len(playing_fields) / total_groups), 1)
    start = group_index * chunk_size
    end = start + chunk_size
    lanes = playing_fields[start:end]
    if lanes:
        return lanes

    fallback_index = min(group_index, len(playing_fields) - 1)
    return [playing_fields[fallback_index]]
    


def _knockout_lanes(age_group: TournamentAgeGroup, phase_config: dict[str, Any]) -> list[dict[str, Any]]:
    raw_lanes = phase_config.get("knockout_field_assignments", [])
    lanes: list[dict[str, Any]] = []
    if isinstance(raw_lanes, list):
        for lane in raw_lanes:
            if not isinstance(lane, dict):
                continue
            field_name = lane.get("field_name")
            field_number = lane.get("field_number")
            category_label = lane.get("category_label")
            if not field_name:
                continue
            effective_name = _build_field_name(str(field_name), category_label)
            lanes.append({
                "field_name": effective_name,
                "field_number": int(field_number) if isinstance(field_number, int) else None,
            })
    return lanes or _schedule_playing_fields(age_group)


def _assign_cross_group_referees(
    matches: list[Match],
    group_team_ids: dict[str, list[str]],
    participants: list[TournamentTeam],
    referee_source_group_ids: dict[str, list[str]] | None = None,
    allow_same_group_primary_ids: set[str] | None = None,
) -> None:
    """Assign referees at organisation level.

    Two teams belonging to the same organisation (e.g. "Rugby Livorno 1931 Verde"
    and "Rugby Livorno 1931 Bianco") share an org_id.  Neither can referee the
    other.  The referee label is the organisation name, not the individual team name.
    When no cross-org candidate is available the field is left blank (to be set
    manually on the day).
    """
    # team_id → org_id, org_id → display name
    org_id_map:   dict[str, str] = {}
    org_name_map: dict[str, str] = {}
    for tt in participants:
        if tt.team and tt.team.organization:
            org_id_map[tt.id]  = tt.team.organization_id
            org_name_map[tt.team.organization_id] = tt.team.organization.name
        elif tt.team:
            # Fallback: treat each team as its own pseudo-org (unique per team)
            org_id_map[tt.id]  = tt.id
            org_name_map[tt.id] = tt.team.name

    # For load-balancing we track how many times each org has been assigned
    org_load: dict[str, int] = defaultdict(int)
    # Map team_id → team display name (used only for fallback label when org name missing)
    participant_name_map = {tt.id: tt.team.name for tt in participants}

    referee_source_group_ids   = referee_source_group_ids or {}
    allow_same_group_primary_ids = allow_same_group_primary_ids or set()

    matches_by_slot: dict[datetime | None, list[Match]] = defaultdict(list)
    for match in matches:
        matches_by_slot[match.scheduled_at].append(match)

    for scheduled_at, slot_matches in matches_by_slot.items():
        busy_team_ids = {
            team_id
            for match in slot_matches
            for team_id in [match.home_team_id, match.away_team_id]
            if team_id
        }
        # Orgs whose teams are playing in this slot → cannot referee
        busy_org_ids = {org_id_map[tid] for tid in busy_team_ids if tid in org_id_map}

        # Orgs that have already been assigned as referee in this slot
        assigned_org_ids: set[str] = set()

        for match in slot_matches:
            home_org = org_id_map.get(match.home_team_id or "", "")
            away_org = org_id_map.get(match.away_team_id or "", "")
            playing_orgs = {home_org, away_org} - {""}

            same_group_team_ids = set(group_team_ids.get(match.group_id or "", []))
            allowed_source_group_ids = referee_source_group_ids.get(match.group_id or "", [])

            def _org_ok(tid: str) -> bool:
                """True when *tid* belongs to an org that may referee this match."""
                oid = org_id_map.get(tid, "")
                return (
                    oid not in playing_orgs
                    and oid not in busy_org_ids
                    and oid not in assigned_org_ids
                )

            # Priority 1: cross-group team from a different org
            cross_group_candidates = [
                tid
                for gid, tids in group_team_ids.items()
                if gid != match.group_id and (not allowed_source_group_ids or gid in allowed_source_group_ids)
                for tid in tids
                if _org_ok(tid)
            ]

            # Priority 2: same-group team from a different org
            same_group_candidates = [
                tid for tid in same_group_team_ids if _org_ok(tid)
            ]

            if match.group_id and match.group_id in allow_same_group_primary_ids:
                candidate_ids = cross_group_candidates + same_group_candidates
            else:
                candidate_ids = cross_group_candidates or same_group_candidates

            # Priority 3: any participant from a different org not busy in this slot
            if not candidate_ids:
                candidate_ids = [
                    tid for tid in participant_name_map
                    if _org_ok(tid)
                ]

            if not candidate_ids:
                # No valid candidate — leave blank for manual assignment
                match.referee = None
                continue

            # Pick the org with the lowest referee load, then alphabetical for stability
            candidate_ids.sort(key=lambda tid: (
                org_load.get(org_id_map.get(tid, ""), 0),
                org_name_map.get(org_id_map.get(tid, ""), participant_name_map.get(tid, "")),
            ))
            selected = candidate_ids[0]
            selected_org = org_id_map.get(selected, "")
            # Assign the organisation name as referee label
            match.referee = org_name_map.get(selected_org) or participant_name_map.get(selected)
            org_load[selected_org] += 1
            assigned_org_ids.add(selected_org)


def _match_end_time(match: Match, slot_delta: timedelta) -> datetime | None:
    if not match.scheduled_at:
        return None
    if match.actual_end_at and match.actual_end_at > match.scheduled_at:
        return match.actual_end_at
    return match.scheduled_at + slot_delta


async def _resolve_age_group_field_conflicts(age_group: TournamentAgeGroup, db: AsyncSession) -> None:
    slot_delta = _slot_delta(age_group)

    occupied_slots: dict[tuple[str, int | None], list[tuple[datetime, datetime]]] = defaultdict(list)

    other_matches_result = await db.execute(
        select(Match)
        .join(Phase, Match.phase_id == Phase.id)
        .join(TournamentAgeGroup, Phase.tournament_age_group_id == TournamentAgeGroup.id)
        .where(
            TournamentAgeGroup.tournament_id == age_group.tournament_id,
            TournamentAgeGroup.id != age_group.id,
            Match.scheduled_at.is_not(None),
            Match.field_name.is_not(None),
        )
    )
    other_matches = other_matches_result.scalars().all()
    for match in other_matches:
        if not match.scheduled_at or not match.field_name:
            continue
        end_time = _match_end_time(match, slot_delta)
        if not end_time:
            continue
        occupied_slots[(match.field_name, match.field_number)].append((match.scheduled_at, end_time))

    age_group_matches_result = await db.execute(
        select(Match)
        .join(Phase, Match.phase_id == Phase.id)
        .where(Phase.tournament_age_group_id == age_group.id)
        .order_by(
            Phase.phase_order.asc(),
            Match.scheduled_at.asc().nulls_last(),
            Match.bracket_round_order.asc().nulls_last(),
            Match.bracket_position.asc().nulls_last(),
        )
    )
    age_group_matches = age_group_matches_result.scalars().all()

    # Query phases fresh from DB — age_group.phases may be stale if phases were just
    # deleted and recreated in the same transaction (the ORM collection is not refreshed
    # automatically when only the FK side is set on the new Phase objects).
    fresh_phases_result = await db.execute(
        select(Phase).where(Phase.tournament_age_group_id == age_group.id)
    )
    _fresh_phases = fresh_phases_result.scalars().all()

    # Build phase-order lookup from fresh DB phase objects
    phase_order_by_id: dict[str, int] = {phase.id: phase.phase_order for phase in _fresh_phases}

    # Separate group-stage matches from knockout matches
    group_stage_matches: list[Match] = []
    knockout_by_phase: dict[str, list[Match]] = defaultdict(list)
    for match in age_group_matches:
        if match.group_id is not None:
            group_stage_matches.append(match)
        elif match.phase_id:
            knockout_by_phase[match.phase_id].append(match)

    # Sort group-stage matches by scheduled_at. Use timestamp float as sort key
    # to avoid TypeError when mixing naive and tz-aware datetimes (SQLite vs PG).
    def _sort_ts(m: Match) -> tuple[int, float, int]:
        if m.scheduled_at is None:
            return (1, 0.0, m.bracket_position or 0)
        try:
            ts = m.scheduled_at.timestamp()
        except (OSError, OverflowError, ValueError):
            ts = 0.0
        return (0, ts, m.bracket_position or 0)
    group_stage_matches.sort(key=_sort_ts)

    def _find_free_slot(field_key: tuple[str, int | None], earliest: datetime) -> datetime:
        candidate = earliest
        while True:
            candidate_end = candidate + slot_delta
            conflicts = [
                (s, e) for s, e in occupied_slots[field_key]
                if candidate < e and candidate_end > s
            ]
            if not conflicts:
                return candidate
            candidate = max(e for _, e in conflicts)

    # Build a map of phase_id → configured start datetime for phases that have an explicit
    # start_time in the structure config. Matches at this anchor time must never be moved
    # by cross-age-group conflict resolution — the admin explicitly chose that time.
    _structure = age_group.structure_config or {}
    _phases_cfg: list[dict[str, Any]] = _structure.get("phases", []) if isinstance(_structure, dict) else []
    anchored_phase_starts: dict[str, datetime] = {}
    for _phase in _fresh_phases:
        _idx = _phase.phase_order - 1
        if _idx < len(_phases_cfg) and isinstance(_phases_cfg[_idx], dict):
            _pc = _phases_cfg[_idx]
            _explicit_st = _pc.get("start_time")
            if isinstance(_explicit_st, str) and _explicit_st:
                _base = _resolve_phase_date(age_group, _idx, _pc)
                if _base:
                    anchored_phase_starts[_phase.id] = datetime.combine(
                        _base.date(), _parse_start_time(_explicit_st), tzinfo=_tournament_tz(age_group)
                    )

    def _same_scheduled_time(left: datetime | None, right: datetime | None) -> bool:
        if left is None or right is None:
            return False
        if left == right:
            return True
        try:
            return abs(left.timestamp() - right.timestamp()) < 1
        except (OSError, OverflowError, ValueError):
            return False

    def _is_anchored_match(match: Match) -> bool:
        if not match.phase_id or not match.scheduled_at:
            return False
        anchor = anchored_phase_starts.get(match.phase_id)
        return anchor is not None and _same_scheduled_time(match.scheduled_at, anchor)

    # ── 1. Group-stage matches (resolved independently by scheduled_at) ──────
    for match in group_stage_matches:
        if not match.scheduled_at or not match.field_name:
            continue
        field_key = (match.field_name, match.field_number)
        if _match_has_recorded_result(match):
            end_time = _match_end_time(match, slot_delta)
            if end_time:
                occupied_slots[field_key].append((match.scheduled_at, end_time))
            continue
        # If this match is at the phase's explicitly configured start time, honour it
        # as-is: the admin chose that time intentionally and it must not be displaced.
        if _is_anchored_match(match):
            occupied_slots[field_key].append((match.scheduled_at, match.scheduled_at + slot_delta))
            continue
        resolved = _find_free_slot(field_key, match.scheduled_at)
        match.scheduled_at = resolved
        occupied_slots[field_key].append((resolved, resolved + slot_delta))

    # ── 2. Knockout matches: process by phase, then bracket_round_order ──────
    # This enforces that finals are never scheduled before their semifinals,
    # and aligns matches within the same round to the same start time.
    for phase_id in sorted(knockout_by_phase.keys(), key=lambda pid: phase_order_by_id.get(pid, 0)):
        phase_matches = knockout_by_phase[phase_id]
        phase_matches.sort(key=lambda m: (m.bracket_round_order or 0, m.bracket_position or 0))
        phase_anchor = anchored_phase_starts.get(phase_id)
        first_round_order = phase_matches[0].bracket_round_order or 0 if phase_matches else 0
        prev_round_end: datetime | None = None
        idx = 0
        while idx < len(phase_matches):
            current_round = phase_matches[idx].bracket_round_order or 0
            end_idx = idx
            while end_idx < len(phase_matches) and (phase_matches[end_idx].bracket_round_order or 0) == current_round:
                end_idx += 1
            round_matches = phase_matches[idx:end_idx]

            # First pass: resolve each match with min_start = prev_round_end
            resolved_times: list[datetime] = []
            for match in round_matches:
                if not match.scheduled_at or not match.field_name:
                    continue
                field_key = (match.field_name, match.field_number)
                if _match_has_recorded_result(match):
                    end_time = _match_end_time(match, slot_delta)
                    if end_time:
                        occupied_slots[field_key].append((match.scheduled_at, end_time))
                    resolved_times.append(match.scheduled_at)
                    continue

                # Honour explicit knockout phase anchors on the opening round:
                # if admin configured this phase to start at a specific time,
                # keep that exact start and do not push it forward.
                if prev_round_end is None and phase_anchor is not None and _same_scheduled_time(match.scheduled_at, phase_anchor):
                    occupied_slots[field_key].append((match.scheduled_at, match.scheduled_at + slot_delta))
                    resolved_times.append(match.scheduled_at)
                    continue

                earliest = max(match.scheduled_at, prev_round_end) if prev_round_end else match.scheduled_at
                resolved = _find_free_slot(field_key, earliest)
                match.scheduled_at = resolved
                occupied_slots[field_key].append((resolved, resolved + slot_delta))
                resolved_times.append(resolved)

            if not resolved_times:
                idx = end_idx
                continue

            # Second pass: align all unplayed matches in this round to the max
            # resolved time so that matches in the same round start in parallel.
            max_round_start = max(resolved_times)
            for match in round_matches:
                if (
                    not match.scheduled_at
                    or _match_has_recorded_result(match)
                    or not match.field_name
                    or _is_anchored_match(match)
                    or match.scheduled_at >= max_round_start
                ):
                    continue
                if prev_round_end is None and phase_anchor is not None and _same_scheduled_time(match.scheduled_at, phase_anchor):
                    continue
                field_key = (match.field_name, match.field_number)
                # Remove the previously placed slot for this match
                old_start = match.scheduled_at
                occupied_slots[field_key] = [
                    (s, e) for s, e in occupied_slots[field_key]
                    if not (s == old_start and e == old_start + slot_delta)
                ]
                # Re-resolve from max_round_start (field might be busy there)
                resolved = _find_free_slot(field_key, max_round_start)
                match.scheduled_at = resolved
                occupied_slots[field_key].append((resolved, resolved + slot_delta))

            # prev_round_end = latest end time in this round
            actual_max = max(m.scheduled_at for m in round_matches if m.scheduled_at is not None)
            prev_round_end = actual_max + slot_delta
            idx = end_idx


def _next_power_of_two(value: int) -> int:
    if value <= 1:
        return 1
    return 1 << math.ceil(math.log2(value))


def _ordinal_it(rank: int) -> str:
    if rank == 1:
        return "1a"
    return f"{rank}a"


def _source_entries_from_group_phase(group_names: list[str], config: dict[str, Any] | None) -> list[dict[str, Any]]:
    labels: list[dict[str, Any]] = []
    config = config or {}
    qualifiers = int(config.get("top_n_per_group", 0) or 0)
    extras = int(config.get("best_third_count", 0) or 0)

    for group_name in group_names:
        for rank in range(1, qualifiers + 1):
            labels.append({"label": f"{_ordinal_it(rank)} {group_name}", "rank": rank, "group_name": group_name})

    for index in range(extras):
        labels.append({"label": f"Migliore extra {index + 1}", "rank": qualifiers + 1})

    return labels


def _resolve_phase_order_map(phases_config: list[dict[str, Any]]) -> dict[str, int]:
    phase_order_map: dict[str, int] = {}
    for phase_index, phase_config in enumerate(phases_config, start=1):
        phase_id = phase_config.get("id")
        if isinstance(phase_id, str) and phase_id:
            phase_order_map[phase_id] = phase_index
    return phase_order_map


def _entries_for_group_route(
    route: dict[str, Any],
    group_names: list[str],
    slot_labels_by_group: dict[str, list[str]] | None,
) -> list[dict[str, Any]]:
    slot_labels_by_group = slot_labels_by_group or {}
    source_mode = str(route.get("source_mode") or "group_rank")

    if source_mode == "best_extra":
        extra_count = int(route.get("extra_count") or 0)
        return [
            {"label": f"Migliore extra {index + 1}", "rank": 999}
            for index in range(max(extra_count, 0))
        ]

    selected_group_names = [
        group_name
        for group_name in route.get("source_groups", [])
        if isinstance(group_name, str) and group_name in group_names
    ] if isinstance(route.get("source_groups"), list) else []
    effective_group_names = selected_group_names or group_names
    rank_from = int(route.get("rank_from") or 0)
    rank_to = int(route.get("rank_to") or 0)
    if rank_from <= 0 or rank_to < rank_from:
        return []

    entries: list[dict[str, Any]] = []
    for group_name in effective_group_names:
        available_slots = len(slot_labels_by_group.get(group_name, []))
        max_rank = min(rank_to, available_slots) if available_slots > 0 else rank_to
        for rank in range(rank_from, max_rank + 1):
            entries.append({
                "label": f"{_ordinal_it(rank)} {group_name}",
                "rank": rank,
                "group_name": group_name,
            })
    return entries


def _normalize_route_target_slots(route: dict[str, Any]) -> list[str]:
    raw_slots = route.get("target_slots")
    if not isinstance(raw_slots, list):
        return []
    return [
        str(slot).strip().upper()
        for slot in raw_slots
        if isinstance(slot, str) and str(slot).strip()
    ]


def _apply_target_slot_assignments(
    entries: list[dict[str, Any]],
    route: dict[str, Any],
    target_phase_config: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    target_phase_config = target_phase_config or {}
    target_slots = _normalize_route_target_slots(route)
    if not target_slots:
        return entries

    phase_type = target_phase_config.get("phase_type")
    assigned_entries: list[dict[str, Any]] = []
    for index, entry in enumerate(entries):
        next_entry = dict(entry)
        if index < len(target_slots):
            slot = target_slots[index]
            if phase_type == "GROUP_STAGE":
                match = re.match(r"^([A-Z])(\d+)$", slot)
                if match:
                    next_entry["target_group_index"] = ord(match.group(1)) - 65
                    next_entry["target_group_position"] = int(match.group(2))
            elif phase_type == "KNOCKOUT" and slot.isdigit():
                next_entry["target_seed"] = int(slot)
        assigned_entries.append(next_entry)
    return assigned_entries


def _sort_entries_for_knockout(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    explicit = [entry for entry in entries if isinstance(entry.get("target_seed"), int)]
    implicit = [entry for entry in entries if not isinstance(entry.get("target_seed"), int)]
    explicit.sort(key=lambda entry: int(entry.get("target_seed") or 0))
    return explicit + implicit


def _is_power_of_two(value: int) -> bool:
    return value > 0 and (value & (value - 1)) == 0


def _queue_group_phase_advancements(
    phase_order: int,
    group_names: list[str],
    config: dict[str, Any] | None,
    slot_labels_by_group: dict[str, list[str]] | None,
    phases_config: list[dict[str, Any]],
    phase_order_map: dict[str, int],
) -> dict[int, list[dict[str, Any]]]:
    config = config or {}
    queued: dict[int, list[dict[str, Any]]] = defaultdict(list)
    routes = config.get("advancement_routes")

    if isinstance(routes, list) and routes:
        for route in routes:
            if not isinstance(route, dict):
                continue
            target_phase_id = route.get("target_phase_id")
            if not isinstance(target_phase_id, str) or not target_phase_id:
                continue
            target_phase_order = phase_order_map.get(target_phase_id)
            if target_phase_order is None or target_phase_order <= phase_order:
                continue
            target_phase_config = phases_config[target_phase_order - 1] if target_phase_order - 1 < len(phases_config) else {}
            queued[target_phase_order].extend(_apply_target_slot_assignments(
                _entries_for_group_route(route, group_names, slot_labels_by_group),
                route,
                target_phase_config if isinstance(target_phase_config, dict) else {},
            ))
        return queued

    next_phase_order = phase_order + 1
    if next_phase_order > len(phases_config):
        return queued
    next_phase_config = phases_config[next_phase_order - 1] if next_phase_order - 1 < len(phases_config) else {}
    if (
        isinstance(next_phase_config, dict)
        and next_phase_config.get("phase_type") == "KNOCKOUT"
        and next_phase_config.get("bracket_mode") == "group_blocks"
    ):
        legacy_route = {
            "source_mode": "group_rank",
            "rank_from": 1,
            "rank_to": 99,
            "source_groups": [],
        }
        legacy_entries = _entries_for_group_route(legacy_route, group_names, slot_labels_by_group)
    else:
        legacy_entries = _source_entries_from_group_phase(group_names, config)
    if legacy_entries:
        queued[next_phase_order].extend(legacy_entries)
    return queued


def _queue_knockout_phase_advancements(
    phase_order: int,
    phase_config: dict[str, Any],
    phases_config: list[dict[str, Any]],
    phase_order_map: dict[str, int],
    winner_entries: list[dict[str, Any]],
    loser_entries: list[dict[str, Any]],
) -> dict[int, list[dict[str, Any]]]:
    queued: dict[int, list[dict[str, Any]]] = defaultdict(list)
    routes = phase_config.get("advancement_routes")

    if isinstance(routes, list) and routes:
        for route in routes:
            if not isinstance(route, dict):
                continue
            target_phase_id = route.get("target_phase_id")
            if not isinstance(target_phase_id, str) or not target_phase_id:
                continue
            target_phase_order = phase_order_map.get(target_phase_id)
            if target_phase_order is None or target_phase_order <= phase_order:
                continue
            target_phase_config = phases_config[target_phase_order - 1] if target_phase_order - 1 < len(phases_config) else {}
            source_mode = route.get("source_mode")
            if source_mode == "knockout_winner":
                queued[target_phase_order].extend(_apply_target_slot_assignments(
                    winner_entries,
                    route,
                    target_phase_config if isinstance(target_phase_config, dict) else {},
                ))
            elif source_mode == "knockout_loser":
                queued[target_phase_order].extend(_apply_target_slot_assignments(
                    loser_entries,
                    route,
                    target_phase_config if isinstance(target_phase_config, dict) else {},
                ))
        return queued

    next_phase_type = phase_config.get("next_phase_type")
    next_phase_order = phase_order + 1
    if isinstance(next_phase_type, str) and next_phase_type and next_phase_order <= len(phases_config):
        queued[next_phase_order].extend(winner_entries)
    return queued


def _group_block_size(phase_config: dict[str, Any] | None, default: int = 4) -> int:
    raw_size = (phase_config or {}).get("group_block_size")
    if isinstance(raw_size, int) and raw_size >= 2 and (raw_size == 2 or _is_power_of_two(raw_size)):
        return raw_size
    return default


def _placement_bucket_label(start_rank: int, end_rank: int) -> str:
    if start_rank >= end_rank:
        return f"Piazzamento {start_rank}"
    return f"Piazzamento {start_rank}-{end_rank}"


def _build_group_block_buckets(entries: list[dict[str, Any]], block_size: int = 4) -> list[tuple[str, int, int, list[dict[str, Any]]]]:
    group_names = sorted({
        str(entry.get("group_name"))
        for entry in entries
        if entry.get("group_name")
    })
    if len(group_names) != 2:
        return [("Tabellone principale", 1, len(entries), entries)]

    grouped_by_rank: dict[int, dict[str, dict[str, Any]]] = defaultdict(dict)
    for entry in entries:
        rank = int(entry.get("rank") or 0)
        group_name = entry.get("group_name")
        if rank <= 0 or group_name not in group_names:
            continue
        grouped_by_rank[rank][group_name] = entry

    carry_matches: list[tuple[str, int, int, list[dict[str, Any]]]] = []
    ordered_ranks = sorted(grouped_by_rank.keys())
    bucket_start_rank = 1
    ranks_per_bucket = max(block_size // len(group_names), 1)

    while bucket_start_rank <= (ordered_ranks[-1] if ordered_ranks else 0):
        bucket_entries: list[dict[str, Any]] = []
        for rank in range(bucket_start_rank, bucket_start_rank + ranks_per_bucket):
            rank_entries = grouped_by_rank.get(rank, {})
            bucket_entries.extend(
                entry
                for group_name in group_names
                for entry in [rank_entries.get(group_name)]
                if entry
            )
        bucket_entries = [entry for entry in bucket_entries if entry]
        if bucket_entries:
            placement_rank = ((bucket_start_rank - 1) * len(group_names)) + 1
            end_rank = placement_rank + len(bucket_entries) - 1
            carry_matches.append((_placement_bucket_label(placement_rank, end_rank), placement_rank, end_rank, bucket_entries))
        bucket_start_rank += ranks_per_bucket

    return carry_matches or [("Tabellone principale", 1, len(entries), entries)]


def _build_cross_group_direct_pairs(bucket_entries: list[dict[str, Any]]) -> list[tuple[dict[str, Any], dict[str, Any] | None]] | None:
    grouped_entries: dict[str, list[dict[str, Any]]] = defaultdict(list)
    ordered_group_names: list[str] = []

    for entry in bucket_entries:
        group_name = entry.get("group_name")
        if not isinstance(group_name, str) or not group_name:
            return None
        if group_name not in grouped_entries:
            ordered_group_names.append(group_name)
        grouped_entries[group_name].append(entry)

    if len(ordered_group_names) < 2:
        return None

    total_entries = len(bucket_entries)
    if total_entries != 2 and (total_entries < 4 or not _is_power_of_two(total_entries)):
        raise ValueError("L'eliminazione diretta dopo i gironi richiede 4, 8, 16 squadre qualificate (oppure 2 per una finale secca)")
    if len(ordered_group_names) % 2 != 0:
        raise ValueError("L'eliminazione diretta incrociata richiede un numero pari di gironi sorgente")

    for group_name in ordered_group_names:
        grouped_entries[group_name].sort(
            key=lambda item: (
                int(item.get("rank") or 999),
                str(item.get("label") or ""),
            )
        )

    pairs: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
    for group_index in range(0, len(ordered_group_names), 2):
        left_group = grouped_entries[ordered_group_names[group_index]]
        right_group = grouped_entries[ordered_group_names[group_index + 1]]
        if len(left_group) != len(right_group):
            raise ValueError("L'eliminazione diretta incrociata richiede lo stesso numero di qualificate per ogni coppia di gironi")
        if len(left_group) == 1:
            pairs.append((left_group[0], right_group[0]))
            continue
        for offset in range(len(left_group) // 2):
            mirrored = len(left_group) - 1 - offset
            pairs.append((left_group[offset], right_group[mirrored]))
            pairs.append((right_group[offset], left_group[mirrored]))
    return pairs


def _build_knockout_block_rounds(
    bucket_name: str,
    start_rank: int,
    bucket_entries: list[dict[str, Any]],
) -> list[tuple[str, list[tuple[dict[str, Any], dict[str, Any] | None]], list[dict[str, Any]]]]:
    if len(bucket_entries) > 4:
        direct_pairs = _build_cross_group_direct_pairs(bucket_entries) or _pair_seed_entries(bucket_entries)
        round_entries = [{"label": f"Vincente {bucket_name} · {_knockout_round_name(len(bucket_entries))} {index + 1}"} for index, _ in enumerate(direct_pairs)]
        rounds = [
            (f"{bucket_name} · {_knockout_round_name(len(bucket_entries))}", direct_pairs, bucket_entries),
        ]

        current_size = len(round_entries)
        while current_size >= 2:
            if current_size == 1:
                break
            round_name = f"{bucket_name} · {_knockout_round_name(current_size)}"
            pairs = _pair_seed_entries(round_entries)
            rounds.append((round_name, pairs, bucket_entries))
            round_entries = [{"label": f"Vincente {round_name} {index + 1}"} for index, _ in enumerate(pairs)]
            current_size = len(round_entries)
        return rounds

    if len(bucket_entries) == 4:
        semifinal_round_name = f"{bucket_name} · Semifinali"
        semifinals = [
            (bucket_entries[0], bucket_entries[3]),
            (bucket_entries[1], bucket_entries[2]),
        ]
        final_label = f"{_placement_bucket_label(start_rank, start_rank + 1)} · Finale"
        consolation_label = f"{_placement_bucket_label(start_rank + 2, start_rank + 3)} · Finale"
        return [
            (semifinal_round_name, semifinals, [
                {"label": f"Vincente {semifinal_round_name} 1"},
                {"label": f"Vincente {semifinal_round_name} 2"},
                {"label": f"Perdente {semifinal_round_name} 1"},
                {"label": f"Perdente {semifinal_round_name} 2"},
            ]),
            (
                consolation_label,
                [({"label": f"Perdente {semifinal_round_name} 1"}, {"label": f"Perdente {semifinal_round_name} 2"})],
                bucket_entries,
            ),
            (
                final_label,
                [({"label": f"Vincente {semifinal_round_name} 1"}, {"label": f"Vincente {semifinal_round_name} 2"})],
                bucket_entries,
            ),
        ]

    if len(bucket_entries) == 2:
        return [
            (f"{bucket_name} · Finale", [(bucket_entries[0], bucket_entries[1])], bucket_entries),
        ]

    if len(bucket_entries) == 1:
        return []

    bracket_size = _next_power_of_two(len(bucket_entries))
    padded = bucket_entries + [
        {"label": f"Riposo {index + 1}", "rank": 999}
        for index in range(max(bracket_size - len(bucket_entries), 0))
    ]
    return [
        (bucket_name, _pair_seed_entries(padded), bucket_entries),
    ]


def _ordered_group_block_rounds(
    carry_matches: list[tuple[str, int, int, list[dict[str, Any]]]],
) -> list[tuple[int, str, list[tuple[dict[str, Any], dict[str, Any] | None]]]]:
    if not carry_matches:
        return []

    top_bucket_name = carry_matches[0][0]
    top_progression_rounds: list[tuple[int, str, list[tuple[dict[str, Any], dict[str, Any] | None]]]] = []
    lower_progression_rounds: list[tuple[int, str, list[tuple[dict[str, Any], dict[str, Any] | None]]]] = []
    middle_single_finals: list[tuple[int, str, list[tuple[dict[str, Any], dict[str, Any] | None]]]] = []
    standalone_single_finals: list[tuple[int, str, list[tuple[dict[str, Any], dict[str, Any] | None]], bool]] = []
    lower_third_place_rounds: list[tuple[int, str, list[tuple[dict[str, Any], dict[str, Any] | None]]]] = []
    lower_final_rounds: list[tuple[int, str, list[tuple[dict[str, Any], dict[str, Any] | None]]]] = []
    top_third_place_rounds: list[tuple[int, str, list[tuple[dict[str, Any], dict[str, Any] | None]]]] = []
    top_final_rounds: list[tuple[int, str, list[tuple[dict[str, Any], dict[str, Any] | None]]]] = []
    only_single_finals = True

    for bucket_name, start_rank, _, bucket_entries in carry_matches:
        block_rounds = _build_knockout_block_rounds(bucket_name, start_rank, bucket_entries)
        if not block_rounds:
            continue
        if len(block_rounds) == 1:
            standalone_single_finals.append((start_rank, block_rounds[0][0], block_rounds[0][1], bucket_name == top_bucket_name))
            continue
        only_single_finals = False
        if len(block_rounds) >= 3:
            target_third = top_third_place_rounds if bucket_name == top_bucket_name else lower_third_place_rounds
            target_final = top_final_rounds if bucket_name == top_bucket_name else lower_final_rounds
            target_progression = top_progression_rounds if bucket_name == top_bucket_name else lower_progression_rounds
            for order, (round_name, pairs, _) in enumerate(block_rounds[:1], start=1):
                target_progression.append((order, round_name, pairs))
            target_third.append((2 if bucket_name != top_bucket_name else 4, block_rounds[1][0], block_rounds[1][1]))
            target_final.append((3 if bucket_name != top_bucket_name else 5, block_rounds[2][0], block_rounds[2][1]))
            continue
        target_progression = top_progression_rounds if bucket_name == top_bucket_name else lower_progression_rounds
        for order, (round_name, pairs, _) in enumerate(block_rounds[:-1], start=1):
            target_progression.append((order, round_name, pairs))
        final_target = top_final_rounds if bucket_name == top_bucket_name else lower_final_rounds
        final_target.append((len(block_rounds), block_rounds[-1][0], block_rounds[-1][1]))

    ordered_rounds: list[tuple[int, str, list[tuple[dict[str, Any], dict[str, Any] | None]]]] = []
    max_progression_order = max(
        [order for order, _, _ in top_progression_rounds + lower_progression_rounds],
        default=0,
    )
    for progression_order in range(1, max_progression_order + 1):
        ordered_rounds.extend([item for item in top_progression_rounds if item[0] == progression_order])
        ordered_rounds.extend([item for item in lower_progression_rounds if item[0] == progression_order])

    if only_single_finals:
        lower_only_finals = sorted(
            [item for item in standalone_single_finals if not item[3]],
            key=lambda item: item[0],
            reverse=True,
        )
        ordered_rounds.extend((2, round_name, pairs) for _, round_name, pairs, _ in lower_only_finals)
        ordered_rounds.extend((3, round_name, pairs) for _, round_name, pairs, is_top in standalone_single_finals if is_top)
    else:
        middle_single_finals.extend((2, round_name, pairs) for _, round_name, pairs, _ in standalone_single_finals)
        ordered_rounds.extend(middle_single_finals)

    ordered_rounds.extend(lower_third_place_rounds)
    ordered_rounds.extend(lower_final_rounds)
    ordered_rounds.extend(top_third_place_rounds)
    ordered_rounds.extend(top_final_rounds)
    return ordered_rounds




async def _sync_future_age_group_matches(age_group: TournamentAgeGroup, phases_config: list[dict[str, Any]], db: AsyncSession) -> TournamentAgeGroup:
    previous_phase_end: datetime | None = None

    for phase_index, phase in enumerate(sorted(age_group.phases, key=lambda item: item.phase_order)):
        phase_config = phases_config[phase_index] if phase_index < len(phases_config) and isinstance(phases_config[phase_index], dict) else {}
        match_slot_length = _slot_delta(age_group, phase_config)
        phase_start = _resolve_phase_start(age_group, phase_index, phase_config, previous_phase_end)
        phase_end = phase_start

        if phase.phase_type == PhaseType.GROUP_STAGE:
            groups = sorted(phase.groups, key=lambda item: item.group_order)
            phase_lane_slot_counters: dict[tuple[str | None, int | None], int] = defaultdict(int)
            stagger_groups = bool(phase_config.get("stagger_groups", False))
            global_slot_offset = 0
            group_plans: list[dict[str, Any]] = []
            max_chunks = 0
            for group_index, group in enumerate(groups):
                group_name = group.name
                lanes = _group_lanes(age_group, phase_config, group_name, group_index, len(groups)) or [{"field_name": None, "field_number": None}]
                matches = sorted(
                    [item for item in phase.matches if item.group_id == group.id],
                    key=lambda item: (item.bracket_position or 0, item.scheduled_at or datetime.max),
                )
                chunks = [matches[index:index + len(lanes)] for index in range(0, len(matches), len(lanes))]
                max_chunks = max(max_chunks, len(chunks))
                group_plans.append({"lanes": lanes, "chunks": chunks})

            for chunk_index in range(max_chunks):
                chunk_level_plans: list[dict[str, Any]] = []
                max_chunk_depth = 0
                for plan in group_plans:
                    if chunk_index >= len(plan["chunks"]):
                        continue
                    chunk_matches = plan["chunks"][chunk_index]
                    lanes = plan["lanes"]
                    subchunks = [chunk_matches[index:index + len(lanes)] for index in range(0, len(chunk_matches), len(lanes))]
                    max_chunk_depth = max(max_chunk_depth, len(subchunks))
                    chunk_level_plans.append({"lanes": lanes, "subchunks": subchunks})
                for subchunk_index in range(max_chunk_depth):
                    for plan in chunk_level_plans:
                        if subchunk_index >= len(plan["subchunks"]):
                            continue
                        chunk_matches = plan["subchunks"][subchunk_index]
                        lanes = plan["lanes"]
                        chunk_lanes = [lanes[lane_index % len(lanes)] for lane_index in range(len(chunk_matches))]
                        if stagger_groups:
                            slot_index = global_slot_offset
                        else:
                            slot_index = max(phase_lane_slot_counters[_lane_key(lane)] for lane in chunk_lanes) if chunk_lanes else 0
                        slot_time = phase_start + (match_slot_length * slot_index) if phase_start else None
                        for lane_index, match in enumerate(chunk_matches):
                            lane = lanes[lane_index % len(lanes)]
                            lane_counter_key = _lane_key(lane)
                            if _match_has_recorded_result(match):
                                if not stagger_groups:
                                    phase_lane_slot_counters[lane_counter_key] = slot_index + 1
                                if match.scheduled_at:
                                    phase_end = max(phase_end or match.scheduled_at, match.scheduled_at + match_slot_length)
                                continue
                            match.scheduled_at = slot_time
                            match.field_name = lane.get("field_name")
                            match.field_number = lane.get("field_number")
                            if slot_time:
                                phase_end = max(phase_end or slot_time, slot_time + match_slot_length)
                            if not stagger_groups:
                                phase_lane_slot_counters[lane_counter_key] = slot_index + 1
                        if stagger_groups:
                            global_slot_offset += 1
        else:
            lanes = _knockout_lanes(age_group, phase_config) or [{"field_name": None, "field_number": None}]
            matches = sorted(
                [item for item in phase.matches if item.group_id is None],
                key=lambda item: (item.bracket_round_order or 0, item.bracket_position or 0),
            )
            for match_index, match in enumerate(matches):
                if _match_has_recorded_result(match):
                    if match.scheduled_at:
                        phase_end = max(phase_end or match.scheduled_at, match.scheduled_at + match_slot_length)
                    continue
                lane = lanes[match_index % len(lanes)]
                slot_time = phase_start + (match_slot_length * (match_index // len(lanes))) if phase_start else None
                match.scheduled_at = slot_time
                match.field_name = lane.get("field_name")
                match.field_number = lane.get("field_number")
                if slot_time:
                    phase_end = max(phase_end or slot_time, slot_time + match_slot_length)
        previous_phase_end = phase_end

    await _resolve_age_group_field_conflicts(age_group, db)
    await _sync_tournament_dates_from_generated_program(age_group)
    await db.commit()
    await db.refresh(age_group)
    return age_group


def _pair_seed_entries(entries: list[dict[str, Any]]) -> list[tuple[dict[str, Any], dict[str, Any] | None]]:
    ordered = entries[:]
    pairs: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
    while ordered:
        first = ordered.pop(0)
        last = ordered.pop(-1) if ordered else None
        pairs.append((first, last))
    return pairs


def _knockout_round_name(size: int) -> str:
    names = {2: "Finale", 4: "Semifinali", 8: "Quarti", 16: "Ottavi"}
    return names.get(size, f"Round of {size}")


def _phase_bucket_name(phase_config: dict[str, Any], default_name: str = "Tabellone principale") -> str:
    placement_start_rank = phase_config.get("placement_start_rank")
    if isinstance(placement_start_rank, int) and placement_start_rank > 0:
        return f"Piazzamento {_ordinal_it(placement_start_rank)}"
    return default_name


def _is_final_phase_config(phases_config: list[dict[str, Any]], phase_order: int) -> bool:
    if phase_order <= 0 or phase_order > len(phases_config):
        return True

    phase_config = phases_config[phase_order - 1]
    if not isinstance(phase_config, dict):
        return True

    routes = phase_config.get("advancement_routes")
    if isinstance(routes, list) and any(isinstance(route, dict) for route in routes):
        return False

    next_phase_type = phase_config.get("next_phase_type")
    if isinstance(next_phase_type, str) and next_phase_type:
        return False

    return True


async def generate_age_group_program(age_group_id: str, db: AsyncSession) -> TournamentAgeGroup:
    result = await db.execute(
        select(TournamentAgeGroup)
        .options(
            selectinload(TournamentAgeGroup.tournament),
            selectinload(TournamentAgeGroup.tournament_teams).selectinload(TournamentTeam.team).selectinload(Team.organization),
            selectinload(TournamentAgeGroup.phases).selectinload(Phase.groups).selectinload(Group.group_teams),
            selectinload(TournamentAgeGroup.phases).selectinload(Phase.matches),
        )
        .where(TournamentAgeGroup.id == age_group_id)
    )
    age_group = result.scalar_one_or_none()
    if not age_group:
        raise ValueError("Age group not found")

    if age_group.phases and _age_group_has_recorded_results(age_group):
        structure = age_group.structure_config or {}
        phases_config = structure.get("phases", [])
        if not phases_config:
            await db.commit()
            await db.refresh(age_group)
            return age_group
        return await _sync_future_age_group_matches(age_group, phases_config, db)

    for phase in list(age_group.phases):
        await db.delete(phase)
    await db.flush()

    structure = age_group.structure_config or {}
    phases_config = structure.get("phases", [])
    if not phases_config:
        await db.commit()
        await db.refresh(age_group)
        return age_group

    participants = sorted(age_group.tournament_teams, key=lambda item: item.team.name.lower())
    if len(participants) < 2:
        raise ValueError("Servono almeno 2 squadre nella categoria per generare le partite")
    initial_entries: list[dict[str, Any]] = [
        {
            "label": _team_label(team),
            "tournament_team_id": team.id,
            "team_id": team.team_id,
            "organization_id": team.team.organization_id,
        }
        for team in participants
    ]
    queued_entries_by_phase: dict[int, list[dict[str, Any]]] = defaultdict(list)
    queued_entries_by_phase[1] = initial_entries
    phase_order_map = _resolve_phase_order_map(phases_config)

    total_created_matches = 0
    previous_phase_end: datetime | None = None

    for phase_index, phase_config in enumerate(phases_config):
        match_slot_length = _slot_delta(age_group, phase_config)
        phase_order = phase_index + 1
        current_entries = queued_entries_by_phase.pop(phase_order, [])
        if not current_entries:
            continue
        phase_type = PhaseType[phase_config.get("phase_type", "GROUP_STAGE")]
        phase = Phase(
            tournament_age_group_id=age_group.id,
            phase_order=phase_order,
            name=phase_config.get("name") or f"Fase {phase_order}",
            phase_type=phase_type,
            num_groups=phase_config.get("num_groups"),
            teams_per_group=None,
            num_teams=len(current_entries) if current_entries else None,
            advancement_config={
                "top_n_per_group": phase_config.get("qualifiers_per_group") or 0,
                "best_third_count": phase_config.get("best_extra_teams") or 0,
                "advancement_routes": phase_config.get("advancement_routes") or [],
                "notes": phase_config.get("notes") or "",
            },
            seeding_source={
                "bracket_mode": phase_config.get("bracket_mode", "standard"),
                "knockout_progression": phase_config.get("knockout_progression", "full_bracket"),
                "placement_start_rank": phase_config.get("placement_start_rank"),
                "group_block_size": _group_block_size(phase_config),
                "next_phase_type": phase_config.get("next_phase_type") or "",
            },
        )
        db.add(phase)
        await db.flush()

        phase_start = _resolve_phase_start(age_group, phase_index, phase_config, previous_phase_end)
        phase_end = phase_start

        if phase_type == PhaseType.GROUP_STAGE:
            group_sizes = parse_group_sizes(
                phase_config.get("group_sizes"),
                int(phase_config.get("num_groups") or 1),
                len(current_entries),
            )
            groups: list[Group] = []
            slot_labels_by_group: dict[str, list[str]] = {}
            phase_group_team_ids: dict[str, list[str]] = {}
            phase_group_name_to_id: dict[str, str] = {}
            created_group_matches: list[Match] = []
            grouped_entries = _distribute_entries_across_groups(current_entries, group_sizes)
            group_plans: list[dict[str, Any]] = []

            for group_index, group_size in enumerate(group_sizes):
                group_name = _group_name_from_config(group_index, phase_config)
                group = Group(
                    phase_id=phase.id,
                    name=group_name,
                    group_order=group_index,
                )
                db.add(group)
                await db.flush()
                groups.append(group)
                phase_group_name_to_id[group_name] = group.id

                group_entries = grouped_entries[group_index] if group_index < len(grouped_entries) else []
                slot_labels_by_group[group.id] = [entry["label"] for entry in group_entries]
                phase_group_team_ids[group.id] = [
                    entry["tournament_team_id"]
                    for entry in group_entries
                    if entry.get("tournament_team_id")
                ]

                for entry in group_entries:
                    if entry.get("tournament_team_id"):
                        db.add(GroupTeam(group_id=group.id, tournament_team_id=entry["tournament_team_id"]))
                await db.flush()

                group_plans.append({
                    "group": group,
                    "lanes": _group_lanes(age_group, phase_config, group_name, group_index, len(group_sizes)) or [{"field_name": None, "field_number": None}],
                    "rounds": _group_stage_rounds(group_entries, phase_config),
                })

            phase_lane_slot_counters: dict[tuple[str | None, int | None], int] = defaultdict(int)
            stagger_groups = bool(phase_config.get("stagger_groups", False))
            _raw_max = phase_config.get("max_concurrent_matches")
            max_concurrent: int | None = int(_raw_max) if isinstance(_raw_max, (int, float)) and int(_raw_max) > 0 else None
            _raw_consec = phase_config.get("max_consecutive_group_matches")
            # Default to True: prevent back-to-back matches unless explicitly disabled (set to 0)
            max_consecutive: bool = not (isinstance(_raw_consec, (int, float)) and int(_raw_consec) == 0)
            slot_matches_count: dict[int, int] = defaultdict(int)
            team_last_slot: dict[str, int] = {}
            global_slot_offset = 0
            phase_group_match_indexes: dict[str, int] = defaultdict(int)
            max_rounds = max((len(plan["rounds"]) for plan in group_plans), default=0)
            for round_index in range(max_rounds):
                round_chunk_plans: list[dict[str, Any]] = []
                max_chunks = 0
                for plan in group_plans:
                    rounds = plan["rounds"]
                    if round_index >= len(rounds):
                        continue
                    lanes = plan["lanes"]
                    round_pairs = rounds[round_index]
                    chunks = [round_pairs[index:index + len(lanes)] for index in range(0, len(round_pairs), len(lanes))]
                    max_chunks = max(max_chunks, len(chunks))
                    round_chunk_plans.append({
                        "group": plan["group"],
                        "lanes": lanes,
                        "chunks": chunks,
                    })
                for chunk_index in range(max_chunks):
                    for plan in round_chunk_plans:
                        if chunk_index >= len(plan["chunks"]):
                            continue
                        group = plan["group"]
                        lanes = plan["lanes"]
                        round_chunk = plan["chunks"][chunk_index]
                        chunk_lanes = [lanes[lane_index % len(lanes)] for lane_index in range(len(round_chunk))]
                        if stagger_groups:
                            slot_index = global_slot_offset
                        else:
                            slot_index = max(phase_lane_slot_counters[_lane_key(lane)] for lane in chunk_lanes) if chunk_lanes else 0
                        # Enforce max_concurrent_matches and max_consecutive_group_matches
                        n = len(round_chunk)
                        chunk_team_ids = [
                            tid
                            for pair in round_chunk
                            for tid in (pair[0].get("tournament_team_id"), pair[1].get("tournament_team_id"))
                            if tid
                        ]
                        for _guard in range(1000):  # safety cap to prevent infinite loop
                            bumped = False
                            if max_concurrent and slot_matches_count[slot_index] + n > max_concurrent:
                                slot_index += 1
                                bumped = True
                            if max_consecutive and not bumped:
                                if any(team_last_slot.get(tid) == slot_index - 1 for tid in chunk_team_ids):
                                    slot_index += 1
                                    bumped = True
                            if not bumped:
                                break
                        slot_time = phase_start + (match_slot_length * slot_index) if phase_start else None
                        for lane_index, (home_entry, away_entry) in enumerate(round_chunk):
                            lane = lanes[lane_index % len(lanes)]
                            lane_counter_key = _lane_key(lane)
                            match = Match(
                                phase_id=phase.id,
                                group_id=group.id,
                                home_team_id=home_entry.get("tournament_team_id"),
                                away_team_id=away_entry.get("tournament_team_id"),
                                scheduled_at=slot_time,
                                original_scheduled_at=slot_time,
                                field_name=lane.get("field_name"),
                                field_number=lane.get("field_number"),
                                status=MatchStatus.SCHEDULED,
                                notes=None if home_entry.get("tournament_team_id") and away_entry.get("tournament_team_id") else encode_seed_note(
                                    home_entry["label"],
                                    away_entry["label"],
                                ),
                                bracket_position=phase_group_match_indexes[group.id] + 1,
                            )
                            db.add(match)
                            created_group_matches.append(match)
                            total_created_matches += 1
                            phase_group_match_indexes[group.id] += 1
                            if slot_time:
                                phase_end = max(phase_end or slot_time, slot_time + match_slot_length)
                            if not stagger_groups:
                                phase_lane_slot_counters[lane_counter_key] = max(
                                    phase_lane_slot_counters[lane_counter_key], slot_index + 1
                                )
                        if max_concurrent:
                            slot_matches_count[slot_index] += n
                        if max_consecutive:
                            for tid in chunk_team_ids:
                                team_last_slot[tid] = slot_index
                        if stagger_groups:
                            global_slot_offset += 1

            await db.flush()
            raw_referee_assignments = phase_config.get("referee_group_assignments", {})
            referee_source_group_ids = {}
            allow_same_group_primary_ids: set[str] = set()
            if isinstance(raw_referee_assignments, dict):
                for group_name, raw_source_group_names in raw_referee_assignments.items():
                    group_id = phase_group_name_to_id.get(group_name)
                    if not group_id or not isinstance(raw_source_group_names, list):
                        continue
                    if group_name in raw_source_group_names:
                        allow_same_group_primary_ids.add(group_id)
                    source_group_ids = [
                        phase_group_name_to_id[source_group_name]
                        for source_group_name in raw_source_group_names
                        if isinstance(source_group_name, str) and source_group_name in phase_group_name_to_id and source_group_name != group_name
                    ]
                    referee_source_group_ids[group_id] = source_group_ids

            _assign_cross_group_referees(
                created_group_matches,
                phase_group_team_ids,
                participants,
                referee_source_group_ids,
                allow_same_group_primary_ids,
            )

            phase.advancement_config = {
                **(phase.advancement_config or {}),
                "group_slot_labels": slot_labels_by_group,
            }
            queued_advancements = _queue_group_phase_advancements(
                phase_order,
                [group.name for group in groups],
                phase.advancement_config,
                {group.name: slot_labels_by_group.get(group.id, []) for group in groups},
                phases_config,
                phase_order_map,
            )
            for target_phase_order, target_entries in queued_advancements.items():
                queued_entries_by_phase[target_phase_order].extend(target_entries)
            previous_phase_end = phase_end
            continue

        current_entries = _sort_entries_for_knockout(current_entries)
        bracket_mode = (phase.seeding_source or {}).get("bracket_mode", "standard")
        if bracket_mode == "placement":
            buckets: dict[int, list[dict[str, Any]]] = defaultdict(list)
            for entry in current_entries:
                buckets[int(entry.get("rank") or 1)].append(entry)
            # Worst placements (highest rank numbers) first so that, e.g., the
            # 9th-10th place final is scheduled before the 7th-8th place final.
            ordered_ranks = sorted(buckets.keys(), reverse=True)
            carry_matches: list[tuple[str, int, int, list[dict[str, Any]]]] = []
            for rank in ordered_ranks:
                bucket_entries = buckets[rank]
                end_rank = rank + len(bucket_entries) - 1
                carry_matches.append((_placement_bucket_label(rank, end_rank), rank, end_rank, bucket_entries))
        elif bracket_mode == "group_blocks":
            carry_matches = _build_group_block_buckets(current_entries, _group_block_size(phase_config))
        else:
            carry_matches = [(_phase_bucket_name(phase_config), 1, len(current_entries), current_entries)]

        next_entries: list[dict[str, Any]] = []
        knockout_winner_entries: list[dict[str, Any]] = []
        knockout_loser_entries: list[dict[str, Any]] = []
        match_position = 1
        knockout_lanes = _knockout_lanes(age_group, phase_config) or [{"field_name": None, "field_number": None}]
        round_match_counts: dict[int, int] = defaultdict(int)
        created_knockout_matches: list[Match] = []
        knockout_progression = (phase.seeding_source or {}).get("knockout_progression", "full_bracket")

        if bracket_mode == "group_blocks":
            round_slot_row = 0
            for round_order, round_name, pairs in _ordered_group_block_rounds(carry_matches):
                for pair_index, (home_entry, away_entry) in enumerate(pairs):
                    home_label = home_entry["label"]
                    away_label = away_entry["label"] if away_entry else "Bye"
                    home_team_id = home_entry.get("tournament_team_id")
                    away_team_id = away_entry.get("tournament_team_id") if away_entry else None
                    lane = knockout_lanes[pair_index % len(knockout_lanes)]
                    scheduled_at = phase_start + (match_slot_length * round_slot_row) if phase_start else None

                    match = Match(
                        phase_id=phase.id,
                        group_id=None,
                        bracket_round=round_name,
                        bracket_position=match_position,
                        bracket_round_order=round_order,
                        home_team_id=home_team_id if away_label != "Bye" else home_team_id,
                        away_team_id=away_team_id if away_label != "Bye" else None,
                        scheduled_at=scheduled_at,
                        original_scheduled_at=scheduled_at,
                        field_name=lane.get("field_name"),
                        field_number=lane.get("field_number"),
                        status=MatchStatus.SCHEDULED,
                        match_duration_minutes=_resolve_generated_match_duration_minutes(age_group, phase_config, round_name),
                        notes=None if home_team_id and away_team_id else encode_seed_note(home_label, away_label),
                    )
                    db.add(match)
                    created_knockout_matches.append(match)
                    total_created_matches += 1
                    match_position += 1
                    if scheduled_at:
                        phase_end = max(phase_end or scheduled_at, scheduled_at + match_slot_length)
                round_slot_row += max((len(pairs) + len(knockout_lanes) - 1) // len(knockout_lanes), 1)

        # For placement brackets each bucket is a separate placement final.
        # Accumulating a round offset ensures each bucket gets a unique
        # bracket_round_order range, so conflict-resolution treats them as
        # independent sequential rounds rather than collapsing them into one.
        placement_round_offset = 0
        for bucket_name, _, _, bucket_entries in carry_matches:
            if not bucket_entries:
                continue
            if bracket_mode != "group_blocks":
                bracket_size = _next_power_of_two(len(bucket_entries))
                padded = bucket_entries + [
                    {"label": f"Riposo {index + 1}", "rank": 999}
                    for index in range(max(bracket_size - len(bucket_entries), 0))
                ]
                direct_pairs = _build_cross_group_direct_pairs(bucket_entries) if bracket_mode == "standard" else None
                round_entries = padded
                round_size = bracket_size
                round_order = 1
                stop_after_first_round = knockout_progression == "single_round"

                while round_size >= 2:
                    pairs = direct_pairs if round_order == 1 else None
                    pairs = pairs or _pair_seed_entries(round_entries)
                    round_name = f"{bucket_name} · {_knockout_round_name(round_size)}" if bucket_name != "Tabellone principale" else _knockout_round_name(round_size)
                    winners: list[dict[str, Any]] = []
                    effective_round_order = placement_round_offset + round_order if bracket_mode == "placement" else round_order
                    for pair_index, (home_entry, away_entry) in enumerate(pairs):
                        home_label = home_entry["label"]
                        away_label = away_entry["label"] if away_entry else "Bye"
                        home_team_id = home_entry.get("tournament_team_id")
                        away_team_id = away_entry.get("tournament_team_id") if away_entry else None
                        round_match_index = round_match_counts[round_order]
                        lane = knockout_lanes[round_match_index % len(knockout_lanes)]
                        round_row = (round_order - 1) + (round_match_index // len(knockout_lanes))
                        scheduled_at = phase_start + (match_slot_length * round_row) if phase_start else None

                        match = Match(
                            phase_id=phase.id,
                            group_id=None,
                            bracket_round=round_name,
                            bracket_position=match_position,
                            bracket_round_order=effective_round_order,
                            home_team_id=home_team_id if away_label != "Bye" else home_team_id,
                            away_team_id=away_team_id if away_label != "Bye" else None,
                            scheduled_at=scheduled_at,
                            original_scheduled_at=scheduled_at,
                            field_name=lane.get("field_name"),
                            field_number=lane.get("field_number"),
                            status=MatchStatus.SCHEDULED,
                            match_duration_minutes=_resolve_generated_match_duration_minutes(age_group, phase_config, round_name),
                            notes=None if home_team_id and away_team_id else encode_seed_note(home_label, away_label),
                        )
                        db.add(match)
                        created_knockout_matches.append(match)
                        total_created_matches += 1
                        match_position += 1
                        if scheduled_at:
                            phase_end = max(phase_end or scheduled_at, scheduled_at + match_slot_length)
                        round_match_counts[round_order] += 1
                        winner_entry = {"label": f"Vincente {round_name} {pair_index + 1}"}
                        winners.append(winner_entry)
                        if stop_after_first_round:
                            knockout_winner_entries.append(winner_entry)
                            if away_entry and away_label != "Bye":
                                knockout_loser_entries.append({"label": f"Perdente {round_name} {pair_index + 1}"})

                    round_entries = winners
                    round_size = len(round_entries)
                    round_order += 1

                    if stop_after_first_round:
                        break
                    if round_size <= 1:
                        break

                if bracket_mode == "placement":
                    placement_round_offset += round_order - 1

            next_entries.extend(bucket_entries)

        await db.flush()

        current_entries = next_entries
        queued_knockout_advancements = _queue_knockout_phase_advancements(
            phase_order,
            phase_config,
            phases_config,
            phase_order_map,
            knockout_winner_entries or current_entries,
            knockout_loser_entries,
        )
        for target_phase_order, target_entries in queued_knockout_advancements.items():
            queued_entries_by_phase[target_phase_order].extend(target_entries)
        previous_phase_end = phase_end

    if total_created_matches == 0:
        raise ValueError("La formula non produce nessuna partita con le squadre attualmente inserite")

    await _resolve_age_group_field_conflicts(age_group, db)
    await _sync_tournament_dates_from_generated_program(age_group)
    await db.commit()
    await db.refresh(age_group)
    return age_group


async def reset_age_group_program(age_group_id: str, db: AsyncSession) -> TournamentAgeGroup:
    result = await db.execute(
        select(TournamentAgeGroup)
        .options(
            selectinload(TournamentAgeGroup.tournament),
            selectinload(TournamentAgeGroup.phases).selectinload(Phase.groups).selectinload(Group.group_teams),
            selectinload(TournamentAgeGroup.phases).selectinload(Phase.matches),
        )
        .where(TournamentAgeGroup.id == age_group_id)
    )
    age_group = result.scalar_one_or_none()
    if not age_group:
        raise ValueError("Age group not found")

    for phase in list(age_group.phases):
        await db.delete(phase)
    await db.flush()
    await db.commit()
    await db.refresh(age_group)
    return age_group


async def reset_and_generate_age_group_program(age_group_id: str, db: AsyncSession) -> TournamentAgeGroup:
    await reset_age_group_program(age_group_id, db)
    return await generate_age_group_program(age_group_id, db)


async def regenerate_age_group_from_phase(age_group_id: str, phase_order: int, db: AsyncSession) -> TournamentAgeGroup:
    result = await db.execute(
        select(TournamentAgeGroup)
        .options(
            selectinload(TournamentAgeGroup.tournament),
            selectinload(TournamentAgeGroup.tournament_teams).selectinload(TournamentTeam.team).selectinload(Team.organization),
            selectinload(TournamentAgeGroup.phases).selectinload(Phase.groups).selectinload(Group.group_teams),
            selectinload(TournamentAgeGroup.phases).selectinload(Phase.matches),
        )
        .where(TournamentAgeGroup.id == age_group_id)
    )
    age_group = result.scalar_one_or_none()
    if not age_group:
        raise ValueError("Age group not found")

    if _age_group_has_recorded_results(age_group):
        raise ValueError("Non puoi rigenerare una singola fase dopo aver inserito risultati nella categoria. Usa l'aggiornamento massivo delle partite future.")

    structure = age_group.structure_config or {}
    phases_config = structure.get("phases", [])
    if not phases_config:
        await db.commit()
        await db.refresh(age_group)
        return age_group

    start_index = max(phase_order - 1, 0)
    if start_index >= len(phases_config):
        raise ValueError("Phase not found")

    existing_phases = sorted(age_group.phases, key=lambda item: item.phase_order)
    for phase in existing_phases:
        if phase.phase_order >= phase_order:
            await db.delete(phase)
    await db.flush()

    participants = sorted(age_group.tournament_teams, key=lambda item: item.team.name.lower())
    if len(participants) < 2:
        raise ValueError("Servono almeno 2 squadre nella categoria per generare le partite")
    initial_entries: list[dict[str, Any]] = [
        {
            "label": _team_label(team),
            "tournament_team_id": team.id,
            "team_id": team.team_id,
            "organization_id": team.team.organization_id,
        }
        for team in participants
    ]
    queued_entries_by_phase: dict[int, list[dict[str, Any]]] = defaultdict(list)
    queued_entries_by_phase[1] = initial_entries
    phase_order_map = _resolve_phase_order_map(phases_config)
    previous_phase_end: datetime | None = None
    # match_slot_length is computed per-phase below (may differ for knockout vs group)
    match_slot_length = _slot_delta(age_group)  # default; overridden per phase in the loops

    for phase in existing_phases:
        if phase.phase_order >= phase_order:
            break
        current_entries = queued_entries_by_phase.pop(phase.phase_order, [])
        if not current_entries:
            continue
        if phase.phase_type == PhaseType.GROUP_STAGE:
            sorted_groups = sorted(phase.groups, key=lambda item: item.group_order)
            slot_labels = (phase.advancement_config or {}).get("group_slot_labels", {})
            queued_advancements = _queue_group_phase_advancements(
                phase.phase_order,
                [group.name for group in sorted_groups],
                phase.advancement_config,
                {
                    group.name: slot_labels.get(group.id, [])
                    for group in sorted_groups
                },
                phases_config,
                phase_order_map,
            )
            for target_phase_order, target_entries in queued_advancements.items():
                queued_entries_by_phase[target_phase_order].extend(target_entries)
        else:
            queued_knockout_advancements = _queue_knockout_phase_advancements(
                phase.phase_order,
                {
                    "advancement_routes": (phase.advancement_config or {}).get("advancement_routes", []),
                    "next_phase_type": (phase.seeding_source or {}).get("next_phase_type"),
                },
                phases_config,
                phase_order_map,
                current_entries,
                [],
            )
            for target_phase_order, target_entries in queued_knockout_advancements.items():
                queued_entries_by_phase[target_phase_order].extend(target_entries)
        phase_match_times = [match.scheduled_at for match in phase.matches if match.scheduled_at]
        if phase_match_times:
            previous_phase_end = max(phase_match_times) + match_slot_length

    total_created_matches = 0

    for relative_index, phase_config in enumerate(phases_config[start_index:], start=start_index):
        match_slot_length = _slot_delta(age_group, phase_config)
        phase_order_number = relative_index + 1
        current_entries = queued_entries_by_phase.pop(phase_order_number, [])
        if not current_entries:
            continue
        phase_type = PhaseType[phase_config.get("phase_type", "GROUP_STAGE")]
        phase = Phase(
            tournament_age_group_id=age_group.id,
            phase_order=phase_order_number,
            name=phase_config.get("name") or f"Fase {phase_order_number}",
            phase_type=phase_type,
            num_groups=phase_config.get("num_groups"),
            teams_per_group=None,
            num_teams=len(current_entries) if current_entries else None,
            advancement_config={
                "top_n_per_group": phase_config.get("qualifiers_per_group") or 0,
                "best_third_count": phase_config.get("best_extra_teams") or 0,
                "advancement_routes": phase_config.get("advancement_routes") or [],
                "notes": phase_config.get("notes") or "",
            },
            seeding_source={
                "bracket_mode": phase_config.get("bracket_mode", "standard"),
                "knockout_progression": phase_config.get("knockout_progression", "full_bracket"),
                "placement_start_rank": phase_config.get("placement_start_rank"),
                "group_block_size": _group_block_size(phase_config),
                "next_phase_type": phase_config.get("next_phase_type") or "",
            },
        )
        db.add(phase)
        await db.flush()

        phase_start = _resolve_phase_start(age_group, relative_index, phase_config, previous_phase_end)
        phase_end = phase_start

        if phase_type == PhaseType.GROUP_STAGE:
            group_sizes = parse_group_sizes(
                phase_config.get("group_sizes"),
                int(phase_config.get("num_groups") or 1),
                len(current_entries),
            )
            groups: list[Group] = []
            slot_labels_by_group: dict[str, list[str]] = {}
            phase_group_team_ids: dict[str, list[str]] = {}
            phase_group_name_to_id: dict[str, str] = {}
            created_group_matches: list[Match] = []
            grouped_entries = _distribute_entries_across_groups(current_entries, group_sizes)
            group_plans: list[dict[str, Any]] = []

            for group_index, group_size in enumerate(group_sizes):
                group_name = _group_name_from_config(group_index, phase_config)
                group = Group(phase_id=phase.id, name=group_name, group_order=group_index)
                db.add(group)
                await db.flush()
                groups.append(group)
                phase_group_name_to_id[group_name] = group.id

                group_entries = grouped_entries[group_index] if group_index < len(grouped_entries) else []
                slot_labels_by_group[group.id] = [entry["label"] for entry in group_entries]
                phase_group_team_ids[group.id] = [
                    entry["tournament_team_id"]
                    for entry in group_entries
                    if entry.get("tournament_team_id")
                ]

                for entry in group_entries:
                    if entry.get("tournament_team_id"):
                        db.add(GroupTeam(group_id=group.id, tournament_team_id=entry["tournament_team_id"]))
                await db.flush()

                group_plans.append({
                    "group": group,
                    "lanes": _group_lanes(age_group, phase_config, group_name, group_index, len(group_sizes)) or [{"field_name": None, "field_number": None}],
                    "rounds": _group_stage_rounds(group_entries, phase_config),
                })

            phase_lane_slot_counters: dict[tuple[str | None, int | None], int] = defaultdict(int)
            stagger_groups = bool(phase_config.get("stagger_groups", False))
            _raw_max = phase_config.get("max_concurrent_matches")
            max_concurrent: int | None = int(_raw_max) if isinstance(_raw_max, (int, float)) and int(_raw_max) > 0 else None
            _raw_consec = phase_config.get("max_consecutive_group_matches")
            # Default to True: prevent back-to-back matches unless explicitly disabled (set to 0)
            max_consecutive: bool = not (isinstance(_raw_consec, (int, float)) and int(_raw_consec) == 0)
            slot_matches_count: dict[int, int] = defaultdict(int)
            team_last_slot: dict[str, int] = {}
            global_slot_offset = 0
            phase_group_match_indexes: dict[str, int] = defaultdict(int)
            max_rounds = max((len(plan["rounds"]) for plan in group_plans), default=0)
            for round_index in range(max_rounds):
                round_chunk_plans: list[dict[str, Any]] = []
                max_chunks = 0
                for plan in group_plans:
                    rounds = plan["rounds"]
                    if round_index >= len(rounds):
                        continue
                    lanes = plan["lanes"]
                    round_pairs = rounds[round_index]
                    chunks = [round_pairs[index:index + len(lanes)] for index in range(0, len(round_pairs), len(lanes))]
                    max_chunks = max(max_chunks, len(chunks))
                    round_chunk_plans.append({
                        "group": plan["group"],
                        "lanes": lanes,
                        "chunks": chunks,
                    })
                for chunk_index in range(max_chunks):
                    for plan in round_chunk_plans:
                        if chunk_index >= len(plan["chunks"]):
                            continue
                        group = plan["group"]
                        lanes = plan["lanes"]
                        round_chunk = plan["chunks"][chunk_index]
                        chunk_lanes = [lanes[lane_index % len(lanes)] for lane_index in range(len(round_chunk))]
                        if stagger_groups:
                            slot_index = global_slot_offset
                        else:
                            slot_index = max(phase_lane_slot_counters[_lane_key(lane)] for lane in chunk_lanes) if chunk_lanes else 0
                        # Enforce max_concurrent_matches and max_consecutive_group_matches
                        n = len(round_chunk)
                        chunk_team_ids = [
                            tid
                            for pair in round_chunk
                            for tid in (pair[0].get("tournament_team_id"), pair[1].get("tournament_team_id"))
                            if tid
                        ]
                        for _guard in range(1000):  # safety cap to prevent infinite loop
                            bumped = False
                            if max_concurrent and slot_matches_count[slot_index] + n > max_concurrent:
                                slot_index += 1
                                bumped = True
                            if max_consecutive and not bumped:
                                if any(team_last_slot.get(tid) == slot_index - 1 for tid in chunk_team_ids):
                                    slot_index += 1
                                    bumped = True
                            if not bumped:
                                break
                        slot_time = phase_start + (match_slot_length * slot_index) if phase_start else None
                        for lane_index, (home_entry, away_entry) in enumerate(round_chunk):
                            lane = lanes[lane_index % len(lanes)]
                            lane_counter_key = _lane_key(lane)
                            match = Match(
                                phase_id=phase.id,
                                group_id=group.id,
                                home_team_id=home_entry.get("tournament_team_id"),
                                away_team_id=away_entry.get("tournament_team_id"),
                                scheduled_at=slot_time,
                                original_scheduled_at=slot_time,
                                field_name=lane.get("field_name"),
                                field_number=lane.get("field_number"),
                                status=MatchStatus.SCHEDULED,
                                notes=None if home_entry.get("tournament_team_id") and away_entry.get("tournament_team_id") else encode_seed_note(
                                    home_entry["label"],
                                    away_entry["label"],
                                ),
                                bracket_position=phase_group_match_indexes[group.id] + 1,
                            )
                            db.add(match)
                            created_group_matches.append(match)
                            total_created_matches += 1
                            phase_group_match_indexes[group.id] += 1
                            if slot_time:
                                phase_end = max(phase_end or slot_time, slot_time + match_slot_length)
                            if not stagger_groups:
                                phase_lane_slot_counters[lane_counter_key] = max(
                                    phase_lane_slot_counters[lane_counter_key], slot_index + 1
                                )
                        if max_concurrent:
                            slot_matches_count[slot_index] += n
                        if max_consecutive:
                            for tid in chunk_team_ids:
                                team_last_slot[tid] = slot_index
                        if stagger_groups:
                            global_slot_offset += 1

            await db.flush()
            raw_referee_assignments = phase_config.get("referee_group_assignments", {})
            referee_source_group_ids = {}
            if isinstance(raw_referee_assignments, dict):
                for group_name, raw_source_group_names in raw_referee_assignments.items():
                    group_id = phase_group_name_to_id.get(group_name)
                    if not group_id or not isinstance(raw_source_group_names, list):
                        continue
                    source_group_ids = [
                        phase_group_name_to_id[source_group_name]
                        for source_group_name in raw_source_group_names
                        if isinstance(source_group_name, str) and source_group_name in phase_group_name_to_id and source_group_name != group_name
                    ]
                    referee_source_group_ids[group_id] = source_group_ids

            _assign_cross_group_referees(created_group_matches, phase_group_team_ids, participants, referee_source_group_ids)
            phase.advancement_config = {**(phase.advancement_config or {}), "group_slot_labels": slot_labels_by_group}
            queued_advancements = _queue_group_phase_advancements(
                phase_order_number,
                [group.name for group in groups],
                phase.advancement_config,
                {group.name: slot_labels_by_group.get(group.id, []) for group in groups},
                phases_config,
                phase_order_map,
            )
            for target_phase_order, target_entries in queued_advancements.items():
                queued_entries_by_phase[target_phase_order].extend(target_entries)
            previous_phase_end = phase_end
            continue

        current_entries = _sort_entries_for_knockout(current_entries)
        bracket_mode = (phase.seeding_source or {}).get("bracket_mode", "standard")
        if bracket_mode == "placement":
            buckets: dict[int, list[dict[str, Any]]] = defaultdict(list)
            for entry in current_entries:
                buckets[int(entry.get("rank") or 1)].append(entry)
            ordered_ranks = sorted(buckets.keys())
            carry_matches: list[tuple[str, int, int, list[dict[str, Any]]]] = []
            for rank in ordered_ranks:
                bucket_entries = buckets[rank]
                end_rank = rank + len(bucket_entries) - 1
                carry_matches.append((_placement_bucket_label(rank, end_rank), rank, end_rank, bucket_entries))
        elif bracket_mode == "group_blocks":
            carry_matches = _build_group_block_buckets(current_entries, _group_block_size(phase_config))
        else:
            carry_matches = [(_phase_bucket_name(phase_config), 1, len(current_entries), current_entries)]

        next_entries: list[dict[str, Any]] = []
        knockout_winner_entries: list[dict[str, Any]] = []
        knockout_loser_entries: list[dict[str, Any]] = []
        match_position = 1
        knockout_lanes = _knockout_lanes(age_group, phase_config) or [{"field_name": None, "field_number": None}]
        round_match_counts: dict[int, int] = defaultdict(int)
        created_knockout_matches: list[Match] = []
        knockout_progression = (phase.seeding_source or {}).get("knockout_progression", "full_bracket")

        if bracket_mode == "group_blocks":
            round_slot_row = 0
            for round_order, round_name, pairs in _ordered_group_block_rounds(carry_matches):
                for pair_index, (home_entry, away_entry) in enumerate(pairs):
                    home_label = home_entry["label"]
                    away_label = away_entry["label"] if away_entry else "Bye"
                    home_team_id = home_entry.get("tournament_team_id")
                    away_team_id = away_entry.get("tournament_team_id") if away_entry else None
                    lane = knockout_lanes[pair_index % len(knockout_lanes)]
                    scheduled_at = phase_start + (match_slot_length * round_slot_row) if phase_start else None
                    match = Match(
                        phase_id=phase.id,
                        group_id=None,
                        bracket_round=round_name,
                        bracket_position=match_position,
                        bracket_round_order=round_order,
                        home_team_id=home_team_id if away_label != "Bye" else home_team_id,
                        away_team_id=away_team_id if away_label != "Bye" else None,
                        scheduled_at=scheduled_at,
                        original_scheduled_at=scheduled_at,
                        field_name=lane.get("field_name"),
                        field_number=lane.get("field_number"),
                        status=MatchStatus.SCHEDULED,
                        match_duration_minutes=_resolve_generated_match_duration_minutes(age_group, phase_config, round_name),
                        notes=None if home_team_id and away_team_id else encode_seed_note(home_label, away_label),
                    )
                    db.add(match)
                    created_knockout_matches.append(match)
                    total_created_matches += 1
                    match_position += 1
                    if scheduled_at:
                        phase_end = max(phase_end or scheduled_at, scheduled_at + match_slot_length)
                round_slot_row += max((len(pairs) + len(knockout_lanes) - 1) // len(knockout_lanes), 1)

        for bucket_name, _, _, bucket_entries in carry_matches:
            if not bucket_entries:
                continue
            if bracket_mode != "group_blocks":
                bracket_size = _next_power_of_two(len(bucket_entries))
                padded = bucket_entries + [{"label": f"Riposo {index + 1}", "rank": 999} for index in range(max(bracket_size - len(bucket_entries), 0))]
                direct_pairs = _build_cross_group_direct_pairs(bucket_entries) if bracket_mode == "standard" else None
                round_entries = padded
                round_size = bracket_size
                round_order = 1
                stop_after_first_round = knockout_progression == "single_round"

                while round_size >= 2:
                    pairs = direct_pairs if round_order == 1 else None
                    pairs = pairs or _pair_seed_entries(round_entries)
                    round_name = f"{bucket_name} · {_knockout_round_name(round_size)}" if bucket_name != "Tabellone principale" else _knockout_round_name(round_size)
                    winners: list[dict[str, Any]] = []
                    for pair_index, (home_entry, away_entry) in enumerate(pairs):
                        home_label = home_entry["label"]
                        away_label = away_entry["label"] if away_entry else "Bye"
                        home_team_id = home_entry.get("tournament_team_id")
                        away_team_id = away_entry.get("tournament_team_id") if away_entry else None
                        round_match_index = round_match_counts[round_order]
                        lane = knockout_lanes[round_match_index % len(knockout_lanes)]
                        round_row = (round_order - 1) + (round_match_index // len(knockout_lanes))
                        scheduled_at = phase_start + (match_slot_length * round_row) if phase_start else None
                        match = Match(
                            phase_id=phase.id,
                            group_id=None,
                            bracket_round=round_name,
                            bracket_position=match_position,
                            bracket_round_order=round_order,
                            home_team_id=home_team_id if away_label != "Bye" else home_team_id,
                            away_team_id=away_team_id if away_label != "Bye" else None,
                            scheduled_at=scheduled_at,
                            original_scheduled_at=scheduled_at,
                            field_name=lane.get("field_name"),
                            field_number=lane.get("field_number"),
                            status=MatchStatus.SCHEDULED,
                            match_duration_minutes=_resolve_generated_match_duration_minutes(age_group, phase_config, round_name),
                            notes=None if home_team_id and away_team_id else encode_seed_note(home_label, away_label),
                        )
                        db.add(match)
                        created_knockout_matches.append(match)
                        total_created_matches += 1
                        match_position += 1
                        if scheduled_at:
                            phase_end = max(phase_end or scheduled_at, scheduled_at + match_slot_length)
                        round_match_counts[round_order] += 1
                        winner_entry = {"label": f"Vincente {round_name} {pair_index + 1}"}
                        winners.append(winner_entry)
                        if stop_after_first_round:
                            knockout_winner_entries.append(winner_entry)
                            if away_entry and away_label != "Bye":
                                knockout_loser_entries.append({"label": f"Perdente {round_name} {pair_index + 1}"})
                    round_entries = winners
                    round_size = len(round_entries)
                    round_order += 1
                    if stop_after_first_round:
                        break
                    if round_size <= 1:
                        break
            next_entries.extend(bucket_entries)

        await db.flush()
        current_entries = next_entries
        queued_knockout_advancements = _queue_knockout_phase_advancements(
            phase_order_number,
            phase_config,
            phases_config,
            phase_order_map,
            knockout_winner_entries or current_entries,
            knockout_loser_entries,
        )
        for target_phase_order, target_entries in queued_knockout_advancements.items():
            queued_entries_by_phase[target_phase_order].extend(target_entries)
        previous_phase_end = phase_end

    if total_created_matches == 0:
        raise ValueError("La formula non produce nessuna partita con le squadre attualmente inserite")

    await _resolve_age_group_field_conflicts(age_group, db)
    await _sync_tournament_dates_from_generated_program(age_group)
    await db.commit()
    await db.refresh(age_group)
    return age_group


async def _sync_tournament_dates_from_generated_program(age_group: TournamentAgeGroup) -> None:
    tournament = age_group.tournament
    if tournament is None:
        return

    phase_dates = [
        match.scheduled_at.astimezone(_tournament_tz(age_group)).date()
        for phase in age_group.phases
        for match in phase.matches
        if match.scheduled_at
    ]

    if not phase_dates:
        return

    earliest = min(phase_dates)
    latest = max(phase_dates)

    if tournament.start_date is None or earliest < tournament.start_date:
        tournament.start_date = earliest
    if tournament.end_date is None or latest > tournament.end_date:
        tournament.end_date = latest


async def get_age_group_program(age_group_id: str, db: AsyncSession) -> AgeGroupProgramResponse | None:
    result = await db.execute(
        select(TournamentAgeGroup)
        .options(
            selectinload(TournamentAgeGroup.tournament).selectinload(Tournament.age_groups),
            selectinload(TournamentAgeGroup.tournament_teams).selectinload(TournamentTeam.team).selectinload(Team.organization),
            selectinload(TournamentAgeGroup.phases).selectinload(Phase.groups).selectinload(Group.group_teams).selectinload(GroupTeam.tournament_team).selectinload(TournamentTeam.team).selectinload(Team.organization),
            selectinload(TournamentAgeGroup.phases).selectinload(Phase.matches).selectinload(Match.home_team).selectinload(TournamentTeam.team).selectinload(Team.organization),
            selectinload(TournamentAgeGroup.phases).selectinload(Phase.matches).selectinload(Match.away_team).selectinload(TournamentTeam.team).selectinload(Team.organization),
        )
        .where(TournamentAgeGroup.id == age_group_id)
    )
    age_group = result.scalar_one_or_none()
    if not age_group:
        return None
    return _serialize_age_group_program(age_group)


async def get_tournament_program(tournament_slug: str, db: AsyncSession) -> TournamentProgramResponse | None:
    result = await db.execute(
        select(Tournament)
        .options(
            selectinload(Tournament.age_groups).selectinload(TournamentAgeGroup.tournament_teams).selectinload(TournamentTeam.team),
            selectinload(Tournament.age_groups).selectinload(TournamentAgeGroup.tournament_teams).selectinload(TournamentTeam.team).selectinload(Team.organization),
            selectinload(Tournament.age_groups).selectinload(TournamentAgeGroup.phases).selectinload(Phase.groups).selectinload(Group.group_teams).selectinload(GroupTeam.tournament_team).selectinload(TournamentTeam.team).selectinload(Team.organization),
            selectinload(Tournament.age_groups).selectinload(TournamentAgeGroup.phases).selectinload(Phase.matches).selectinload(Match.home_team).selectinload(TournamentTeam.team).selectinload(Team.organization),
            selectinload(Tournament.age_groups).selectinload(TournamentAgeGroup.phases).selectinload(Phase.matches).selectinload(Match.away_team).selectinload(TournamentTeam.team).selectinload(Team.organization),
        )
        .where(Tournament.slug == tournament_slug, Tournament.is_published == True)
    )
    tournament = result.scalar_one_or_none()
    if not tournament:
        return None

    age_groups = [
        _serialize_age_group_program(age_group)
        for age_group in sorted(tournament.age_groups, key=lambda item: item.age_group.value)
    ]
    return TournamentProgramResponse(
        tournament_id=tournament.id,
        tournament_name=tournament.name,
        age_groups=age_groups,
    )


def _serialize_age_group_program(age_group: TournamentAgeGroup) -> AgeGroupProgramResponse:
    phase_days: dict[str, list[ProgramPhaseResponse]] = defaultdict(list)
    structure = age_group.structure_config if isinstance(age_group.structure_config, dict) else {}
    phases_config = structure.get("phases", []) if isinstance(structure.get("phases", []), list) else []
    phases_by_order = {phase.phase_order: phase for phase in sorted(age_group.phases, key=lambda item: item.phase_order)}

    for phase_order, phase_config in enumerate(phases_config, start=1):
        phase = phases_by_order.get(phase_order)
        _phase_duration = _resolve_phase_duration_minutes(age_group, phase_config if isinstance(phase_config, dict) else None)
        if phase:
            group_responses, knockout_matches, phase_date, phase_id, phase_name, phase_type, phase_start_at, estimated_end_at = _serialize_phase_for_program(phase, _phase_duration)
        else:
            group_responses, knockout_matches, phase_date, phase_id, phase_name, phase_type, phase_start_at, estimated_end_at = _build_placeholder_phase_from_config(
                age_group.id,
                phase_order,
                phase_config if isinstance(phase_config, dict) else {},
                phases_config,
                age_group,
            )

        configured_start_at = _resolve_phase_start(
            age_group,
            phase_order - 1,
            phase_config if isinstance(phase_config, dict) else {},
            None,
        ) if phase_order <= len(phases_config) else None
        day_key = phase_date.isoformat() if phase_date else f"phase-{phase_order}"
        phase_days[day_key].append(ProgramPhaseResponse(
            id=phase_id,
            name=phase_name,
            phase_type=phase_type,
            phase_order=phase_order,
            is_final_phase=_is_final_phase_config(phases_config, phase_order),
            scheduled_date=phase_date,
            configured_start_at=configured_start_at,
            phase_start_at=phase_start_at,
            estimated_end_at=estimated_end_at,
            match_duration_minutes=_phase_duration,
            num_halves=int((phase_config or {}).get("num_halves")) if isinstance((phase_config or {}).get("num_halves"), int) else None,
            half_duration_minutes=int((phase_config or {}).get("half_duration_minutes")) if isinstance((phase_config or {}).get("half_duration_minutes"), int) else None,
            groups=group_responses,
            knockout_matches=knockout_matches,
        ))

    for phase in sorted(age_group.phases, key=lambda item: item.phase_order):
        if phase.phase_order <= len(phases_config):
            continue
        extra_phase_duration = _resolve_phase_duration_minutes(age_group)
        group_responses, knockout_matches, phase_date, phase_id, phase_name, phase_type, phase_start_at, estimated_end_at = _serialize_phase_for_program(phase, extra_phase_duration)
        day_key = phase_date.isoformat() if phase_date else f"phase-{phase.phase_order}"
        phase_days[day_key].append(ProgramPhaseResponse(
            id=phase_id,
            name=phase_name,
            phase_type=phase_type,
            phase_order=phase.phase_order,
            is_final_phase=True,
            scheduled_date=phase_date,
            configured_start_at=None,
            phase_start_at=phase_start_at,
            estimated_end_at=estimated_end_at,
            match_duration_minutes=extra_phase_duration,
            num_halves=None,
            half_duration_minutes=None,
            groups=group_responses,
            knockout_matches=knockout_matches,
        ))

    days: list[ProgramDayResponse] = []
    for day_key, phases in sorted(phase_days.items(), key=lambda item: item[0]):
        sorted_phases = sorted(phases, key=_program_phase_sort_key)
        date_value = sorted_phases[0].scheduled_date
        label = date_value.strftime("%d/%m/%Y") if date_value else "Da definire"
        days.append(ProgramDayResponse(date=date_value, label=label, phases=sorted_phases))

    expected_teams = None
    if age_group.structure_config and isinstance(age_group.structure_config, dict):
        raw_expected = age_group.structure_config.get("expected_teams")
        expected_teams = raw_expected if isinstance(raw_expected, int) else None

    return AgeGroupProgramResponse(
        age_group_id=age_group.id,
        age_group=age_group.age_group.value,
        display_name=age_group.display_name,
        field_map_url=age_group.field_map_url,
        participant_count=len(age_group.tournament_teams),
        expected_teams=expected_teams,
        hide_future_phases_until_complete=bool(((structure.get("schedule") or {}) if isinstance(structure.get("schedule"), dict) else {}).get("hide_future_phases_until_complete")),
        generated=len(age_group.phases) > 0,
        days=days,
    )


def _program_phase_sort_key(phase: ProgramPhaseResponse) -> tuple[datetime, int, str]:
    scheduled_values = [
        match.scheduled_at
        for group in phase.groups
        for match in group.matches
        if match.scheduled_at
    ] + [
        match.scheduled_at
        for match in phase.knockout_matches
        if match.scheduled_at
    ]
    earliest = min(scheduled_values) if scheduled_values else datetime.max.replace(tzinfo=ZoneInfo("UTC"))
    return (earliest, phase.phase_order, phase.name)


def _serialize_phase_for_program(
    phase: Phase,
    match_duration_minutes: int | None = None,
) -> tuple[list[ProgramGroupResponse], list[ProgramMatchResponse], date_type | None, str, str, str, datetime | None, datetime | None]:
    group_responses: list[ProgramGroupResponse] = []

    for group in sorted(phase.groups, key=lambda item: item.group_order):
        slot_labels = (phase.advancement_config or {}).get("group_slot_labels", {}).get(group.id, [])
        teams = [
            ProgramTeamSlotResponse(
                team_id=group_team.tournament_team.team_id,
                tournament_team_id=group_team.tournament_team.id,
                label=_team_label(group_team.tournament_team),
                team_logo_url=group_team.tournament_team.team.logo_url or group_team.tournament_team.team.organization.logo_url,
                is_placeholder=False,
            )
            for group_team in group.group_teams
        ]

        if not teams and slot_labels:
            teams = [
                ProgramTeamSlotResponse(label=label, is_placeholder=True)
                for label in slot_labels
            ]

        matches = [
            _serialize_match(match, phase.name, phase.phase_type.value, group.name, match_duration_minutes)
            for match in sorted(
                [item for item in phase.matches if item.group_id == group.id],
                key=lambda item: (item.bracket_position or 0, item.scheduled_at or datetime.max),
            )
        ]

        group_responses.append(ProgramGroupResponse(
            id=group.id,
            name=group.name,
            order=group.group_order,
            teams=teams,
            matches=matches,
        ))

    knockout_matches = [
        _serialize_match(match, phase.name, phase.phase_type.value, None, match_duration_minutes)
        for match in sorted(
            [item for item in phase.matches if item.group_id is None],
            key=lambda item: (item.bracket_round_order or 0, item.bracket_position or 0),
        )
    ]

    scheduled_dates = [match.scheduled_at.date() for match in phase.matches if match.scheduled_at]
    phase_date = min(scheduled_dates) if scheduled_dates else None
    phase_matches = [
        *[match for group in group_responses for match in group.matches],
        *knockout_matches,
    ]
    age_group = phase.tournament_age_group
    _interval = int(_schedule_settings(age_group).get("interval_minutes") or 8) if age_group else 8
    phase_start_at, estimated_end_at = _estimate_phase_time_window(
        phase_matches,
        _phase_slot_duration(age_group) if age_group else timedelta(minutes=20),
        interval_minutes=_interval,
    )
    return group_responses, knockout_matches, phase_date, phase.id, phase.name, phase.phase_type.value, phase_start_at, estimated_end_at


def _build_placeholder_phase_from_config(
    age_group_id: str,
    phase_order: int,
    phase_config: dict[str, Any],
    phases_config: list[dict[str, Any]],
    age_group: TournamentAgeGroup,
) -> tuple[list[ProgramGroupResponse], list[ProgramMatchResponse], date_type | None, str, str, str, datetime | None, datetime | None]:
    phase_name = str(phase_config.get("name") or f"Fase {phase_order}")
    phase_type = "KNOCKOUT" if phase_config.get("phase_type") == "KNOCKOUT" else "GROUP_STAGE"
    phase_id = str(phase_config.get("id") or f"placeholder-phase-{age_group_id}-{phase_order}")
    raw_phase_date = phase_config.get("phase_date")
    phase_date = None
    if isinstance(raw_phase_date, str) and raw_phase_date:
        try:
            phase_date = date_type.fromisoformat(raw_phase_date)
        except ValueError:
            phase_date = None

    if phase_type == "GROUP_STAGE":
        num_groups = int(phase_config.get("num_groups") or 0)
        group_sizes = parse_group_sizes(phase_config.get("group_sizes"), num_groups or 1, 0) if num_groups else []
        total_groups = max(num_groups, len(group_sizes), 1)
        slot_labels = _build_placeholder_group_slot_labels(phase_config, phases_config)
        groups: list[ProgramGroupResponse] = []
        for group_index in range(total_groups):
            group_name = _group_name_from_config(group_index, phase_config)
            labels = slot_labels.get(group_name, [])
            if not labels:
                fallback_size = group_sizes[group_index] if group_index < len(group_sizes) else 0
                labels = [f"Da definire {group_name} #{slot + 1}" for slot in range(fallback_size)]
            groups.append(ProgramGroupResponse(
                id=f"{phase_id}-group-{group_index}",
                name=group_name,
                order=group_index,
                teams=[ProgramTeamSlotResponse(label=label, is_placeholder=True) for label in labels],
                matches=[],
            ))
        phase_start_at = _resolve_phase_start(age_group, phase_order - 1, phase_config, None)
        # Estimate end time for the placeholder group stage
        gs_estimated_end: datetime | None = None
        if phase_start_at and group_sizes:
            total_matches = sum(s * (s - 1) // 2 for s in group_sizes if s > 1)
            if phase_config.get("round_trip_mode") == "double":
                total_matches *= 2
            if total_matches > 0:
                total_lanes = sum(
                    max(len(_group_lanes(age_group, phase_config, _group_name_from_config(gi, phase_config), gi, total_groups)), 1)
                    for gi in range(total_groups)
                )
                slot_duration = _phase_slot_duration(age_group, phase_config)
                slot_rows = math.ceil(total_matches / max(total_lanes, 1))
                gs_estimated_end = phase_start_at + (slot_duration * slot_rows)
        return groups, [], phase_date, phase_id, phase_name, phase_type, phase_start_at, gs_estimated_end

    phase_start_at, estimated_end_at = _estimate_placeholder_knockout_end(
        age_group,
        phase_order,
        phase_config,
        phases_config,
    )
    return [], [], phase_date, phase_id, phase_name, phase_type, phase_start_at, estimated_end_at


def _build_placeholder_group_slot_labels(
    target_phase_config: dict[str, Any],
    phases_config: list[dict[str, Any]],
) -> dict[str, list[str]]:
    target_phase_id = target_phase_config.get("id")
    if not isinstance(target_phase_id, str) or not target_phase_id:
        return {}

    labels_by_group: dict[str, dict[int, str]] = defaultdict(dict)
    for source_phase in phases_config:
        if not isinstance(source_phase, dict):
            continue
        source_phase_name = str(source_phase.get("name") or "Fase precedente")
        for route in source_phase.get("advancement_routes", []) if isinstance(source_phase.get("advancement_routes"), list) else []:
            if not isinstance(route, dict) or route.get("target_phase_id") != target_phase_id:
                continue
            route_labels = _entries_for_group_route(route, [], None)
            if route.get("source_mode") == "knockout_winner":
                route_labels = [{"label": f"Vincente {source_phase_name} {index + 1}"} for index, _ in enumerate(_normalize_route_target_slots(route))]
            elif route.get("source_mode") == "knockout_loser":
                route_labels = [{"label": f"Perdente {source_phase_name} {index + 1}"} for index, _ in enumerate(_normalize_route_target_slots(route))]
            target_slots = _normalize_route_target_slots(route)
            for index, slot in enumerate(target_slots):
                match = re.match(r"^([A-Z])(\d+)$", slot)
                if not match:
                    continue
                group_name = f"Girone {match.group(1)}"
                position = int(match.group(2))
                fallback_label = f"Da definire {group_name} #{position}"
                labels_by_group[group_name][position] = route_labels[index]["label"] if index < len(route_labels) else fallback_label

    ordered: dict[str, list[str]] = {}
    for group_name, entries in labels_by_group.items():
        ordered[group_name] = [label for _, label in sorted(entries.items(), key=lambda item: item[0])]
    return ordered


def _placeholder_entries_for_knockout_phase(
    target_phase_config: dict[str, Any],
    phases_config: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    target_phase_id = target_phase_config.get("id")
    if not isinstance(target_phase_id, str) or not target_phase_id:
        return []

    entries: list[dict[str, Any]] = []
    for source_phase in phases_config:
        if not isinstance(source_phase, dict):
            continue
        source_phase_name = str(source_phase.get("name") or "Fase precedente")
        num_groups = int(source_phase.get("num_groups") or 0)
        if num_groups == 0:
            # Fall back to inferring group count from group_sizes when num_groups is not set
            _inferred_sizes = parse_group_sizes(source_phase.get("group_sizes"), 1, 0)
            num_groups = len(_inferred_sizes)
        group_names = [_group_name_from_config(index, source_phase) for index in range(max(num_groups, 0))]
        for route in source_phase.get("advancement_routes", []) if isinstance(source_phase.get("advancement_routes"), list) else []:
            if not isinstance(route, dict) or route.get("target_phase_id") != target_phase_id:
                continue
            source_mode = str(route.get("source_mode") or "group_rank")
            if source_mode == "knockout_winner":
                route_entries = [
                    {"label": f"Vincente {source_phase_name} {index + 1}"}
                    for index, _ in enumerate(_normalize_route_target_slots(route))
                ]
            elif source_mode == "knockout_loser":
                route_entries = [
                    {"label": f"Perdente {source_phase_name} {index + 1}"}
                    for index, _ in enumerate(_normalize_route_target_slots(route))
                ]
            else:
                route_entries = _entries_for_group_route(route, group_names, None)
            entries.extend(_apply_target_slot_assignments(route_entries, route, target_phase_config))
    return entries


def _count_standard_bucket_matches(bucket_entries: list[dict[str, Any]], knockout_progression: str) -> int:
    if not bucket_entries:
        return 0
    bracket_size = _next_power_of_two(len(bucket_entries))
    padded = bucket_entries + [
        {"label": f"Riposo {index + 1}", "rank": 999}
        for index in range(max(bracket_size - len(bucket_entries), 0))
    ]

    round_entries = padded
    round_size = bracket_size
    round_order = 1
    total_matches = 0
    stop_after_first_round = knockout_progression == "single_round"

    while round_size >= 2:
        pairs = _build_cross_group_direct_pairs(bucket_entries) if round_order == 1 else None
        pairs = pairs or _pair_seed_entries(round_entries)
        total_matches += len(pairs)
        if stop_after_first_round:
            break
        round_entries = [{"label": f"Round {round_order} vincente {index + 1}"} for index, _ in enumerate(pairs)]
        round_size = len(round_entries)
        round_order += 1
        if round_size <= 1:
            break

    return total_matches


def _estimate_placeholder_knockout_end(
    age_group: TournamentAgeGroup,
    phase_order: int,
    phase_config: dict[str, Any],
    phases_config: list[dict[str, Any]],
) -> tuple[datetime | None, datetime | None]:
    phase_start_at = _resolve_phase_start(age_group, phase_order - 1, phase_config, None)
    if not phase_start_at:
        return None, None

    entries = _sort_entries_for_knockout(_placeholder_entries_for_knockout_phase(phase_config, phases_config))
    if not entries:
        return phase_start_at, None

    bracket_mode = str(phase_config.get("bracket_mode") or "standard")
    knockout_progression = str(phase_config.get("knockout_progression") or "full_bracket")
    match_count = 0

    if bracket_mode == "group_blocks":
        carry_matches = _build_group_block_buckets(entries, _group_block_size(phase_config))
        match_count = sum(len(pairs) for _, _, pairs in _ordered_group_block_rounds(carry_matches))
    elif bracket_mode == "placement":
        buckets: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for entry in entries:
            buckets[int(entry.get("rank") or 1)].append(entry)
        for bucket_entries in buckets.values():
            match_count += _count_standard_bucket_matches(bucket_entries, knockout_progression)
    else:
        match_count = _count_standard_bucket_matches(entries, knockout_progression)

    if match_count <= 0:
        return phase_start_at, None

    lane_count = max(len(_knockout_lanes(age_group, phase_config)) or 0, 1)
    slot_duration = _phase_slot_duration(age_group)
    slot_rows = math.ceil(match_count / lane_count)
    return phase_start_at, phase_start_at + (slot_duration * slot_rows)


def _serialize_match(match: Match, phase_name: str, phase_type: str, group_name: str | None, match_duration_minutes: int | None = None) -> ProgramMatchResponse:
    seed_home, seed_away, clean_notes = decode_seed_note(match.notes)
    home_label = match.home_team.team.name if match.home_team else seed_home or "Da definire"
    away_label = match.away_team.team.name if match.away_team else seed_away or "Da definire"
    home_logo_url = match.home_team.team.logo_url or match.home_team.team.organization.logo_url if match.home_team else None
    away_logo_url = match.away_team.team.logo_url or match.away_team.team.organization.logo_url if match.away_team else None

    return ProgramMatchResponse(
        id=match.id,
        phase_id=match.phase_id,
        phase_name=phase_name,
        phase_type=phase_type,
        group_id=match.group_id,
        group_name=group_name,
        bracket_round=match.bracket_round,
        bracket_round_order=match.bracket_round_order,
        bracket_position=match.bracket_position,
        scheduled_at=match.scheduled_at,
        original_scheduled_at=match.original_scheduled_at,
        actual_end_at=match.actual_end_at,
        status=match.status,
        field_name=match.field_name,
        field_number=match.field_number,
        home_team_id=match.home_team_id,
        away_team_id=match.away_team_id,
        home_label=home_label,
        away_label=away_label,
        home_logo_url=home_logo_url,
        away_logo_url=away_logo_url,
        home_score=match.home_score,
        away_score=match.away_score,
        home_tries=match.home_tries,
        away_tries=match.away_tries,
        referee=match.referee,
        notes=clean_notes,
        match_duration_minutes=match.match_duration_minutes if match.match_duration_minutes is not None else match_duration_minutes,
    )
