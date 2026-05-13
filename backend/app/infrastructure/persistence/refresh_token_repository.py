from __future__ import annotations

import uuid
from datetime import datetime, UTC

from sqlalchemy.orm import Session as DbSession

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

    def consume(self, token_hash: str) -> str | None:
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
            return None
        # Reuse detection: a token presented after it has already been
        # rotated (used) or after revocation indicates either a stolen
        # cookie or a victim's session being replayed by an attacker.
        # Treat as compromise and revoke every refresh token for this
        # user — both lineages die so neither party retains access.
        if record.used or record.revoked:
            self.revoke_all_for_user(record.user_id)
            return None
        expires = record.expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=UTC)
        if datetime.now(UTC) > expires:
            return None
        record.used = True
        self._db.flush()
        return record.user_id

    def revoke_all_for_user(self, user_id: str) -> None:
        self._db.query(RefreshToken).filter(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked.is_(False),
        ).update({"revoked": True})
        self._db.flush()
