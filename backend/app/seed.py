"""Seed the database with a demo user for first-time players.

Gated on SEED_DEMO_USER=true so production deployments don't silently ship a
well-known public credential. When the flag is off (default), this is a no-op.

Idempotent — skips creation when the demo user already exists.
Called from the application lifespan after Alembic migrations.
"""
import logging
import os

from sqlalchemy.orm import Session

from app.domain.user.aggregate import User
from app.infrastructure.persistence.user_repository import SqlAlchemyUserRepository
from app.utils.security import hash_password

logger = logging.getLogger(__name__)

DEMO_USERNAME = "demo"
DEMO_PASSWORD = "Demo1234"


def _is_enabled() -> bool:
    return os.environ.get("SEED_DEMO_USER", "").strip().lower() in ("1", "true", "yes", "on")


def ensure_demo_user(db: Session) -> None:
    """Create the demo user if SEED_DEMO_USER is enabled and it does not already exist."""
    if not _is_enabled():
        logger.debug("SEED_DEMO_USER not set — skipping demo seed")
        return

    repo = SqlAlchemyUserRepository(db)
    if repo.find_by_username(DEMO_USERNAME):
        logger.debug("Demo user already exists — skipping seed")
        return

    user = User.create(
        username=DEMO_USERNAME,
        password_hash=hash_password(DEMO_PASSWORD),
    )
    repo.save(user)
    db.commit()
    # Never log the password: log lines land in aggregators and terminal scrollback.
    logger.info("Seeded demo user: %s", DEMO_USERNAME)
