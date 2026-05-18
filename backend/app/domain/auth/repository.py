"""Auth-support repository Protocols.

The Application layer talks to these interfaces so it never touches a raw
SQLAlchemy Session for lockout / revocation state. Keeps AuthApplicationService
independent of the persistence technology and lets the Unit of Work own every
commit.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
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


class RefreshTokenConsumeStatus(Enum):
    """Outcome of RefreshTokenRepository.consume()."""

    OK = "ok"  # token rotated; user_id is set
    INVALID = "invalid"  # not found / expired; user_id is None
    # Token presented after rotation or revocation — a stolen-cookie replay.
    # user_id is set so the caller can revoke the whole token family.
    REUSE_DETECTED = "reuse_detected"


@dataclass(frozen=True)
class RefreshTokenConsumeResult:
    """Typed result of consume().

    consume() deliberately does not perform the reuse->revoke cascade itself.
    Returning REUSE_DETECTED hands that decision to the caller, which owns the
    Unit of Work and so can revoke the token family and commit it where the
    transaction boundary is visible (BA-S1 / BA-U1).
    """

    status: RefreshTokenConsumeStatus
    user_id: str | None = None


@runtime_checkable
class RefreshTokenRepository(Protocol):
    def create(self, user_id: str, token_hash: str, expires_at: datetime) -> None: ...

    def consume(self, token_hash: str) -> RefreshTokenConsumeResult:
        """Mark the token used (rotation) and report the outcome.

        Returns OK with the user_id on a valid token, INVALID when the token
        is missing/expired, and REUSE_DETECTED (with the user_id) when the
        token was already used or revoked. consume() does NOT revoke the
        token family on reuse — the caller owns that decision and the commit
        that makes it durable.
        """
        ...

    def revoke_all_for_user(self, user_id: str) -> None:
        """Revoke every active refresh token for a user (e.g., on logout or password change)."""
        ...


@runtime_checkable
class EmailService(Protocol):
    def send_verification_email(self, to: str, player_name: str, token: str) -> None: ...

    def send_account_exists_notice(self, to: str, player_name: str) -> None:
        """Notify the holder of an existing account that someone tried to register
        with their email. Carries no token: it is purely informational so the
        existing user knows to sign in (or change password if it wasn't them)."""
        ...
