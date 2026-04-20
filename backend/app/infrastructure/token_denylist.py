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

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session as DbSession

from app.models.denied_token import DeniedToken


def _now() -> datetime:
    return datetime.now(UTC)


def deny(db: DbSession, jti: str, expires_at: float) -> None:
    """Add a token's JTI to the deny-list until it expires.

    Writes only. Cleanup of expired rows is the job of ``purge_expired``,
    which should run on a scheduler — piggy-backing cleanup on every logout
    was a DoS amplifier and also created a TOCTOU window against readers.
    """
    expiry_dt = datetime.fromtimestamp(expires_at, tz=UTC)
    # Idempotent: logging out a token whose JTI is already denied must not error.
    # No commit here — the enclosing Unit of Work is the transaction boundary.
    stmt = pg_insert(DeniedToken).values(jti=jti, expires_at=expiry_dt)
    stmt = stmt.on_conflict_do_nothing(index_elements=["jti"])
    db.execute(stmt)


def is_denied(db: DbSession, jti: str) -> bool:
    """Check whether a JTI has been revoked.

    Pure read: a single query filters by ``expires_at > now`` so an expired
    row is ignored without deleting it. The previous lazy-delete path created
    a race where concurrent readers could observe inconsistent state while a
    revocation was in flight.
    """
    stmt = select(DeniedToken.jti).where(
        DeniedToken.jti == jti,
        DeniedToken.expires_at > _now(),
    )
    return db.execute(stmt).first() is not None


def purge_expired(db: DbSession) -> None:
    """Remove entries whose JWT would have expired anyway.

    Intended for a scheduled job (e.g. cron/APS) rather than the request path.
    """
    db.execute(delete(DeniedToken).where(DeniedToken.expires_at <= _now()))
    db.commit()
