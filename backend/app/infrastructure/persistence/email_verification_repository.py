from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, UTC

from sqlalchemy.orm import Session as DbSession

from app.models.email_verification_token import EmailVerificationToken


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class SqlAlchemyEmailVerificationRepository:

    def __init__(self, db: DbSession) -> None:
        self._db = db

    def create(self, user_id: str, token: str, expires_at: datetime) -> None:
        # Store only SHA-256 of the raw token, mirroring refresh_token storage.
        # If the database is read-disclosed (backup leak, replica compromise)
        # plaintext tokens would otherwise let the attacker walk straight into
        # a verified-email state for any pending user.
        record = EmailVerificationToken(
            id=str(uuid.uuid4()),
            user_id=user_id,
            token=_hash_token(token),
            expires_at=expires_at,
            used=False,
        )
        self._db.add(record)
        self._db.flush()

    def consume_verification_token(self, token: str) -> str | None:
        """Validate the token, mark it used, and return its user_id.

        Returns None if the token does not exist, is already used, or has expired.
        All checks and the mark-as-used mutation happen in the same call so the
        caller never touches an ORM object directly.
        """
        record = (
            self._db.query(EmailVerificationToken)
            .filter(EmailVerificationToken.token == _hash_token(token))
            .first()
        )
        if record is None or record.used:
            return None
        expires = record.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        if datetime.now(UTC) > expires:
            return None
        record.used = True
        self._db.flush()
        return record.user_id

    def invalidate_for_user(self, user_id: str) -> None:
        """Mark all pending tokens for a user as used so only the newest works."""
        self._db.query(EmailVerificationToken).filter(
            EmailVerificationToken.user_id == user_id,
            EmailVerificationToken.used.is_(False),
        ).update({"used": True})
        self._db.flush()
