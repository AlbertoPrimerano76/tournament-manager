import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from datetime import date

logger = logging.getLogger(__name__)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.deps import require_creator, require_editor, require_admin, require_scorer, ensure_tournament_access, ensure_age_group_access, get_assigned_age_group_ids
from app.models.tournament import Tournament, TournamentAgeGroup
from app.models.organization import Organization
from app.models.team import TournamentTeam
from app.models.team import Team
from app.models.phase import Group, GroupTeam, Phase
from app.models.match import Match
from app.models.structure_template import StructureTemplate
from app.models.tournament_template import TournamentTemplate
from app.models.user import User, UserRole
from app.schemas.tournament import (
    TournamentCreate, TournamentUpdate, TournamentResponse,
    AgeGroupCreate, AgeGroupUpdate, AgeGroupResponse,
)
from app.schemas.structure import (
    AgeGroupStructureUpdate, StructureTemplateCreate, StructureTemplateResponse,
    TournamentParticipantResponse,
)
from app.schemas.tournament_template import TournamentTemplateCreate, TournamentTemplateResponse
from app.schemas.program import AgeGroupProgramResponse, GroupTeamMoveRequest, MatchParticipantsUpdate
from app.services.program_builder import generate_age_group_program, get_age_group_program, regenerate_age_group_from_phase, reset_and_generate_age_group_program, reset_age_group_program
from app.services.program_pdf import build_age_group_program_pdf, build_full_tournament_pdf, build_tournament_campo_calendar_pdf
from app.services.program_excel import build_age_group_program_excel, build_full_tournament_excel, build_tournament_campo_calendar_excel

router = APIRouter()


def _slugify(value: str) -> str:
    return (
        value.lower()
        .replace("à", "a")
        .replace("á", "a")
        .replace("â", "a")
        .replace("è", "e")
        .replace("é", "e")
        .replace("ê", "e")
        .replace("ì", "i")
        .replace("í", "i")
        .replace("ò", "o")
        .replace("ó", "o")
        .replace("ù", "u")
        .replace("ú", "u")
    )


def _slugify_compact(value: str) -> str:
    sanitized = "".join(char if char.isalnum() else "-" for char in _slugify(value))
    while "--" in sanitized:
        sanitized = sanitized.replace("--", "-")
    return sanitized.strip("-")


async def _build_tournament_slug(
    db: AsyncSession,
    *,
    organization_id: str,
    name: str,
    event_type: str,
    year: int,
    start_date: date | None,
    current_tournament_id: str | None = None,
) -> str:
    organization = await db.get(Organization, organization_id)
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")

    base_name = _slugify_compact(name)
    org_part = _slugify_compact(organization.slug or organization.name)
    suffix = (
        start_date.isoformat()
        if event_type == "GATHERING" and start_date
        else str(year)
    )
    candidate = "-".join(part for part in [org_part, base_name, suffix] if part)
    if not candidate:
        raise HTTPException(status_code=422, detail="Impossibile generare lo slug del torneo")

    unique_slug = candidate
    counter = 2
    while True:
        existing = (
            await db.execute(select(Tournament.id).where(Tournament.slug == unique_slug))
        ).scalar_one_or_none()
        if not existing or existing == current_tournament_id:
            return unique_slug
        unique_slug = f"{candidate}-{counter}"
        counter += 1


def _serialize_tournament(tournament: Tournament) -> TournamentResponse:
    organization = tournament.organization
    return TournamentResponse(
        id=tournament.id,
        organization_id=tournament.organization_id,
        organization_name=organization.name if organization else None,
        organization_slug=organization.slug if organization else None,
        organization_logo_url=organization.logo_url if organization else None,
        name=tournament.name,
        event_type=tournament.event_type,
        year=tournament.year,
        slug=tournament.slug,
        edition=tournament.edition,
        start_date=tournament.start_date,
        end_date=tournament.end_date,
        location=tournament.location,
        venue_map_url=tournament.venue_map_url,
        logo_url=tournament.logo_url,
        theme_primary_color=tournament.theme_primary_color,
        theme_accent_color=tournament.theme_accent_color,
        timezone=tournament.timezone,
        is_published=tournament.is_published,
        sponsor_images=tournament.sponsor_images or [],
        previous_slugs=tournament.previous_slugs or [],
        description=tournament.description,
    )


