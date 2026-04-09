from __future__ import annotations

from collections import defaultdict
from datetime import date as date_type, datetime, time, timedelta
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


AUTO_SEED_PREFIX = "AUTOSEED::"
LOCAL_TIMEZONE = ZoneInfo("Europe/Rome")


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
    note = f"{AUTO_SEED_PREFIX}{home_label}||{away_label}"
    if extra_note:
        note = f"{note}||{extra_note}"
    return note


def decode_seed_note(note: str | None) -> tuple[str | None, str | None, str | None]:
    if not note or not note.startswith(AUTO_SEED_PREFIX):
        return None, None, note
    payload = note[len(AUTO_SEED_PREFIX):]
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
    return datetime.combine(start_date + timedelta(days=day_offset), time(hour=12), tzinfo=LOCAL_TIMEZONE)


def _team_label(tt: TournamentTeam) -> str:
    return tt.team.name


def _group_name(index: int) -> str:
    return f"Girone {chr(65 + index)}"


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
        if not field_name:
            continue
        normalized_field = {
            "field_name": str(field_name),
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
    return datetime.combine(base.date(), start, tzinfo=LOCAL_TIMEZONE)


def _resolve_phase_date(
    age_group: TournamentAgeGroup,
    phase_index: int,
    phase_config: dict[str, Any],
) -> datetime | None:
    explicit_date = phase_config.get("phase_date")
    if isinstance(explicit_date, str) and explicit_date:
        try:
            parsed = datetime.strptime(explicit_date, "%Y-%m-%d").date()
            return datetime.combine(parsed, time(hour=12), tzinfo=LOCAL_TIMEZONE)
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
        return datetime.combine(base.date(), _parse_start_time(explicit_start), tzinfo=LOCAL_TIMEZONE)
    return fallback_start or _phase_start_datetime(age_group, phase_index)


def _slot_delta(age_group: TournamentAgeGroup) -> timedelta:
    schedule = _schedule_settings(age_group)
    duration = int(schedule.get("match_duration_minutes") or 12)
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
        return rounds

    reverse_rounds = [
        [(away_entry, home_entry) for home_entry, away_entry in round_pairs]
        for round_pairs in rounds
    ]
    return rounds + reverse_rounds


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
            if not field_name:
                continue
            normalized_lane = {
                "field_name": str(field_name),
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
            if not field_name:
                continue
            lanes.append({
                "field_name": str(field_name),
                "field_number": int(field_number) if isinstance(field_number, int) else None,
            })
    return lanes or _schedule_playing_fields(age_group)


def _assign_cross_group_referees(
    matches: list[Match],
    group_team_ids: dict[str, list[str]],
    participants: list[TournamentTeam],
    referee_source_group_ids: dict[str, list[str]] | None = None,
) -> None:
    participant_name_map = {team.id: team.team.name for team in participants}
    referee_load: dict[str, int] = defaultdict(int)
    referee_source_group_ids = referee_source_group_ids or {}

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
        assigned_referee_ids: set[str] = set()
        external_referee_counter = 1

        for match in slot_matches:
            same_group_team_ids = set(group_team_ids.get(match.group_id or "", []))
            allowed_source_group_ids = referee_source_group_ids.get(match.group_id or "", [])
            cross_group_candidate_ids = [
                team_id
                for group_id, team_ids in group_team_ids.items()
                if group_id != match.group_id and (not allowed_source_group_ids or group_id in allowed_source_group_ids)
                for team_id in team_ids
                if team_id not in busy_team_ids and team_id not in same_group_team_ids and team_id not in assigned_referee_ids
            ]

            fallback_same_group_ids = [
                team_id
                for team_id in same_group_team_ids
                if team_id not in busy_team_ids and team_id not in assigned_referee_ids
            ]

            candidate_ids = cross_group_candidate_ids or fallback_same_group_ids
            if not candidate_ids:
                remaining_global_ids = [
                    team_id
                    for team_id in participant_name_map.keys()
                    if team_id not in busy_team_ids and team_id not in assigned_referee_ids
                ]
                candidate_ids = remaining_global_ids
            if not candidate_ids:
                match.referee = f"Staff torneo {external_referee_counter}"
                external_referee_counter += 1
                continue

            candidate_ids.sort(key=lambda team_id: (referee_load[team_id], participant_name_map.get(team_id, "")))
            selected = candidate_ids[0]
            match.referee = participant_name_map.get(selected)
            referee_load[selected] += 1
            assigned_referee_ids.add(selected)


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
            labels.append({"label": f"{_ordinal_it(rank)} {group_name}", "rank": rank})

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


def _build_group_block_buckets(entries: list[dict[str, Any]]) -> list[tuple[str, list[dict[str, Any]]]]:
    group_names = sorted({
        str(entry.get("group_name"))
        for entry in entries
        if entry.get("group_name")
    })
    if len(group_names) != 2:
        return [("Tabellone principale", entries)]

    grouped_by_rank: dict[int, dict[str, dict[str, Any]]] = defaultdict(dict)
    for entry in entries:
        rank = int(entry.get("rank") or 0)
        group_name = entry.get("group_name")
        if rank <= 0 or group_name not in group_names:
            continue
        grouped_by_rank[rank][group_name] = entry

    carry_matches: list[tuple[str, list[dict[str, Any]]]] = []
    ordered_ranks = sorted(grouped_by_rank.keys())
    bucket_start_rank = 1

    while bucket_start_rank <= (ordered_ranks[-1] if ordered_ranks else 0):
        current_rank_entries = grouped_by_rank.get(bucket_start_rank, {})
        next_rank_entries = grouped_by_rank.get(bucket_start_rank + 1, {})
        bucket_entries = [
            current_rank_entries.get(group_names[0]),
            current_rank_entries.get(group_names[1]),
            next_rank_entries.get(group_names[0]),
            next_rank_entries.get(group_names[1]),
        ]
        bucket_entries = [entry for entry in bucket_entries if entry]
        if bucket_entries:
            placement_rank = ((bucket_start_rank - 1) * len(group_names)) + 1
            carry_matches.append((f"Piazzamento {_ordinal_it(placement_rank)}", bucket_entries))
        bucket_start_rank += 2

    return carry_matches or [("Tabellone principale", entries)]


def _build_knockout_block_rounds(
    bucket_name: str,
    bucket_entries: list[dict[str, Any]],
) -> list[tuple[str, list[tuple[dict[str, Any], dict[str, Any] | None]], list[dict[str, Any]]]]:
    if len(bucket_entries) == 4:
        semifinals = [
            (bucket_entries[0], bucket_entries[3]),
            (bucket_entries[1], bucket_entries[2]),
        ]
        return [
            (f"{bucket_name} · Semifinali", semifinals, [
                {"label": f"Vincente {bucket_name} · Semifinale 1"},
                {"label": f"Vincente {bucket_name} · Semifinale 2"},
                {"label": f"Perdente {bucket_name} · Semifinale 1"},
                {"label": f"Perdente {bucket_name} · Semifinale 2"},
            ]),
            (
                f"{bucket_name} · Finale 3°/4° posto",
                [({"label": f"Perdente {bucket_name} · Semifinale 1"}, {"label": f"Perdente {bucket_name} · Semifinale 2"})],
                bucket_entries,
            ),
            (
                f"{bucket_name} · Finale 1°/2° posto",
                [({"label": f"Vincente {bucket_name} · Semifinale 1"}, {"label": f"Vincente {bucket_name} · Semifinale 2"})],
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


async def _sync_future_age_group_matches(age_group: TournamentAgeGroup, phases_config: list[dict[str, Any]], db: AsyncSession) -> TournamentAgeGroup:
    match_slot_length = _slot_delta(age_group)
    previous_phase_end: datetime | None = None

    for phase_index, phase in enumerate(sorted(age_group.phases, key=lambda item: item.phase_order)):
        phase_config = phases_config[phase_index] if phase_index < len(phases_config) and isinstance(phases_config[phase_index], dict) else {}
        phase_start = _resolve_phase_start(age_group, phase_index, phase_config, previous_phase_end)
        phase_end = phase_start

        if phase.phase_type == PhaseType.GROUP_STAGE:
            groups = sorted(phase.groups, key=lambda item: item.group_order)
            phase_lane_slot_counters: dict[tuple[str | None, int | None], int] = defaultdict(int)
            for group_index, group in enumerate(groups):
                group_name = group.name
                lanes = _group_lanes(age_group, phase_config, group_name, group_index, len(groups)) or [{"field_name": None, "field_number": None}]
                matches = sorted(
                    [item for item in phase.matches if item.group_id == group.id],
                    key=lambda item: (item.bracket_position or 0, item.scheduled_at or datetime.max),
                )
                for match_index, match in enumerate(matches):
                    lane = lanes[match_index % len(lanes)]
                    lane_counter_key = _lane_key(lane)
                    slot_index = phase_lane_slot_counters[lane_counter_key]
                    if _match_has_recorded_result(match):
                        phase_lane_slot_counters[lane_counter_key] = slot_index + 1
                        continue
                    slot_time = phase_start + (match_slot_length * slot_index) if phase_start else None
                    match.scheduled_at = slot_time
                    match.field_name = lane.get("field_name")
                    match.field_number = lane.get("field_number")
                    if slot_time:
                        phase_end = max(phase_end or slot_time, slot_time + match_slot_length)
                    phase_lane_slot_counters[lane_counter_key] = slot_index + 1
        else:
            lanes = _knockout_lanes(age_group, phase_config) or [{"field_name": None, "field_number": None}]
            matches = sorted(
                [item for item in phase.matches if item.group_id is None],
                key=lambda item: (item.bracket_round_order or 0, item.bracket_position or 0),
            )
            for match_index, match in enumerate(matches):
                if _match_has_recorded_result(match):
                    continue
                lane = lanes[match_index % len(lanes)]
                slot_time = phase_start + (match_slot_length * (match_index // len(lanes))) if phase_start else None
                match.scheduled_at = slot_time
                match.field_name = lane.get("field_name")
                match.field_number = lane.get("field_number")
                if slot_time:
                    phase_end = max(phase_end or slot_time, slot_time + match_slot_length)
        previous_phase_end = phase_end

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
    return not (isinstance(next_phase_type, str) and next_phase_type)


async def generate_age_group_program(age_group_id: str, db: AsyncSession) -> TournamentAgeGroup:
    result = await db.execute(
        select(TournamentAgeGroup)
        .options(
            selectinload(TournamentAgeGroup.tournament),
            selectinload(TournamentAgeGroup.tournament_teams).selectinload(TournamentTeam.team),
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
    match_slot_length = _slot_delta(age_group)
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
            entry_cursor = 0
            slot_labels_by_group: dict[str, list[str]] = {}
            phase_group_team_ids: dict[str, list[str]] = {}
            phase_group_name_to_id: dict[str, str] = {}
            created_group_matches: list[Match] = []
            phase_lane_slot_counters: dict[tuple[str | None, int | None], int] = defaultdict(int)
            grouped_entries = _distribute_entries_across_groups(current_entries, group_sizes)

            for group_index, group_size in enumerate(group_sizes):
                group_name = _group_name(group_index)
                group = Group(
                    phase_id=phase.id,
                    name=group_name,
                    group_order=group_index,
                )
                db.add(group)
                await db.flush()
                groups.append(group)
                phase_group_name_to_id[group_name] = group.id

                group_entries = grouped_entries[group_index] if group_index < len(grouped_entries) else current_entries[entry_cursor: entry_cursor + group_size]
                entry_cursor += group_size
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

                lanes = _group_lanes(age_group, phase_config, group_name, group_index, len(group_sizes)) or [{"field_name": None, "field_number": None}]
                rounds = _group_stage_rounds(group_entries, phase_config)
                match_index = 0

                for round_pairs in rounds:
                    for chunk_start in range(0, len(round_pairs), len(lanes)):
                        round_chunk = round_pairs[chunk_start: chunk_start + len(lanes)]
                        chunk_lanes = [lanes[lane_index % len(lanes)] for lane_index in range(len(round_chunk))]
                        slot_index = max(phase_lane_slot_counters[_lane_key(lane)] for lane in chunk_lanes) if chunk_lanes else 0
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
                                field_name=lane.get("field_name"),
                                field_number=lane.get("field_number"),
                                status=MatchStatus.SCHEDULED,
                                notes=None if home_entry.get("tournament_team_id") and away_entry.get("tournament_team_id") else encode_seed_note(
                                    home_entry["label"],
                                    away_entry["label"],
                                ),
                                bracket_position=match_index + 1,
                            )
                            db.add(match)
                            created_group_matches.append(match)
                            total_created_matches += 1
                            match_index += 1
                            if slot_time:
                                phase_end = max(phase_end or slot_time, slot_time + match_slot_length)
                            phase_lane_slot_counters[lane_counter_key] = slot_index + 1

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

            _assign_cross_group_referees(
                created_group_matches,
                phase_group_team_ids,
                participants,
                referee_source_group_ids,
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
            ordered_ranks = sorted(buckets.keys())
            carry_matches: list[tuple[str, list[dict[str, Any]]]] = []
            for rank in ordered_ranks:
                carry_matches.append((f"Piazzamento {_ordinal_it(rank)}", buckets[rank]))
        elif bracket_mode == "group_blocks":
            carry_matches = _build_group_block_buckets(current_entries)
        else:
            carry_matches = [(_phase_bucket_name(phase_config), current_entries)]

        next_entries: list[dict[str, Any]] = []
        knockout_winner_entries: list[dict[str, Any]] = []
        knockout_loser_entries: list[dict[str, Any]] = []
        match_position = 1
        knockout_lanes = _knockout_lanes(age_group, phase_config) or [{"field_name": None, "field_number": None}]
        knockout_slot_index = 0
        created_knockout_matches: list[Match] = []
        knockout_progression = (phase.seeding_source or {}).get("knockout_progression", "full_bracket")

        for bucket_name, bucket_entries in carry_matches:
            if not bucket_entries:
                continue
            if bracket_mode == "group_blocks":
                block_rounds = _build_knockout_block_rounds(bucket_name, bucket_entries)
                for round_order, (round_name, pairs, _) in enumerate(block_rounds, start=1):
                    for pair_index, (home_entry, away_entry) in enumerate(pairs):
                        home_label = home_entry["label"]
                        away_label = away_entry["label"] if away_entry else "Bye"
                        home_team_id = home_entry.get("tournament_team_id")
                        away_team_id = away_entry.get("tournament_team_id") if away_entry else None
                        lane = knockout_lanes[knockout_slot_index % len(knockout_lanes)]
                        scheduled_at = phase_start + (match_slot_length * (knockout_slot_index // len(knockout_lanes))) if phase_start else None

                        match = Match(
                            phase_id=phase.id,
                            group_id=None,
                            bracket_round=round_name,
                            bracket_position=match_position,
                            bracket_round_order=round_order,
                            home_team_id=home_team_id if away_label != "Bye" else home_team_id,
                            away_team_id=away_team_id if away_label != "Bye" else None,
                            scheduled_at=scheduled_at,
                            field_name=lane.get("field_name"),
                            field_number=lane.get("field_number"),
                            status=MatchStatus.SCHEDULED,
                            notes=None if home_team_id and away_team_id else encode_seed_note(home_label, away_label),
                        )
                        db.add(match)
                        created_knockout_matches.append(match)
                        total_created_matches += 1
                        match_position += 1
                        if scheduled_at:
                            phase_end = max(phase_end or scheduled_at, scheduled_at + match_slot_length)
                        knockout_slot_index += 1
            else:
                bracket_size = _next_power_of_two(len(bucket_entries))
                padded = bucket_entries + [
                    {"label": f"Riposo {index + 1}", "rank": 999}
                    for index in range(max(bracket_size - len(bucket_entries), 0))
                ]
                round_entries = padded
                round_size = bracket_size
                round_order = 1
                stop_after_first_round = knockout_progression == "single_round"

                while round_size >= 2:
                    pairs = _pair_seed_entries(round_entries)
                    round_name = f"{bucket_name} · {_knockout_round_name(round_size)}" if bucket_name != "Tabellone principale" else _knockout_round_name(round_size)
                    winners: list[dict[str, Any]] = []
                    for pair_index, (home_entry, away_entry) in enumerate(pairs):
                        home_label = home_entry["label"]
                        away_label = away_entry["label"] if away_entry else "Bye"
                        home_team_id = home_entry.get("tournament_team_id")
                        away_team_id = away_entry.get("tournament_team_id") if away_entry else None
                        lane = knockout_lanes[knockout_slot_index % len(knockout_lanes)]
                        scheduled_at = phase_start + (match_slot_length * (knockout_slot_index // len(knockout_lanes))) if phase_start else None

                        match = Match(
                            phase_id=phase.id,
                            group_id=None,
                            bracket_round=round_name,
                            bracket_position=match_position,
                            bracket_round_order=round_order,
                            home_team_id=home_team_id if away_label != "Bye" else home_team_id,
                            away_team_id=away_team_id if away_label != "Bye" else None,
                            scheduled_at=scheduled_at,
                            field_name=lane.get("field_name"),
                            field_number=lane.get("field_number"),
                            status=MatchStatus.SCHEDULED,
                            notes=None if home_team_id and away_team_id else encode_seed_note(home_label, away_label),
                        )
                        db.add(match)
                        created_knockout_matches.append(match)
                        total_created_matches += 1
                        match_position += 1
                        if scheduled_at:
                            phase_end = max(phase_end or scheduled_at, scheduled_at + match_slot_length)
                        knockout_slot_index += 1
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
        _assign_cross_group_referees(
            created_knockout_matches,
            {"all": [team.id for team in participants]},
            participants,
        )

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
            selectinload(TournamentAgeGroup.tournament_teams).selectinload(TournamentTeam.team),
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
    match_slot_length = _slot_delta(age_group)
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
            entry_cursor = 0
            slot_labels_by_group: dict[str, list[str]] = {}
            phase_group_team_ids: dict[str, list[str]] = {}
            phase_group_name_to_id: dict[str, str] = {}
            created_group_matches: list[Match] = []
            phase_lane_slot_counters: dict[tuple[str | None, int | None], int] = defaultdict(int)
            grouped_entries = _distribute_entries_across_groups(current_entries, group_sizes)

            for group_index, group_size in enumerate(group_sizes):
                group_name = _group_name(group_index)
                group = Group(phase_id=phase.id, name=group_name, group_order=group_index)
                db.add(group)
                await db.flush()
                groups.append(group)
                phase_group_name_to_id[group_name] = group.id

                group_entries = grouped_entries[group_index] if group_index < len(grouped_entries) else current_entries[entry_cursor: entry_cursor + group_size]
                entry_cursor += group_size
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

                lanes = _group_lanes(age_group, phase_config, group_name, group_index, len(group_sizes)) or [{"field_name": None, "field_number": None}]
                rounds = _group_stage_rounds(group_entries, phase_config)
                match_index = 0

                for round_pairs in rounds:
                    for chunk_start in range(0, len(round_pairs), len(lanes)):
                        round_chunk = round_pairs[chunk_start: chunk_start + len(lanes)]
                        chunk_lanes = [lanes[lane_index % len(lanes)] for lane_index in range(len(round_chunk))]
                        slot_index = max(phase_lane_slot_counters[_lane_key(lane)] for lane in chunk_lanes) if chunk_lanes else 0
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
                                field_name=lane.get("field_name"),
                                field_number=lane.get("field_number"),
                                status=MatchStatus.SCHEDULED,
                                notes=None if home_entry.get("tournament_team_id") and away_entry.get("tournament_team_id") else encode_seed_note(
                                    home_entry["label"],
                                    away_entry["label"],
                                ),
                                bracket_position=match_index + 1,
                            )
                            db.add(match)
                            created_group_matches.append(match)
                            total_created_matches += 1
                            match_index += 1
                            if slot_time:
                                phase_end = max(phase_end or slot_time, slot_time + match_slot_length)
                            phase_lane_slot_counters[lane_counter_key] = slot_index + 1

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
            carry_matches: list[tuple[str, list[dict[str, Any]]]] = []
            for rank in ordered_ranks:
                carry_matches.append((f"Piazzamento {_ordinal_it(rank)}", buckets[rank]))
        elif bracket_mode == "group_blocks":
            carry_matches = _build_group_block_buckets(current_entries)
        else:
            carry_matches = [(_phase_bucket_name(phase_config), current_entries)]

        next_entries: list[dict[str, Any]] = []
        knockout_winner_entries: list[dict[str, Any]] = []
        knockout_loser_entries: list[dict[str, Any]] = []
        match_position = 1
        knockout_lanes = _knockout_lanes(age_group, phase_config) or [{"field_name": None, "field_number": None}]
        knockout_slot_index = 0
        created_knockout_matches: list[Match] = []
        knockout_progression = (phase.seeding_source or {}).get("knockout_progression", "full_bracket")

        for bucket_name, bucket_entries in carry_matches:
            if not bucket_entries:
                continue
            if bracket_mode == "group_blocks":
                block_rounds = _build_knockout_block_rounds(bucket_name, bucket_entries)
                for round_order, (round_name, pairs, _) in enumerate(block_rounds, start=1):
                    for pair_index, (home_entry, away_entry) in enumerate(pairs):
                        home_label = home_entry["label"]
                        away_label = away_entry["label"] if away_entry else "Bye"
                        home_team_id = home_entry.get("tournament_team_id")
                        away_team_id = away_entry.get("tournament_team_id") if away_entry else None
                        lane = knockout_lanes[knockout_slot_index % len(knockout_lanes)]
                        scheduled_at = phase_start + (match_slot_length * (knockout_slot_index // len(knockout_lanes))) if phase_start else None
                        match = Match(
                            phase_id=phase.id,
                            group_id=None,
                            bracket_round=round_name,
                            bracket_position=match_position,
                            bracket_round_order=round_order,
                            home_team_id=home_team_id if away_label != "Bye" else home_team_id,
                            away_team_id=away_team_id if away_label != "Bye" else None,
                            scheduled_at=scheduled_at,
                            field_name=lane.get("field_name"),
                            field_number=lane.get("field_number"),
                            status=MatchStatus.SCHEDULED,
                            notes=None if home_team_id and away_team_id else encode_seed_note(home_label, away_label),
                        )
                        db.add(match)
                        created_knockout_matches.append(match)
                        total_created_matches += 1
                        match_position += 1
                        if scheduled_at:
                            phase_end = max(phase_end or scheduled_at, scheduled_at + match_slot_length)
                        knockout_slot_index += 1
            else:
                bracket_size = _next_power_of_two(len(bucket_entries))
                padded = bucket_entries + [{"label": f"Riposo {index + 1}", "rank": 999} for index in range(max(bracket_size - len(bucket_entries), 0))]
                round_entries = padded
                round_size = bracket_size
                round_order = 1
                stop_after_first_round = knockout_progression == "single_round"

                while round_size >= 2:
                    pairs = _pair_seed_entries(round_entries)
                    round_name = f"{bucket_name} · {_knockout_round_name(round_size)}" if bucket_name != "Tabellone principale" else _knockout_round_name(round_size)
                    winners: list[dict[str, Any]] = []
                    for pair_index, (home_entry, away_entry) in enumerate(pairs):
                        home_label = home_entry["label"]
                        away_label = away_entry["label"] if away_entry else "Bye"
                        home_team_id = home_entry.get("tournament_team_id")
                        away_team_id = away_entry.get("tournament_team_id") if away_entry else None
                        lane = knockout_lanes[knockout_slot_index % len(knockout_lanes)]
                        scheduled_at = phase_start + (match_slot_length * (knockout_slot_index // len(knockout_lanes))) if phase_start else None
                        match = Match(
                            phase_id=phase.id,
                            group_id=None,
                            bracket_round=round_name,
                            bracket_position=match_position,
                            bracket_round_order=round_order,
                            home_team_id=home_team_id if away_label != "Bye" else home_team_id,
                            away_team_id=away_team_id if away_label != "Bye" else None,
                            scheduled_at=scheduled_at,
                            field_name=lane.get("field_name"),
                            field_number=lane.get("field_number"),
                            status=MatchStatus.SCHEDULED,
                            notes=None if home_team_id and away_team_id else encode_seed_note(home_label, away_label),
                        )
                        db.add(match)
                        created_knockout_matches.append(match)
                        total_created_matches += 1
                        match_position += 1
                        if scheduled_at:
                            phase_end = max(phase_end or scheduled_at, scheduled_at + match_slot_length)
                        knockout_slot_index += 1
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
        _assign_cross_group_referees(created_knockout_matches, {"all": [team.id for team in participants]}, participants)
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

    await _sync_tournament_dates_from_generated_program(age_group)
    await db.commit()
    await db.refresh(age_group)
    return age_group


async def _sync_tournament_dates_from_generated_program(age_group: TournamentAgeGroup) -> None:
    tournament = age_group.tournament
    if tournament is None:
        return

    phase_dates = [
        match.scheduled_at.astimezone(LOCAL_TIMEZONE).date()
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
        if phase:
            group_responses, knockout_matches, phase_date, phase_id, phase_name, phase_type = _serialize_phase_for_program(phase)
        else:
            group_responses, knockout_matches, phase_date, phase_id, phase_name, phase_type = _build_placeholder_phase_from_config(
                age_group.id,
                phase_order,
                phase_config if isinstance(phase_config, dict) else {},
                phases_config,
            )

        day_key = phase_date.isoformat() if phase_date else f"phase-{phase_order}"
        phase_days[day_key].append(ProgramPhaseResponse(
            id=phase_id,
            name=phase_name,
            phase_type=phase_type,
            phase_order=phase_order,
            is_final_phase=_is_final_phase_config(phases_config, phase_order),
            scheduled_date=phase_date,
            groups=group_responses,
            knockout_matches=knockout_matches,
        ))

    for phase in sorted(age_group.phases, key=lambda item: item.phase_order):
        if phase.phase_order <= len(phases_config):
            continue
        group_responses, knockout_matches, phase_date, phase_id, phase_name, phase_type = _serialize_phase_for_program(phase)
        day_key = phase_date.isoformat() if phase_date else f"phase-{phase.phase_order}"
        phase_days[day_key].append(ProgramPhaseResponse(
            id=phase_id,
            name=phase_name,
            phase_type=phase_type,
            phase_order=phase.phase_order,
            is_final_phase=True,
            scheduled_date=phase_date,
            groups=group_responses,
            knockout_matches=knockout_matches,
        ))

    days: list[ProgramDayResponse] = []
    for day_key, phases in sorted(phase_days.items(), key=lambda item: item[0]):
        date_value = phases[0].scheduled_date
        label = date_value.strftime("%d/%m/%Y") if date_value else "Da definire"
        days.append(ProgramDayResponse(date=date_value, label=label, phases=phases))

    expected_teams = None
    if age_group.structure_config and isinstance(age_group.structure_config, dict):
        raw_expected = age_group.structure_config.get("expected_teams")
        expected_teams = raw_expected if isinstance(raw_expected, int) else None

    return AgeGroupProgramResponse(
        age_group_id=age_group.id,
        age_group=age_group.age_group.value,
        display_name=age_group.display_name,
        participant_count=len(age_group.tournament_teams),
        expected_teams=expected_teams,
        generated=len(age_group.phases) > 0,
        days=days,
    )


def _serialize_phase_for_program(
    phase: Phase,
) -> tuple[list[ProgramGroupResponse], list[ProgramMatchResponse], date_type | None, str, str, str]:
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
            _serialize_match(match, phase.name, phase.phase_type.value, group.name)
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
        _serialize_match(match, phase.name, phase.phase_type.value, None)
        for match in sorted(
            [item for item in phase.matches if item.group_id is None],
            key=lambda item: (item.bracket_round_order or 0, item.bracket_position or 0),
        )
    ]

    scheduled_dates = [match.scheduled_at.date() for match in phase.matches if match.scheduled_at]
    phase_date = min(scheduled_dates) if scheduled_dates else None
    return group_responses, knockout_matches, phase_date, phase.id, phase.name, phase.phase_type.value


def _build_placeholder_phase_from_config(
    age_group_id: str,
    phase_order: int,
    phase_config: dict[str, Any],
    phases_config: list[dict[str, Any]],
) -> tuple[list[ProgramGroupResponse], list[ProgramMatchResponse], date_type | None, str, str, str]:
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
            group_name = _group_name(group_index)
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
        return groups, [], phase_date, phase_id, phase_name, phase_type

    return [], [], phase_date, phase_id, phase_name, phase_type


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


def _serialize_match(match: Match, phase_name: str, phase_type: str, group_name: str | None) -> ProgramMatchResponse:
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
        bracket_position=match.bracket_position,
        scheduled_at=match.scheduled_at,
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
    )
