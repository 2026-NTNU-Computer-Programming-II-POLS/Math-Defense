"""Seed the database with a demo user for first-time players.

Gated on SEED_DEMO_USER=true so production deployments don't silently ship a
well-known public credential. When the flag is off (default), this is a no-op.

Idempotent — re-runs check for the existing email and skip the insert.
"""
import logging
import os

from sqlalchemy.orm import Session

from app.application.auth_service import _assert_password_strength
from app.config import settings
from app.domain.errors import ConstraintViolationError, DomainValueError
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.infrastructure.persistence.user_repository import SqlAlchemyUserRepository
from app.schemas.auth import _validate_password_shape
from app.utils.security import hash_password

logger = logging.getLogger(__name__)

DEMO_EMAIL = "demo@mathdefense.local"
DEMO_PLAYER_NAME = "demo"


def _is_enabled() -> bool:
    return os.environ.get("SEED_DEMO_USER", "").strip().lower() in ("1", "true", "yes", "on")


def _demo_password() -> str | None:
    """Return the demo user password from env, or None if unset (seed is skipped)."""
    return os.environ.get("DEMO_SEED_PASSWORD") or None


def ensure_demo_user(db: Session) -> None:
    """Create the demo user if SEED_DEMO_USER is enabled and it does not already exist.

    Routes through ``User.create`` + ``SqlAlchemyUserRepository.save`` rather than
    a raw INSERT so the aggregate's invariants (id assignment, defaulted
    progression fields) cannot drift from the production registration path
    (B-ARCH-12).
    """
    if not _is_enabled():
        logger.debug("SEED_DEMO_USER not set — skipping demo seed")
        return

    # Refuse to seed in production-shaped environments. The demo account
    # is for local development and CI; if frontend_url looks like a real
    # site, an operator has likely flipped the flag in the wrong env.
    fe = (settings.frontend_url or "").lower()
    if not any(token in fe for token in ("localhost", "127.0.0.1", "0.0.0.0", ".local", ".test")):
        logger.warning(
            "SEED_DEMO_USER=true but frontend_url=%s does not look like a dev environment — skipping demo seed",
            settings.frontend_url,
        )
        return

    password = _demo_password()
    if password is None:
        logger.warning("SEED_DEMO_USER=true but DEMO_SEED_PASSWORD is not set — skipping demo seed")
        return

    # Apply the full strength check (shape + zxcvbn) the registration path
    # uses so a weak DEMO_SEED_PASSWORD can't slip in past the production
    # rules. The seed runs offline, so calling zxcvbn here is fine — the
    # B-ARCH-18 concern is HTTP-edge DoS, not seed startup cost.
    try:
        _validate_password_shape(password)
        _assert_password_strength(password)
    except (ValueError, DomainValueError) as exc:
        logger.warning("DEMO_SEED_PASSWORD rejected: %s — skipping demo seed", exc)
        return

    repo = SqlAlchemyUserRepository(db)
    if repo.find_by_email(DEMO_EMAIL) is not None:
        logger.debug("Demo user already exists — skipping seed")
        return

    try:
        user = User.create(
            email=DEMO_EMAIL,
            player_name=DEMO_PLAYER_NAME,
            role=Role.STUDENT,
            password_hash=hash_password(password),
        )
        repo.save(user)
        db.commit()
    except (ConstraintViolationError, DomainValueError) as exc:
        # Race against another process seeding the same row, or an aggregate
        # invariant tripping. Roll back and treat as "already seeded" — the
        # next caller's find_by_email will short-circuit.
        db.rollback()
        logger.debug("Demo user seed skipped (%s)", exc)
        return

    logger.info("Seeded demo user (role: student)")
