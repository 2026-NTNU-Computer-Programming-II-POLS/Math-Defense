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


class StudentRemovedFromClassError(DomainError):
    pass


class ClassNameConflictError(DomainError):
    pass
