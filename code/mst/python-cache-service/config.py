import os
from pathlib import Path
from dotenv import load_dotenv

# Load the service-local .env first, then fall back to the project root .env.
# This supports both `./run.sh` from this folder and `uvicorn` from the root.
SERVICE_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = SERVICE_DIR.parent
load_dotenv(SERVICE_DIR / ".env")
load_dotenv(PROJECT_DIR / ".env")


def _normalize_db_url(url: str) -> str:
    """
    Supabase gives you a plain 'postgresql://...' connection string.
    SQLAlchemy's async engine needs the 'postgresql+asyncpg://...' form.
    This makes either style work without the user having to think about it.
    """
    if not url:
        return url
    if url.startswith("postgresql+asyncpg://"):
        return url
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://"):]
    return url


class Settings:
    database_url: str = _normalize_db_url(os.getenv("DATABASE_URL", ""))
    tmdb_api_key: str = os.getenv("TMDB_API_KEY", "")
    youtube_api_key: str = os.getenv("YOUTUBE_API_KEY", "")
    port: int = int(os.getenv("PORT", "8000"))
    # Comma-separated list of origins allowed to call this service directly.
    # Not needed when Node proxies server-to-server, but kept for flexibility.
    cors_origins: list[str] = [
        o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()
    ]


settings = Settings()

if not settings.database_url:
    raise RuntimeError(
        "DATABASE_URL is required. Put your Supabase Postgres connection string in "
        "python-cache-service/.env (see .env.example)."
    )
