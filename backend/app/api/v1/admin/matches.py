from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.deps import require_editor, require_scorer, ensure_match_access
from app.models.match import Match, MatchStatus
from app.models.phase import Phase
from app.services.program_builder import decode_seed_note, seed_next_phases_from_standings
from app.models.team import TournamentTeam
from app.models.tournament import TournamentAgeGroup
from app.models.user import User, UserRole
from app.models.user_tournament_assignment import UserTournamentAssignment
from app.schemas.match import MatchCreate, MatchUpdate, MatchResponse, MatchScheduleUpdate, ScoreEntry, BulkGroupScheduleUpdate, TodayMatchItem

router = APIRouter()


def _clear_match_result_data(match: Match) -> None:
    match.home_score = None
    match.away_score = None
    match.home_tries = None
    match.away_tries = None
    match.status = MatchStatus.SCHEDULED
    match.result_entered_by = None
    match.result_entered_at = None


def _round_matches(phase_matches: list[Match], round_order: int) -> list[Match]:
    return sorted(
        [match for match in phase_matches if match.bracket_round_order == round_order],
        key=lambda item: ((item.bracket_position or 0), item.id),
    )


def _round_index(phase_matches: list[Match], match: Match) -> int | None:
    if match.bracket_round_order is None:
        return None
    current_round_matches = _round_matches(phase_matches, match.bracket_round_order)
    for index, item in enumerate(current_round_matches):
        if item.id == match.id:
            return index
    return None


def _source_match_labels(phase_matches: list[Match], match: Match) -> set[str]:
    labels: set[str] = set()
    if match.bracket_round:
        labels.add(match.bracket_round)
    round_index = _round_index(phase_matches, match)
    if match.bracket_round and round_index is not None:
        labels.add(f"{match.bracket_round} {round_index + 1}")
    return labels


def _apply_seed_reference(match: Match, labels: set[str], team_id: str | None) -> bool:
    seed_home, seed_away, _ = decode_seed_note(match.notes)
    changed = False
    if seed_home in labels and match.home_team_id != team_id:
        match.home_team_id = team_id
        changed = True
    if seed_away in labels and match.away_team_id != team_id:
        match.away_team_id = team_id
        changed = True
    return changed


def _propagate_knockout_outcomes(
    phase_matches: list[Match],
    source_match: Match,
    winner_team_id: str | None,
    loser_team_id: str | None,
) -> None:
    if source_match.bracket_round_order is None:
        return

    source_labels = _source_match_labels(phase_matches, source_match)
    if not source_labels:
        return

    winner_labels = {f"Vincente {label}" for label in source_labels}
    loser_labels = {f"Perdente {label}" for label in source_labels}

    future_matches = sorted(
        [
            match
            for match in phase_matches
            if match.id != source_match.id
            and (match.bracket_round_order or 0) > (source_match.bracket_round_order or 0)
        ],
        key=lambda item: ((item.bracket_round_order or 0), (item.bracket_position or 0), item.id),
    )

    for future_match in future_matches:
        changed = False
        changed = _apply_seed_reference(future_match, winner_labels, winner_team_id) or changed
        changed = _apply_seed_reference(future_match, loser_labels, loser_team_id) or changed
        if not changed:
            continue
        if _match_has_locked_result(future_match):
            _clear_match_result_data(future_match)
        _propagate_knockout_outcomes(phase_matches, future_match, None, None)


def _clear_knockout_descendants(phase_matches: list[Match], source_match: Match) -> None:
    _propagate_knockout_outcomes(phase_matches, source_match, None, None)


def _propagate_knockout_result(phase_matches: list[Match], source_match: Match, winner_team_id: str | None, loser_team_id: str | None) -> None:
    _propagate_knockout_outcomes(phase_matches, source_match, winner_team_id, loser_team_id)


def _match_has_locked_result(match: Match) -> bool:
    return (
        match.home_score is not None
        or match.away_score is not None
        or match.home_tries is not None
        or match.away_tries is not None
        or match.status == MatchStatus.COMPLETED
    )


def _match_slot_duration(match: Match) -> timedelta:
    age_group = match.phase.tournament_age_group if match.phase else None
    structure = age_group.structure_config if age_group and isinstance(age_group.structure_config, dict) else {}
    schedule = structure.get("schedule", {}) if isinstance(structure.get("schedule"), dict) else {}
    duration = int(match.match_duration_minutes or schedule.get("match_duration_minutes") or 12)
    interval = int(schedule.get("interval_minutes") or 8)
    return timedelta(minutes=max(duration, 1) + max(interval, 0))


