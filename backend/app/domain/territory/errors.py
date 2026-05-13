"""Territory domain errors. Status codes live in app.http_status_map."""
from app.domain.errors import DomainError


class ActivityNotFoundError(DomainError):
    pass


class ActivityExpiredError(DomainError):
    pass


class ActivityAlreadySettledError(DomainError):
    pass


class SlotNotFoundError(DomainError):
    pass


class TerritoryCapReachedError(DomainError):
    pass


class ScoreNotHighEnoughError(DomainError):
    pass


class NotActivityOwnerError(DomainError):
    pass


class InvalidSessionError(DomainError):
    pass
