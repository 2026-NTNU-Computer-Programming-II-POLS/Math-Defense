import logging
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.domain.errors import DomainError
from app.routers import auth, leaderboard, game_session
from app.limiter import limiter

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# backend/app/main.py -> backend/app -> backend -> backend/alembic.ini
_ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Alembic is the single source of truth for schema. `upgrade head` is idempotent
    # when the DB is already current, so running it every boot is cheap and removes
    # the prior race between Base.metadata.create_all and operator-run migrations.
    cfg = Config(str(_ALEMBIC_INI))
    command.upgrade(cfg, "head")
    logger.info("Alembic: schema at head")
    yield


app = FastAPI(
    title="Math Defense API",
    description="Math Defense Game Backend API",
    version="1.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(DomainError)
async def _domain_error_handler(_request: Request, exc: DomainError) -> JSONResponse:
    # DomainError subclasses carry their own status_code; pluck it and surface
    # the message. Unhandled bugs still fall through to Starlette's default 500.
    return JSONResponse(status_code=exc.status_code, content={"detail": str(exc)})


@app.exception_handler(ValueError)
async def _value_error_handler(_request: Request, exc: ValueError) -> JSONResponse:
    # Domain invariants (e.g. score must not decrease) raise plain ValueError;
    # treat them as 422 so routers don't need to re-wrap every call.
    return JSONResponse(status_code=422, content={"detail": str(exc)})


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


@app.get("/health")
def health():
    return {"status": "ok"}
