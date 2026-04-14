from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass
from typing import Any, Awaitable, Callable


@dataclass
class _CacheEntry:
    value: Any
    expires_at: float
    stale_expires_at: float


class PublicApiCache:
    def __init__(self) -> None:
        self._entries: dict[str, _CacheEntry] = {}
        self._inflight: dict[str, asyncio.Future[Any]] = {}
        self._lock = asyncio.Lock()
        self._generation = 0

    async def get_or_set(
        self,
        key: str,
        ttl_seconds: float,
        loader: Callable[[], Awaitable[Any]],
        stale_while_revalidate_seconds: float = 0,
    ) -> Any:
        now = time.monotonic()
        async with self._lock:
            entry = self._entries.get(key)
            if entry and entry.expires_at > now:
                return entry.value

            generation = self._generation
            future = self._inflight.get(key)
            if entry and entry.stale_expires_at > now:
                if future is None:
                    future = asyncio.get_running_loop().create_future()
                    self._inflight[key] = future
                    asyncio.create_task(
                        self._refresh_in_background(
                            key=key,
                            ttl_seconds=ttl_seconds,
                            stale_while_revalidate_seconds=stale_while_revalidate_seconds,
                            loader=loader,
                            future=future,
                            generation=generation,
                        )
                    )
                return entry.value

            if future is None:
                future = asyncio.get_running_loop().create_future()
                self._inflight[key] = future
                is_owner = True
            else:
                is_owner = False

        if not is_owner:
            return await future

        try:
            value = await loader()
        except Exception as exc:
            async with self._lock:
                current = self._inflight.pop(key, None)
                if current and not current.done():
                    current.set_exception(exc)
            raise

        async with self._lock:
            if generation == self._generation:
                now = time.monotonic()
                self._entries[key] = _CacheEntry(
                    value=value,
                    expires_at=now + ttl_seconds,
                    stale_expires_at=now + ttl_seconds + stale_while_revalidate_seconds,
                )
            current = self._inflight.pop(key, None)
            if current and not current.done():
                current.set_result(value)

        return value

    async def _refresh_in_background(
        self,
        *,
        key: str,
        ttl_seconds: float,
        stale_while_revalidate_seconds: float,
        loader: Callable[[], Awaitable[Any]],
        future: asyncio.Future[Any],
        generation: int,
    ) -> None:
        try:
            value = await loader()
        except Exception as exc:
            async with self._lock:
                current = self._inflight.pop(key, None)
                if current and not current.done():
                    current.set_exception(exc)
            return

        async with self._lock:
            if generation == self._generation:
                now = time.monotonic()
                self._entries[key] = _CacheEntry(
                    value=value,
                    expires_at=now + ttl_seconds,
                    stale_expires_at=now + ttl_seconds + stale_while_revalidate_seconds,
                )
            current = self._inflight.pop(key, None)
            if current and not current.done():
                current.set_result(value)

    async def invalidate_keys(self, keys: set[str]) -> None:
        """Remove specific cache keys without touching other entries."""
        async with self._lock:
            for key in keys:
                self._entries.pop(key, None)

    async def clear(self) -> None:
        async with self._lock:
            self._entries.clear()
            self._generation += 1

    async def get_json_bytes_or_set(
        self,
        key: str,
        ttl_seconds: float,
        loader: Callable[[], Awaitable[Any]],
        stale_while_revalidate_seconds: float = 0,
    ) -> bytes:
        async def serialize() -> bytes:
            value = await loader()
            return json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")

        return await self.get_or_set(key, ttl_seconds, serialize, stale_while_revalidate_seconds)


public_api_cache = PublicApiCache()


