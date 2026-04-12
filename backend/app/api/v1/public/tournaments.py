from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.models.tournament import Tournament, TournamentAgeGroup
from app.models.phase import Phase
from app.models.organization import Organization
from app.schemas.tournament import TournamentResponse, AgeGroupResponse
from app.schemas.organization import OrganizationResponse
from app.services.phase_engine import get_phase_standings, get_knockout_final_ranking
from app.schemas.program import TournamentProgramResponse, AgeGroupProgramResponse
from app.services.program_builder import get_tournament_program, get_age_group_program, _is_final_phase_config
from app.services.program_pdf import build_age_group_program_pdf
from app.services.public_api_cache import public_api_cache

router = APIRouter()
PUBLIC_CACHE_TTL_SECONDS = 15
PUBLIC_CACHE_STALE_SECONDS = 45


def _serialize_standings_row(row):
    return {
        "team_id": row.team_id,
        "team_name": row.team_name,
        "points": row.points,
        "played": row.played,
        "wins": row.won,
        "draws": row.drawn,
        "losses": row.lost,
        "goals_for": row.goals_for,
        "goals_against": row.goals_against,
        "goal_diff": row.goal_diff,
        "tries_for": row.tries_for,
        "tries_against": row.tries_against,
        "try_diff": row.try_diff,
        "distance_km": row.distance_km,
    }


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


async def _find_published_tournament_by_slug(slug: str, db: AsyncSession) -> Tournament | None:
    exact_match = (
        await db.execute(
            select(Tournament)
            .options(selectinload(Tournament.organization))
            .where(Tournament.is_published == True, Tournament.slug == slug)
        )
    ).scalar_one_or_none()
    if exact_match:
        return exact_match

    tournaments = (
        await db.execute(
            select(Tournament)
            .options(selectinload(Tournament.organization))
            .where(Tournament.is_published == True)
        )
    ).scalars().all()
    for tournament in tournaments:
        if slug in (tournament.previous_slugs or []):
            return tournament
    return None


