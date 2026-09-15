from datetime import datetime

from sqlalchemy import String, DateTime, Integer, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class CachedResponse(Base):
    """
    One row per unique (endpoint + parameters) combination.
    The first user to request something (e.g. search 'batman', or movie id 27205)
    triggers a real TMDB/YouTube call and the result is saved here.
    Every user after that, until it expires, gets served straight from Postgres —
    no external API call at all.
    """

    __tablename__ = "cached_responses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Unique fingerprint of the request, e.g. "movie:27205:full" or "search:batman:page=1"
    cache_key: Mapped[str] = mapped_column(String(512), unique=True, index=True, nullable=False)

    # Which kind of request this was, useful for admin/debugging queries
    endpoint: Mapped[str] = mapped_column(String(64), index=True, nullable=False)

    # The actual cached JSON response
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)

    # Stored as naive UTC datetimes throughout (see app/cache.py's utcnow()) to avoid
    # naive/aware comparison bugs across different DB drivers.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False, index=True)

    # How many times this cached row served a request instead of hitting the real API
    hit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
