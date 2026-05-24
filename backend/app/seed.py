"""Seed dev accounts (teacher + student) for local development.

Gated on SEED_DEMO_USER=true so production deployments don't silently ship
well-known public credentials. When the flag is off (default), this is a
no-op.

These accounts are intentionally weak by production standards — they are
chosen for memorability and are also rendered in the AuthView UI when the
frontend is built in dev mode (import.meta.env.DEV). Two guards prevent
them from reaching production:

  1. `_is_dev_environment()` below refuses to seed unless FRONTEND_URL
     points at a recognised local-dev host.
  2. Vite eliminates the `import.meta.env.DEV` false branch from production
     bundles, so the credentials never leave the source tree.

The credential list below is mirrored in
``frontend/src/views/AuthView.vue`` (DEV_ACCOUNTS). Edits in one must be
echoed in the other; the two are co-located for "what the seed creates"
and "what the UI shows" to stay in lockstep.
"""
import logging
import os
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import settings
from app.domain.errors import ConstraintViolationError, DomainValueError
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.infrastructure.persistence.user_repository import SqlAlchemyUserRepository
from app.schemas.auth import _validate_password_shape
from app.utils.security import hash_password

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class _DevAccount:
    email: str
    player_name: str
    role: Role
    password: str


# MIRROR: frontend/src/views/AuthView.vue DEV_ACCOUNTS.
_DEV_ACCOUNTS: tuple[_DevAccount, ...] = (
    _DevAccount(
        email="teacher@mathdefense.local",
        player_name="Teacher",
        role=Role.TEACHER,
        password="TeacherDev2026!",
    ),
    _DevAccount(
        email="student@mathdefense.local",
        player_name="Student",
        role=Role.STUDENT,
        password="StudentDev2026!",
    ),
)


def _is_enabled() -> bool:
    return os.environ.get("SEED_DEMO_USER", "").strip().lower() in ("1", "true", "yes", "on")


def _is_dev_environment() -> bool:
    fe = (settings.frontend_url or "").lower()
    return any(token in fe for token in ("localhost", "127.0.0.1", "0.0.0.0", ".local", ".test"))


def _seed_one(repo: SqlAlchemyUserRepository, db: Session, account: _DevAccount) -> None:
    # Shape-only validation: enforces length / character classes / bcrypt's
    # 72-byte cap so we can never persist an unhashable password. The
    # zxcvbn dictionary check applied to /register is deliberately skipped
    # here — dev accounts are display-only credentials.
    try:
        _validate_password_shape(account.password)
    except ValueError as exc:
        logger.error(
            "Dev account %s has an invalid password shape: %s — skipping",
            account.email,
            exc,
        )
        return

    if repo.find_by_email(account.email) is not None:
        logger.debug("Dev account %s already exists — skipping seed", account.email)
        return

    try:
        user = User.create(
            email=account.email,
            player_name=account.player_name,
            role=account.role,
            password_hash=hash_password(account.password),
        )
        repo.save(user)
        db.commit()
        logger.info("Seeded dev account: %s (role=%s)", account.email, account.role.value)
    except (ConstraintViolationError, DomainValueError) as exc:
        # Race against another process seeding the same row, or an aggregate
        # invariant tripping. Roll back and treat as "already seeded" — the
        # next caller's find_by_email will short-circuit.
        db.rollback()
        logger.debug("Dev account %s seed skipped (%s)", account.email, exc)


def ensure_dev_accounts(db: Session) -> None:
    """Create the dev teacher + student accounts if SEED_DEMO_USER is enabled.

    Routes through ``User.create`` + ``SqlAlchemyUserRepository.save`` rather
    than a raw INSERT so the aggregate's invariants (id assignment, defaulted
    progression fields) cannot drift from the production registration path
    (B-ARCH-12). Idempotent: existing emails are skipped row-by-row, so a
    partial seed (one account already present, the other missing) self-heals.
    """
    if not _is_enabled():
        logger.debug("SEED_DEMO_USER not set — skipping dev account seed")
        return

    if not _is_dev_environment():
        logger.warning(
            "SEED_DEMO_USER=true but frontend_url=%s does not look like a dev environment — skipping dev account seed",
            settings.frontend_url,
        )
        return

    repo = SqlAlchemyUserRepository(db)
    for account in _DEV_ACCOUNTS:
        _seed_one(repo, db, account)
