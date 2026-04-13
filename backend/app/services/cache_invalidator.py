"""
Surgical cache invalidation.

Instead of clearing the entire public cache on every admin write,
resolve which tournament / age-group was affected and delete only
those keys.  All other tournaments stay cached.

Resolution chain (all done in a single round-trip per path pattern):
  match_id  → phase → age_group → tournament
  phase_id  → age_group → tournament
  group_id  → phase → age_group → tournament
  tournament slug/id → tournament
  team_id   → age_group → tournament
  field_id  → tournament / org
  org_id    → org (invalidates list key only)
"""
from __future__ import annotations

import re
import logging
from typing import NamedTuple

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.public_api_cache import public_api_cache

logger = logging.getLogger(__name__)

# ── regex patterns for admin URL paths ────────────────────────────────────────
_RE_MATCH   = re.compile(r"^/api/v1/admin/matches/([^/]+)")
_RE_PHASE   = re.compile(r"^/api/v1/admin/phases/([^/]+)")
_RE_GROUP   = re.compile(r"^/api/v1/admin/groups/([^/]+)")
_RE_TOURNEY = re.compile(r"^/api/v1/admin/tournaments/([^/]+)")
_RE_TEAM    = re.compile(r"^/api/v1/admin/teams/([^/]+)")
_RE_FIELD   = re.compile(r"^/api/v1/admin/fields/([^/]+)")
_RE_ORG     = re.compile(r"^/api/v1/admin/organizations/([^/]+)")


class _InvalidationScope(NamedTuple):
    tournament_slug: str | None
    age_group_ids: list[str]


# ── key helpers ───────────────────────────────────────────────────────────────

def _tournament_cache_keys(slug: str, age_group_ids: list[str]) -> set[str]:
    """All cache keys that belong to one tournament."""
    keys: set[str] = {
        "public:tournaments:list:all:all",
        f"public:tournaments:detail:{slug}",
        f"public:tournaments:age-groups:{slug}",
        f"public:tournaments:program:{slug}",
        f"public:tournaments:fields:{slug}",
        f"public:tournaments:organization:{slug}",
    }
    for ag_id in age_group_ids:
        keys.add(f"public:age-groups:standings:{ag_id}")
        keys.add(f"public:age-groups:program:{ag_id}")
    return keys


def _age_group_cache_keys(age_group_id: str) -> set[str]:
    """Cache keys that belong to a single age-group (standings + program)."""
    return {
        f"public:age-groups:standings:{age_group_id}",
        f"public:age-groups:program:{age_group_id}",
    }


# ── scope resolution ──────────────────────────────────────────────────────────

async def _scope_from_match(match_id: str, db: AsyncSession) -> _InvalidationScope:
    row = await db.execute(text("""
        SELECT t.slug, tg.id AS age_group_id
        FROM matches m
        JOIN phases p ON p.id = m.phase_id
        JOIN tournament_age_groups tg ON tg.id = p.tournament_age_group_id
        JOIN tournaments t ON t.id = tg.tournament_id
        WHERE m.id = :mid
    """), {"mid": match_id})
    r = row.mappings().first()
    if not r:
        return _InvalidationScope(None, [])
    return _InvalidationScope(r["slug"], [r["age_group_id"]])


async def _scope_from_phase(phase_id: str, db: AsyncSession) -> _InvalidationScope:
    row = await db.execute(text("""
        SELECT t.slug, tg.id AS age_group_id
        FROM phases p
        JOIN tournament_age_groups tg ON tg.id = p.tournament_age_group_id
        JOIN tournaments t ON t.id = tg.tournament_id
        WHERE p.id = :pid
    """), {"pid": phase_id})
    r = row.mappings().first()
    if not r:
        return _InvalidationScope(None, [])
    return _InvalidationScope(r["slug"], [r["age_group_id"]])


