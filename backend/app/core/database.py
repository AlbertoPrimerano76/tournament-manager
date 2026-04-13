from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


class Base(DeclarativeBase):
    pass


_is_sqlite = settings.async_database_url.startswith("sqlite")
engine = create_async_engine(
    settings.async_database_url,
    echo=False,
    pool_pre_ping=True,
    **({} if _is_sqlite else {
        "pool_size": 10,       # persistent connections always open
        "max_overflow": 20,    # burst headroom (was 40 — caused OOM on free tier)
        "pool_timeout": 30,    # wait max 30s before giving up
        "pool_recycle": 300,
    }),
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
