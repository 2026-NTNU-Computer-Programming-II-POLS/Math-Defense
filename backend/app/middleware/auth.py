from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.domain.errors import InvalidTokenError
from app.domain.user.aggregate import User
from app.factories import build_auth_service

AUTH_COOKIE_NAME = "access_token"

# auto_error=False so we can fall back to the cookie when no Bearer header is present.
bearer_scheme = HTTPBearer(auto_error=False)

_REQUEST_CACHE_ATTR = "_auth_current_user"


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
    # Explicitly re-check the scheme: HTTPBearer accepts the header as-is when
    # auto_error=False, so a client sending `Authorization: Basic ...` would
    # otherwise leak its payload into the JWT decode path.
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token and credentials and credentials.scheme.lower() == "bearer":
        token = credentials.credentials
    if not token:
        raise InvalidTokenError("Not authenticated")

    # InvalidTokenError / UserNotFoundError (both DomainError subclasses) are
    # mapped to 401 by the global handler in main.py.
    user = build_auth_service(db).authenticate_token(token)
    setattr(request.state, _REQUEST_CACHE_ATTR, user)
    return user
