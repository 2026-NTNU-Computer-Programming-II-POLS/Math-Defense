"""Seed the database with a demo user for first-time players.

Idempotent — skips creation when the demo user already exists.
Called from the application lifespan after Alembic migrations.
"""
import logging

from sqlalchemy.orm import Session

from app.domain.user.aggregate import User
from app.infrastructure.persistence.user_repository import SqlAlchemyUserRepository
from app.utils.security import hash_password

logger = logging.getLogger(__name__)

DEMO_USERNAME = "demo"
DEMO_PASSWORD = "Demo1234"


def ensure_demo_user(db: Session) -> None:
    """Create the demo user if it does not already exist."""
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
    logger.info("Seeded demo user: %s / %s", DEMO_USERNAME, DEMO_PASSWORD)