def _match_end(match: Match) -> datetime | None:
    if not match.scheduled_at:
        return None
    if match.actual_end_at and match.actual_end_at > match.scheduled_at:
        return match.actual_end_at
    return match.scheduled_at + _match_slot_duration(match)


async def _normalize_field_schedule(
    db: AsyncSession,
    *,
    field_name: str | None,
    field_number: int | None,
    anchor_match_id: str | None = None,
) -> None:
    if not field_name:
        return

    result = await db.execute(
        select(Match)
        .options(selectinload(Match.phase).selectinload(Phase.tournament_age_group))
        .where(
            Match.field_name == field_name,
            Match.field_number == field_number,
            Match.scheduled_at.is_not(None),
        )
        .order_by(Match.scheduled_at.asc(), Match.id.asc())
    )
    matches = result.scalars().all()
    if not matches:
        return

    cursor_end: datetime | None = None
    for match in matches:
        if not match.scheduled_at:
            continue

        match_end = _match_end(match)
        if match_end is None:
            continue

        if cursor_end is None:
            cursor_end = match_end
            continue

        if match.scheduled_at >= cursor_end:
            cursor_end = match_end
            continue

        if _match_has_locked_result(match):
            cursor_end = max(cursor_end, match_end)
            continue

        shift = cursor_end - match.scheduled_at
        match.scheduled_at = cursor_end
        if match.actual_end_at:
            match.actual_end_at = match.actual_end_at + shift
        shifted_end = _match_end(match)
        cursor_end = shifted_end or cursor_end


@router.get("/matches/today", response_model=list[TodayMatchItem])
async def get_today_matches(
    user: User = Depends(require_scorer),
    db: AsyncSession = Depends(get_db),
):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    query = (
        select(Match)
        .options(
            selectinload(Match.phase)
            .selectinload(Phase.tournament_age_group)
            .selectinload(TournamentAgeGroup.tournament),
            selectinload(Match.home_team).selectinload(TournamentTeam.team),
            selectinload(Match.away_team).selectinload(TournamentTeam.team),
        )
        .where(
            Match.scheduled_at >= today_start,
            Match.scheduled_at < today_end,
        )
        .order_by(
            Match.field_number.asc().nulls_last(),
            Match.scheduled_at.asc().nulls_last(),
        )
    )

    if user.role == UserRole.SCORE_KEEPER:
        query = (
            query
            .join(Phase, Phase.id == Match.phase_id)
            .join(TournamentAgeGroup, TournamentAgeGroup.id == Phase.tournament_age_group_id)
            .join(UserTournamentAssignment, UserTournamentAssignment.tournament_id == TournamentAgeGroup.tournament_id)
            .where(
                UserTournamentAssignment.user_id == user.id,
                (UserTournamentAssignment.age_group_id.is_(None)) | (UserTournamentAssignment.age_group_id == TournamentAgeGroup.id),
            )
        )

    result = await db.execute(query)
    matches = result.scalars().unique().all()

    items = []
    for match in matches:
        age_group = match.phase.tournament_age_group if match.phase else None
        tournament = age_group.tournament if age_group else None
        items.append(TodayMatchItem(
            id=match.id,
            tournament_id=tournament.id if tournament else "",
            tournament_name=tournament.name if tournament else "",
            age_group_id=age_group.id if age_group else "",
            age_group_name=(age_group.display_name or age_group.age_group) if age_group else "",
            scheduled_at=match.scheduled_at,
            field_name=match.field_name,
            field_number=match.field_number,
            status=match.status,
            home_label=match.home_team.team.name if match.home_team and match.home_team.team else None,
            away_label=match.away_team.team.name if match.away_team and match.away_team.team else None,
            home_score=match.home_score,
            away_score=match.away_score,
            home_tries=match.home_tries,
            away_tries=match.away_tries,
        ))

    return items


