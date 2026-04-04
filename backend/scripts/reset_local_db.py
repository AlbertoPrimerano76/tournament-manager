import asyncio
from pathlib import Path
import sys

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import app.models  # noqa: F401,E402
from app.core.database import Base, AsyncSessionLocal, engine  # noqa: E402
from app.core.local_bootstrap import bootstrap_local_environment  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.organization import Organization  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from scripts.seed_demo_tournaments import main as seed_demo_tournaments  # noqa: E402


ADMIN_EMAIL = "admin@rugby.it"
ADMIN_PASSWORD = "Admin123!"


async def reset_local_db() -> None:
    db_path = ROOT / "dev.db"
    if db_path.exists():
        db_path.unlink()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await bootstrap_local_environment()

    async with AsyncSessionLocal() as session:
        org = (
            await session.execute(
                select(Organization).where(Organization.slug == "rugby-livorno")
            )
        ).scalar_one_or_none()
        admin = (
            await session.execute(select(User).where(User.email == ADMIN_EMAIL))
        ).scalar_one_or_none()
        if not admin:
            session.add(
                User(
                    email=ADMIN_EMAIL,
                    hashed_password=hash_password(ADMIN_PASSWORD),
                    role=UserRole.SUPER_ADMIN,
                    organization_id=org.id if org else None,
                    is_active=True,
                )
            )
        await session.commit()

    await seed_demo_tournaments()

    print("Database locale ricreato.")
    print(f"Admin: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(reset_local_db())
