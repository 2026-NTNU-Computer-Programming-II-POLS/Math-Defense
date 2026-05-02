"""Class domain errors"""
from app.domain.errors import DomainError


class ClassNotFoundError(DomainError):
    status_code = 404


class ClassNameInvalidError(DomainError):
    status_code = 422


class StudentAlreadyInClassError(DomainError):
    status_code = 409


class StudentNotInClassError(DomainError):
    status_code = 404


class InvalidJoinCodeError(DomainError):
    status_code = 404


class NotClassOwnerError(DomainError):
    status_code = 403


# Raised by add_student when the email resolves to no account (404, not 401)
class StudentEmailNotFoundError(DomainError):
    status_code = 404


class NotAStudentError(DomainError):
    status_code = 400


class StudentRemovedFromClassError(DomainError):
    status_code = 403


class ClassNameConflictError(DomainError):
    status_code = 409