@router.post("/matches", response_model=MatchResponse, status_code=201)
async def create_match(
    body: MatchCreate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    payload = body.model_dump()
    payload["original_scheduled_at"] = payload.get("scheduled_at")
    match = Match(**payload)
    db.add(match)
    await db.commit()
    await db.refresh(match)
    return MatchResponse.from_match(match)


@router.put("/matches/{match_id}", response_model=MatchResponse)
async def update_match(
    match_id: str,
    body: MatchUpdate,
    user: User = Depends(require_scorer),
    db: AsyncSession = Depends(get_db),
):
    await ensure_match_access(user, match_id, db)
    result = await db.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(match, k, v)
    await db.commit()
    await db.refresh(match)
    return MatchResponse.from_match(match)


@router.post("/matches/{match_id}/schedule", response_model=MatchResponse)
async def update_match_schedule(
    match_id: str,
    body: MatchScheduleUpdate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Match)
        .options(selectinload(Match.phase).selectinload(Phase.tournament_age_group))
        .where(Match.id == match_id)
    )
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    previous_scheduled_at = match.scheduled_at
    previous_field_name = match.field_name
    previous_field_number = match.field_number

    if match.original_scheduled_at is None:
        match.original_scheduled_at = previous_scheduled_at

    next_scheduled_at = body.scheduled_at
    next_actual_end_at = body.actual_end_at
    if body.delay_minutes is not None:
        # Automatic delay mode: offset from the current scheduled time
        if previous_scheduled_at is None:
            raise HTTPException(status_code=422, detail="Impossibile applicare un ritardo senza un orario già definito")
        next_scheduled_at = previous_scheduled_at + timedelta(minutes=body.delay_minutes)
        if previous_scheduled_at and match.actual_end_at:
            duration_delta = match.actual_end_at - previous_scheduled_at
            next_actual_end_at = next_scheduled_at + duration_delta
    elif body.scheduled_at is not None and body.scheduled_at != previous_scheduled_at:
        # Manual reschedule: reset original_scheduled_at so no delay is shown
        match.original_scheduled_at = body.scheduled_at

    match.scheduled_at = next_scheduled_at
    match.actual_end_at = next_actual_end_at
    match.match_duration_minutes = body.match_duration_minutes
    match.field_name = body.field_name
    match.field_number = body.field_number
    match.referee = body.referee
    if "notes" in body.model_fields_set:
        match.notes = body.notes

    if (
        body.propagate_delay
        and previous_scheduled_at
        and next_scheduled_at
        and next_scheduled_at != previous_scheduled_at
        and previous_field_name
    ):
        delay = next_scheduled_at - previous_scheduled_at
        future_matches_result = await db.execute(
            select(Match)
            .where(
                Match.id != match.id,
                Match.field_name == previous_field_name,
                Match.field_number == previous_field_number,
                Match.scheduled_at.is_not(None),
                Match.scheduled_at > previous_scheduled_at,
            )
            .order_by(Match.scheduled_at)
        )
        future_matches = future_matches_result.scalars().all()
        for future_match in future_matches:
            if future_match.scheduled_at:
                future_match.scheduled_at = future_match.scheduled_at + delay

    await _normalize_field_schedule(
        db,
        field_name=match.field_name,
        field_number=match.field_number,
        anchor_match_id=match.id,
    )
    if previous_field_name and (previous_field_name != match.field_name or previous_field_number != match.field_number):
        await _normalize_field_schedule(
            db,
            field_name=previous_field_name,
            field_number=previous_field_number,
        )

    await db.commit()
    await db.refresh(match)
    return MatchResponse.from_match(match)


