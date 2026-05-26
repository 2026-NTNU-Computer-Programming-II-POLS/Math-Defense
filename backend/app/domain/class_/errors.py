"""Class domain errors. Status codes live in app.http_status_map."""
from app.domain.errors import DomainError


class ClassNotFoundError(DomainError):
    pass


class ClassNameInvalidError(DomainError):
    pass


class StudentAlreadyInClassError(DomainError):
    pass


class StudentNotInClassError(DomainError):
    pass


class InvalidJoinCodeError(DomainError):
    pass


class NotClassOwnerError(DomainError):
    pass


# Raised by add_student when the email resolves to no account (404, not 401)
class StudentEmailNotFoundError(DomainError):
    pass


class NotAStudentError(DomainError):
    pass


class NotATeacherError(DomainError):
    """Raised when an operation expects a teacher account but the target
    user has a different role. Distinct from NotAStudentError so log/audit
    readers can disambiguate the failed precondition."""
    pass


class StudentRemovedFromClassError(DomainError):
    pass


class ClassNameConflictError(DomainError):
    pass


# ── Archive / lifecycle ───────────────────────────────────────────────────────


class ClassArchivedError(DomainError):
    """Operation refused because the class is archived."""
    pass


class ClassAlreadyArchivedError(DomainError):
    pass


class ClassNotArchivedError(DomainError):
    pass


class ClassCapacityReachedError(DomainError):
    pass


# ── Co-teacher ────────────────────────────────────────────────────────────────


class CoTeacherAlreadyExistsError(DomainError):
    pass


class CoTeacherNotFoundError(DomainError):
    pass


class CannotAddOwnerAsCoTeacherError(DomainError):
    pass


# ── Groups ────────────────────────────────────────────────────────────────────


class GroupNotFoundError(DomainError):
    pass


class GroupNameConflictError(DomainError):
    pass


class StudentNotInClassForGroupError(DomainError):
    pass


class StudentAlreadyInGroupError(DomainError):
    pass


# ── Invites ───────────────────────────────────────────────────────────────────


class InviteAlreadyExistsError(DomainError):
    pass


class InviteNotFoundError(DomainError):
    pass
