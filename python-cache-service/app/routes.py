from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from .cache import cached
from .config import settings
from .database import get_session
from . import tmdb, youtube, analysis

router = APIRouter()

# Base TTL values - will be adjusted dynamically based on movie popularity/age
BASE_TTL_LISTS = 6 * 60 * 60          # popular / now-playing / upcoming / top-rated: 6 hours
BASE_TTL_SEARCH = 12 * 60 * 60        # search results: 12 hours
BASE_TTL_DETAILS = 30 * 24 * 60 * 60  # movie details: 30 days (barely changes once released)
BASE_TTL_ANALYSIS = 3 * 24 * 60 * 60  # YouTube review sentiment: 3 days (base)


def calculate_dynamic_ttl(base_ttl: int, popularity: float = 0, release_date: str = None) -> int:
    """
    Calculate dynamic TTL based on movie popularity and release date.
    More popular or newer movies get shorter TTL (cached for less time).
    Less popular or older movies get longer TTL (cached for more time).
    """
    if popularity == 0 and not release_date:
        return base_ttl

    # Normalize popularity (TMDB popularity scores are typically 0-100+ but can vary)
    # Popularity factor: higher popularity = lower multiplier (shorter TTL)
    popularity_factor = 1.0
    if popularity > 0:
        # Scale popularity to a 0.5-1.5 range for adjustment
        # Very popular (>50) -> 0.5x TTL, Less popular (<10) -> 1.5x TTL
        popularity_factor = max(0.5, min(1.5, 2.0 - (popularity / 50.0)))

    # Release date factor: newer movies get shorter TTL
    date_factor = 1.0
    if release_date:
        try:
            from datetime import datetime
            release = datetime.strptime(release_date, "%Y-%m-%d")
            now = datetime.now()
            days_old = (now - release).days

            # Newer movies (less than 30 days) -> 0.5x TTL
            # Older movies (more than 2 years) -> 2.0x TTL
            if days_old < 30:
                date_factor = 0.5
            elif days_old > 730:  # 2 years
                date_factor = 2.0
            else:
                # Linear interpolation between 30 days and 2 years
                date_factor = 0.5 + (1.5 * min(1.0, (days_old - 30) / 700))
        except:
            pass  # Keep default date_factor if parsing fails

    # Combine factors (both reduce TTL when >1.0, but we want inverse for TTL)
    # Actually, we want: higher popularity/newer = LOWER TTL multiplier
    combined_factor = (popularity_factor * date_factor)

    # Apply factor to base TTL (ensure reasonable bounds)
    dynamic_ttl = int(base_ttl * combined_factor)

    # Enforce minimum and maximum bounds
    min_ttl = 30 * 60      # 30 minutes minimum
    max_ttl = 90 * 24 * 60 * 60  # 90 days maximum

    return max(min_ttl, min(max_ttl, dynamic_ttl))


async def get_cached_or_fetch_analysis(session: AsyncSession, movie_id: str, movie_data: dict) -> tuple[list, dict]:
    """
    Get analysis data with special handling for new movies:
    - Movies released in last 2 days: always fetch fresh (no cache delay)
    - Movies released in last 7 days: very short TTL (1 hour)
    - Older movies: use dynamic TTL based on popularity/age
    Returns (reviews, source_errors)
    """
    title = movie_data.get("title", "")
    popularity = movie_data.get("popularity", 0)
    release_date = movie_data.get("release_date")

    # Check if this is a very new movie (released within last 2 days)
    is_very_new = False
    if release_date:
        try:
            from datetime import datetime
            release = datetime.strptime(release_date, "%Y-%m-%d")
            now = datetime.now()
            days_old = (now - release).days
            is_very_new = days_old <= 2
        except:
            pass  # Keep default if parsing fails

    # For very new movies (last 2 days), bypass cache entirely for fresh data
    if is_very_new:
        try:
            reviews = await youtube.fetch_reviews(title)
            source_errors = None
        except Exception as exc:
            reviews = []
            source_errors = {"youtube": str(exc)}
        return reviews, source_errors

    # For somewhat new movies (last 7 days), use very short TTL
    is_recent = False
    if release_date and not is_very_new:
        try:
            from datetime import datetime
            release = datetime.strptime(release_date, "%Y-%m-%d")
            now = datetime.now()
            days_old = (now - release).days
            is_recent = days_old <= 7
        except:
            pass  # Keep default if parsing fails

    if is_recent:
        # Very short TTL for recent movies (1 hour)
        analysis_ttl = 60 * 60  # 1 hour
    else:
        # Calculate dynamic TTL for analysis based on popularity and age
        analysis_ttl = calculate_dynamic_ttl(BASE_TTL_ANALYSIS, popularity, release_date)

    # Fetch YouTube reviews with calculated TTL
    try:
        reviews = await cached(
            session, f"movie:{movie_id}:reviews", "reviews", analysis_ttl,
            lambda: youtube.fetch_reviews(title),
        )
        source_errors = None
    except Exception as exc:
        reviews = []
        source_errors = {"youtube": str(exc)}

    return reviews, source_errors