@router.post("/matches/{match_id}/score", response_model=MatchResponse)
async def enter_score(
    match_id: str,
    body: ScoreEntry,
    user: User = Depends(require_scorer),
    db: AsyncSession = Depends(get_db),
):
    await ensure_match_access(user, match_id, db)
    result = await db.execute(
        select(Match)
        .options(selectinload(Match.phase).selectinload(Phase.matches))
        .where(Match.id == match_id)
    )
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    phase_matches = list(match.phase.matches) if match.phase else []

    if body.clear_result:
        _clear_match_result_data(match)
        match.status = body.status or MatchStatus.SCHEDULED
        if match.group_id is None:
            _clear_knockout_descendants(phase_matches, match)
    else:
        if match.home_team_id is None or match.away_team_id is None:
            raise HTTPException(status_code=422, detail="Non è possibile registrare un risultato per una partita senza squadre assegnate")
        if match.status == MatchStatus.CANCELLED:
            raise HTTPException(status_code=422, detail="Non è possibile registrare un risultato per una partita annullata")
        if body.home_score is None or body.away_score is None:
            raise HTTPException(status_code=422, detail="Inserisci entrambi i punteggi")
        if body.home_score < 0 or body.away_score < 0:
            raise HTTPException(status_code=422, detail="I punteggi non possono essere negativi")
        if body.home_tries is not None and body.home_tries < 0:
            raise HTTPException(status_code=422, detail="Le mete casa non possono essere negative")
        if body.away_tries is not None and body.away_tries < 0:
            raise HTTPException(status_code=422, detail="Le mete ospite non possono essere negative")

        match.home_score = body.home_score
        match.away_score = body.away_score
        match.home_tries = body.home_tries
        match.away_tries = body.away_tries
        match.status = body.status or MatchStatus.COMPLETED
        match.result_entered_by = user.id
        match.result_entered_at = datetime.now(timezone.utc)

        if match.group_id is None:
            winner_team_id: str | None = None
            loser_team_id: str | None = None
            if body.home_score > body.away_score:
                winner_team_id = match.home_team_id
                loser_team_id = match.away_team_id
            elif body.away_score > body.home_score:
                winner_team_id = match.away_team_id
                loser_team_id = match.home_team_id
            _propagate_knockout_result(phase_matches, match, winner_team_id, loser_team_id)

    # Capture before commit — ORM attributes expire after db.commit() and
    # cannot be lazily loaded in an async session.
    is_group_match = match.group_id is not None
    phase_id_for_seed = match.phase_id
    age_group_id_for_seed = match.phase.tournament_age_group_id if match.phase else None
    final_status = match.status

    await db.commit()

    # When the last group match in a phase is completed, resolve seed
    # placeholders ("1a Girone A" etc.) in the next knockout phase.
    if (
        not body.clear_result
        and is_group_match
        and final_status == MatchStatus.COMPLETED
        and age_group_id_for_seed
    ):
        remaining_result = await db.execute(
            select(Match.id).where(
                Match.phase_id == phase_id_for_seed,
                Match.group_id.is_not(None),
                Match.status.notin_([MatchStatus.COMPLETED, MatchStatus.CANCELLED]),
            )
        )
        if not remaining_result.scalars().all():
            await seed_next_phases_from_standings(age_group_id_for_seed, db)

    await db.refresh(match)
    return MatchResponse.from_match(match)


@router.post("/groups/{group_id}/bulk-schedule")
async def bulk_schedule_group_matches(
    group_id: str,
    body: BulkGroupScheduleUpdate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    if body.step_minutes is not None and body.step_minutes < 0:
        raise HTTPException(status_code=422, detail="L'intervallo non può essere negativo")

    result = await db.execute(
        select(Match)
        .where(Match.group_id == group_id)
        .order_by(Match.scheduled_at.asc().nulls_last(), Match.bracket_position.asc())
    )
    matches = result.scalars().all()
    if not matches:
        raise HTTPException(status_code=404, detail="Nessuna partita trovata per questo girone")

    for index, match in enumerate(matches):
        if body.start_at:
            step = body.step_minutes or 0
            match.scheduled_at = body.start_at + timedelta(minutes=step * index)
        if body.field_name is not None:
            match.field_name = body.field_name
            match.field_number = body.field_number
        if body.referee is not None:
            match.referee = body.referee or None

    await db.commit()
    return {"updated": len(matches)}


@router.post("/phases/{phase_id}/bulk-schedule")
async def bulk_schedule_phase_matches(
    phase_id: str,
    body: BulkGroupScheduleUpdate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    if body.step_minutes is not None and body.step_minutes < 0:
        raise HTTPException(status_code=422, detail="L'intervallo non può essere negativo")

    result = await db.execute(
        select(Match)
        .where(Match.phase_id == phase_id, Match.group_id.is_(None))
        .order_by(Match.bracket_round_order.asc().nulls_last(), Match.bracket_position.asc())
    )
    matches = result.scalars().all()
    if not matches:
        raise HTTPException(status_code=404, detail="Nessuna partita trovata per questa fase finale")

    for index, match in enumerate(matches):
        if body.start_at:
            step = body.step_minutes or 0
            match.scheduled_at = body.start_at + timedelta(minutes=step * index)
        if body.field_name is not None:
            match.field_name = body.field_name
            match.field_number = body.field_number
        if body.referee is not None:
            match.referee = body.referee or None

    await db.commit()
    return {"updated": len(matches)}


@router.delete("/matches/{match_id}", status_code=204)
async def delete_match(
    match_id: str,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")
    await db.delete(match)
    await db.commit()