@router.get("/tournaments", response_model=list[TournamentResponse])
async def list_all_tournaments(
    user: User = Depends(require_scorer),
    db: AsyncSession = Depends(get_db),
):
    query = select(Tournament).options(selectinload(Tournament.organization))
    if user.role == UserRole.SCORE_KEEPER:
        from app.models.user_tournament_assignment import UserTournamentAssignment
        query = query.join(UserTournamentAssignment, UserTournamentAssignment.tournament_id == Tournament.id).where(
            UserTournamentAssignment.user_id == user.id
        )
    result = await db.execute(query.order_by(Tournament.organization_id, Tournament.start_date.desc(), Tournament.year.desc(), Tournament.name))
    return [_serialize_tournament(tournament) for tournament in result.scalars().unique().all()]


@router.post("/tournaments", response_model=TournamentResponse, status_code=201)
async def create_tournament(
    body: TournamentCreate,
    user: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    payload = body.model_dump()
    payload["slug"] = await _build_tournament_slug(
        db,
        organization_id=payload["organization_id"],
        name=payload["name"],
        event_type=payload.get("event_type") or "TOURNAMENT",
        year=payload["year"],
        start_date=payload.get("start_date"),
    )
    t = Tournament(**payload)
    db.add(t)
    await db.commit()
    result = await db.execute(
        select(Tournament)
        .options(selectinload(Tournament.organization))
        .where(Tournament.id == t.id)
    )
    return _serialize_tournament(result.scalar_one())


@router.put("/tournaments/{tournament_id}", response_model=TournamentResponse)
async def update_tournament(
    tournament_id: str,
    body: TournamentUpdate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Tournament)
        .options(selectinload(Tournament.organization))
        .where(Tournament.id == tournament_id)
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")

    payload = body.model_dump(exclude_unset=True)
    merged_organization_id = payload.get("organization_id", t.organization_id)
    merged_name = payload.get("name", t.name)
    merged_event_type = payload.get("event_type", t.event_type)
    merged_year = payload.get("year", t.year)
    merged_start_date = payload.get("start_date", t.start_date)
    current_slug = t.slug
    payload["slug"] = await _build_tournament_slug(
        db,
        organization_id=merged_organization_id,
        name=merged_name,
        event_type=merged_event_type,
        year=merged_year,
        start_date=merged_start_date,
        current_tournament_id=t.id,
    )
    if payload["slug"] != current_slug:
        previous_slugs = [slug for slug in (t.previous_slugs or []) if slug != payload["slug"]]
        if current_slug and current_slug not in previous_slugs:
            previous_slugs.append(current_slug)
        payload["previous_slugs"] = previous_slugs

    for k, v in payload.items():
        setattr(t, k, v)

    await db.commit()
    result = await db.execute(
        select(Tournament)
        .options(selectinload(Tournament.organization))
        .where(Tournament.id == t.id)
    )
    return _serialize_tournament(result.scalar_one())


@router.delete("/tournaments/{tournament_id}", status_code=204)
async def delete_tournament(
    tournament_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tournament).where(Tournament.id == tournament_id))
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Tournament not found")
    await db.delete(t)
    await db.commit()


