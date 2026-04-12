import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.config import settings
from app.db.database import create_tables
from app.routers import auth, leaderboard, game_session
from app.limiter import limiter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.auto_create_tables:
        create_tables()
        logger.info("Database tables ensured (dev mode: create_all)")
    else:
        logger.info("Skipping create_all — use Alembic migrations for schema changes")
    yield


app = FastAPI(
    title="Math Defense API",
    description="Math Defense Game Backend API",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Routes
app.include_router(auth.router)
app.include_router(leaderboard.router)
app.include_router(game_session.router)


@app.get("/")
def root():
    return {"message": "Math Defense API is running", "docs": "/docs"}
