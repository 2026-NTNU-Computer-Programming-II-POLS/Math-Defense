from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy.orm import Session as DbSession

from app.domain.auth.repository import (
    RefreshTokenConsumeResult,
    RefreshTokenConsumeStatus,
)
from app.models.refresh_token import RefreshToken


class SqlAlchemyRefreshTokenRepository:

    def __init__(self, db: DbSession) -> None:
        self._db = db

    def create(self, user_id: str, token_hash: str, expires_at: datetime) -> None:
        record = RefreshToken(
            id=str(uuid.uuid4()),
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
            used=False,
            revoked=False,
        )
        self._db.add(record)
        self._db.flush()

    def consume(self, token_hash: str) -> RefreshTokenConsumeResult:
        # M3: SELECT FOR UPDATE serialises concurrent refreshes with the same
        # raw token so the used=False check is atomic. Without it two requests
        # arriving within the same READ COMMITTED snapshot can both pass the
        # check and both mint new tokens, leaving a third stolen copy valid.
        record = (
            self._db.query(RefreshToken)
            .filter(RefreshToken.token_hash == token_hash)
            .with_for_update()
            .first()
        )
        if record is None:
            return RefreshTokenConsumeResult(RefreshTokenConsumeStatus.INVALID)
        # Reuse detection: a token presented after it has already been
        # rotated (used) or after revocation indicates either a stolen
        # cookie or a victim's session being replayed by an attacker.
        # The compromise response — revoking every refresh token for the
        # user so both lineages die — is the caller's: it owns the Unit of
        # Work and commits the revocation, so the transaction boundary stays
        # visible instead of being buried here (BA-S1 / BA-U1).
        if record.used or record.revoked:
            return RefreshTokenConsumeResult(
                RefreshTokenConsumeStatus.REUSE_DETECTED, record.user_id
            )
        expires = record.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        if datetime.now(UTC) > expires:
            return RefreshTokenConsumeResult(RefreshTokenConsumeStatus.INVALID)
        record.used = True
        self._db.flush()
        return RefreshTokenConsumeResult(
            RefreshTokenConsumeStatus.OK, record.user_id
        )

    def revoke_all_for_user(self, user_id: str) -> None:
        self._db.query(RefreshToken).filter(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked.is_(False),
        ).update({"revoked": True})
        self._db.flush()
