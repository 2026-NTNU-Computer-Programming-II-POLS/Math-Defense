"""Auth-support repository Protocols.

The Application layer talks to these interfaces so it never touches a raw
SQLAlchemy Session for lockout / revocation state. Keeps AuthApplicationService
independent of the persistence technology and lets the Unit of Work own every
commit.
"""
from __future__ import annotations

from datetime import datetime
from typing import Protocol, runtime_checkable


@runtime_checkable
class LoginAttemptRepository(Protocol):
    def is_locked(self, username: str) -> "datetime | None": ...

    def record_failure(self, username: str) -> None: ...

    def clear(self, username: str) -> None: ...


@runtime_checkable
class TokenDenylistRepository(Protocol):
    def deny(self, jti: str, expires_at: float) -> None: ...

    def is_denied(self, jti: str) -> bool: ...


@runtime_checkable
class EmailVerificationRepository(Protocol):
    def create(self, user_id: str, token: str, expires_at: datetime) -> None: ...

    def consume_verification_token(self, token: str) -> str | None:
        """Mark the token used and return its user_id, or None if invalid/expired."""
        ...

    def invalidate_for_user(self, user_id: str) -> None:
        """Mark all pending tokens for a user as used (called before issuing a new one)."""
        ...


@runtime_checkable
class RefreshTokenRepository(Protocol):
    def create(self, user_id: str, token_hash: str, expires_at: datetime) -> None: ...

    def consume(self, token_hash: str) -> str | None:
        """Mark token used (rotation) and return its user_id, or None if invalid/expired/used/revoked."""
        ...

    def revoke_all_for_user(self, user_id: str) -> None:
        """Revoke every active refresh token for a user (e.g., on logout or password change)."""
        ...


@runtime_checkable
class EmailService(Protocol):
    def send_verification_email(self, to: str, player_name: str, token: str) -> None: ...