async def _scope_from_group(group_id: str, db: AsyncSession) -> _InvalidationScope:
    row = await db.execute(text("""
        SELECT t.slug, tg.id AS age_group_id
        FROM groups g
        JOIN phases p ON p.id = g.phase_id
        JOIN tournament_age_groups tg ON tg.id = p.tournament_age_group_id
        JOIN tournaments t ON t.id = tg.tournament_id
        WHERE g.id = :gid
    """), {"gid": group_id})
    r = row.mappings().first()
    if not r:
        return _InvalidationScope(None, [])
    return _InvalidationScope(r["slug"], [r["age_group_id"]])


async def _scope_from_tournament_id_or_slug(value: str, db: AsyncSession) -> _InvalidationScope:
    # Try as slug first, then as id
    row = await db.execute(text("""
        SELECT t.slug, tg.id AS age_group_id
        FROM tournaments t
        LEFT JOIN tournament_age_groups tg ON tg.tournament_id = t.id
        WHERE t.slug = :v OR t.id = :v
    """), {"v": value})
    rows = row.mappings().all()
    if not rows:
        return _InvalidationScope(None, [])
    slug = rows[0]["slug"]
    age_group_ids = [r["age_group_id"] for r in rows if r["age_group_id"]]
    return _InvalidationScope(slug, age_group_ids)


async def _scope_from_team(team_id: str, db: AsyncSession) -> _InvalidationScope:
    row = await db.execute(text("""
        SELECT t.slug, tg.id AS age_group_id
        FROM tournament_teams tt
        JOIN tournament_age_groups tg ON tg.id = tt.tournament_age_group_id
        JOIN tournaments t ON t.id = tg.tournament_id
        WHERE tt.id = :tid
    """), {"tid": team_id})
    r = row.mappings().first()
    if not r:
        return _InvalidationScope(None, [])
    return _InvalidationScope(r["slug"], [r["age_group_id"]])


async def _scope_from_field(field_id: str, db: AsyncSession) -> _InvalidationScope:
    row = await db.execute(text("""
        SELECT t.slug, tg.id AS age_group_id
        FROM fields f
        LEFT JOIN tournaments t ON t.id = f.tournament_id
        LEFT JOIN tournament_age_groups tg ON tg.tournament_id = t.id
        WHERE f.id = :fid
    """), {"fid": field_id})
    rows = row.mappings().all()
    if not rows or not rows[0]["slug"]:
        return _InvalidationScope(None, [])
    slug = rows[0]["slug"]
    age_group_ids = [r["age_group_id"] for r in rows if r["age_group_id"]]
    return _InvalidationScope(slug, age_group_ids)


# ── public entry point ────────────────────────────────────────────────────────

async def invalidate_for_request(path: str, db: AsyncSession) -> None:
    """
    Called after a successful admin write.  Resolves the affected tournament
    from the request path and removes only the relevant cache keys.
    """
    scope: _InvalidationScope | None = None

    if m := _RE_MATCH.match(path):
        scope = await _scope_from_match(m.group(1), db)

    elif m := _RE_PHASE.match(path):
        scope = await _scope_from_phase(m.group(1), db)

    elif m := _RE_GROUP.match(path):
        scope = await _scope_from_group(m.group(1), db)

    elif m := _RE_TOURNEY.match(path):
        scope = await _scope_from_tournament_id_or_slug(m.group(1), db)

    elif m := _RE_TEAM.match(path):
        scope = await _scope_from_team(m.group(1), db)

    elif m := _RE_FIELD.match(path):
        scope = await _scope_from_field(m.group(1), db)

    elif _RE_ORG.match(path):
        # Organization change: invalidate list + org keys only (no full clear)
        await public_api_cache.invalidate_keys({"public:tournaments:list:all:all"})
        logger.debug("cache invalidated: org-level keys")
        return

    if scope is None or scope.tournament_slug is None:
        # Unknown path — fall back to full clear to stay safe
        logger.debug("cache invalidated: full clear (unknown path %s)", path)
        await public_api_cache.clear()
        return

    keys = _tournament_cache_keys(scope.tournament_slug, scope.age_group_ids)
    await public_api_cache.invalidate_keys(keys)
    logger.debug(
        "cache invalidated: %d keys for tournament=%s age_groups=%s",
        len(keys), scope.tournament_slug, scope.age_group_ids,
    )
