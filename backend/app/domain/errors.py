"""Domain error hierarchy.

Domain layer is HTTP-free: subclasses describe the *kind* of failure, not its
transport status. The API layer (see app.main._domain_error_handler) is the
single place that maps a domain class onto an HTTP status code.
"""
from __future__ import annotations


class DomainError(Exception):
    """Base class for errors raised from domain / application layers."""


# ── Session ──

class SessionNotFoundError(DomainError):
    pass


class SessionStaleError(DomainError):
    pass


class SessionNotActiveError(DomainError):
    pass


class InvalidStatusTransitionError(DomainError):
    pass


class Star5LockedError(DomainError):
    """Raised when a user attempts to start a Star-5 session before satisfying
    the Initial-Answer unlock requirement (Habgood & Ainsworth 2011 — see
    docs/Pedagogical_Backlog_Spec.md §5)."""

    def __init__(self, message: str = "STAR_5_LOCKED") -> None:
        super().__init__(message)


# ── Auth ──

class UsernameTakenError(DomainError):
    pass


class InvalidCredentialsError(DomainError):
    pass


class AccountLockedError(DomainError):
    def __init__(self, message: str = "", retry_after_seconds: int | None = None) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class AccountDisabledError(DomainError):
    pass


class InvalidTokenError(DomainError):
    pass


class UserNotFoundError(DomainError):
    pass


class InvalidMFACodeError(DomainError):
    pass


class MFANotSetupError(DomainError):
    pass


class MFAAlreadyEnabledError(DomainError):
    pass


# ── Replay validation (FU-A) ──

class ReplayMismatchError(DomainError):
    """Raised when a v2 session submits a total_score that doesn't match the
    server's wasmtime-py recomputation. v1 sessions only log a warning (no
    bit-exactness contract); v2 explicitly promised bit-equal acceptance so
    a mismatch is treated as tampering.

    The message is the literal string ``replay_mismatch`` so the global
    DomainError handler surfaces it as the ``detail`` field — the construction
    plan §8 acceptance criterion checks for this exact code.
    """

    def __init__(self, submitted: float, recomputed: float) -> None:
        super().__init__("replay_mismatch")
        self.submitted = submitted
        self.recomputed = recomputed


class ReplayUnavailableError(DomainError):
    """Raised when a v2 session cannot be verified because the WASM runtime
    that backs bit-exact pow is not loaded. v2 promised bit-equal acceptance;
    falling back to Python pow at the wider v1 tolerance would silently
    weaken the contract, so we fail closed (B-BUG-15)."""

    def __init__(self) -> None:
        super().__init__("replay_unavailable")


# ── Validation ──

class DomainValueError(DomainError, ValueError):
    """Domain invariant expressed as a value constraint (e.g. score must not decrease).

    Inherits from both DomainError and ValueError (semantic compatibility with
    existing except-clauses / tests). The DomainError handler takes precedence
    over the generic ValueError handler because it is registered first.
    """


# ── Leaderboard ──

class SessionValidationError(DomainError):
    pass


class PermissionDeniedError(DomainError):
    pass


class DuplicateSubmissionError(DomainError):
    pass


# ── Challenge ──

class ChallengeNotFoundError(DomainError):
    pass


class ChallengeImmutableError(DomainError):
    """Constraints cannot be edited once the challenge has been played
    (see Pedagogical_Backlog_Spec.md §23.4)."""


# ── Talent ──

class InsufficientTalentPointsError(DomainError):
    pass


class PrerequisiteNotMetError(DomainError):
    pass


class MaxLevelReachedError(DomainError):
    pass


class TalentNodeNotFoundError(DomainError):
    pass


# ── Persistence (infrastructure boundary) ──

class PersistenceError(DomainError):
    """Raised by the UoW when the persistence layer encounters an unrecoverable error."""


class ConstraintViolationError(PersistenceError):
    """Raised when a unique or FK constraint is violated at commit/flush time.

    `constraint_name` is the database-level constraint identifier
    (e.g. 'uq_leaderboard_session_id'). Application services inspect this
    field to decide which domain error to surface to the caller.
    """

    def __init__(self, message: str = "", *, constraint_name: str | None = None) -> None:
        super().__init__(message)
        self.constraint_name = constraint_name
