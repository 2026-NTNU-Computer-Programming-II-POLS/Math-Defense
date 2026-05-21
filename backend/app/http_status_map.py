"""Transport-layer mapping from domain errors to HTTP status codes.

Domain code stays HTTP-free; this module is the single edge where a
DomainError class is translated into an HTTP response status. Add new
mappings here when introducing a new domain error.
"""
from __future__ import annotations

from app.domain.errors import (
    AccountDisabledError,
    AccountLockedError,
    ChallengeImmutableError,
    ChallengeNotFoundError,
    ConstraintViolationError,
    DomainError,
    DomainValueError,
    DuplicateSubmissionError,
    EmailNotVerifiedError,
    InsufficientTalentPointsError,
    InvalidCredentialsError,
    InvalidMFACodeError,
    InvalidStatusTransitionError,
    InvalidTokenError,
    MFAAlreadyEnabledError,
    MFANotSetupError,
    MaxLevelReachedError,
    PermissionDeniedError,
    PersistenceError,
    PrerequisiteNotMetError,
    ReplayMismatchError,
    ReplayUnavailableError,
    SessionNotActiveError,
    SessionNotFoundError,
    SessionStaleError,
    SessionValidationError,
    Star5LockedError,
    TalentNodeNotFoundError,
    UserNotFoundError,
    UsernameTakenError,
)

# Most-specific subclass wins (we walk MRO). 400 is the fallback.
_STATUS_BY_CLASS: dict[type[DomainError], int] = {
    # Session
    SessionNotFoundError: 404,
    SessionStaleError: 410,
    SessionNotActiveError: 409,
    InvalidStatusTransitionError: 409,
    Star5LockedError: 403,
    # Auth
    UsernameTakenError: 409,
    InvalidCredentialsError: 401,
    AccountLockedError: 429,
    AccountDisabledError: 403,
    InvalidTokenError: 401,
    # 404 not 401: this also fires when an authenticated admin targets a
    # non-existent user (admin_service.set_user_active). 401 would wrongly
    # signal "not authenticated" and could log a legitimate admin out.
    UserNotFoundError: 404,
    EmailNotVerifiedError: 403,
    InvalidMFACodeError: 401,
    MFANotSetupError: 400,
    MFAAlreadyEnabledError: 409,
    # Replay
    ReplayMismatchError: 422,
    ReplayUnavailableError: 503,
    # Validation
    DomainValueError: 422,
    # Leaderboard
    SessionValidationError: 400,
    PermissionDeniedError: 403,
    DuplicateSubmissionError: 409,
    # Challenge
    ChallengeNotFoundError: 404,
    ChallengeImmutableError: 409,
    # Talent
    InsufficientTalentPointsError: 409,
    PrerequisiteNotMetError: 409,
    MaxLevelReachedError: 409,
    TalentNodeNotFoundError: 409,
    # Persistence
    ConstraintViolationError: 409,
    PersistenceError: 500,
}


def _register_extra_mappings() -> None:
    """Late-import to avoid circulars during module init for sub-package errors."""
    from app.domain.class_.errors import (
        ClassNameConflictError,
        ClassNameInvalidError,
        ClassNotFoundError,
        InvalidJoinCodeError,
        NotAStudentError,
        NotClassOwnerError,
        StudentAlreadyInClassError,
        StudentEmailNotFoundError,
        StudentNotInClassError,
        StudentRemovedFromClassError,
    )
    from app.domain.territory.errors import (
        ActivityAlreadySettledError,
        ActivityExpiredError,
        ActivityNotFoundError,
        InvalidSessionError,
        NotActivityOwnerError,
        ScoreNotHighEnoughError,
        SlotNotFoundError,
        TerritoryCapReachedError,
    )

    _STATUS_BY_CLASS.update({
        ClassNotFoundError: 404,
        ClassNameInvalidError: 422,
        StudentAlreadyInClassError: 409,
        StudentNotInClassError: 404,
        InvalidJoinCodeError: 404,
        NotClassOwnerError: 403,
        StudentEmailNotFoundError: 404,
        NotAStudentError: 400,
        StudentRemovedFromClassError: 403,
        ClassNameConflictError: 409,

        ActivityNotFoundError: 404,
        ActivityExpiredError: 409,
        ActivityAlreadySettledError: 409,
        SlotNotFoundError: 404,
        TerritoryCapReachedError: 409,
        ScoreNotHighEnoughError: 409,
        NotActivityOwnerError: 403,
        InvalidSessionError: 422,
    })


_register_extra_mappings()


def http_status_for(exc: DomainError) -> int:
    for cls in type(exc).__mro__:
        if cls in _STATUS_BY_CLASS:
            return _STATUS_BY_CLASS[cls]
    return 400