@router.post("/tournaments/{tournament_id}/reset-results")
async def reset_tournament_results(
    tournament_id: str,
    user: User = Depends(require_creator),
    db: AsyncSession = Depends(get_db),
):
    await ensure_tournament_access(user, tournament_id, db)
    tournament_result = await db.execute(
        select(Tournament)
        .options(selectinload(Tournament.age_groups).selectinload(TournamentAgeGroup.phases))
        .where(Tournament.id == tournament_id)
    )
    tournament = tournament_result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    reset_age_group_ids: list[str] = []
    for age_group in tournament.age_groups:
        if not age_group.phases:
            continue
        await reset_and_generate_age_group_program(age_group.id, db)
        reset_age_group_ids.append(age_group.id)

    return {
        "reset_age_groups": len(reset_age_group_ids),
        "age_group_ids": reset_age_group_ids,
    }


@router.post("/age-groups", response_model=AgeGroupResponse, status_code=201)
async def create_age_group(
    body: AgeGroupCreate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    existing_result = await db.execute(
        select(TournamentAgeGroup).where(
            TournamentAgeGroup.tournament_id == body.tournament_id,
            TournamentAgeGroup.age_group == body.age_group,
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Categoria già presente nel torneo")

    ag = TournamentAgeGroup(**body.model_dump())
    db.add(ag)
    await db.commit()
    await db.refresh(ag)
    return ag


@router.put("/age-groups/{ag_id}", response_model=AgeGroupResponse)
async def update_age_group(
    ag_id: str,
    body: AgeGroupUpdate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TournamentAgeGroup).where(TournamentAgeGroup.id == ag_id))
    ag = result.scalar_one_or_none()
    if not ag:
        raise HTTPException(status_code=404, detail="Age group not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(ag, k, v)
    await db.commit()
    await db.refresh(ag)
    return ag


@router.get("/tournaments/{tournament_id}/age-groups", response_model=list[AgeGroupResponse])
async def list_tournament_age_groups(
    tournament_id: str,
    user: User = Depends(require_scorer),
    db: AsyncSession = Depends(get_db),
):
    await ensure_tournament_access(user, tournament_id, db)
    query = select(TournamentAgeGroup).where(TournamentAgeGroup.tournament_id == tournament_id)
    if user.role == UserRole.SCORE_KEEPER:
        assigned_age_group_ids = await get_assigned_age_group_ids(user, db)
        if assigned_age_group_ids:
            query = query.where(TournamentAgeGroup.id.in_(assigned_age_group_ids))
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/age-groups/{ag_id}/teams", response_model=list[TournamentParticipantResponse])
async def list_age_group_teams(
    ag_id: str,
    user: User = Depends(require_scorer),
    db: AsyncSession = Depends(get_db),
):
    await ensure_age_group_access(user, ag_id, db)
    result = await db.execute(
        select(TournamentTeam, Team, Organization)
        .join(Team, Team.id == TournamentTeam.team_id)
        .join(Organization, Organization.id == Team.organization_id)
        .where(TournamentTeam.tournament_age_group_id == ag_id)
        .order_by(Team.name)
    )
    rows = result.all()
    return [
        TournamentParticipantResponse(
            id=tt.id,
            tournament_age_group_id=tt.tournament_age_group_id,
            team_id=team.id,
            team_name=team.name,
            team_short_name=team.short_name,
            organization_id=organization.id,
            organization_name=organization.name,
            tournament_id=team.tournament_id,
            is_tournament_team=team.tournament_id is not None,
            team_logo_url=team.logo_url or organization.logo_url,
            city=team.city or organization.city,
            contact_name=tt.contact_name,
            contact_email=tt.contact_email,
            notes=tt.notes,
        )
        for tt, team, organization in rows
    ]


@router.put("/age-groups/{ag_id}/structure", response_model=AgeGroupResponse)
async def update_age_group_structure(
    ag_id: str,
    body: AgeGroupStructureUpdate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TournamentAgeGroup).where(TournamentAgeGroup.id == ag_id))
    ag = result.scalar_one_or_none()
    if not ag:
        raise HTTPException(status_code=404, detail="Age group not found")

    ag.structure_template_name = body.structure_template_name
    ag.structure_config = body.structure_config
    await db.commit()
    await db.refresh(ag)
    return ag


@router.post("/age-groups/{ag_id}/generate-program", response_model=AgeGroupProgramResponse)
async def generate_program_for_age_group(
    ag_id: str,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    try:
        await generate_age_group_program(ag_id, db)
    except ValueError as exc:
        detail = str(exc)
        if detail == "Age group not found":
            raise HTTPException(status_code=404, detail=detail)
        raise HTTPException(status_code=422, detail=detail)

    program = await get_age_group_program(ag_id, db)
    if not program:
        raise HTTPException(status_code=404, detail="Age group not found")
    return program


@router.post("/age-groups/{ag_id}/reset-and-generate-program", response_model=AgeGroupProgramResponse)
async def reset_and_generate_program_for_age_group(
    ag_id: str,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    try:
        await reset_and_generate_age_group_program(ag_id, db)
    except ValueError as exc:
        detail = str(exc)
        if detail == "Age group not found":
            raise HTTPException(status_code=404, detail=detail)
        raise HTTPException(status_code=422, detail=detail)

    program = await get_age_group_program(ag_id, db)
    if not program:
        raise HTTPException(status_code=404, detail="Age group not found")
    return program


@router.delete("/age-groups/{ag_id}/program", status_code=204)
async def delete_program_for_age_group(
    ag_id: str,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    try:
        await reset_age_group_program(ag_id, db)
    except ValueError as exc:
        detail = str(exc)
        if detail == "Age group not found":
            raise HTTPException(status_code=404, detail=detail)
        raise HTTPException(status_code=422, detail=detail)


@router.post("/age-groups/{ag_id}/phases/{phase_order}/regenerate", response_model=AgeGroupProgramResponse)
async def regenerate_program_from_phase(
    ag_id: str,
    phase_order: int,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    try:
        await regenerate_age_group_from_phase(ag_id, phase_order, db)
    except ValueError as exc:
        detail = str(exc)
        if detail in {"Age group not found", "Phase not found"}:
            raise HTTPException(status_code=404, detail=detail)
        raise HTTPException(status_code=422, detail=detail)

    program = await get_age_group_program(ag_id, db)
    if not program:
        raise HTTPException(status_code=404, detail="Age group not found")
    return program


@router.get("/age-groups/{ag_id}/program", response_model=AgeGroupProgramResponse)
async def get_admin_age_group_program(
    ag_id: str,
    user: User = Depends(require_scorer),
    db: AsyncSession = Depends(get_db),
):
    await ensure_age_group_access(user, ag_id, db)
    program = await get_age_group_program(ag_id, db)
    if not program:
        raise HTTPException(status_code=404, detail="Age group not found")
    return program


@router.get("/age-groups/{ag_id}/program.pdf")
async def download_admin_age_group_program_pdf(
    ag_id: str,
    user: User = Depends(require_scorer),
    db: AsyncSession = Depends(get_db),
):
    await ensure_age_group_access(user, ag_id, db)
    age_group_result = await db.execute(
        select(TournamentAgeGroup)
        .options(selectinload(TournamentAgeGroup.tournament))
        .where(TournamentAgeGroup.id == ag_id)
    )
    age_group = age_group_result.scalar_one_or_none()
    if not age_group or not age_group.tournament:
        raise HTTPException(status_code=404, detail="Age group not found")

    program = await get_age_group_program(ag_id, db)
    if not program:
        raise HTTPException(status_code=404, detail="Age group not found")

    try:
        payload, filename = build_age_group_program_pdf(age_group.tournament.name, program, age_group.tournament.timezone)
    except ModuleNotFoundError as exc:
        if exc.name == "reportlab":
            raise HTTPException(status_code=503, detail="Export PDF non disponibile sul server")
        raise

    return Response(
        content=payload,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/age-groups/{ag_id}/program.xlsx")
async def download_admin_age_group_program_excel(
    ag_id: str,
    user: User = Depends(require_scorer),
    db: AsyncSession = Depends(get_db),
):
    await ensure_age_group_access(user, ag_id, db)
    age_group_result = await db.execute(
        select(TournamentAgeGroup)
        .options(
            selectinload(TournamentAgeGroup.tournament)
            .selectinload(Tournament.organization)
        )
        .where(TournamentAgeGroup.id == ag_id)
    )
    age_group = age_group_result.scalar_one_or_none()
    if not age_group or not age_group.tournament:
        raise HTTPException(status_code=404, detail="Age group not found")

    program = await get_age_group_program(ag_id, db)
    if not program:
        raise HTTPException(status_code=404, detail="Age group not found")

    t = age_group.tournament
    try:
        payload, filename = build_age_group_program_excel(
            t.name,
            program,
            t.timezone,
            organization_logo_url=t.organization.logo_url if t.organization else None,
            tournament_logo_url=t.logo_url,
        )
    except ModuleNotFoundError as exc:
        if exc.name == "openpyxl":
            raise HTTPException(status_code=503, detail="Export Excel non disponibile sul server")
        raise
    except Exception as exc:
        logger.exception("Excel generation failed for age_group %s", ag_id)
        raise HTTPException(status_code=500, detail=f"Errore generazione Excel: {type(exc).__name__}: {exc}")

    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _load_tournament_programs(tournament_id: str, user: User, db: AsyncSession):
    """Load tournament + all age groups + all programs. Returns (tournament, programs_list)."""
    t_result = await db.execute(
        select(Tournament)
        .options(selectinload(Tournament.organization))
        .where(Tournament.id == tournament_id)
    )
    tournament = t_result.scalar_one_or_none()
    if not tournament:
        raise HTTPException(status_code=404, detail="Tournament not found")

    ag_result = await db.execute(
        select(TournamentAgeGroup).where(TournamentAgeGroup.tournament_id == tournament_id)
    )
    age_groups = ag_result.scalars().all()

    programs = []
    for ag in age_groups:
        prog = await get_age_group_program(ag.id, db)
        if prog and prog.generated:
            programs.append(prog)
    return tournament, programs


@router.get("/tournaments/{tournament_id}/full-program.xlsx")
async def download_full_tournament_excel(
    tournament_id: str,
    user: User = Depends(require_scorer),
    db: AsyncSession = Depends(get_db),
):
    tournament, programs = await _load_tournament_programs(tournament_id, user, db)
    try:
        payload, filename = build_full_tournament_excel(
            tournament.name,
            programs,
            tournament.timezone,
            organization_logo_url=tournament.organization.logo_url if tournament.organization else None,
            tournament_logo_url=tournament.logo_url,
        )
    except ModuleNotFoundError as exc:
        if exc.name == "openpyxl":
            raise HTTPException(status_code=503, detail="Export Excel non disponibile sul server")
        raise
    except Exception as exc:
        logger.exception("Full tournament Excel failed for %s", tournament_id)
        raise HTTPException(status_code=500, detail=f"Errore generazione Excel: {type(exc).__name__}: {exc}")
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/tournaments/{tournament_id}/full-program.pdf")
async def download_full_tournament_pdf(
    tournament_id: str,
    user: User = Depends(require_scorer),
    db: AsyncSession = Depends(get_db),
):
    tournament, programs = await _load_tournament_programs(tournament_id, user, db)
    try:
        payload, filename = build_full_tournament_pdf(tournament.name, programs, tournament.timezone)
    except ModuleNotFoundError as exc:
        if exc.name == "reportlab":
            raise HTTPException(status_code=503, detail="Export PDF non disponibile sul server")
        raise
    except Exception as exc:
        logger.exception("Full tournament PDF failed for %s", tournament_id)
        raise HTTPException(status_code=500, detail=f"Errore generazione PDF: {type(exc).__name__}: {exc}")
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/tournaments/{tournament_id}/campo-calendar.xlsx")
async def download_campo_calendar_excel(
    tournament_id: str,
    user: User = Depends(require_scorer),
    db: AsyncSession = Depends(get_db),
):
    tournament, programs = await _load_tournament_programs(tournament_id, user, db)
    try:
        payload, filename = build_tournament_campo_calendar_excel(
            tournament.name,
            programs,
            tournament.timezone,
            organization_logo_url=tournament.organization.logo_url if tournament.organization else None,
            tournament_logo_url=tournament.logo_url,
        )
    except ModuleNotFoundError as exc:
        if exc.name == "openpyxl":
            raise HTTPException(status_code=503, detail="Export Excel non disponibile sul server")
        raise
    except Exception as exc:
        logger.exception("Campo calendar Excel failed for %s", tournament_id)
        raise HTTPException(status_code=500, detail=f"Errore generazione Excel: {type(exc).__name__}: {exc}")
    return Response(
        content=payload,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/tournaments/{tournament_id}/campo-calendar.pdf")
async def download_campo_calendar_pdf(
    tournament_id: str,
    user: User = Depends(require_scorer),
    db: AsyncSession = Depends(get_db),
):
    tournament, programs = await _load_tournament_programs(tournament_id, user, db)
    try:
        payload, filename = build_tournament_campo_calendar_pdf(tournament.name, programs, tournament.timezone)
    except ModuleNotFoundError as exc:
        if exc.name == "reportlab":
            raise HTTPException(status_code=503, detail="Export PDF non disponibile sul server")
        raise
    except Exception as exc:
        logger.exception("Campo calendar PDF failed for %s", tournament_id)
        raise HTTPException(status_code=500, detail=f"Errore generazione PDF: {type(exc).__name__}: {exc}")
    return Response(
        content=payload,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/age-groups/{ag_id}/groups/{group_id}/teams/{tournament_team_id}/move", response_model=AgeGroupProgramResponse)
async def move_group_team(
    ag_id: str,
    group_id: str,
    tournament_team_id: str,
    body: GroupTeamMoveRequest,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    age_group_result = await db.execute(select(TournamentAgeGroup).where(TournamentAgeGroup.id == ag_id))
    age_group = age_group_result.scalar_one_or_none()
    if not age_group:
        raise HTTPException(status_code=404, detail="Age group not found")

    source_group_result = await db.execute(
        select(Group)
        .join(Phase, Phase.id == Group.phase_id)
        .where(Group.id == group_id, Phase.tournament_age_group_id == ag_id)
    )
    source_group = source_group_result.scalar_one_or_none()
    if not source_group:
        raise HTTPException(status_code=404, detail="Gruppo origine non trovato")

    target_group_result = await db.execute(
        select(Group)
        .join(Phase, Phase.id == Group.phase_id)
        .where(Group.id == body.target_group_id, Phase.tournament_age_group_id == ag_id)
    )
    target_group = target_group_result.scalar_one_or_none()
    if not target_group:
        raise HTTPException(status_code=404, detail="Gruppo destinazione non trovato")

    if target_group.phase_id != source_group.phase_id:
        raise HTTPException(status_code=422, detail="Puoi spostare una squadra solo tra gironi della stessa fase")

    enrollment_result = await db.execute(
        select(TournamentTeam).where(
            TournamentTeam.id == tournament_team_id,
            TournamentTeam.tournament_age_group_id == ag_id,
        )
    )
    enrollment = enrollment_result.scalar_one_or_none()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Squadra torneo non trovata")

    group_team_result = await db.execute(
        select(GroupTeam).where(
            GroupTeam.group_id == group_id,
            GroupTeam.tournament_team_id == tournament_team_id,
        )
    )
    group_team = group_team_result.scalar_one_or_none()
    if not group_team:
        raise HTTPException(status_code=404, detail="La squadra non appartiene al girone selezionato")

    existing_target_result = await db.execute(
        select(GroupTeam).where(
            GroupTeam.group_id == target_group.id,
            GroupTeam.tournament_team_id == tournament_team_id,
        )
    )
    if existing_target_result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="La squadra è già presente nel girone di destinazione")

    group_team.group_id = target_group.id
    await db.commit()

    program = await get_age_group_program(ag_id, db)
    if not program:
        raise HTTPException(status_code=404, detail="Age group not found")
    return program


@router.put("/matches/{match_id}/participants", response_model=AgeGroupProgramResponse)
async def update_match_participants(
    match_id: str,
    body: MatchParticipantsUpdate,
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

    age_group_id = match.phase.tournament_age_group_id
    valid_team_ids: set[str] = set()
    valid_group_team_ids: set[str] = set()

    enrollment_result = await db.execute(
        select(TournamentTeam).where(TournamentTeam.tournament_age_group_id == age_group_id)
    )
    enrollments = enrollment_result.scalars().all()
    valid_group_team_ids = {item.id for item in enrollments}

    if match.group_id:
        group_team_result = await db.execute(select(GroupTeam).where(GroupTeam.group_id == match.group_id))
        valid_team_ids = {item.tournament_team_id for item in group_team_result.scalars().all()}
    else:
        valid_team_ids = valid_group_team_ids

    for candidate in [body.home_team_id, body.away_team_id]:
        if candidate and candidate not in valid_team_ids:
            raise HTTPException(status_code=422, detail="Una delle squadre selezionate non è valida per questa partita")

    if body.home_team_id and body.away_team_id and body.home_team_id == body.away_team_id:
        raise HTTPException(status_code=422, detail="La stessa squadra non può giocare contro sé stessa")

    match.home_team_id = body.home_team_id
    match.away_team_id = body.away_team_id
    await db.commit()

    program = await get_age_group_program(age_group_id, db)
    if not program:
        raise HTTPException(status_code=404, detail="Age group not found")
    return program


@router.delete("/age-groups/{ag_id}", status_code=204)
async def delete_age_group(
    ag_id: str,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TournamentAgeGroup).where(TournamentAgeGroup.id == ag_id))
    ag = result.scalar_one_or_none()
    if not ag:
        raise HTTPException(status_code=404, detail="Age group not found")
    await db.delete(ag)
    await db.commit()


@router.get("/structure-templates", response_model=list[StructureTemplateResponse])
async def list_structure_templates(
    age_group: str | None = None,
    organization_id: str | None = None,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    query = select(StructureTemplate).order_by(StructureTemplate.name)
    if age_group:
        query = query.where(
            (StructureTemplate.age_group == age_group) | (StructureTemplate.age_group.is_(None))
        )
    if organization_id:
        query = query.where(
            (StructureTemplate.organization_id == organization_id) | (StructureTemplate.organization_id.is_(None))
        )
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/structure-templates", response_model=StructureTemplateResponse, status_code=201)
async def create_structure_template(
    body: StructureTemplateCreate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    template = StructureTemplate(**body.model_dump())
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.get("/tournament-templates", response_model=list[TournamentTemplateResponse])
async def list_tournament_templates(
    organization_id: str | None = None,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    query = select(TournamentTemplate).order_by(TournamentTemplate.name)
    if organization_id:
        query = query.where(
            (TournamentTemplate.organization_id == organization_id) | (TournamentTemplate.organization_id.is_(None))
        )
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/tournament-templates", response_model=TournamentTemplateResponse, status_code=201)
async def create_tournament_template(
    body: TournamentTemplateCreate,
    _: User = Depends(require_editor),
    db: AsyncSession = Depends(get_db),
):
    template = TournamentTemplate(**body.model_dump())
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template
