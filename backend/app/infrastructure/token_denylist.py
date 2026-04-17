"""JWT deny-list for server-side logout.

Denied tokens are held until their natural JWT expiry (access_token_expire_minutes),
so the table stays bounded: at most one row per active-then-logged-out user.

Persisted to Postgres so revocations survive process restarts and are visible
to every replica. An earlier in-memory implementation gave "logout" a false
sense of revocation — a leaked token stayed usable on other replicas and
after a restart until its natural TTL.
"""
from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session as DbSession

from app.models.denied_token import DeniedToken


def _now() -> datetime:
    return datetime.now(UTC)


def deny(db: DbSession, jti: str, expires_at: float) -> None:
    """Add a token's JTI to the deny-list until it expires."""
    expiry_dt = datetime.fromtimestamp(expires_at, tz=UTC)
    # Idempotent: logging out a token whose JTI is already denied must not error.
    stmt = pg_insert(DeniedToken).values(jti=jti, expires_at=expiry_dt)
    stmt = stmt.on_conflict_do_nothing(index_elements=["jti"])
    db.execute(stmt)
    # Piggyback cleanup on writes so the table doesn't grow without bound.
    db.execute(delete(DeniedToken).where(DeniedToken.expires_at <= _now()))
    db.commit()


def is_denied(db: DbSession, jti: str) -> bool:
    """Check whether a JTI has been revoked."""
    row = db.get(DeniedToken, jti)
    if row is None:
        return False
    expires_at = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=UTC)
    if expires_at <= _now():
        db.delete(row)
        db.commit()
        return False
    return True


def purge_expired(db: DbSession) -> None:
    """Remove entries whose JWT would have expired anyway."""
    db.execute(delete(DeniedToken).where(DeniedToken.expires_at <= _now()))
    db.commit()
