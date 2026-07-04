from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


engine = create_async_engine(
    settings.database_url,
    echo=settings.env == "development",
    pool_pre_ping=True,   # verify a conn before use (managed PG drops idle ones)
    pool_size=10,
    max_overflow=10,      # up to 20 concurrent conns
    pool_recycle=1800,    # recycle every 30 min to avoid stale connections
)

AsyncSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding a database session."""
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    """Create tables on startup.

    For MVP we use create_all; production migrations are managed by Alembic.
    """
    # Import models so they register on Base.metadata before create_all.
    from app import models  # noqa: F401
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # create_all won't add columns to a pre-existing table. Idempotently
        # backfill columns added after a table first shipped (Postgres-only).
        await conn.execute(
            text(
                "ALTER TABLE game_sessions "
                "ADD COLUMN IF NOT EXISTS mode VARCHAR(16) NOT NULL DEFAULT 'versus'"
            )
        )