async def warmup_public_cache() -> None:
    """
    Pre-populate the public cache for all published tournaments at startup.
    Runs in background so it never blocks server boot.
    Prevents the first wave of real users from hitting cold-cache latency spikes.
    """
    import logging
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.core.database import AsyncSessionLocal

    logger = logging.getLogger(__name__)
    logger.info("public_cache_warmup: starting")

    # Import here to avoid circular imports at module load time
    from app.models.tournament import Tournament, TournamentAgeGroup
    from app.models.phase import Phase
    from app.services.program_builder import get_tournament_program, get_age_group_program
    from app.services.phase_engine import get_phase_standings, get_knockout_final_ranking
    from app.services.program_builder import _is_final_phase_config

    # TTL constants — mirror what the route module uses
    PUBLIC_TTL = 300
    PUBLIC_STALE = 1800
    PROGRAM_TTL = 1800
    PROGRAM_STALE = 7200

    try:
        async with AsyncSessionLocal() as db:
            tournaments = (
                await db.execute(
                    select(Tournament)
                    .options(selectinload(Tournament.organization))
                    .where(Tournament.is_published == True)
                )
            ).scalars().all()

            for t in tournaments:
                slug = t.slug
                org_slug = t.organization.slug if t.organization else None

                # --- tournament list (one entry per org+year combo already cached by key)
                async def _load_list(db=db):
                    from app.schemas.tournament import TournamentResponse
                    result = (await db.execute(
                        select(Tournament).options(selectinload(Tournament.organization))
                        .where(Tournament.is_published == True)
                    )).scalars().all()
                    from app.schemas.tournament import TournamentResponse as TR
                    return [TR(
                        id=x.id, organization_id=x.organization_id,
                        organization_name=x.organization.name if x.organization else None,
                        organization_slug=x.organization.slug if x.organization else None,
                        organization_logo_url=x.organization.logo_url if x.organization else None,
                        name=x.name, event_type=x.event_type, year=x.year, slug=x.slug,
                        edition=x.edition, start_date=x.start_date, end_date=x.end_date,
                        location=x.location, venue_map_url=x.venue_map_url, logo_url=x.logo_url,
                        theme_primary_color=x.theme_primary_color,
                        theme_accent_color=x.theme_accent_color, timezone=x.timezone,
                        is_published=x.is_published, sponsor_images=x.sponsor_images or [],
                        previous_slugs=x.previous_slugs or [], description=x.description,
                    ).model_dump(mode="json") for x in result]

                await public_api_cache.get_or_set("public:tournaments:list:all:all", PUBLIC_TTL, _load_list, PUBLIC_STALE)

                # --- tournament detail
                async def _load_detail(t=t):
                    from app.schemas.tournament import TournamentResponse as TR
                    return TR(
                        id=t.id, organization_id=t.organization_id,
                        organization_name=t.organization.name if t.organization else None,
                        organization_slug=t.organization.slug if t.organization else None,
                        organization_logo_url=t.organization.logo_url if t.organization else None,
                        name=t.name, event_type=t.event_type, year=t.year, slug=t.slug,
                        edition=t.edition, start_date=t.start_date, end_date=t.end_date,
                        location=t.location, venue_map_url=t.venue_map_url, logo_url=t.logo_url,
                        theme_primary_color=t.theme_primary_color,
                        theme_accent_color=t.theme_accent_color, timezone=t.timezone,
                        is_published=t.is_published, sponsor_images=t.sponsor_images or [],
                        previous_slugs=t.previous_slugs or [], description=t.description,
                    ).model_dump(mode="json")

                await public_api_cache.get_or_set(f"public:tournaments:detail:{slug}", PUBLIC_TTL, _load_detail, PUBLIC_STALE)

                # --- age groups
                async def _load_ag(t=t, db=db):
                    from app.schemas.tournament import AgeGroupResponse
                    result = (await db.execute(
                        select(TournamentAgeGroup).where(TournamentAgeGroup.tournament_id == t.id)
                    )).scalars().all()
                    return [AgeGroupResponse.model_validate(ag).model_dump(mode="json") for ag in result]

                age_groups_data = await public_api_cache.get_or_set(
                    f"public:tournaments:age-groups:{slug}", PUBLIC_TTL, _load_ag, PUBLIC_STALE
                )

                # --- tournament program
                async def _load_prog(slug=slug, db=db):
                    prog = await get_tournament_program(slug, db)
                    return prog.model_dump(mode="json") if prog else None

                await public_api_cache.get_or_set(f"public:tournaments:program:{slug}", PROGRAM_TTL, _load_prog, PROGRAM_STALE)

                # --- fields
                from app.models.field import Field as FieldModel
                async def _load_fields(t=t, db=db):
                    result = (await db.execute(
                        select(FieldModel).where(
                            (FieldModel.organization_id == t.organization_id) | (FieldModel.tournament_id == t.id)
                        )
                    )).scalars().all()
                    return [{col.name: getattr(f, col.name) for col in f.__table__.columns} for f in result]

                await public_api_cache.get_or_set(f"public:tournaments:fields:{slug}", PUBLIC_TTL, _load_fields, PUBLIC_STALE)

                # --- org
                if org_slug and t.organization:
                    org = t.organization
                    async def _load_org(org=org):
                        from app.schemas.organization import OrganizationResponse
                        return OrganizationResponse.model_validate(org).model_dump(mode="json")
                    await public_api_cache.get_or_set(f"public:organizations:{org_slug}", PUBLIC_TTL, _load_org, PUBLIC_STALE)

                # --- per-age-group: standings + program
                age_groups_result = (await db.execute(
                    select(TournamentAgeGroup).where(TournamentAgeGroup.tournament_id == t.id)
                )).scalars().all()

                for ag in age_groups_result:
                    ag_id = ag.id

                    async def _load_standings(ag_id=ag_id, db=db):
                        age_group = (await db.execute(
                            select(TournamentAgeGroup).where(TournamentAgeGroup.id == ag_id)
                        )).scalar_one_or_none()
                        structure = age_group.structure_config if age_group and isinstance(age_group.structure_config, dict) else {}
                        phases_config = structure.get("phases", []) if isinstance(structure.get("phases", []), list) else []
                        phases = (await db.execute(
                            select(Phase).where(Phase.tournament_age_group_id == ag_id).order_by(Phase.phase_order)
                        )).scalars().all()
                        response = {}
                        for phase in phases:
                            standings = await get_phase_standings(phase.id, db)
                            if standings:
                                response[phase.id] = {
                                    "phase_name": phase.name, "phase_type": phase.phase_type,
                                    "is_final_phase": _is_final_phase_config(phases_config, phase.phase_order),
                                    "groups": {
                                        gid: [
                                            {"team_id": r.team_id, "team_name": r.team_name, "points": r.points,
                                             "played": r.played, "wins": r.won, "draws": r.drawn, "losses": r.lost,
                                             "goals_for": r.goals_for, "goals_against": r.goals_against,
                                             "goal_diff": r.goal_diff, "tries_for": r.tries_for,
                                             "tries_against": r.tries_against, "try_diff": r.try_diff,
                                             "distance_km": r.distance_km}
                                            for r in rows
                                        ] for gid, rows in standings.items()
                                    },
                                }
                            else:
                                final = await get_knockout_final_ranking(phase.id, db)
                                if final:
                                    response[phase.id] = {
                                        "phase_name": phase.name, "phase_type": phase.phase_type,
                                        "is_final_phase": _is_final_phase_config(phases_config, phase.phase_order),
                                        "groups": {}, "final_ranking": final,
                                    }
                        return response

                    await public_api_cache.get_or_set(f"public:age-groups:standings:{ag_id}", PROGRAM_TTL, _load_standings, PROGRAM_STALE)

                    async def _load_ag_prog(ag_id=ag_id, db=db):
                        prog = await get_age_group_program(ag_id, db)
                        return prog.model_dump(mode="json") if prog else None

                    await public_api_cache.get_or_set(f"public:age-groups:program:{ag_id}", PROGRAM_TTL, _load_ag_prog, PROGRAM_STALE)

        logger.info("public_cache_warmup: completed — %d tournaments warmed", len(tournaments))

    except Exception as exc:
        logger.warning("public_cache_warmup: failed (non-fatal): %s", exc)
