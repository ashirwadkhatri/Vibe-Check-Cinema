from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import init_models
from .routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Creates the cached_responses table on first run if it doesn't exist yet.
    await init_models()
    yield


app = FastAPI(title="Vibecheck Cinema Cache Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(router)
