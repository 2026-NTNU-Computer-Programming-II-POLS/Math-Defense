import asyncio
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
from sqlalchemy import text

from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings
from app.db.database import engine, SessionLocal
from app.domain.errors import DomainError
from app.infrastructure.login_guard import purge_stale as purge_stale_login_attempts
from app.infrastructure.token_denylist import purge_expired as purge_expired_denied_tokens
from app.routers import auth, leaderboard, game_session
from app.limiter import limiter
from app.seed import ensure_demo_user

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# backend/app/main.py -> backend/app -> backend -> backend/alembic.ini
_ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"

# Arbitrary fixed key for the PostgreSQL advisory lock that serialises migrations.
_MIGRATION_LOCK_ID = 483_921_746

# How often the auth-store janitor runs. Frequent enough that rows don't
# accumulate noticeably; infrequent enough that concurrent DELETEs don't
# compete with the login path for row locks.
_JANITOR_INTERVAL_SECONDS = 600


async def _auth_store_janitor() -> None:
    """Periodically purge expired deny-list and stale login-attempt rows.

    Replaces the previous inline cleanup that `deny()` and `is_locked()` ran
    on every write/read — a DoS amplifier under logout spam and a TOCTOU
    source on the read path.
    """
    while True:
        try:
            await asyncio.sleep(_JANITOR_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            return
        db = SessionLocal()
        try:
            purge_expired_denied_tokens(db)
            purge_stale_login_attempts(db)
        except Exception:
            logger.exception("Auth-store janitor iteration failed")
        finally:
            db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Use a PostgreSQL advisory lock to serialise migrations across concurrent
    # workers. Only one worker runs `upgrade head`; the rest wait for the lock
    # and then proceed (the upgrade is a no-op when already at head).
    with engine.connect() as conn:
        conn.execute(text("SELECT pg_advisory_lock(:id)"), {"id": _MIGRATION_LOCK_ID})
        try:
            cfg = Config(str(_ALEMBIC_INI))
            command.upgrade(cfg, "head")
            logger.info("Alembic: schema at head")
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(:id)"), {"id": _MIGRATION_LOCK_ID})
            conn.commit()
    # Seed demo user after schema is up-to-date
    db = SessionLocal()
    try:
        ensure_demo_user(db)
    finally:
        db.close()
    janitor = asyncio.create_task(_auth_store_janitor())
    try:
        yield
    finally:
        janitor.cancel()
        try:
            await janitor
        except asyncio.CancelledError:
            pass


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
    # Domain invariants now raise DomainValueError (a DomainError subclass)
    # and are handled above. Plain ValueErrors from libraries or Python internals
    # get a generic message to avoid leaking stack/internal details.
    return JSONResponse(status_code=422, content={"detail": "Unprocessable request"})


# Security headers — defence-in-depth for direct backend access (dev docker-compose
# exposes port 8000). In production, nginx adds its own set of headers as well.
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
        if request.url.path.startswith("/api/auth"):
            response.headers["Cache-Control"] = "no-store"
        return response

app.add_middleware(SecurityHeadersMiddleware)

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
