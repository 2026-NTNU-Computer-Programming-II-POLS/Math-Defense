"""Seed the database with a demo user for first-time players.

Gated on SEED_DEMO_USER=true so production deployments don't silently ship a
well-known public credential. When the flag is off (default), this is a no-op.

Idempotent — uses INSERT ... ON CONFLICT DO NOTHING.
"""
import logging
import os
import uuid
from datetime import datetime, UTC

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.utils.security import hash_password

logger = logging.getLogger(__name__)

DEMO_EMAIL = "demo@mathdefense.local"
DEMO_PASSWORD = "Demo1234"
DEMO_PLAYER_NAME = "demo"


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
            INSERT INTO users (id, username, email, player_name, role, password_hash, created_at, updated_at)
            VALUES (:id, :username, :email, :player_name, :role, :password_hash, :created_at, :updated_at)
            ON CONFLICT DO NOTHING
            """
        ),
        {
            "id": str(uuid.uuid4()),
            "username": DEMO_PLAYER_NAME,
            "email": DEMO_EMAIL,
            "player_name": DEMO_PLAYER_NAME,
            "role": "student",
            "password_hash": hash_password(DEMO_PASSWORD),
            "created_at": now,
            "updated_at": now,
        },
    )
    db.commit()
    if result.rowcount:
        logger.info("Seeded demo user: %s", DEMO_EMAIL)
    else:
        logger.debug("Demo user already exists — skipping seed")
