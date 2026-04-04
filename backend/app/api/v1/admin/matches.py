from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import require_editor, require_scorer, ensure_match_access
from app.models.match import Match, MatchStatus
from app.models.user import User
from app.schemas.match import MatchCreate, MatchUpdate, MatchResponse, MatchScheduleUpdate, ScoreEntry, BulkGroupScheduleUpdate

router = APIRouter()


@router.post("/matches", response_model=MatchResponse, status_code=201)
async def create_match(
    body: MatchCreate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    match = Match(**body.model_dump())
    db.add(match)
    await db.commit()
    await db.refresh(match)
    return match


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
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(match, k, v)
    await db.commit()
    await db.refresh(match)
    return match


@router.post("/matches/{match_id}/schedule", response_model=MatchResponse)
async def update_match_schedule(
    match_id: str,
    body: MatchScheduleUpdate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    previous_scheduled_at = match.scheduled_at
    previous_field_name = match.field_name
    previous_field_number = match.field_number

    next_scheduled_at = body.scheduled_at
    next_actual_end_at = body.actual_end_at
    if body.delay_minutes is not None:
        if previous_scheduled_at is None:
            raise HTTPException(status_code=422, detail="Impossibile applicare un ritardo senza un orario già definito")
        next_scheduled_at = previous_scheduled_at + timedelta(minutes=body.delay_minutes)
        if previous_scheduled_at and match.actual_end_at:
            duration_delta = match.actual_end_at - previous_scheduled_at
            next_actual_end_at = next_scheduled_at + duration_delta

    match.scheduled_at = next_scheduled_at
    match.actual_end_at = next_actual_end_at
    match.field_name = body.field_name
    match.field_number = body.field_number
    match.referee = body.referee
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

    await db.commit()
    await db.refresh(match)
    return match


@router.post("/matches/{match_id}/score", response_model=MatchResponse)
async def enter_score(
    match_id: str,
    body: ScoreEntry,
    user: User = Depends(require_scorer),
    db: AsyncSession = Depends(get_db),
):
    await ensure_match_access(user, match_id, db)
    result = await db.execute(select(Match).where(Match.id == match_id))
    match = result.scalar_one_or_none()
    if not match:
        raise HTTPException(status_code=404, detail="Match not found")

    if body.clear_result:
        match.home_score = None
        match.away_score = None
        match.home_tries = None
        match.away_tries = None
        match.status = body.status or MatchStatus.SCHEDULED
        match.result_entered_by = None
        match.result_entered_at = None
    else:
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

    await db.commit()
    await db.refresh(match)
    return match


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