@router.get("/tournaments", response_model=list[TournamentResponse])
async def list_tournaments(
    year: int | None = None,
    organization_slug: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    cache_key = f"public:tournaments:list:{year or 'all'}:{organization_slug or 'all'}"

    async def load() -> list[dict]:
        query = select(Tournament).options(selectinload(Tournament.organization)).where(Tournament.is_published == True)

        if year:
            query = query.where(Tournament.year == year)

        if organization_slug:
            query = query.join(Organization).where(Organization.slug == organization_slug)

        result = await db.execute(query.order_by(Tournament.organization_id, Tournament.start_date.desc(), Tournament.year.desc(), Tournament.name))
        tournaments = result.scalars().all()
        return [_serialize_tournament(tournament).model_dump(mode="json") for tournament in tournaments]

    return await public_api_cache.get_or_set(cache_key, PUBLIC_CACHE_TTL_SECONDS, load, PUBLIC_CACHE_STALE_SECONDS)


@router.get("/tournaments/{slug}", response_model=TournamentResponse)
async def get_tournament(slug: str, db: AsyncSession = Depends(get_db)):
    async def load() -> dict:
        t = await _find_published_tournament_by_slug(slug, db)
        if not t:
            raise HTTPException(status_code=404, detail="Tournament not found")
        return _serialize_tournament(t).model_dump(mode="json")

    return await public_api_cache.get_or_set(f"public:tournaments:detail:{slug}", PUBLIC_CACHE_TTL_SECONDS, load, PUBLIC_CACHE_STALE_SECONDS)


@router.get("/tournaments/{slug}/organization", response_model=OrganizationResponse)
async def get_tournament_organization(slug: str, db: AsyncSession = Depends(get_db)):
    async def load() -> dict:
        tournament = await _find_published_tournament_by_slug(slug, db)
        org = tournament.organization if tournament else None
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        return OrganizationResponse.model_validate(org).model_dump(mode="json")

    return await public_api_cache.get_or_set(f"public:tournaments:organization:{slug}", PUBLIC_CACHE_TTL_SECONDS, load, PUBLIC_CACHE_STALE_SECONDS)


@router.get("/tournaments/{slug}/age-groups", response_model=list[AgeGroupResponse])
async def get_tournament_age_groups(slug: str, db: AsyncSession = Depends(get_db)):
    async def load() -> list[dict]:
        t = await _find_published_tournament_by_slug(slug, db)
        if not t:
            raise HTTPException(status_code=404, detail="Tournament not found")

        ag_result = await db.execute(
            select(TournamentAgeGroup).where(TournamentAgeGroup.tournament_id == t.id)
        )
        return [AgeGroupResponse.model_validate(age_group).model_dump(mode="json") for age_group in ag_result.scalars().all()]

    return await public_api_cache.get_or_set(f"public:tournaments:age-groups:{slug}", PUBLIC_CACHE_TTL_SECONDS, load, PUBLIC_CACHE_STALE_SECONDS)


@router.get("/age-groups/{age_group_id}/standings")
async def get_standings(age_group_id: str, db: AsyncSession = Depends(get_db)):
    """Return standings for all groups in all phases of an age group."""
    async def load() -> dict:
        age_group_result = await db.execute(
            select(TournamentAgeGroup).where(TournamentAgeGroup.id == age_group_id)
        )
        age_group = age_group_result.scalar_one_or_none()
        structure = age_group.structure_config if age_group and isinstance(age_group.structure_config, dict) else {}
        phases_config = structure.get("phases", []) if isinstance(structure.get("phases", []), list) else []

        phases_result = await db.execute(
            select(Phase).where(Phase.tournament_age_group_id == age_group_id).order_by(Phase.phase_order)
        )
        phases = phases_result.scalars().all()

        response = {}
        for phase in phases:
            phase_standings = await get_phase_standings(phase.id, db)
            if phase_standings:
                response[phase.id] = {
                    "phase_name": phase.name,
                    "phase_type": phase.phase_type,
                    "is_final_phase": _is_final_phase_config(phases_config, phase.phase_order),
                    "groups": {
                        group_id: [_serialize_standings_row(row) for row in rows]
                        for group_id, rows in phase_standings.items()
                    },
                }
            else:
                final_ranking = await get_knockout_final_ranking(phase.id, db)
                if final_ranking:
                    response[phase.id] = {
                        "phase_name": phase.name,
                        "phase_type": phase.phase_type,
                        "is_final_phase": _is_final_phase_config(phases_config, phase.phase_order),
                        "groups": {},
                        "final_ranking": final_ranking,
                    }

        return response

    return await public_api_cache.get_or_set(f"public:age-groups:standings:{age_group_id}", PUBLIC_CACHE_TTL_SECONDS, load, PUBLIC_CACHE_STALE_SECONDS)


@router.get("/tournaments/{slug}/fields")
async def get_tournament_fields(slug: str, db: AsyncSession = Depends(get_db)):
    from app.models.field import Field as FieldModel

    async def load() -> list[dict]:
        t = await _find_published_tournament_by_slug(slug, db)
        if not t:
            raise HTTPException(status_code=404, detail="Tournament not found")
        fields_result = await db.execute(
            select(FieldModel).where(
                (FieldModel.organization_id == t.organization_id) | (FieldModel.tournament_id == t.id)
            )
        )
        return [
            {column.name: getattr(field, column.name) for column in field.__table__.columns}
            for field in fields_result.scalars().all()
        ]

    return await public_api_cache.get_or_set(f"public:tournaments:fields:{slug}", PUBLIC_CACHE_TTL_SECONDS, load, PUBLIC_CACHE_STALE_SECONDS)


@router.get("/tournaments/{slug}/program", response_model=TournamentProgramResponse)
async def get_public_tournament_program(slug: str, db: AsyncSession = Depends(get_db)):
    async def load() -> dict:
        tournament = await _find_published_tournament_by_slug(slug, db)
        program = await get_tournament_program(tournament.slug, db) if tournament else None
        if not program:
            raise HTTPException(status_code=404, detail="Tournament not found")
        return program.model_dump(mode="json")

    return await public_api_cache.get_or_set(f"public:tournaments:program:{slug}", PUBLIC_CACHE_TTL_SECONDS, load, PUBLIC_CACHE_STALE_SECONDS)


@router.get("/age-groups/{age_group_id}/program", response_model=AgeGroupProgramResponse)
async def get_public_age_group_program(age_group_id: str, db: AsyncSession = Depends(get_db)):
    async def load() -> dict:
        program = await get_age_group_program(age_group_id, db)
        if not program:
            raise HTTPException(status_code=404, detail="Age group not found")
        return program.model_dump(mode="json")

    return await public_api_cache.get_or_set(f"public:age-groups:program:{age_group_id}", PUBLIC_CACHE_TTL_SECONDS, load, PUBLIC_CACHE_STALE_SECONDS)


@router.get("/age-groups/{age_group_id}/program.pdf")
async def download_public_age_group_program_pdf(age_group_id: str, db: AsyncSession = Depends(get_db)):
    age_group_result = await db.execute(
        select(TournamentAgeGroup)
        .options(selectinload(TournamentAgeGroup.tournament))
        .join(Tournament, Tournament.id == TournamentAgeGroup.tournament_id)
        .where(TournamentAgeGroup.id == age_group_id, Tournament.is_published == True)
    )
    age_group = age_group_result.scalar_one_or_none()
    if not age_group or not age_group.tournament:
        raise HTTPException(status_code=404, detail="Age group not found")

    program = await get_age_group_program(age_group_id, db)
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


@router.get("/organizations/{slug}", response_model=OrganizationResponse)
async def get_organization(slug: str, db: AsyncSession = Depends(get_db)):
    async def load() -> dict:
        result = await db.execute(select(Organization).where(Organization.slug == slug))
        org = result.scalar_one_or_none()
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        return OrganizationResponse.model_validate(org).model_dump(mode="json")

    return await public_api_cache.get_or_set(f"public:organizations:{slug}", PUBLIC_CACHE_TTL_SECONDS, load, PUBLIC_CACHE_STALE_SECONDS)
