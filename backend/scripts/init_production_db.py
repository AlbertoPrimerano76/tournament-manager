import asyncio

import app.models  # noqa: F401
from sqlalchemy import inspect, text

from app.core.database import Base, engine


HEAD_REVISION = "005"


async def main() -> None:
    async with engine.begin() as conn:
        table_names = await conn.run_sync(lambda sync_conn: inspect(sync_conn).get_table_names())
        user_tables = [name for name in table_names if name != "alembic_version"]

        if user_tables:
            print(f"Database already initialized ({len(user_tables)} tables found).")
            return

        print("Empty database detected. Creating schema from SQLAlchemy metadata.")
        await conn.run_sync(Base.metadata.create_all)
        await conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL)"
        )
        await conn.execute(text("DELETE FROM alembic_version"))
        await conn.execute(text("INSERT INTO alembic_version(version_num) VALUES (:revision)"), {"revision": HEAD_REVISION})
        print(f"Database initialized and stamped at revision {HEAD_REVISION}.")


if __name__ == "__main__":
    asyncio.run(main())
