from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.application.auth_service import AuthApplicationService
from app.db.database import get_db
from app.domain.errors import InvalidTokenError
from app.domain.user.aggregate import User
from app.infrastructure.persistence.user_repository import SqlAlchemyUserRepository
from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

AUTH_COOKIE_NAME = "access_token"

# auto_error=False so we can fall back to the cookie when no Bearer header is present.
bearer_scheme = HTTPBearer(auto_error=False)

_REQUEST_CACHE_ATTR = "_auth_current_user"


def _get_service(db: Session) -> AuthApplicationService:
    return AuthApplicationService(
        user_repo=SqlAlchemyUserRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
    )


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    # Request-scoped cache: FastAPI's Depends caching dedupes within one request
    # for most routes, but sub-dependencies that resolve the user manually
    # bypass that cache. Stashing on request.state makes the per-request DB
    # hit a true singleton regardless of entry point.
    cached = getattr(request.state, _REQUEST_CACHE_ATTR, None)
    if cached is not None:
        return cached

    # Prefer HTTP-only cookie; fall back to Bearer header for backward compat.
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token and credentials:
        token = credentials.credentials
    if not token:
        raise InvalidTokenError("Not authenticated")

    # InvalidTokenError / UserNotFoundError (both DomainError subclasses) are
    # mapped to 401 by the global handler in main.py.
    user = _get_service(db).authenticate_token(token)
    setattr(request.state, _REQUEST_CACHE_ATTR, user)
    return user
