import httpx

from .config import settings

TMDB_BASES = ["https://api.tmdb.org/3", "https://api.themoviedb.org/3"]
TMDB_IMAGES = "https://image.tmdb.org/t/p/w500"


def image_url(path):
    return f"{TMDB_IMAGES}{path}" if path else None


def simplify(movie: dict) -> dict:
    return {
        "id": movie.get("id"),
        "title": movie.get("title"),
        "release_date": movie.get("release_date"),
        "overview": movie.get("overview"),
        "poster_url": image_url(movie.get("poster_path")),
        "backdrop_url": image_url(movie.get("backdrop_path")),
        "vote_average": movie.get("vote_average"),
        "popularity": movie.get("popularity"),
    }


async def tmdb_request(pathname: str, params: dict | None = None) -> dict:
    if not settings.tmdb_api_key:
        raise RuntimeError("TMDB_API_KEY is not configured on the server.")

    query = dict(params or {})
    query["api_key"] = settings.tmdb_api_key

    last_error: Exception | None = None
    async with httpx.AsyncClient(timeout=15) as client:
        for base in TMDB_BASES:
            try:
                response = await client.get(
                    f"{base}{pathname}", params=query, headers={"Accept": "application/json"}
                )
                response.raise_for_status()
                return response.json()
            except Exception as exc:  # try the mirror host next
                last_error = exc
                continue

    raise last_error or RuntimeError("TMDB request failed")


async def search_movies(query: str, page: int) -> dict:
    data = await tmdb_request("/search/movie", {"query": query, "page": page})
    return {
        "query": query,
        "page": data.get("page"),
        "total_results": data.get("total_results"),
        "total_pages": data.get("total_pages"),
        "results": [simplify(m) for m in data.get("results") or []],
    }


async def movie_list(path: str, page: int) -> dict:
    data = await tmdb_request(path, {"page": page})
    return {
        "page": data.get("page"),
        "total_pages": data.get("total_pages"),
        "results": [simplify(m) for m in data.get("results") or []],
    }


async def movie_details(movie_id: str) -> dict:
    data = await tmdb_request(f"/movie/{movie_id}", {"append_to_response": "credits,videos"})

    videos = (data.get("videos") or {}).get("results") or []
    trailer = next(
        (v for v in videos if v.get("site") == "YouTube" and v.get("type") in ("Trailer", "Teaser")),
        None,
    )
    credits = data.get("credits") or {}
    director = next(
        (p.get("name") for p in (credits.get("crew") or []) if p.get("job") == "Director"),
        None,
    )
    cast = [
        {"name": p.get("name"), "character": p.get("character")}
        for p in (credits.get("cast") or [])[:8]
    ]

    trailer_out = None
    if trailer and trailer.get("key"):
        key = trailer["key"]
        trailer_out = {
            "name": trailer.get("name"),
            "youtube_key": key,
            "youtube_url": f"https://www.youtube.com/watch?v={key}",
            "youtube_embed_url": f"https://www.youtube.com/embed/{key}",
        }

    return {
        "id": data.get("id"),
        "title": data.get("title"),
        "tagline": data.get("tagline"),
        "overview": data.get("overview"),
        "release_date": data.get("release_date"),
        "runtime": data.get("runtime"),
        "genres": [g.get("name") for g in data.get("genres") or []],
        "poster_url": image_url(data.get("poster_path")),
        "backdrop_url": image_url(data.get("backdrop_path")),
        "vote_average": data.get("vote_average"),
        "vote_count": data.get("vote_count"),
        "director": director,
        "cast": cast,
        "trailer": trailer_out,
    }
