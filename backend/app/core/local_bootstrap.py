from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncConnection

import app.models  # noqa: F401
from app.core.config import settings
from app.core.database import Base, AsyncSessionLocal, engine
from app.models.organization import Organization
from app.models.user import User, UserRole


DEFAULT_ORGANIZATIONS = [
    {
        "name": "Rugby Livorno",
        "slug": "rugby-livorno",
        "city": "Livorno",
        "primary_color": "#0f172a",
        "accent_color": "#d97706",
    },
    {
        "name": "Rugby Pisa",
        "slug": "rugby-pisa",
        "city": "Pisa",
        "primary_color": "#134e4a",
        "accent_color": "#dc2626",
    },
    {
        "name": "Rugby Firenze",
        "slug": "rugby-firenze",
        "city": "Firenze",
        "primary_color": "#1e3a8a",
        "accent_color": "#ca8a04",
    },
]


async def bootstrap_local_environment() -> None:
    is_sqlite = settings.DATABASE_URL.startswith("sqlite")
    is_development = settings.ENVIRONMENT.lower() == "development"

    async with engine.begin() as conn:
        if is_sqlite or is_development:
            await conn.run_sync(Base.metadata.create_all)
        await _ensure_development_schema(conn)
        if is_sqlite:
            await _ensure_alembic_version(conn)

    async with AsyncSessionLocal() as session:
        if is_sqlite or is_development:
            existing_slugs = set(
                (await session.execute(select(Organization.slug))).scalars().all()
            )
            for payload in DEFAULT_ORGANIZATIONS:
                if payload["slug"] in existing_slugs:
                    continue
                session.add(Organization(**payload))

        if settings.DEFAULT_ADMIN_EMAIL:
            existing_user = (
                await session.execute(select(User).where(User.email == settings.DEFAULT_ADMIN_EMAIL))
            ).scalar_one_or_none()
            if not existing_user:
                default_org = (
                    await session.execute(select(Organization).order_by(Organization.name))
                ).scalars().first()
                session.add(
                    User(
                        email=settings.DEFAULT_ADMIN_EMAIL,
                        hashed_password="",
                        role=UserRole.SUPER_ADMIN,
                        organization_id=default_org.id if default_org else None,
                        is_active=True,
                    )
                )

        await session.commit()


