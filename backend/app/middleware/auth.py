from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.application.auth_service import AuthApplicationService
from app.db.database import get_db
from app.domain.user.aggregate import User
from app.infrastructure.persistence.user_repository import SqlAlchemyUserRepository
from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

bearer_scheme = HTTPBearer()

_REQUEST_CACHE_ATTR = "_auth_current_user"


def _get_service(db: Session) -> AuthApplicationService:
    return AuthApplicationService(
        user_repo=SqlAlchemyUserRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
    )


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    # Request-scoped cache: FastAPI's Depends caching dedupes within one request
    # for most routes, but sub-dependencies that resolve the user manually
    # bypass that cache. Stashing on request.state makes the per-request DB
    # hit a true singleton regardless of entry point.
    cached = getattr(request.state, _REQUEST_CACHE_ATTR, None)
    if cached is not None:
        return cached

    # InvalidTokenError / UserNotFoundError (both DomainError subclasses) are
    # mapped to 401 by the global handler in main.py.
    user = _get_service(db).authenticate_token(credentials.credentials)
    setattr(request.state, _REQUEST_CACHE_ATTR, user)
    return user
