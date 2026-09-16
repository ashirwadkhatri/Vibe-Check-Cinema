from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.exc import SQLAlchemyError

from .config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session():
    """FastAPI dependency that yields a DB session and always closes it."""
    async with AsyncSessionLocal() as session:
        yield session


async def init_models():
    """Create tables when reachable, without blocking service startup on a transient DB outage."""
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except (SQLAlchemyError, OSError) as error:
        # Firebase auth and the Node frontend do not depend on this service's
        # database. Keep the HTTP service alive so health checks report the
        # actual API-key state and the DB can recover on a later restart.
        print(f"[Database] Startup connection unavailable: {error}")
