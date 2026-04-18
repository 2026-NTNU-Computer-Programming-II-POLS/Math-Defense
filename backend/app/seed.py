"""Seed the database with a demo user for first-time players.

Gated on SEED_DEMO_USER=true so production deployments don't silently ship a
well-known public credential. When the flag is off (default), this is a no-op.

Idempotent — uses INSERT ... ON CONFLICT DO NOTHING so concurrent workers
racing at startup (the advisory lock is released after Alembic finishes, not
after this seed) cannot produce duplicate-key errors.
"""
import logging
import os
import uuid
from datetime import datetime, UTC

from sqlalchemy import text
from sqlalchemy.orm import Session

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

    now = datetime.now(UTC)
    result = db.execute(
        text(
            """
            INSERT INTO users (id, username, password_hash, created_at, updated_at)
            VALUES (:id, :username, :password_hash, :created_at, :updated_at)
            ON CONFLICT (username) DO NOTHING
            """
        ),
        {
            "id": str(uuid.uuid4()),
            "username": DEMO_USERNAME,
            "password_hash": hash_password(DEMO_PASSWORD),
            "created_at": now,
            "updated_at": now,
        },
    )
    db.commit()
    # Never log the password: log lines land in aggregators and terminal scrollback.
    if result.rowcount:
        logger.info("Seeded demo user: %s", DEMO_USERNAME)
    else:
        logger.debug("Demo user already exists — skipping seed")
