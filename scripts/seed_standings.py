"""
One-shot script: resolve seed-label placeholders in knockout matches using
group stage standings for all existing age groups.

Usage (from repo root with venv active):
    cd backend
    python ../scripts/seed_standings.py

Set DATABASE_URL in your environment or .env file before running.
"""

import asyncio
import sys
import os

# Make backend app importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.tournament import TournamentAgeGroup
from app.services.program_builder import seed_next_phases_from_standings


async def main() -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(TournamentAgeGroup.id, TournamentAgeGroup.name))
        age_groups = result.all()

    total_updated = 0
    for age_group_id, age_group_name in age_groups:
        async with AsyncSessionLocal() as db:
            updated = await seed_next_phases_from_standings(age_group_id, db)
            if updated:
                print(f"  [{age_group_name}] {updated} slot/i aggiornati")
                total_updated += updated

    print(f"\nTotale: {total_updated} slot aggiornati su {len(age_groups)} categorie.")


if __name__ == "__main__":
    asyncio.run(main())