def error_message(exc: Exception) -> str:
    text = str(exc)
    return text.split(" for url:")[0] if " for url:" in text else text


async def get_full(session: AsyncSession, movie_id: str) -> dict:
    # Get movie details with standard long TTL (details don't change much)
    movie = await cached(
        session, f"movie:{movie_id}:details", "movie_details", BASE_TTL_DETAILS,
        lambda: tmdb.movie_details(movie_id),
    )

    # Get analysis with special handling for new movies
    reviews, source_errors = await get_cached_or_fetch_analysis(session, movie_id, movie)

    result = analysis.analyze(reviews, movie["title"])
    result["source_errors"] = source_errors
    return {"movie": movie, "analysis": result}


@router.get("/api/health")
async def health():
    missing = [
        name for name, value in (
            ("TMDB_API_KEY", settings.tmdb_api_key),
            ("YOUTUBE_API_KEY", settings.youtube_api_key),
        ) if not value
    ]
    return {"status": "ok", "missing_api_keys": missing, "ready": not missing}


@router.get("/api/search")
async def search(q: str = Query(...), page: int = 1, session: AsyncSession = Depends(get_session)):
    query = q.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query param 'q' is required")
    try:
        key = f"search:{query.lower()}:page={page}"
        return await cached(session, key, "search", BASE_TTL_SEARCH, lambda: tmdb.search_movies(query, page))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=error_message(exc))


# --- Literal list routes MUST be registered before the /{movie_id} routes below,
# --- so e.g. "/api/movies/popular" never gets swallowed by the movie_id matcher.

_LIST_ROUTES = {
    "popular": "/movie/popular",
    "now-playing": "/movie/now_playing",
    "upcoming": "/movie/upcoming",
    "top-rated": "/movie/top_rated",
}


def _make_list_handler(route_name: str, tmdb_path: str):
    async def _handler(page: int = 1, session: AsyncSession = Depends(get_session)):
        try:
            key = f"list:{route_name}:page={page}"
            return await cached(
                session, key, "movie_list", BASE_TTL_LISTS,
                lambda: tmdb.movie_list(tmdb_path, page),
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail=error_message(exc))

    return _handler


for _route_name, _tmdb_path in _LIST_ROUTES.items():
    router.add_api_route(
        f"/api/movies/{_route_name}",
        _make_list_handler(_route_name, _tmdb_path),
        methods=["GET"],
    )


@router.get("/api/movies/{movie_id}/full")
async def movie_full_route(movie_id: str, session: AsyncSession = Depends(get_session)):
    try:
        return await get_full(session, movie_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=error_message(exc))


@router.get("/api/movies/{movie_id}/analysis")
async def movie_analysis_route(movie_id: str, session: AsyncSession = Depends(get_session)):
    try:
        result = await get_full(session, movie_id)
        return result["analysis"]
    except Exception as exc:
        raise HTTPException(status_code=502, detail=error_message(exc))


@router.get("/api/movies/{movie_id}")
async def movie_details_route(movie_id: str, session: AsyncSession = Depends(get_session)):
    try:
        key = f"movie:{movie_id}:details"
        return await cached(session, key, "movie_details", BASE_TTL_DETAILS, lambda: tmdb.movie_details(movie_id))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=error_message(exc))