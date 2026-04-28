"""Class domain errors"""
from app.domain.errors import DomainError


class ClassNotFoundError(DomainError):
    status_code = 404


class StudentAlreadyInClassError(DomainError):
    status_code = 409


class StudentNotInClassError(DomainError):
    status_code = 404


class InvalidJoinCodeError(DomainError):
    status_code = 404


class NotClassOwnerError(DomainError):
    status_code = 403