async def _ensure_development_schema(conn: AsyncConnection) -> None:
    dialect = conn.dialect.name
    if dialect == "sqlite":
        age_group_columns = {
            row[1] for row in (await conn.exec_driver_sql("PRAGMA table_info(tournament_age_groups)")).fetchall()
        }
        tournament_columns = {
            row[1] for row in (await conn.exec_driver_sql("PRAGMA table_info(tournaments)")).fetchall()
        }
        organization_columns = {
            row[1] for row in (await conn.exec_driver_sql("PRAGMA table_info(organizations)")).fetchall()
        }
        user_columns = {
            row[1] for row in (await conn.exec_driver_sql("PRAGMA table_info(users)")).fetchall()
        }
        team_columns = {
            row[1] for row in (await conn.exec_driver_sql("PRAGMA table_info(teams)")).fetchall()
        }
        field_columns = {
            row[1] for row in (await conn.exec_driver_sql("PRAGMA table_info(fields)")).fetchall()
        }
        match_columns = {
            row[1] for row in (await conn.exec_driver_sql("PRAGMA table_info(matches)")).fetchall()
        }
        if "structure_template_name" not in age_group_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE tournament_age_groups ADD COLUMN structure_template_name VARCHAR(255)"
            )
        if "structure_config" not in age_group_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE tournament_age_groups ADD COLUMN structure_config JSON"
            )
        if "theme_primary_color" not in tournament_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE tournaments ADD COLUMN theme_primary_color VARCHAR(20)"
            )
        if "theme_accent_color" not in tournament_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE tournaments ADD COLUMN theme_accent_color VARCHAR(20)"
            )
        if "previous_slugs" not in tournament_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE tournaments ADD COLUMN previous_slugs JSON"
            )
        if "event_type" not in tournament_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE tournaments ADD COLUMN event_type VARCHAR(20) NOT NULL DEFAULT 'TOURNAMENT'"
            )
        if "city" not in organization_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE organizations ADD COLUMN city VARCHAR(100)"
            )
        if "token_version" not in user_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0"
            )
        if "updated_at" not in user_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE users ADD COLUMN updated_at DATETIME"
            )
        if "tournament_id" not in team_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE teams ADD COLUMN tournament_id VARCHAR(36)"
            )
        if "organization_id" not in field_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE fields ADD COLUMN organization_id VARCHAR(36)"
            )
            await conn.exec_driver_sql(
                """
                UPDATE fields
                SET organization_id = (
                    SELECT tournaments.organization_id
                    FROM tournaments
                    WHERE tournaments.id = fields.tournament_id
                )
                WHERE organization_id IS NULL
                """
            )
        if "age_group" not in field_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE fields ADD COLUMN age_group VARCHAR(20)"
            )
        if "actual_end_at" not in match_columns:
            await conn.exec_driver_sql(
                "ALTER TABLE matches ADD COLUMN actual_end_at DATETIME"
            )

        await conn.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS structure_templates (
                id VARCHAR(36) PRIMARY KEY NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                organization_id VARCHAR(36),
                age_group VARCHAR(20),
                config JSON NOT NULL,
                is_system BOOLEAN NOT NULL DEFAULT 0,
                FOREIGN KEY(organization_id) REFERENCES organizations(id)
            )
            """
        )
        await conn.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS user_tournament_assignments (
                id VARCHAR(36) PRIMARY KEY NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                tournament_id VARCHAR(36) NOT NULL,
                UNIQUE(user_id, tournament_id),
                FOREIGN KEY(user_id) REFERENCES users(id),
                FOREIGN KEY(tournament_id) REFERENCES tournaments(id)
            )
            """
        )
        await conn.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id VARCHAR(36) PRIMARY KEY NOT NULL,
                user_id VARCHAR(36) NOT NULL,
                token_hash VARCHAR(64) NOT NULL UNIQUE,
                expires_at DATETIME NOT NULL,
                used_at DATETIME,
                created_at DATETIME NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        return

    if dialect == "postgresql":
        await conn.exec_driver_sql(
            "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS city VARCHAR(100)"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS previous_slugs JSON"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS event_type VARCHAR(20) NOT NULL DEFAULT 'TOURNAMENT'"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE matches ADD COLUMN IF NOT EXISTS actual_end_at TIMESTAMP WITH TIME ZONE"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE teams ADD COLUMN IF NOT EXISTS tournament_id VARCHAR(36)"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE fields ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36)"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE fields ADD COLUMN IF NOT EXISTS age_group VARCHAR(20)"
        )
        await conn.exec_driver_sql(
            """
            UPDATE fields
            SET organization_id = tournaments.organization_id
            FROM tournaments
            WHERE fields.tournament_id = tournaments.id
              AND fields.organization_id IS NULL
            """
        )
        await conn.exec_driver_sql(
            "ALTER TABLE fields ALTER COLUMN tournament_id DROP NOT NULL"
        )
        await conn.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS user_tournament_assignments (
                id VARCHAR(36) PRIMARY KEY NOT NULL,
                user_id VARCHAR(36) NOT NULL REFERENCES users(id),
                tournament_id VARCHAR(36) NOT NULL REFERENCES tournaments(id),
                CONSTRAINT uq_user_tournament_assignment UNIQUE (user_id, tournament_id)
            )
            """
        )
        await conn.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id VARCHAR(36) PRIMARY KEY NOT NULL,
                user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash VARCHAR(64) NOT NULL UNIQUE,
                expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                used_at TIMESTAMP WITH TIME ZONE,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL
            )
            """
        )


async def _ensure_alembic_version(conn: AsyncConnection) -> None:
    await conn.exec_driver_sql(
        "CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL)"
    )
    result = await conn.exec_driver_sql("SELECT version_num FROM alembic_version LIMIT 1")
    current = result.scalar_one_or_none()
    if current is None:
        await conn.exec_driver_sql("INSERT INTO alembic_version(version_num) VALUES ('005')")
    elif current != "005":
        await conn.exec_driver_sql("UPDATE alembic_version SET version_num = '005'")
