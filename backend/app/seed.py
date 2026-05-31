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
    _DevAccount(
        email="admin@mathdefense.local",
        player_name="Admin",
        role=Role.ADMIN,
        password="AdminDev2026!",
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


def ensure_admin_account(db: Session) -> None:
    """Seed the bootstrap admin account if SEED_ADMIN_EMAIL and
    SEED_ADMIN_PASSWORD are both set.

    Idempotent: if the email already exists the function returns without
    modifying the existing row — the DB record is the source of truth after
    first boot, so an operator can change the password in the DB and the
    next restart will not revert it.

    No environment restriction — intended for production first-run as well as
    local setup (unlike ensure_dev_accounts which is localhost-only). When
    running outside a recognised dev host a WARNING is emitted so the startup
    log always records that a privileged seed ran.

    Unexpected DB or domain errors call db.rollback() before re-raising so
    the caller receives a clean session and can continue with other seed steps.
    """
    email = (settings.seed_admin_email or "").strip()
    # SecretStr: access the raw value only here; never log or assign to a
    # plain variable that outlives this scope.
    _secret = settings.seed_admin_password
    password = _secret.get_secret_value() if _secret is not None else ""
    if not email or not password:
        logger.debug("SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin seed")
        return

    if not _is_dev_environment():
        logger.warning(
            "Seeding bootstrap admin account in non-local environment (FRONTEND_URL=%s). "
            "Ensure these credentials are intentional and unique to this environment.",
            settings.frontend_url,
        )

    # Warn when the admin email shadows a well-known dev account — the dev
    # credential would then authenticate as admin, an unintended privilege escalation.
    if any(a.email == email for a in _DEV_ACCOUNTS):
        logger.warning(
            "SEED_ADMIN_EMAIL=%s matches a dev account email. "
            "The known dev password will authenticate as admin if SEED_DEMO_USER is also enabled. "
            "Use a distinct email for the bootstrap admin.",
            email,
        )

    try:
        _validate_password_shape(password)
    except ValueError:
        # Do NOT log exc — a future change to _validate_password_shape could
        # include the raw value in the message, leaking SEED_ADMIN_PASSWORD.
        logger.error("SEED_ADMIN_PASSWORD does not meet complexity requirements — skipping admin seed")
        return

    repo = SqlAlchemyUserRepository(db)
    if repo.find_by_email(email) is not None:
        logger.debug("Admin account %s already exists — skipping seed", email)
        return

    try:
        user = User.create(
            email=email,
            player_name=settings.seed_admin_name,
            role=Role.ADMIN,
            password_hash=hash_password(password),
        )
        # Mark email as verified: the admin key was set by the operator who
        # controls the environment, so they vouch for the identity — the same
        # rationale used in AdminApplicationService.create_teacher.
        user.is_email_verified = True
        repo.save(user)
        db.commit()
        logger.info("Seeded bootstrap admin account: %s", email)
    except (ConstraintViolationError, DomainValueError) as exc:
        # Expected races (two workers starting simultaneously) or aggregate
        # invariant violations. Roll back and treat as already seeded.
        db.rollback()
        logger.debug("Admin account %s seed skipped (%s)", email, exc)
    except Exception:
        # Unexpected error (network drop, tablespace full, etc.). Roll back so
        # the session is clean for the caller, then re-raise.
        db.rollback()
        raise


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
