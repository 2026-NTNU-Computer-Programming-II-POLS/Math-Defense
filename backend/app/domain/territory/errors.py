"""Territory domain errors"""
from app.domain.errors import DomainError


class ActivityNotFoundError(DomainError):
    status_code = 404


class ActivityExpiredError(DomainError):
    status_code = 409


class ActivityAlreadySettledError(DomainError):
    status_code = 409


class SlotNotFoundError(DomainError):
    status_code = 404


class TerritoryCapReachedError(DomainError):
    status_code = 409


class ScoreNotHighEnoughError(DomainError):
    status_code = 409


class NotActivityOwnerError(DomainError):
    status_code = 403
