"""Auth-support repository Protocols.

The Application layer talks to these interfaces so it never touches a raw
SQLAlchemy Session for lockout / revocation state. Keeps AuthApplicationService
independent of the persistence technology and lets the Unit of Work own every
commit.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class LoginAttemptRepository(Protocol):
    def is_locked(self, username: str) -> bool: pass

    def record_failure(self, username: str) -> None: pass

    def clear(self, username: str) -> None: pass


@runtime_checkable
class TokenDenylistRepository(Protocol):
    def deny(self, jti: str, expires_at: float) -> None: pass

    def is_denied(self, jti: str) -> bool: pass
