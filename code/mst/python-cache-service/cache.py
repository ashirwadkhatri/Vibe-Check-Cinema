from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import CachedResponse


def utcnow() -> datetime:
    # Naive UTC on purpose - kept consistent with the naive DateTime columns in models.py.
    return datetime.utcnow()


async def cache_get(session: AsyncSession, key: str):
    """Return the cached payload if present and not expired, else None."""
    result = await session.execute(select(CachedResponse).where(CachedResponse.cache_key == key))
    row = result.scalar_one_or_none()
    if row is None:
        return None
    if row.expires_at <= utcnow():
        return None
    row.hit_count += 1
    await session.commit()
    return row.payload


async def cache_set(session: AsyncSession, key: str, endpoint: str, payload: dict, ttl_seconds: int) -> dict:
    """Insert or update the cached payload for this key, resetting its expiry."""
    result = await session.execute(select(CachedResponse).where(CachedResponse.cache_key == key))
    row = result.scalar_one_or_none()
    expires_at = utcnow() + timedelta(seconds=ttl_seconds)

    if row is not None:
        row.payload = payload
        row.expires_at = expires_at
        row.endpoint = endpoint
    else:
        row = CachedResponse(
            cache_key=key,
            endpoint=endpoint,
            payload=payload,
            expires_at=expires_at,
        )
        session.add(row)

    await session.commit()
    return payload


async def cached(session: AsyncSession, key: str, endpoint: str, ttl_seconds: int, fetcher):
    """
    Look up `key` in the DB cache. On a miss (or expiry), call the async `fetcher()`
    to get fresh data from the real API, store it, and return it.
    """
    existing = await cache_get(session, key)
    if existing is not None:
        return existing
    fresh = await fetcher()
    return await cache_set(session, key, endpoint, fresh, ttl_seconds)
