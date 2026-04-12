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


class InvalidTokenError(DomainError):
    status_code = 401


class UserNotFoundError(DomainError):
    status_code = 401


# ── Leaderboard ──

class SessionValidationError(DomainError):
    status_code = 400


class PermissionDeniedError(DomainError):
    status_code = 403


class DuplicateSubmissionError(DomainError):
    status_code = 409
