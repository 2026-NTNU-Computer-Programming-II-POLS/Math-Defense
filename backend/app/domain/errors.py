"""Domain error hierarchy.

Each subclass carries its HTTP status code so the global exception handler
can translate domain failures without a try/except wall in every router.
"""
from __future__ import annotations


class DomainError(Exception):
    """Base class for errors raised from domain / application layers."""
    status_code: int = 400


# ── Session ──

class SessionNotFoundError(DomainError):
    status_code = 404


class SessionStaleError(DomainError):
    status_code = 410


class SessionNotActiveError(DomainError):
    status_code = 409


class InvalidStatusTransitionError(DomainError):
    status_code = 409


# ── Auth ──

class UsernameTakenError(DomainError):
    status_code = 409


class InvalidCredentialsError(DomainError):
    status_code = 401


class AccountLockedError(DomainError):
    status_code = 429

    def __init__(self, message: str = "", retry_after_seconds: int | None = None) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class AccountDisabledError(DomainError):
    status_code = 403


class InvalidTokenError(DomainError):
    status_code = 401


class UserNotFoundError(DomainError):
    status_code = 403


class EmailNotVerifiedError(DomainError):
    status_code = 403


class InvalidMFACodeError(DomainError):
    status_code = 401


class MFANotSetupError(DomainError):
    status_code = 400


class MFAAlreadyEnabledError(DomainError):
    status_code = 409


# ── Validation ──

class DomainValueError(DomainError, ValueError):
    """Domain invariant expressed as a value constraint (e.g. score must not decrease).

    Inherits from both DomainError (carries status_code for the global handler)
    and ValueError (semantic compatibility with existing except-clauses / tests).
    The DomainError handler takes precedence over the generic ValueError handler
    because it is registered first.
    """
    status_code = 422


# ── Leaderboard ──

class SessionValidationError(DomainError):
    status_code = 400


class PermissionDeniedError(DomainError):
    status_code = 403


class DuplicateSubmissionError(DomainError):
    status_code = 409


# ── Talent ──

class InsufficientTalentPointsError(DomainError):
    status_code = 409


class PrerequisiteNotMetError(DomainError):
    status_code = 409


class MaxLevelReachedError(DomainError):
    status_code = 409


class TalentNodeNotFoundError(DomainError):
    status_code = 409


# ── Persistence (infrastructure boundary) ──

class PersistenceError(DomainError):
    """Raised by the UoW when the persistence layer encounters an unrecoverable error."""
    status_code = 500


class ConstraintViolationError(PersistenceError):
    """Raised when a unique or FK constraint is violated at commit/flush time.

    `constraint_name` is the database-level constraint identifier
    (e.g. 'uq_leaderboard_session_id'). Application services inspect this
    field to decide which domain error to surface to the caller.
    """
    status_code = 409

    def __init__(self, message: str = "", *, constraint_name: str | None = None) -> None:
        super().__init__(message)
        self.constraint_name = constraint_name
